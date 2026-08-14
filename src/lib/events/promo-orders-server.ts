import { randomBytes } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { normalizePhone } from "@/lib/crm/phone-utils";
import { createConfirmation } from "@/lib/events/confirmations-server";
import { setEventConfirmationPaymentState } from "@/lib/events/event-registration-state";
import { grantEventAccess } from "@/lib/lms/event-entitlements";
import { appBaseUrl } from "@/lib/utils";

export type PromoPaymentOption = "reservation" | "full";

export interface PromoParticipantInput {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface CreatePromoOrderInput {
  eventId: string;
  primary: PromoParticipantInput;
  secondary?: PromoParticipantInput;
  paymentOption: PromoPaymentOption;
}

export interface PromoOrderCheckout {
  orderId: string;
  eventId: string;
  primaryConfirmationId: string;
  secondConfirmationId: string | null;
  totalAmountMxn: number;
  depositAmountMxn: number;
  amountAlreadyPaidMxn: number;
  chargeAmountMxn: number;
  paymentOption: PromoPaymentOption;
  primaryEmail: string | null;
  participantNames: string[];
}

interface ConfirmationLike {
  id: string;
  name: string;
  email?: string | null;
  phone_normalized?: string | null;
  payment_status?: string | null;
  registration_status?: string | null;
  paymentStatus?: string | null;
}

interface PromoOrderLike {
  id: string;
  event_id: string;
  primary_confirmation_id: string;
  status: string;
  total_amount_mxn: number;
  deposit_amount_mxn: number;
  amount_paid_mxn: number;
}

interface ParticipantLike {
  slot_number: number;
  confirmation_id: string | null;
  name: string | null;
  email: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email?: string | null): string | null {
  const value = email?.trim().toLowerCase() ?? "";
  return value && EMAIL_RE.test(value) ? value : null;
}

function cleanName(name?: string | null): string {
  return name?.trim().replace(/\s+/g, " ") ?? "";
}

function isPaidStatus(status: string | null | undefined): boolean {
  return status === "paid" || status === "paid_manual" || status === "partial";
}

function isRealMode(): boolean {
  return typeof window === "undefined" && checkSupabaseConfig().configured;
}

/**
 * Creates or reuses a pending promo order. Existing unpaid confirmations are
 * reused by the canonical confirmation service; paid normal confirmations are
 * never converted into a promo order.
 */
export async function createOrReusePromoOrder(
  input: CreatePromoOrderInput,
): Promise<{ ok: boolean; checkout?: PromoOrderCheckout; error?: string }> {
  if (!isRealMode()) return { ok: false, error: "Supabase no configurado." };
  const primaryName = cleanName(input.primary.name);
  const primaryEmail = normalizeEmail(input.primary.email);
  const primaryPhone = input.primary.phone?.trim() || null;
  if (!primaryName) return { ok: false, error: "El nombre de la primera persona es obligatorio." };
  if (!primaryEmail && !normalizePhone(primaryPhone)) {
    return { ok: false, error: "Agrega un email o teléfono para la primera persona." };
  }

  const primaryResult = await createConfirmation({
    eventId: input.eventId,
    name: primaryName,
    email: primaryEmail,
    phoneRaw: primaryPhone,
    source: "public_form",
  });
  if (!primaryResult.ok || !primaryResult.confirmation) {
    return { ok: false, error: primaryResult.note };
  }
  const primary = primaryResult.confirmation as unknown as ConfirmationLike;
  if (isPaidStatus(primary.payment_status ?? primary.paymentStatus)) {
    return {
      ok: false,
      error: "Esta persona ya tiene un pago o apartado activo en el evento. Conservamos ese registro sin convertirlo a la promoción.",
    };
  }

  const supabase = createSupabaseAdminClient();
  const { data: existingOrder } = await supabase
    .from("event_promo_orders" as never)
    .select("id, event_id, primary_confirmation_id, status, total_amount_mxn, deposit_amount_mxn, amount_paid_mxn")
    .eq("event_id" as never, input.eventId)
    .eq("primary_confirmation_id" as never, primary.id)
    .in("status" as never, ["pending", "partial"])
    .maybeSingle();
  const order = existingOrder as unknown as PromoOrderLike | null;

  let orderId = order?.id ?? null;
  if (!orderId) {
    const { data: inserted, error } = await supabase
      .from("event_promo_orders" as never)
      .insert({
        event_id: input.eventId,
        primary_confirmation_id: primary.id,
        total_amount_mxn: 1500,
        deposit_amount_mxn: 200,
        amount_paid_mxn: 0,
        payment_option: input.paymentOption,
        status: "pending",
        idempotency_key: `promo:${input.eventId}:${primary.id}`,
      } as never)
      .select("id, event_id, primary_confirmation_id, status, total_amount_mxn, deposit_amount_mxn, amount_paid_mxn")
      .single();
    if (error || !inserted) {
      if (error?.code === "23505") {
        const { data: retry } = await supabase
          .from("event_promo_orders" as never)
          .select("id, event_id, primary_confirmation_id, status, total_amount_mxn, deposit_amount_mxn, amount_paid_mxn")
          .eq("event_id" as never, input.eventId)
          .eq("primary_confirmation_id" as never, primary.id)
          .in("status" as never, ["pending", "partial"])
          .maybeSingle();
        orderId = (retry as unknown as PromoOrderLike | null)?.id ?? null;
      }
      if (!orderId) return { ok: false, error: "No se pudo crear la orden promocional." };
    } else {
      orderId = (inserted as unknown as PromoOrderLike).id;
    }
  }

  const currentOrder = order ?? (await getPromoOrder(orderId));
  if (!currentOrder) return { ok: false, error: "La orden promocional no está disponible." };
  if (currentOrder.status === "partial" && input.paymentOption === "reservation") {
    return { ok: false, error: "El apartado ya está registrado. Elige liquidar el saldo restante." };
  }
  if (currentOrder.status === "paid") {
    return { ok: false, error: "La promoción ya está pagada." };
  }

  let secondConfirmationId: string | null = null;
  const secondName = cleanName(input.secondary?.name);
  const secondEmail = normalizeEmail(input.secondary?.email);
  const secondPhone = input.secondary?.phone?.trim() || null;
  if (secondName) {
    // The base event table intentionally keeps its email/phone uniqueness.
    // When the same contact data is used for both seats, the second person
    // keeps a separate named confirmation with contact details on the promo
    // participant row, avoiding a duplicate person by email/phone.
    const emailForConfirmation = secondEmail === primaryEmail ? null : secondEmail;
    const phoneForConfirmation = normalizePhone(secondPhone) === normalizePhone(primaryPhone)
      ? null
      : secondPhone;
    const secondResult = await createConfirmation({
      eventId: input.eventId,
      name: secondName,
      email: emailForConfirmation,
      phoneRaw: phoneForConfirmation,
      source: "public_form",
    });
    if (!secondResult.ok || !secondResult.confirmation) {
      return { ok: false, error: secondResult.note };
    }
    secondConfirmationId = secondResult.confirmation.id;
  }

  const { data: existingParticipants } = await supabase
    .from("event_promo_order_participants" as never)
    .select("slot_number, confirmation_id, name, email")
    .eq("promo_order_id" as never, orderId);
  const participantRows = (existingParticipants ?? []) as unknown as ParticipantLike[];
  const slotOne = participantRows.find((row) => row.slot_number === 1);
  const slotTwo = participantRows.find((row) => row.slot_number === 2);
  const participantPayload = [
    {
      promo_order_id: orderId,
      slot_number: 1,
      confirmation_id: primary.id,
      name: primaryName,
      email: primaryEmail,
      phone_raw: primaryPhone,
      phone_normalized: normalizePhone(primaryPhone),
      identity_status: "named",
    },
    {
      promo_order_id: orderId,
      slot_number: 2,
      confirmation_id: secondConfirmationId ?? slotTwo?.confirmation_id ?? null,
      name: secondName || slotTwo?.name || null,
      email: secondEmail || slotTwo?.email || null,
      phone_raw: secondPhone,
      phone_normalized: normalizePhone(secondPhone),
      identity_status: secondName || slotTwo?.name ? "named" : "identity_pending",
    },
  ];
  if (!slotOne) {
    const { error } = await supabase.from("event_promo_order_participants" as never).insert(participantPayload as never);
    if (error) return { ok: false, error: "No se pudieron guardar las dos plazas de la promoción." };
  } else if (secondName && !slotTwo?.confirmation_id) {
    const { error } = await supabase
      .from("event_promo_order_participants" as never)
      .update(participantPayload[1] as never)
      .eq("promo_order_id" as never, orderId)
      .eq("slot_number" as never, 2);
    if (error) return { ok: false, error: "No se pudo actualizar la segunda persona." };
  }

  const amountPaid = Number(currentOrder.amount_paid_mxn ?? 0);
  const chargeAmount = input.paymentOption === "reservation"
    ? 200
    : Math.max(0, 1500 - amountPaid);
  const { data: finalParticipants } = await supabase
    .from("event_promo_order_participants" as never)
    .select("slot_number, confirmation_id, name, email")
    .eq("promo_order_id" as never, orderId)
    .order("slot_number", { ascending: true });
  const rows = (finalParticipants ?? []) as unknown as ParticipantLike[];
  return {
    ok: true,
    checkout: {
      orderId,
      eventId: input.eventId,
      primaryConfirmationId: primary.id,
      secondConfirmationId: rows.find((row) => row.slot_number === 2)?.confirmation_id ?? secondConfirmationId,
      totalAmountMxn: 1500,
      depositAmountMxn: 200,
      amountAlreadyPaidMxn: amountPaid,
      chargeAmountMxn: chargeAmount,
      paymentOption: input.paymentOption,
      primaryEmail,
      participantNames: rows.map((row) => row.name).filter((name): name is string => Boolean(name)),
    },
  };
}

async function getPromoOrder(orderId: string): Promise<PromoOrderLike | null> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("event_promo_orders" as never)
    .select("id, event_id, primary_confirmation_id, status, total_amount_mxn, deposit_amount_mxn, amount_paid_mxn")
    .eq("id" as never, orderId)
    .maybeSingle();
  return data as unknown as PromoOrderLike | null;
}

export async function createSharedPromoQr(args: {
  orderId: string;
  eventId: string;
  primaryConfirmationId: string;
}): Promise<{ id: string | null; token: string; checkInUrl: string; qrImageUrl: string } | null> {
  if (!isRealMode()) return null;
  const supabase = createSupabaseAdminClient();
  const { data: existing } = await supabase
    .from("event_qr_tokens" as never)
    .select("id, token")
    .eq("promo_order_id" as never, args.orderId)
    .maybeSingle();
  const token = (existing as { token?: string } | null)?.token ?? randomBytes(24).toString("base64url");
  let tokenId = (existing as { id?: string } | null)?.id ?? null;
  if (!existing) {
    const { data: event } = await supabase
      .from("events")
      .select("starts_at, ends_at")
      .eq("id", args.eventId)
      .maybeSingle();
    const eventRow = event as { starts_at?: string; ends_at?: string | null } | null;
    const base = new Date(eventRow?.ends_at ?? eventRow?.starts_at ?? new Date().toISOString());
    const expiresAt = new Date(base.getTime() + 6 * 60 * 60 * 1000).toISOString();
    const { data: inserted, error } = await supabase.from("event_qr_tokens" as never).insert({
      event_id: args.eventId,
      attendee_phone_normalized: `promo:${args.orderId}`,
      attendee_name: "Pase compartido",
      attendee_email: null,
      confirmation_id: args.primaryConfirmationId,
      promo_order_id: args.orderId,
      is_shared_qr: true,
      max_check_ins: 2,
      check_in_count: 0,
      token,
      expires_at: expiresAt,
    } as never).select("id").maybeSingle();
    if (error && error.code !== "23505") return null;
    tokenId = (inserted as { id?: string } | null)?.id ?? tokenId;
    if (!tokenId) {
      const { data: raced } = await supabase
        .from("event_qr_tokens" as never)
        .select("id")
        .eq("promo_order_id" as never, args.orderId)
        .maybeSingle();
      tokenId = (raced as { id?: string } | null)?.id ?? null;
    }
  }
  const baseUrl = appBaseUrl();
  return {
    id: tokenId,
    token,
    checkInUrl: `${baseUrl}/check-in/${encodeURIComponent(token)}`,
    qrImageUrl: `${baseUrl}/api/event-qr/${encodeURIComponent(token)}.png`,
  };
}

/** Settles both named confirmations and the order after a verified payment. */
export async function settlePromoOrder(args: {
  orderId: string;
  paymentId: string;
  paymentOption: PromoPaymentOption;
  amountPaidMxn: number;
}): Promise<{ ok: boolean; eventId?: string; confirmationIds: string[]; qr?: { id: string | null; token: string; checkInUrl: string; qrImageUrl: string } | null; error?: string }> {
  if (!isRealMode()) return { ok: false, confirmationIds: [], error: "Supabase no configurado." };
  const supabase = createSupabaseAdminClient();
  const order = await getPromoOrder(args.orderId);
  if (!order) return { ok: false, confirmationIds: [], error: "Orden promocional no encontrada." };
  const nextStatus = args.paymentOption === "reservation" && args.amountPaidMxn < Number(order.total_amount_mxn)
    ? "partial"
    : "paid";
  await supabase.from("event_promo_orders" as never).update({
    status: nextStatus,
    payment_option: args.paymentOption,
    amount_paid_mxn: args.paymentOption === "reservation"
      ? Math.max(Number(order.amount_paid_mxn ?? 0), args.amountPaidMxn)
      : Number(order.total_amount_mxn),
    updated_at: new Date().toISOString(),
  } as never).eq("id" as never, args.orderId);
  const { data: participants } = await supabase
    .from("event_promo_order_participants" as never)
    .select("slot_number, confirmation_id")
    .eq("promo_order_id" as never, args.orderId)
    .order("slot_number", { ascending: true });
  const confirmationIds = ((participants ?? []) as unknown as Array<{ confirmation_id: string | null }>)
    .map((row) => row.confirmation_id)
    .filter((id): id is string => Boolean(id));
  const paymentStatus = nextStatus === "partial" ? "partial" : "paid";
  for (const confirmationId of confirmationIds) {
    await setEventConfirmationPaymentState(supabase, {
      confirmationId,
      paymentStatus,
    });
    await grantEventAccess({
      userId: null,
      confirmationId,
      eventId: order.event_id,
      source: "event_purchase",
      paymentId: args.paymentId,
      grantedReason: `promo_pair_${paymentStatus}`,
    });
  }
  const qr = await createSharedPromoQr({
    orderId: args.orderId,
    eventId: order.event_id,
    primaryConfirmationId: order.primary_confirmation_id,
  });
  return { ok: true, eventId: order.event_id, confirmationIds, qr };
}

export async function revokePromoOrder(orderId: string, reason: string): Promise<{ ok: boolean; confirmationIds: string[] }> {
  if (!isRealMode()) return { ok: false, confirmationIds: [] };
  const supabase = createSupabaseAdminClient();
  const order = await getPromoOrder(orderId);
  if (!order) return { ok: false, confirmationIds: [] };
  await supabase.from("event_promo_orders" as never).update({ status: "refunded", updated_at: new Date().toISOString(), metadata: { revoked_reason: reason } } as never).eq("id" as never, orderId);
  const { data: participants } = await supabase.from("event_promo_order_participants" as never).select("confirmation_id").eq("promo_order_id" as never, orderId);
  const confirmationIds = ((participants ?? []) as unknown as Array<{ confirmation_id: string | null }>)
    .map((row) => row.confirmation_id).filter((id): id is string => Boolean(id));
  for (const confirmationId of confirmationIds) {
    await setEventConfirmationPaymentState(supabase, { confirmationId, paymentStatus: "revoked" });
  }
  await supabase.from("event_qr_tokens" as never).update({ revoked_at: new Date().toISOString(), revoked_reason: reason } as never).eq("promo_order_id" as never, orderId);
  return { ok: true, confirmationIds };
}
