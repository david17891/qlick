/**
 * src/lib/payments/manual-payment.ts
 *
 * Pagos manuales para eventos (efectivo, tarjeta en puerta, transferencia,
 * OXXO/SPEI reportados por el cliente). El sprint cobro-de-entrada
 * (commit 897e61c) cubre el flow digital (Stripe Checkout); este lib cubre
 * el ~70% de cobros en Mexico que NO pasan por Stripe.
 *
 * Tres tipos de metodos:
 *   1. card / oxxo / spei  -> validacion contra Stripe API (token
 *      digital: pi_xxx, voucher 16 digitos, CLABE 18 digitos).
 *   2. cash / transfer    -> admin marca a mano, sin validacion.
 *   3. free_rsvp          -> no aplica, evento free.
 *
 * Source-of-truth del estado de pago del confirmado:
 *   - event_confirmations.payment_status ('not_required' | 'pending'
 *     | 'paid' | 'revoked') — migration 20260715014706.
 *   - event_access.access_source ('event_purchase' | 'manual_event_admin'
 *     | 'simulated_event_payment' | 'free_rsvp' | etc) — migration
 *     20260707100000.
 *   - payments.provider ('stripe' | 'manual_admin' | 'mock' | etc).
 *
 * El admin UI consume los 3 flags en el tab "payments" del evento.
 *
 * Auditoria:
 *   - admin_audit_log: action='manual_payment_registered' o
 *     'manual_payment_revoked' con before/after completos.
 *
 * Out of scope (sprint futuro):
 *   - Reembolsos automaticos.
 *   - Bot helper que valida vouchers automaticamente desde WhatsApp.
 *   - Multi-moneda (siempre MXN en este sprint).
 *
 * @server
 */

import Stripe from "stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/crm/audit-server";
import { grantEventAccess } from "@/lib/lms/event-entitlements";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { sendEmail } from "@/lib/email/brevo-client";
import { renderPaymentConfirmedEmail } from "@/lib/email/templates/payment-confirmed";

/* ------------------------------------------------------------------ */
/*  Tipos publicos                                                    */
/* ------------------------------------------------------------------ */

/**
 * Metodo de pago que el admin registra manualmente.
 *
 * - `card`: datáfono en puerta (sin token de Stripe — el admin lo marca
 *   con el monto cobrado).
 * - `oxxo`: cliente pago en tienda OXXO. Si nos da el voucher number,
 *   validamos contra Stripe API; si no, queda como manual.
 * - `spei`: cliente transfirio por SPEI. Si nos da la CLABE/referencia,
 *   validamos contra Stripe API; si no, queda como manual.
 * - `cash`: efectivo en puerta. Siempre manual.
 * - `transfer`: transferencia manual (BBVA, Banamex, etc) directo al
 *   admin. Siempre manual.
 */
export type ManualPaymentMethod =
  | "card"
  | "oxxo"
  | "spei"
  | "cash"
  | "transfer";

export interface ManualPaymentInput {
  eventId: string;
  confirmationId: string;
  method: ManualPaymentMethod;
  /**
   * Token digital (opcional, depende del method):
   *   - `card`  -> payment_intent_id (`pi_xxx`) si lo tienen (poco comun
   *     en puerta, mas comun si el cliente pago online y el admin
   *     confirma visualmente).
   *   - `oxxo`  -> voucher number de 16 digitos.
   *   - `spei`  -> CLABE 18 digitos o numero de referencia.
   * - `cash` / `transfer` -> null (no hay token).
   */
  voucherInput?: string | null;
  /** Monto cobrado. Default = event.price_mxn. */
  amountMXN: number;
  /** Notas libres del admin. */
  notes?: string | null;
  /** Email del admin que registra (del session actual). */
  actorEmail: string;
}

export interface ManualPaymentResult {
  ok: boolean;
  paymentId?: string;
  eventAccessId?: string;
  /** Status final del confirmado despues del registro. */
  paymentStatus?: "paid" | "pending_verification" | "revoked";
  /**
   * Si el method se valido contra Stripe API, este campo tiene el
   * `payment_intent_id` de Stripe (para trazabilidad y para evitar
   * doble cobro si el admin reintenta).
   */
  stripePaymentIntentId?: string;
  /** Mensaje de error si ok=false. */
  error?: string;
  /** Nota legible para mostrar al admin. */
  note?: string;
}

export interface TokenVerificationResult {
  ok: boolean;
  /** payment_intent_id resuelto de Stripe (si la verificacion paso). */
  paymentIntentId?: string;
  /** Status del payment_intent en Stripe. */
  stripeStatus?: string;
  /** Monto del payment_intent en centavos. */
  amountCentavos?: number;
  /** Email del pagador. */
  customerEmail?: string | null;
  /** Mensaje de error si ok=false. */
  error?: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers de shape                                                 */
/* ------------------------------------------------------------------ */

const SHAPE_CARD_PI = /^pi_[A-Za-z0-9]{10,}$/; // pi_ + 14+ chars alfanumericos
const SHAPE_OXXO_VOUCHER = /^\d{16}$/; // 16 digitos exactos
const SHAPE_SPEI_CLABE = /^\d{18}$/; // 18 digitos exactos (CLABE estandard MX)
const SHAPE_SPEI_REFERENCE = /^\d{8,12}$/; // 8-12 digitos (numero de referencia SPEI)

/** Detecta el tipo de token que el admin ingreso. */
export function detectTokenKind(
  method: ManualPaymentMethod,
  input: string | null | undefined,
): "pi" | "oxxo_voucher" | "spei_clabe" | "spei_reference" | "unknown" {
  if (!input) return "unknown";
  const trimmed = input.trim();
  if (method === "card" && SHAPE_CARD_PI.test(trimmed)) return "pi";
  if (method === "oxxo" && SHAPE_OXXO_VOUCHER.test(trimmed)) return "oxxo_voucher";
  if (method === "spei" && SHAPE_SPEI_CLABE.test(trimmed)) return "spei_clabe";
  if (method === "spei" && SHAPE_SPEI_REFERENCE.test(trimmed))
    return "spei_reference";
  return "unknown";
}

/** Cliente Stripe (lazy). Lee STRIPE_SECRET_KEY del env. */
function getStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY no esta configurado. Define la key en .env.local o Vercel.",
    );
  }
  return new Stripe(key, {
    // Cast al union de apiVersion del SDK. Si Stripe deprecia esta
    // version, el casteo aqui sera el unico lugar a tocar (mismo
    // patron que stripe-provider.ts).
    apiVersion: "2025-09-30.clover" as never,
    typescript: true,
    appInfo: { name: "Qlick LMS", version: "1.0.0" },
  });
}

/** Server-only flag para evitar ejecucion en el bundle del cliente. */
function isServerOnly(): boolean {
  return typeof window === "undefined";
}

/* ------------------------------------------------------------------ */
/*  Verificacion contra Stripe API                                  */
/* ------------------------------------------------------------------ */

/**
 * Verifica un token digital contra Stripe API. La validacion depende
 * del method y del kind detectado:
 *
 * - `pi`           -> `paymentIntents.retrieve(pi_xxx)`, status debe ser
 *                     'succeeded'.
 * - `oxxo_voucher` -> `paymentIntents.search({ query: 'voucher_number:
 *                     "XXXX"' })`. Status 'succeeded'.
 * - `spei_clabe`   -> similar, query por CLABE.
 * - `spei_reference` -> similar, query por numero de referencia.
 *
 * Si la verificacion pasa, devolvemos el `payment_intent_id` y el monto
 * en centavos para que el caller lo use al crear el `payments` row.
 *
 * Si falla (status != 'succeeded', o el token no existe en Stripe), el
 * caller decide que hacer: mi recomendacion es marcar como
 * `pending_verification` con la nota del error, no bloquear.
 */
export async function verifyStripeToken(
  method: ManualPaymentMethod,
  input: string,
): Promise<TokenVerificationResult> {
  if (!isServerOnly()) {
    return { ok: false, error: "verifyStripeToken solo corre en server." };
  }
  const kind = detectTokenKind(method, input);
  if (kind === "unknown") {
    return {
      ok: false,
      error: `El input no tiene el shape esperado para ${method}. Verifica que sea un PI ID (pi_xxx), voucher OXXO (16 digitos), o CLABE SPEI (18 digitos).`,
    };
  }

  let stripe: Stripe;
  try {
    stripe = getStripeClient();
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Stripe no configurado.",
    };
  }

  try {
    if (kind === "pi") {
      const pi = await stripe.paymentIntents.retrieve(input.trim());
      return {
        ok: pi.status === "succeeded",
        paymentIntentId: pi.id,
        stripeStatus: pi.status,
        amountCentavos: typeof pi.amount === "number" ? pi.amount : 0,
        customerEmail: pi.receipt_email ?? null,
        error:
          pi.status === "succeeded"
            ? undefined
            : `El PaymentIntent ${pi.id} esta en status '${pi.status}', no 'succeeded'. Pedile al cliente que confirme el pago.`,
      };
    }

    // Para OXXO / SPEI usamos search con metadata (los voucher numbers
    // se guardan en metadata.voucher_number o en la descripcion del PI).
    // Stripe search es robusto: indexa metadata, description y campos
    // custom.
    const queryField =
      kind === "oxxo_voucher"
        ? `metadata['voucher_number']:'${input.trim()}'`
        : kind === "spei_clabe"
          ? `metadata['clabe']:'${input.trim()}'`
          : `metadata['spei_reference']:'${input.trim()}'`;

    const results = await stripe.paymentIntents.search({
      query: queryField,
      limit: 1,
    });
    const pi = results.data[0];
    if (!pi) {
      return {
        ok: false,
        error: `No encontre ningun PaymentIntent en Stripe con ${kind} = ${input}. Verifica que el cliente haya pagado.`,
      };
    }
    return {
      ok: pi.status === "succeeded",
      paymentIntentId: pi.id,
      stripeStatus: pi.status,
      amountCentavos: typeof pi.amount === "number" ? pi.amount : 0,
      customerEmail: pi.receipt_email ?? null,
      error:
        pi.status === "succeeded"
          ? undefined
          : `El PaymentIntent ${pi.id} esta en status '${pi.status}', no 'succeeded'. Pedile al cliente que confirme el pago.`,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Error consultando Stripe.",
    };
  }
}

/* ------------------------------------------------------------------ */
/*  Registro de pago manual                                          */
/* ------------------------------------------------------------------ */

/**
 * Registra un pago manual para un `event_confirmation`. Es la funcion
 * principal que el server action consume.
 *
 * Flow:
 * 1. Lee el confirmation y verifica que el evento es de pago.
 * 2. Si method in {card, oxxo, spei} y vino voucherInput -> llama a
 *    `verifyStripeToken`. Si pasa, marca como 'paid' con metadata
 *    del PI. Si falla, marca como 'pending_verification' con la nota
 *    del error (admin revisa despues).
 * 3. Si method in {cash, transfer} -> marca como 'paid' directo con
 *    el monto del admin.
 * 4. Crea row en `payments` con provider='manual_admin', method=input,
 *    amount_mxn=input, status='approved' si paso Stripe o 'admin_confirmed'
 *    si es cash/transfer.
 * 5. Crea/actualiza `event_access` con access_source='manual_event_admin',
 *    payment_id apuntando al row nuevo.
 * 6. Marca `event_confirmations.payment_status`:
 *    - 'paid' si todo OK.
 *    - 'pending_verification' si la verificacion contra Stripe fallo.
 *    - 'revoked' no se usa aca, eso es `revokePayment()`.
 * 7. Audit log con action='manual_payment_registered'.
 *
 * Si el admin quizo hacer doble cobro (confirmation ya esta 'paid' y
 * no es el mismo pago), devolvemos ok=false con error explicativo.
 */
export async function registerManualPayment(
  input: ManualPaymentInput,
): Promise<ManualPaymentResult> {
  if (!isServerOnly()) {
    return { ok: false, error: "registerManualPayment solo corre en server." };
  }
  if (!checkSupabaseConfig().configured) {
    return { ok: false, error: "Supabase no configurado (modo demo)." };
  }
  if (!input.eventId || !input.confirmationId || !input.actorEmail) {
    return { ok: false, error: "Faltan eventId, confirmationId o actorEmail." };
  }
  if (!Number.isFinite(input.amountMXN) || input.amountMXN < 0) {
    return {
      ok: false,
      error: "amountMXN debe ser un numero >= 0.",
    };
  }

  const supabase = createSupabaseAdminClient();

  // 1. Leer el confirmation. Cast a tipo local porque el typegen de
  // Supabase esta stale (la columna payment_status existe en DB desde
  // la migration 20260715014706 pero el typegen local no la incluye).
  type ConfWithPay = {
    id: string;
    event_id: string;
    name: string;
    email: string | null;
    phone_normalized: string | null;
    source: string;
    payment_status: "not_required" | "pending" | "paid" | "revoked";
  };
  const { data: conf, error: confErr } = await supabase
    .from("event_confirmations")
    .select(
      "id, event_id, name, email, phone_normalized, source, payment_status",
    )
    .eq("id", input.confirmationId)
    .eq("event_id", input.eventId)
    .maybeSingle();
  const confTyped = conf as unknown as ConfWithPay | null;

  if (confErr || !confTyped) {
    return {
      ok: false,
      error: `Confirmation ${input.confirmationId} no existe o no pertenece al evento ${input.eventId}.`,
    };
  }

  // Si ya esta paid con un pago previo, abortamos para evitar doble cobro.
  if (confTyped.payment_status === "paid") {
    return {
      ok: false,
      error: `El confirmado ${confTyped.name} ya esta marcado como pagado. Si necesitas re-registrar, primero revoca el pago previo.`,
    };
  }

  // 2. Verificacion contra Stripe (solo si method lo amerita y hay input).
  let verification: TokenVerificationResult | null = null;
  if (
    (input.method === "card" ||
      input.method === "oxxo" ||
      input.method === "spei") &&
    input.voucherInput &&
    input.voucherInput.trim().length > 0
  ) {
    verification = await verifyStripeToken(input.method, input.voucherInput);
  }

  // 3. Determinar el status final del pago.
  // - cash / transfer: siempre 'paid' (admin confirma a mano).
  // - card/oxxo/spei con voucher que paso Stripe: 'paid'.
  // - card/oxxo/spei con voucher que NO paso: 'pending_verification'.
  // - card/oxxo/spei SIN voucher: 'paid' (admin lo marca aunque no valide).
  let finalPaymentStatus: "paid" | "pending_verification" = "paid";
  let verificationNote: string | null = null;
  if (verification) {
    if (verification.ok) {
      finalPaymentStatus = "paid";
    } else {
      finalPaymentStatus = "pending_verification";
      verificationNote = verification.error ?? "Verificacion Stripe fallo.";
    }
  }

  // 4. Crear el row en payments.
  const amountCentavos = Math.round(input.amountMXN * 100);
  const paymentMetadata: Record<string, unknown> = {
    manual: true,
    actor_email: input.actorEmail,
    notes: input.notes ?? null,
    verification: verification
      ? {
          ok: verification.ok,
          stripe_payment_intent_id: verification.paymentIntentId ?? null,
          stripe_status: verification.stripeStatus ?? null,
          amount_centavos: verification.amountCentavos ?? null,
        }
      : null,
  };
  const { data: payment, error: payErr } = await supabase
    .from("payments")
    .insert({
      user_id: null, // admin-triggered; no hay user_id de estudiante aca
      course_id: null,
      provider: "manual_admin",
      external_reference: `manual_admin_${input.confirmationId}_${Date.now()}`,
      amount_mxn: amountCentavos, // La columna es integer (centavos)
      discount_mxn: 0,
      currency: "MXN",
      status: finalPaymentStatus === "paid" ? "approved" : "pending",
      method: input.method,
      idempotency_key: `manual_admin:${input.confirmationId}:${Date.now()}`,
      metadata: paymentMetadata,
    } as never)
    .select("id")
    .single();

  if (payErr || !payment) {
    return {
      ok: false,
      error: `Error creando payment: ${payErr?.message ?? "unknown"}`,
    };
  }

  // 5. Crear/actualizar event_access.
  // grantEventAccess ya es idempotente. Si ya habia uno active del mismo
  // (user_id, event_id), actualiza el granted_reason. Como el user_id
  // es null aca (no tenemos lead), la logica interna maneja eso.
  // Workaround: si no hay user_id (guest checkout manual), el event_access
  // queda con user_id=null y el bot puede link-earlo despues cuando el
  // cliente se identifique.
  let eventAccessId: string | undefined;
  try {
    // Si el email del confirmado matchea un user en auth.users, lo
    // usamos. Si no, queda con user_id=null y un follow-up del bot
    // puede resolverlo.
    let userId: string | null = null;
    if (confTyped.email) {
      const { data: rpcId } = await supabase.rpc("get_user_id_by_email", {
        p_email: confTyped.email,
      });
      if (rpcId) userId = rpcId as string;
    }
    if (userId) {
      const access = await grantEventAccess({
        userId,
        eventId: input.eventId,
        source: "manual_event_admin",
        paymentId: payment.id,
        grantedReason: `manual_admin_${input.method}_${new Date()
          .toISOString()
          .slice(0, 16)}`,
      });
      eventAccessId = access.id;
    }
    // Si no hay user_id, no creamos event_access todavia. El bot o un
    // follow-up del admin lo creara cuando el cliente se identifique.
  } catch (err) {
    // No fatal: el payment ya esta creado. El grant se puede reconciliar
    // despues.
    // eslint-disable-next-line no-console
    console.error(
      "[manual-payment] grantEventAccess fallo, continuamos:",
      err instanceof Error ? err.message : String(err),
    );
  }

  // 6. Marcar event_confirmations.payment_status. Cast a `as never`
  //    porque el typegen esta stale (la columna existe en DB post
  //    migration 20260715014706).
  const { error: updateErr } = await supabase
    .from("event_confirmations")
    .update({ payment_status: finalPaymentStatus } as never)
    .eq("id", input.confirmationId);

  if (updateErr) {
    return {
      ok: false,
      paymentId: payment.id,
      eventAccessId,
      error: `Error actualizando payment_status: ${updateErr.message}`,
    };
  }

  // 7. Audit log.
  await logAdminAction({
    actor_email: input.actorEmail,
    action: "manual_payment_registered",
    entity_type: "event_confirmation",
    entity_id: input.confirmationId,
    metadata: {
      event_id: input.eventId,
      method: input.method,
      amount_mxn: input.amountMXN,
      voucher_input_kind: detectTokenKind(input.method, input.voucherInput),
      stripe_payment_intent_id: verification?.paymentIntentId ?? null,
      stripe_verification_ok: verification?.ok ?? null,
      final_payment_status: finalPaymentStatus,
    },
    before: { payment_status: confTyped.payment_status },
    after: { payment_status: finalPaymentStatus, payment_id: payment.id },
  });

  // 8. Email transaccional: "recibimos tu pago". Solo cuando el pago
  //    quedo confirmado (finalPaymentStatus === 'paid'). Si quedo en
  //    pending_verification NO mandamos email (seria confuso para el
  //    cliente). Si no hay email del cliente (guest), skip silencioso.
  //    El envio es best-effort: si Brevo falla, loggeamos pero no
  //    rompemos el flow principal.
  if (finalPaymentStatus === "paid" && confTyped.email) {
    try {
      // Leemos el evento solo aca (no antes, para no penalizar paths
      // que no mandan email). Tipo local por typegen stale.
      type EventRowLocal = {
        title: string;
        starts_at: string;
        location: string | null;
      };
      const { data: ev } = await supabase
        .from("events")
        .select("title, starts_at, location")
        .eq("id", input.eventId)
        .maybeSingle();
      const evTyped = ev as unknown as EventRowLocal | null;
      if (evTyped) {
        const email = renderPaymentConfirmedEmail({
          attendeeName: confTyped.name,
          attendeeEmail: confTyped.email,
          eventTitle: evTyped.title,
          eventStartsAt: evTyped.starts_at,
          eventLocation: evTyped.location,
          paymentMethod: input.method,
          amountMXN: input.amountMXN,
          currency: "MXN",
          notes: input.notes,
        });
        await sendEmail({
          to: confTyped.email,
          subject: email.subject,
          html: email.html,
          text: email.text,
        });
      }
    } catch (err) {
      // Best-effort: log error pero no romper el flow.
      // eslint-disable-next-line no-console
      console.error(
        "[manual-payment] sendEmail fallo (continuamos):",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  return {
    ok: true,
    paymentId: payment.id,
    eventAccessId,
    paymentStatus: finalPaymentStatus,
    stripePaymentIntentId: verification?.paymentIntentId,
    note: verificationNote ?? undefined,
  };
}

/* ------------------------------------------------------------------ */
/*  Revocacion de pago manual                                        */
/* ------------------------------------------------------------------ */

/**
 * Revoca un pago manual (cambia el payment_status a 'revoked' y, si
 * hay event_access asociado, lo desactiva). Usado cuando el admin
 * detecta que el pago no era valido (ej: voucher falso, devolucion,
 * cancelacion).
 *
 * Si el event_access ya existe, lo cambiamos a status='revoked' (no
 * lo eliminamos — es auditoria).
 */
export async function revokeManualPayment(params: {
  confirmationId: string;
  eventId: string;
  reason: string;
  actorEmail: string;
}): Promise<ManualPaymentResult> {
  if (!isServerOnly()) {
    return { ok: false, error: "revokeManualPayment solo corre en server." };
  }
  if (!checkSupabaseConfig().configured) {
    return { ok: false, error: "Supabase no configurado (modo demo)." };
  }
  if (!params.confirmationId || !params.eventId || !params.actorEmail) {
    return { ok: false, error: "Faltan confirmationId, eventId o actorEmail." };
  }

  const supabase = createSupabaseAdminClient();

  // 1. Leer el confirmation. Cast a tipo local (typegen stale, ver
  //    registerManualPayment para el detalle).
  type ConfWithPay = {
    id: string;
    event_id: string;
    payment_status:
      | "not_required"
      | "pending"
      | "paid"
      | "pending_verification"
      | "revoked";
  };
  const { data: conf, error: confErr } = await supabase
    .from("event_confirmations")
    .select("id, event_id, payment_status")
    .eq("id", params.confirmationId)
    .eq("event_id", params.eventId)
    .maybeSingle();
  const confTyped = conf as unknown as ConfWithPay | null;

  if (confErr || !confTyped) {
    return {
      ok: false,
      error: `Confirmation ${params.confirmationId} no existe.`,
    };
  }
  if (
    confTyped.payment_status !== "paid" &&
    confTyped.payment_status !== "pending_verification"
  ) {
    return {
      ok: false,
      error: `Solo se puede revocar un pago en status 'paid' o 'pending_verification'. Actual: '${confTyped.payment_status}'.`,
    };
  }

  // 2. Marcar event_confirmations.payment_status='revoked'. Cast a
  //    `as never` por typegen stale.
  const { error: updateErr } = await supabase
    .from("event_confirmations")
    .update({ payment_status: "revoked" } as never)
    .eq("id", params.confirmationId);

  if (updateErr) {
    return { ok: false, error: `Error revocando: ${updateErr.message}` };
  }

  // 3. Si hay event_access activo del user+event, marcarlo como revoked.
  // grantEventAccess no expone revoke directo, asi que hacemos UPDATE
  // directo en la DB (es una operacion puntual del admin).
  const { error: accessErr } = await supabase
    .from("event_access")
    .update({
      access_status: "revoked",
      granted_reason: `revoked_by_admin_${params.actorEmail}_${new Date()
        .toISOString()
        .slice(0, 16)}`,
    } as never)
    .eq("event_id", params.eventId)
    .eq("access_status", "active");

  // Si accessErr es por "no hay rows" (PGRST116), no es fatal.
  if (accessErr && accessErr.code !== "PGRST116") {
    // eslint-disable-next-line no-console
    console.error(
      "[manual-payment] revoke event_access fallo (continuamos):",
      accessErr.message,
    );
  }

  // 4. Audit log.
  await logAdminAction({
    actor_email: params.actorEmail,
    action: "manual_payment_revoked",
    entity_type: "event_confirmation",
    entity_id: params.confirmationId,
    metadata: {
      event_id: params.eventId,
      reason: params.reason,
    },
    before: { payment_status: confTyped.payment_status },
    after: { payment_status: "revoked" },
  });

  return {
    ok: true,
    paymentStatus: "revoked",
    note: `Pago revocado. Razon: ${params.reason}`,
  };
}
