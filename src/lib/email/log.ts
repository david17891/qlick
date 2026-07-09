/**
 * logEventEmail — persiste resultado de un email transaccional de evento.
 *
 * FIX P1 (auditoria pre-scanner, 2026-07-03): los emails del bot
 * (`sendEventQrPassEmail`) y del cron (`sendEventReminderEmail`) solo
 * hacian `console.log` en el wrapper de Brevo. Cuando fallaban, el
 * admin no tenia forma de verlo. David reporto "no me llego correo,
 * mismo caso por ahora" (sesion 2026-07-03).
 *
 * Esta funcion inserta una fila en `event_email_log` despues de cada
 * `sendEmail` para que el admin pueda ver QUE fallo via endpoint
 * `/api/admin/emails/failed?eventId=...`.
 *
 * **Best-effort:** si la insercion falla (DB down, RLS, etc.), NO rompe
 * el flow principal. Loggea como warning y sigue. El email ya fue
 * enviado (o intento enviarse) — solo perdemos la observabilidad.
 *
 * **Server-only.** No importar desde Client Components.
 *
 * @server
 */

import { createSupabaseAdminClient } from "../supabase/admin";
import { checkSupabaseConfig } from "../supabase/health";

export type EventEmailType =
  | "qr_pass"
  | "reminder_24h"
  | "reminder_2h"
  | "certificate";

export interface LogEventEmailInput {
  emailType: EventEmailType;
  eventId: string | null;
  /** ID del token QR asociado (si aplica). Nullable: el QR pass puede no tener token. */
  eventQrTokenId?: string | null;
  /**
   * ID del certificado asociado. Solo poblado cuando `emailType === 'certificate'`
   * (sprint v0.9.2 Cert Email). Permite reenviar el email de un cert especifico
   * o auditar quien recibio que folio. Nullable para los otros tipos.
   */
  eventCertificateId?: string | null;
  recipient: string;
  attendeeName?: string | null;
  subject: string;
  ok: boolean;
  error?: string | null;
  providerMessageId?: string | null;
}

/**
 * Inserta una fila en `event_email_log`. Best-effort — si falla, solo loggea.
 */
export async function logEventEmail(input: LogEventEmailInput): Promise<void> {
  if (!checkSupabaseConfig().configured) {
    // Modo demo: ni intentar insertar (la tabla es service-role only).
    return;
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("event_email_log" as never)
    .insert({
      email_type: input.emailType,
      event_id: input.eventId,
      event_qr_token_id: input.eventQrTokenId ?? null,
      event_certificate_id: input.eventCertificateId ?? null,
      recipient: input.recipient,
      attendee_name: input.attendeeName ?? null,
      subject: input.subject,
      ok: input.ok,
      error: input.error ?? null,
      provider_message_id: input.providerMessageId ?? null,
      sent_at: new Date().toISOString(),
    } as never);

  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[lib/email/log] insert event_email_log falló", {
      code: (error as { code?: string }).code,
      emailType: input.emailType,
      recipient: input.recipient,
    });
  }
}