/**
 * Helper para enviar recordatorios automáticos por email (Fase 7a, Bloque 3).
 *
 * Encadena `renderEventReminderEmail` + `sendEmail` (Resend). Best-effort.
 *
 * Server-only.
 */

import { sendEmail, type SendEmailResult } from "./brevo-client";
import {
  renderEventReminderEmail,
  type EventReminderInput,
} from "./templates/event-reminder";

export type { EventReminderInput };

export type ReminderKind = EventReminderInput["reminderKind"];

export interface SendEventReminderResult extends SendEmailResult {
  /** ID del mensaje en Resend. */
  messageId?: string;
}

export async function sendEventReminderEmail(
  input: EventReminderInput,
): Promise<SendEventReminderResult> {
  const { subject, html } = renderEventReminderEmail(input);
  const result = await sendEmail({
    to: input.attendeeEmail,
    subject,
    html,
  });
  // eslint-disable-next-line no-console
  console.log(
    `[email/event-reminder] ${result.ok ? "ok" : "failed"} kind=${input.reminderKind} mode=${result.mode} to=${input.attendeeEmail} event="${input.eventTitle}"`,
    result.error ? { error: result.error } : {},
  );
  return {
    ...result,
    messageId: result.id,
  };
}