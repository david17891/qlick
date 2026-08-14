/**
 * Idempotent payment follow-up engine for paid events.
 *
 * The existing payment-reminders module remains as a compatibility wrapper;
 * this module owns the new 4h / 24h / last-day cadence.
 */

import { appBaseUrl } from "../utils";
import { createSupabaseAdminClient } from "../supabase/admin";
import { checkSupabaseConfig } from "../supabase/health";
import { getActiveWhatsAppProvider } from "../whatsapp";
import { isWithinProactiveContactWindow } from "../whatsapp/followup-quiet-hours";

export const PAYMENT_NUDGE_4H = "payment_nudge_4h" as const;
export const PAYMENT_PRIORITY_24H = "payment_priority_24h" as const;
export const PAYMENT_LAST_DAY = "payment_last_day" as const;
export const LEGACY_PAYMENT_24H = "payment_24h" as const;
export type PaymentFollowupKind =
  | typeof PAYMENT_NUDGE_4H
  | typeof PAYMENT_PRIORITY_24H
  | typeof PAYMENT_LAST_DAY
  | typeof LEGACY_PAYMENT_24H;

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const BATCH_SIZE = 50;

export interface PaymentFollowupRunResult {
  ok: boolean;
  demo: boolean;
  note: string;
  eligible: number;
  sent: number;
  failed: number;
  skipped: number;
  shadow: number;
}

interface Candidate {
  id: string;
  event_id: string;
  name: string | null;
  phone_normalized: string | null;
  confirmed_at: string;
  payment_status: string | null;
  registration_status: string | null;
  payment_reminder_eligible_at: string | null;
  payment_priority_expires_at: string | null;
  lead_id: string | null;
}

interface EventRow {
  id: string;
  slug: string;
  title: string;
  starts_at: string;
  status: string;
  price_mxn: number | null;
  event_rules: {
    reservation_enabled?: boolean;
    reservation_amount_mxn?: number;
  } | null;
}

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function displayName(name: string | null): string {
  return name?.trim() || "Hola";
}

function paymentAmount(event: EventRow): number {
  const reservation = event.event_rules?.reservation_enabled === true
    ? Number(event.event_rules.reservation_amount_mxn ?? 0)
    : 0;
  return reservation > 0 ? reservation : Number(event.price_mxn ?? 0);
}

export function buildPaymentFollowupBody(args: {
  kind: PaymentFollowupKind;
  attendeeName: string | null;
  event: EventRow;
  checkoutUrl: string;
}): string {
  const name = escapeText(displayName(args.attendeeName));
  const title = escapeText(args.event.title);
  const amount = paymentAmount(args.event).toLocaleString("es-MX");
  if (args.kind === PAYMENT_NUDGE_4H) {
    return `${name}, ¿quieres asegurar tu asistencia a *${title}*? Tu apartado es de $${amount} MXN y puedes hacerlo aquí:\n${args.checkoutUrl}\n\nSi necesitas ayuda, respóndeme.`;
  }
  if (args.kind === PAYMENT_LAST_DAY) {
    return `*${title}* es mañana. Si deseas asistir, confirma hoy con tu apartado de $${amount} MXN:\n${args.checkoutUrl}\n\nTu QR se envía al verificar el pago.`;
  }
  return `Tu prioridad de 24 horas para *${title}* terminó. Todavía puedes confirmar mientras el registro siga abierto:\n${args.checkoutUrl}\n\nAl verificarse el pago te envío tu QR.`;
}

function templateNameFor(kind: PaymentFollowupKind): string | null {
  if (kind === PAYMENT_PRIORITY_24H || kind === LEGACY_PAYMENT_24H) {
    return process.env.WHATSAPP_TEMPLATE_PAYMENT_REMINDER_24H?.trim() || null;
  }
  if (kind === PAYMENT_LAST_DAY) {
    return process.env.WHATSAPP_TEMPLATE_PAYMENT_LAST_DAY?.trim() || null;
  }
  return null;
}

function buildTemplateVariables(args: {
  attendeeName: string | null;
  event: EventRow;
  checkoutUrl: string;
}): string {
  return [displayName(args.attendeeName), args.event.title, args.checkoutUrl].join("\n");
}

function emptyResult(note: string, demo = false): PaymentFollowupRunResult {
  return { ok: true, demo, note, eligible: 0, sent: 0, failed: 0, skipped: 0, shadow: 0 };
}

function dueKind(candidate: Candidate, event: EventRow, now: Date): PaymentFollowupKind | null {
  const startsAt = new Date(event.starts_at).getTime();
  const nowMs = now.getTime();
  if (!Number.isFinite(startsAt) || startsAt <= nowMs) return null;

  const priorityExpires = candidate.payment_priority_expires_at
    ? new Date(candidate.payment_priority_expires_at).getTime()
    : null;
  const createdAt = new Date(
    candidate.payment_reminder_eligible_at ?? candidate.confirmed_at,
  ).getTime();

  // Historical pending rows have no priority deadline; they enter only the
  // last-day campaign and never receive a fabricated new 24h window.
  if (startsAt - nowMs <= DAY_MS) return PAYMENT_LAST_DAY;
  if (priorityExpires !== null && nowMs >= priorityExpires) return PAYMENT_PRIORITY_24H;
  if (priorityExpires !== null && nowMs >= createdAt + FOUR_HOURS_MS) return PAYMENT_NUDGE_4H;
  return null;
}

export async function runEventPaymentFollowupsJob(
  now: Date = new Date(),
): Promise<PaymentFollowupRunResult> {
  if (!checkSupabaseConfig().configured) return emptyResult("Supabase no configurado (modo demo).", true);

  const mode = process.env.EVENT_PAYMENT_FOLLOWUP_MODE?.trim().toLowerCase() || "off";
  if (mode === "off") return emptyResult("Seguimiento de pago apagado (EVENT_PAYMENT_FOLLOWUP_MODE=off).");

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("event_confirmations" as never)
    .select("id, event_id, name, phone_normalized, confirmed_at, payment_status, registration_status, payment_reminder_eligible_at, payment_priority_expires_at, lead_id" as never)
    .eq("registration_status" as never, "payment_pending" as never)
    .in("payment_status" as never, ["pending", "pending_verification"] as never)
    .limit(BATCH_SIZE);
  if (error) {
    return { ok: false, demo: false, note: error.message, eligible: 0, sent: 0, failed: 0, skipped: 0, shadow: 0 };
  }

  const candidates = (data ?? []) as unknown as Candidate[];
  if (candidates.length === 0) return emptyResult("No hay pagos pendientes elegibles.");
  const eventIds = [...new Set(candidates.map((candidate) => candidate.event_id))];
  const { data: events, error: eventError } = await supabase
    .from("events")
    .select("id, slug, title, starts_at, status, price_mxn, event_rules")
    .in("id", eventIds);
  if (eventError || !events) {
    return { ok: false, demo: false, note: eventError?.message ?? "No se pudieron leer eventos.", eligible: candidates.length, sent: 0, failed: 0, skipped: 0, shadow: 0 };
  }

  const eventById = new Map((events as unknown as EventRow[]).map((event) => [event.id, event]));
  const result: PaymentFollowupRunResult = { ok: true, demo: false, note: "", eligible: 0, sent: 0, failed: 0, skipped: 0, shadow: 0 };

  for (const candidate of candidates) {
    const event = eventById.get(candidate.event_id);
    const kind = event ? dueKind(candidate, event, now) : null;
    if (!event || event.status !== "published" || !kind) continue;
    result.eligible++;
    if (!candidate.phone_normalized) { result.skipped++; continue; }
    if (!isWithinProactiveContactWindow(now)) continue;

    // Commercial follow-ups never override consent, a human handoff or an
    // explicit pause. These checks are intentionally server-side and run on
    // every attempt, not only when the confirmation was first selected.
    if (candidate.lead_id) {
      const [{ data: lead }, { data: handoff }] = await Promise.all([
        supabase.from("leads" as never).select("bot_paused, consent_to_contact, tags" as never)
          .eq("id" as never, candidate.lead_id as never).maybeSingle(),
        supabase.from("handoff_requests" as never).select("id" as never)
          .eq("lead_id" as never, candidate.lead_id as never).eq("status" as never, "pending" as never).limit(1),
      ]);
      const leadRow = lead as { bot_paused?: boolean; consent_to_contact?: boolean; tags?: string[] } | null;
      if (leadRow?.bot_paused || leadRow?.consent_to_contact === false || (leadRow?.tags ?? []).includes("whatsapp:opt_out") || (handoff ?? []).length > 0) {
        result.skipped++;
        continue;
      }
      const { data: journey } = await supabase.from("lead_event_journeys" as never)
        .select("conversation_control" as never).eq("lead_id" as never, candidate.lead_id as never)
        .eq("event_id" as never, candidate.event_id as never).maybeSingle();
      const journeyRow = journey as unknown as { conversation_control?: string } | null;
      if (journeyRow?.conversation_control !== undefined && journeyRow.conversation_control !== "bot") {
        result.skipped++;
        continue;
      }
    }

    // A free-text 4h nudge is allowed only while the service window is active
    // and after a recent inbound. Template stages remain eligible outside the
    // window and are handled by Meta's approved template.
    if (kind === PAYMENT_NUDGE_4H && candidate.lead_id) {
      const { data: recentInbound } = await supabase.from("lead_whatsapp_conversations" as never)
        .select("id" as never).eq("lead_id" as never, candidate.lead_id as never)
        .eq("direction" as never, "inbound" as never)
        .gte("created_at" as never, new Date(now.getTime() - DAY_MS).toISOString())
        .limit(1);
      if (!recentInbound || recentInbound.length === 0) { result.skipped++; continue; }
    }

    const { data: existing } = await supabase
      .from("event_payment_reminder_log" as never)
      .select("id, status" as never)
      .eq("confirmation_id" as never, candidate.id)
      .eq("reminder_kind" as never, kind)
      .maybeSingle();
    const existingRow = existing as { id?: string; status?: string } | null;
    // Shadow observations must not consume the real send when live is
    // enabled later. Sent/sending/failed/skipped rows remain terminal.
    if (existingRow && existingRow.status !== "shadow") continue;

    // Re-read immediately before claiming so a webhook-approved payment wins
    // a race with this cron and no payment message is sent afterwards.
    const { data: fresh } = await supabase.from("event_confirmations" as never)
      .select("registration_status, payment_status" as never).eq("id" as never, candidate.id as never).maybeSingle();
    if ((fresh as { registration_status?: string; payment_status?: string } | null)?.registration_status !== "payment_pending"
      || !["pending", "pending_verification"].includes((fresh as { payment_status?: string } | null)?.payment_status ?? "")) {
      result.skipped++;
      continue;
    }

    if (mode === "shadow") {
      const { error: shadowError } = await supabase.from("event_payment_reminder_log" as never).insert({
        confirmation_id: candidate.id,
        reminder_kind: kind,
        status: "shadow",
        scheduled_for: now.toISOString(),
        attempt_count: 0,
      } as never);
      if (!shadowError || (shadowError as { code?: string }).code === "23505") result.shadow++;
      continue;
    }

    const claimResult = existingRow?.id
      ? await supabase.from("event_payment_reminder_log" as never)
        .update({ status: "sending", scheduled_for: now.toISOString(), attempt_count: 1, last_attempt_at: now.toISOString() } as never)
        .eq("id" as never, existingRow.id as never).select("id" as never).maybeSingle()
      : await supabase.from("event_payment_reminder_log" as never)
        .insert({ confirmation_id: candidate.id, reminder_kind: kind, status: "sending", scheduled_for: now.toISOString(), attempt_count: 1, last_attempt_at: now.toISOString() } as never)
        .select("id" as never).maybeSingle();
    const claim = claimResult.data;
    const claimError = claimResult.error;
    if (claimError || !claim) {
      if ((claimError as { code?: string } | null)?.code !== "23505") result.failed++;
      continue;
    }

    const checkoutUrl = `${appBaseUrl()}/pagar/evento/${event.slug}?confirmation=${candidate.id}${event.event_rules?.reservation_enabled ? "&payment_option=reservation" : ""}`;
    const body = buildPaymentFollowupBody({ kind, attendeeName: candidate.name, event, checkoutUrl });
    const templateName = templateNameFor(kind);
    if (kind !== PAYMENT_NUDGE_4H && !templateName) {
      await supabase.from("event_payment_reminder_log" as never).update({ status: "skipped", error: "template_required" } as never).eq("id" as never, (claim as { id: string }).id);
      result.skipped++;
      continue;
    }

    try {
      const sendResult = await getActiveWhatsAppProvider().send({
        to: candidate.phone_normalized,
        body: templateName ? buildTemplateVariables({ attendeeName: candidate.name, event, checkoutUrl }) : body,
        ...(templateName ? { templateName, templateLanguage: "es_MX" } : {}),
      });
      await supabase.from("event_payment_reminder_log" as never).update({
        status: sendResult.ok ? "sent" : "failed",
        sent_at: sendResult.ok ? new Date().toISOString() : null,
        external_id: sendResult.externalId ?? null,
        error: sendResult.ok ? null : sendResult.note,
      } as never).eq("id" as never, (claim as { id: string }).id);
      if (!sendResult.ok) { result.failed++; continue; }
      await supabase.from("lead_whatsapp_conversations" as never).insert({
        phone_normalized: candidate.phone_normalized,
        direction: "outbound",
        message_type: "text",
        body,
        whatsapp_message_id: sendResult.externalId ?? null,
        metadata: { intent: kind, confirmation_id: candidate.id, event_id: event.id, template_name: templateName },
      } as never);
      result.sent++;
    } catch (sendError) {
      await supabase.from("event_payment_reminder_log" as never).update({
        status: "failed",
        error: sendError instanceof Error ? sendError.message : String(sendError),
      } as never).eq("id" as never, (claim as { id: string }).id);
      result.failed++;
    }
  }
  result.note = `${result.sent} enviados · ${result.failed} errores · ${result.skipped} omitidos · ${result.shadow} shadow`;
  return result;
}
