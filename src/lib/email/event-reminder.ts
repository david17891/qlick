/**
 * Helper para enviar recordatorios automáticos por email (Fase 7a, Bloque 3).
 *
 * Encadena `renderEventReminderEmail` + `sendEmail` (Brevo). Best-effort.
 *
 * FIX P1 2026-07-03 (auditoria pre-scanner): ahora tambien persiste
 * el resultado en `event_email_log` via `logEventEmail`. Esto le da al
 * admin visibilidad de QUE emails fallaron sin tener que ir a Brevo.
 *
 * Server-only.
 */

import { sendEmail, type SendEmailResult } from "./brevo-client";
import {
  renderEventReminderEmail,
  type EventReminderInput,
} from "./templates/event-reminder";
import { logEventEmail, type LogEventEmailInput } from "./log";
import { infoLog } from "../log";

export type { EventReminderInput };

export type ReminderKind = EventReminderInput["reminderKind"];

export interface SendEventReminderResult extends SendEmailResult {
  /** ID del mensaje en Brevo. */
  messageId?: string;
}

export interface SendEventReminderExtra {
  /** ID del evento (para loggear en event_email_log). */
  eventId?: string | null;
  /** ID del token QR (para loggear en event_email_log). */
  eventQrTokenId?: string | null;
}

export async function sendEventReminderEmail(
  input: EventReminderInput,
  extra: SendEventReminderExtra = {},
): Promise<SendEventReminderResult> {
  const { subject, html } = renderEventReminderEmail(input);
  const result = await sendEmail({
    to: input.attendeeEmail,
    subject,
    html,
  });
  // FIX 2026-07-08 (audit): usar infoLog (helper centralizado) en vez de
  // console.log directo. infoLog aparece en logs de prod (es operacional,
  // no debug) pero pasa por el wrapper para consistencia con el resto del
  // sistema. El log incluye email + eventTitle (PII operacional acotada,
  // aceptable para observabilidad — ver memory: 'Cero PII en logs' aplica
  // para bot-engine debug, no para observabilidad de infra de email).
  infoLog(
    `[email/event-reminder] ${result.ok ? "ok" : "failed"} kind=${input.reminderKind} mode=${result.mode} to=${input.attendeeEmail} event="${input.eventTitle}"`,
    result.error ? { error: result.error } : {},
  );

  // FIX P1: persistir resultado para visibilidad del admin.
  // Mapear reminder_kind al enum de email_type.
  const emailType: LogEventEmailInput["emailType"] =
    input.reminderKind === "24h" ? "reminder_24h" : "reminder_2h";
  await logEventEmail({
    emailType,
    eventId: extra.eventId ?? null,
    eventQrTokenId: extra.eventQrTokenId ?? null,
    recipient: input.attendeeEmail,
    attendeeName: input.attendeeName,
    subject,
    ok: result.ok,
    error: result.error ?? null,
    providerMessageId: result.id ?? null,
  });

  return {
    ...result,
    messageId: result.id,
  };
}