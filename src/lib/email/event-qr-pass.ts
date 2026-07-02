/**
 * Helper para enviar el email de "pase digital" al asistente (Fase 7a).
 *
 * Encadena `renderEventQrPassEmail` + `sendEmail` (Brevo). Best-effort:
 * si falla, loggea y devuelve `{ ok: false }` — NO rompe el flow principal
 * (el link del pase por WhatsApp sigue funcionando).
 *
 * Server-only. No importar desde Client Components.
 */

import { sendEmail, type SendEmailResult } from "./brevo-client";
import {
  renderEventQrPassEmail,
  type EventQrPassInput,
} from "./templates/event-qr-pass";

export type { EventQrPassInput };

export interface SendEventQrPassResult extends SendEmailResult {
  /** ID del mensaje en Brevo, o `dev` si se loggeó solo. */
  messageId?: string;
}

/**
 * Envía el email del pase digital al asistente.
 *
 * Pre-condición: `input.qrDataUrl` debe ser un data URL válido
 * (`data:image/png;base64,...`). Generado por `generateQrDataUrl`.
 *
 * No validar `eventStartsAt` acá — si es inválido, `renderEventQrPassEmail`
 * cae al string crudo como fallback (degradación segura).
 */
export async function sendEventQrPassEmail(
  input: EventQrPassInput,
): Promise<SendEventQrPassResult> {
  const { subject, html } = renderEventQrPassEmail(input);
  const result = await sendEmail({
    to: input.attendeeEmail,
    subject,
    html,
  });
  // eslint-disable-next-line no-console
  console.log(
    `[email/event-qr-pass] ${result.ok ? "ok" : "failed"} mode=${result.mode} to=${input.attendeeEmail} event="${input.eventTitle}"`,
    result.error ? { error: result.error } : {},
  );
  return {
    ...result,
    messageId: result.id,
  };
}