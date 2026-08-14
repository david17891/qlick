/**
 * Recordatorio suave de pago para nuevas inscripciones de eventos de pago.
 *
 * El job se ejecuta junto con el cron diario existente de encuestas. Busca
 * confirmaciones nuevas cuya alta ya tiene al menos 24 horas, siguen en
 * `pending` y aún no recibieron este recordatorio. La ventana es deliberadamente
 * abierta por arriba: en Vercel Hobby el cron puede correr una vez al día, por
 * lo que el envío ocurre en la siguiente ejecución disponible después de 24h.
 *
 * Server-only.
 */

import { createSupabaseAdminClient } from "../supabase/admin";
import { checkSupabaseConfig } from "../supabase/health";
import { appBaseUrl } from "../utils";
import { getActiveWhatsAppProvider } from "../whatsapp";
import { runEventPaymentFollowupsJob } from "./event-payment-followups";

export const PAYMENT_REMINDER_KIND = "payment_24h" as const;
const MINIMUM_AGE_MS = 24 * 60 * 60 * 1000;

export interface PaymentReminderBodyInput {
  attendeeName: string | null;
  eventTitle: string;
  checkoutUrl: string;
}

export interface PaymentReminderRunResult {
  ok: boolean;
  demo: boolean;
  note: string;
  eligible: number;
  sent: number;
  failed: number;
  skipped: number;
}

function escapeWhatsAppText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Copy compatible para consumidores legacy del módulo. */
export function buildPaymentReminderBody(input: PaymentReminderBodyInput): string {
  const name = input.attendeeName?.trim();
  const eventTitle = escapeWhatsAppText(input.eventTitle);
  return [
    name ? `Hola ${name} 👋` : "Hola 👋",
    "",
    `Recibimos tus datos para *${eventTitle}*. Para confirmar tu asistencia y recibir tu QR, completa el pago aquí:`,
    "",
    input.checkoutUrl,
    "",
    "Si ya realizaste el pago, ignora este mensaje. Si necesitas ayuda, respóndenos.",
  ].join("\n");
}

function buildTemplateVariables(input: PaymentReminderBodyInput): string {
  return [
    input.attendeeName?.trim() || "Hola",
    input.eventTitle.trim(),
    input.checkoutUrl,
  ].join("\n");
}

function emptyResult(note: string, demo = false): PaymentReminderRunResult {
  return { ok: true, demo, note, eligible: 0, sent: 0, failed: 0, skipped: 0 };
}

/** Compatibilidad: conserva el export y delega al motor unificado. */
export async function runPaymentRemindersJob(
  now: Date = new Date(),
): Promise<PaymentReminderRunResult> {
  const result = await runEventPaymentFollowupsJob(now);
  return {
    ok: result.ok,
    demo: result.demo,
    note: result.note,
    eligible: result.eligible,
    sent: result.sent,
    failed: result.failed,
    skipped: result.skipped,
  };
}

/** Implementación legacy conservada para auditoría/referencias históricas. */
async function runLegacyPaymentRemindersJob(
  now: Date = new Date(),
): Promise<PaymentReminderRunResult> {
  if (!checkSupabaseConfig().configured) {
    return emptyResult("Supabase no configurado (modo demo).", true);
  }

  // WhatsApp fuera de la ventana de 24 horas solo debe salir mediante una
  // plantilla aprobada por Meta. Mientras esa plantilla no esté configurada,
  // el recordatorio queda preparado pero deliberadamente desactivado.
  const templateName = process.env.WHATSAPP_TEMPLATE_PAYMENT_REMINDER_24H?.trim() || null;
  if (!templateName) {
    return emptyResult(
      "Recordatorio de pago desactivado: falta la plantilla aprobada de WhatsApp.",
    );
  }

  const supabase = createSupabaseAdminClient();
  const cutoff = new Date(now.getTime() - MINIMUM_AGE_MS).toISOString();

  const { data: confirmations, error: confirmationsError } = await supabase
    .from("event_confirmations" as never)
    .select(
      "id, event_id, name, phone_normalized, payment_status, payment_reminder_eligible_at" as never,
    )
    .eq("payment_status" as never, "pending")
    .not("payment_reminder_eligible_at" as never, "is", null)
    .lte("payment_reminder_eligible_at" as never, cutoff);

  if (confirmationsError) {
    return {
      ok: false,
      demo: false,
      note: `Error leyendo inscripciones: ${confirmationsError.code ?? "unknown"}`,
      eligible: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
    };
  }

  const candidates = (confirmations ?? []) as Array<{
    id: string;
    event_id: string;
    name: string | null;
    phone_normalized: string | null;
  }>;
  if (candidates.length === 0) {
    return emptyResult("No hay inscripciones pendientes en ventana de 24h.");
  }

  const eventIds = [...new Set(candidates.map((candidate) => candidate.event_id))];
  const { data: events, error: eventsError } = await supabase
    .from("events" as never)
    .select("id, slug, title, price_mxn" as never)
    .in("id" as never, eventIds);

  if (eventsError || !events) {
    return {
      ok: false,
      demo: false,
      note: `Error leyendo eventos: ${eventsError?.code ?? "unknown"}`,
      eligible: candidates.length,
      sent: 0,
      failed: 0,
      skipped: 0,
    };
  }

  const eventById = new Map(
    (events as Array<{ id: string; slug: string; title: string; price_mxn: number | null }>)
      .filter((event) => (event.price_mxn ?? 0) > 0)
      .map((event) => [event.id, event]),
  );

  const { data: existingLogs } = await supabase
    .from("event_payment_reminder_log" as never)
    .select("confirmation_id" as never)
    .eq("reminder_kind" as never, PAYMENT_REMINDER_KIND);
  const alreadyClaimed = new Set(
    ((existingLogs ?? []) as Array<{ confirmation_id: string }>).map(
      (log) => log.confirmation_id,
    ),
  );

  const baseUrl = appBaseUrl();
  const result: PaymentReminderRunResult = {
    ok: true,
    demo: false,
    note: "",
    eligible: candidates.length,
    sent: 0,
    failed: 0,
    skipped: 0,
  };

  for (const candidate of candidates) {
    const event = eventById.get(candidate.event_id);
    if (!event || alreadyClaimed.has(candidate.id)) continue;

    const { data: claim, error: claimError } = await supabase
      .from("event_payment_reminder_log" as never)
      .insert({
        confirmation_id: candidate.id,
        reminder_kind: PAYMENT_REMINDER_KIND,
        status: "sending",
      } as never)
      .select("id" as never)
      .maybeSingle();

    if (claimError || !claim) {
      // 23505 means another cron invocation already claimed this contact.
      if ((claimError as { code?: string } | null)?.code !== "23505") result.failed++;
      continue;
    }

    const checkoutUrl = `${baseUrl}/pagar/evento/${event.slug}?confirmation=${candidate.id}`;
    const messageBody = buildPaymentReminderBody({
      attendeeName: candidate.name,
      eventTitle: event.title,
      checkoutUrl,
    });

    if (!candidate.phone_normalized) {
      await supabase
        .from("event_payment_reminder_log" as never)
        .update({ status: "skipped", error: "no_phone" } as never)
        .eq("id" as never, (claim as { id: string }).id);
      result.skipped++;
      continue;
    }

    try {
      const sendResult = await getActiveWhatsAppProvider().send({
        to: candidate.phone_normalized,
        body: templateName
          ? buildTemplateVariables({
              attendeeName: candidate.name,
              eventTitle: event.title,
              checkoutUrl,
            })
          : messageBody,
        ...(templateName
          ? { templateName, templateLanguage: "es_MX" }
          : {}),
      });

      await supabase
        .from("event_payment_reminder_log" as never)
        .update({
          status: sendResult.ok ? "sent" : "failed",
          sent_at: sendResult.ok ? new Date().toISOString() : null,
          external_id: sendResult.externalId ?? null,
          error: sendResult.ok ? null : sendResult.note,
        } as never)
        .eq("id" as never, (claim as { id: string }).id);

      if (sendResult.ok) {
        await supabase.from("lead_whatsapp_conversations" as never).insert({
          phone_normalized: candidate.phone_normalized,
          direction: "outbound",
          message_type: "text",
          body: messageBody,
          whatsapp_message_id: sendResult.externalId ?? null,
          metadata: {
            intent: "payment_reminder_24h",
            confirmation_id: candidate.id,
            event_id: event.id,
            template_name: templateName,
          },
        } as never);
        result.sent++;
      } else {
        result.failed++;
      }
    } catch (error) {
      await supabase
        .from("event_payment_reminder_log" as never)
        .update({
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        } as never)
        .eq("id" as never, (claim as { id: string }).id);
      result.failed++;
    }
  }

  result.note = `${result.sent} enviados · ${result.failed} errores · ${result.skipped} sin teléfono`;
  return result;
}
