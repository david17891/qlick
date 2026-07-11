/**
 * Helper para enviar el email de "constancia de asistencia" al asistente.
 *
 * Sprint v0.9.2 Cert Email (fase 2 del sprint Concept C, 2026-07-08).
 *
 * Encadena `renderEventCertificateEmail` + `sendEmail` (Brevo) + persistencia
 * en `event_email_log` (con `email_type='certificate'` y `event_certificate_id`).
 *
 * Best-effort: si Brevo falla, loggea y devuelve `{ ok: false }` — NO
 * rompe el flujo principal (la emisión del cert ya esta commiteada en DB
 * y David puede reintentar via admin).
 *
 * Server-only. No importar desde Client Components.
 */

import { sendEmail, type SendEmailResult } from "./brevo-client";
import {
  renderEventCertificateEmail,
  type EventCertificateInput,
} from "./templates/event-certificate";
import { logEventEmail, type LogEventEmailInput } from "./log";

export type { EventCertificateInput };

export interface SendEventCertificateResult extends SendEmailResult {
  /** ID del mensaje en Brevo, o `dev` si solo se loggeo. */
  messageId?: string;
}

export interface SendEventCertificateExtra {
  /** ID del evento (para loggear en event_email_log). */
  eventId?: string | null;
  /** ID del cert (para el campo event_certificate_id del log). */
  eventCertificateId?: string | null;
  /** Folio del cert (para logging). */
  folio?: string | null;
}

/**
 * Envia el email de constancia al asistente.
 *
 * Pre-condicion: `input.certUrl` debe ser URL absoluta (https://...).
 * El caller (server action batch) compone la URL con `appBaseUrl() + /cert/${folio}`.
 *
 * Si se pasa `extra.eventId` y `extra.eventCertificateId`, el resultado
 * se persiste en `event_email_log` con `email_type='certificate'` para
 * que el admin tenga visibilidad del envio.
 */
export async function sendEventCertificateEmail(
  input: EventCertificateInput,
  extra: SendEventCertificateExtra = {},
): Promise<SendEventCertificateResult> {
  const { subject, html } = renderEventCertificateEmail(input);
  const result = await sendEmail({
    to: input.attendeeEmail,
    subject,
    html,
  });

  // eslint-disable-next-line no-console
  console.log(
    `[email/event-certificate] ${result.ok ? "ok" : "failed"} mode=${result.mode} to=${input.attendeeEmail} folio=${extra.folio ?? "?"} event="${input.eventTitle}"`,
    result.error ? { error: result.error } : {},
  );

  // Best-effort: persistir resultado para visibilidad del admin.
  // Si falla el INSERT, NO rompemos el flow (el email ya fue enviado).
  const logInput: LogEventEmailInput = {
    emailType: "certificate",
    eventId: extra.eventId ?? null,
    eventCertificateId: extra.eventCertificateId ?? null,
    recipient: input.attendeeEmail,
    attendeeName: input.attendeeName,
    subject,
    ok: result.ok,
    error: result.error ?? null,
    providerMessageId: result.id ?? null,
  };
  await logEventEmail(logInput);

  return {
    ...result,
    messageId: result.id,
  };
}