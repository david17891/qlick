/**
 * Helper para enviar el email de "pase digital" al asistente (Fase 7a).
 *
 * Encadena `renderEventQrPassEmail` + `sendEmail` (Brevo). Best-effort:
 * si falla, loggea y devuelve `{ ok: false }` — NO rompe el flow principal
 * (el link del pase por WhatsApp sigue funcionando).
 *
 * FIX P1 2026-07-03 (auditoria pre-scanner): ahora tambien persiste
 * el resultado en `event_email_log` via `logEventEmail`. Esto le da al
 * admin visibilidad de QUE emails fallaron sin tener que ir a Brevo.
 *
 * Server-only. No importar desde Client Components.
 */

import { sendEmail, type SendEmailResult } from "./brevo-client";
import {
  renderEventQrPassEmail,
  type EventQrPassInput,
} from "./templates/event-qr-pass";
import { logEventEmail, type LogEventEmailInput } from "./log";
import { infoLog } from "../log";

export type { EventQrPassInput };

export interface SendEventQrPassResult extends SendEmailResult {
  /** ID del mensaje en Brevo, o `dev` si se loggeó solo. */
  messageId?: string;
}

export interface SendEventQrPassExtra {
  /** ID del evento (para loggear en event_email_log). */
  eventId?: string | null;
  /** ID del token QR (para loggear en event_email_log). */
  eventQrTokenId?: string | null;
}

/**
 * Envía el email del pase digital al asistente.
 *
 * Pre-condición: `input.qrDataUrl` debe ser un data URL válido
 * (`data:image/png;base64,...`). Generado por `generateQrDataUrl`.
 *
 * No validar `eventStartsAt` acá — si es inválido, `renderEventQrPassEmail`
 * cae al string crudo como fallback (degradación segura).
 *
 * Si se pasa `extra.eventId` y/o `extra.eventQrTokenId`, el resultado
 * se persiste en `event_email_log` para que el admin tenga visibilidad.
 */
export async function sendEventQrPassEmail(
  input: EventQrPassInput,
  extra: SendEventQrPassExtra = {},
): Promise<SendEventQrPassResult> {
  const { subject, html } = renderEventQrPassEmail(input);
  const result = await sendEmail({
    to: input.attendeeEmail,
    subject,
    html,
  });
  // FIX 2026-07-08 (audit): usar infoLog en vez de console.log directo.
  // Mismo rationale que en event-reminder.ts.
  infoLog(
    `[email/event-qr-pass] ${result.ok ? "ok" : "failed"} mode=${result.mode} to=${input.attendeeEmail} event="${input.eventTitle}"`,
    result.error ? { error: result.error } : {},
  );

  // FIX P1: persistir resultado para visibilidad del admin.
  // Best-effort — si falla el INSERT, NO rompe el flow.
  const logInput: LogEventEmailInput = {
    emailType: "qr_pass",
    eventId: extra.eventId ?? null,
    eventQrTokenId: extra.eventQrTokenId ?? null,
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