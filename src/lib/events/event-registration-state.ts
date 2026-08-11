import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

export type EventRegistrationStatus = "payment_pending" | "confirmed";
export type EventPaymentStatus =
  | "not_required"
  | "pending"
  | "partial"
  | "paid"
  | "paid_manual"
  | "pending_verification"
  | "revoked";

export interface EventConfirmationStateRow {
  id?: string;
  event_id?: string;
  payment_status?: string | null;
  registration_status?: string | null;
  registration_confirmed_at?: string | null;
}

export function isVerifiedEventPayment(paymentStatus: unknown): boolean {
  return paymentStatus === "not_required"
    || paymentStatus === "partial"
    || paymentStatus === "paid"
    || paymentStatus === "paid_manual";
}

export function isEventRegistrationConfirmed(row: EventConfirmationStateRow): boolean {
  if (row.registration_status === "confirmed") return true;
  if (row.registration_status === "payment_pending") return false;
  // Backward-compatible fallback for rows written before the additive column.
  return isVerifiedEventPayment(row.payment_status);
}

export function registrationStatusForPayment(
  paymentStatus: EventPaymentStatus,
): EventRegistrationStatus {
  return isVerifiedEventPayment(paymentStatus) ? "confirmed" : "payment_pending";
}

type AdminClient = SupabaseClient<Database>;

/**
 * Updates payment + registration state together. The payment ledger remains
 * the financial source of truth; this row is the operational projection used
 * by the bot, admin panel and QR/access gates.
 */
export async function setEventConfirmationPaymentState(
  supabase: AdminClient,
  args: {
    confirmationId: string;
    paymentStatus: EventPaymentStatus;
    confirmedAt?: string;
  },
): Promise<{ ok: boolean; error?: string; registrationStatus: EventRegistrationStatus }> {
  const registrationStatus = registrationStatusForPayment(args.paymentStatus);
  const confirmedAt = registrationStatus === "confirmed"
    ? args.confirmedAt ?? new Date().toISOString()
    : null;
  let { error } = await supabase
    .from("event_confirmations")
    .update({
      payment_status: args.paymentStatus,
      registration_status: registrationStatus,
      registration_confirmed_at: confirmedAt,
    } as never)
    .eq("id", args.confirmationId);

  // Preview/test workers may still use the pre-migration schema. Preserve
  // the financial update there; the additive columns become authoritative as
  // soon as the migration is applied.
  if (error?.code === "PGRST204" || error?.code === "42703") {
    const legacyResult = await supabase
      .from("event_confirmations")
      .update({ payment_status: args.paymentStatus } as never)
      .eq("id", args.confirmationId);
    error = legacyResult.error;
  }

  if (error) return { ok: false, error: error.message, registrationStatus };
  const { data: confirmation } = await supabase
    .from("event_confirmations")
    .select("lead_id, event_id" as never)
    .eq("id", args.confirmationId)
    .maybeSingle();
  const linked = confirmation as { lead_id?: string | null; event_id?: string | null } | null;
  if (linked?.lead_id && linked.event_id) {
    const journeyPaymentStatus = args.paymentStatus === "pending_verification"
      ? "pending"
      : args.paymentStatus === "paid_manual"
        ? "paid"
        : args.paymentStatus === "revoked"
          ? "refunded"
          : args.paymentStatus;
    const journeyUpdate = await supabase
      .from("lead_event_journeys" as never)
      .update({
        relationship_stage: registrationStatus,
        payment_status: journeyPaymentStatus,
        next_follow_up_at: null,
      } as never)
      .eq("lead_id" as never, linked.lead_id)
      .eq("event_id" as never, linked.event_id);
    if (journeyUpdate.error?.code === "23514") {
      await supabase
        .from("lead_event_journeys" as never)
        .update({
          relationship_stage: "registered",
          payment_status: journeyPaymentStatus,
        } as never)
        .eq("lead_id" as never, linked.lead_id)
        .eq("event_id" as never, linked.event_id);
    }
  }
  if (registrationStatus === "confirmed") {
    await supabase
      .from("event_qr_tokens" as never)
      .update({ revoked_at: null, revoked_reason: null } as never)
      .eq("confirmation_id" as never, args.confirmationId);
  } else {
    await revokeEventConfirmationArtifacts(supabase, args.confirmationId);
  }
  return { ok: true, registrationStatus };
}

/** Revokes artifacts without deleting them, preserving an audit trail. */
export async function revokeEventConfirmationArtifacts(
  supabase: AdminClient,
  confirmationId: string,
): Promise<void> {
  await Promise.all([
    supabase
      .from("event_qr_tokens" as never)
      .update({
        revoked_at: new Date().toISOString(),
        revoked_reason: "payment_pending_registration",
      } as never)
      .eq("confirmation_id" as never, confirmationId)
      .is("revoked_at" as never, null),
    supabase
      .from("event_access" as never)
      .update({
        access_status: "revoked",
        granted_reason: "payment_pending_registration",
      } as never)
      .eq("confirmation_id" as never, confirmationId)
      .eq("access_status" as never, "active")
      .not("access_source" as never, "in" as never, "(free_rsvp,manual_event_admin)" as never),
  ]);
}
