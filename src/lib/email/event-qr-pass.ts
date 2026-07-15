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
import { randomBytes } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { appBaseUrl } from "@/lib/utils";
import { normalizePhone } from "@/lib/crm/phone-utils";
import { generateQrDataUrl } from "@/lib/qr/generate";
import type { Event } from "@/types/events";

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

/* ------------------------------------------------------------------ */
/*  Helper publico: sendQrPassForConfirmation                         */
/* ------------------------------------------------------------------ */

/**
 * Helper publico (no requiere admin) que arma y manda el email del
 * pase digital para un `event_confirmation` recien creado. Usado
 * por:
 *   - El form publico `/eventos/[slug]/actions.ts` (sprint 2026-07-15,
 *     fix bug "email no llega tras confirmar asistencia").
 *   - El endpoint admin `/api/admin/events/[id]/send-qr-pass` (que
 *     ya tiene su propio flow inline, no usa este helper; lo dejo
 *     como alternativa futura).
 *
 * Flow:
 *   1. Lee el confirmation de la DB.
 *   2. Lee el evento.
 *   3. Crea o reusa un `event_qr_tokens` (token firmado de 32 chars).
 *   4. Genera el QR data URL con la lib `generateQrDataUrl`.
 *   5. Renderiza el email con el template (incluye bloque de pago
 *      si el evento es de cobro).
 *   6. Manda via Brevo y loggea en `event_email_log`.
 *
 * Si algo falla (Supabase no config, no email del cliente, Brevo
 * rechaza), NO rompe el flow principal. El admin puede reenviar
 * despues desde el panel con `ResendQrPassButton`.
 *
 * Privacidad: server-only. Usa service role, bypass RLS.
 *
 * @server
 */
export interface SendQrPassForConfirmationResult {
  ok: boolean;
  messageId?: string;
  mode?: "dev" | "prod";
  error?: string;
}

export async function sendQrPassForConfirmation(args: {
  confirmationId: string;
  event: Event;
}): Promise<SendQrPassForConfirmationResult> {
  // Guards basicos.
  if (!isServerOnly() || !checkSupabaseConfig().configured) {
    return { ok: false, error: "sendQrPassForConfirmation solo corre en server con Supabase." };
  }
  if (!args.confirmationId) {
    return { ok: false, error: "Falta confirmationId." };
  }
  if (!args.event) {
    return { ok: false, error: "Falta event." };
  }

  const supabase = createSupabaseAdminClient();

  // 1. Leer el confirmation.
  type ConfLocal = {
    id: string;
    event_id: string;
    name: string;
    email: string | null;
    phone_normalized: string | null;
  };
  const { data: confRaw } = await supabase
    .from("event_confirmations")
    .select("id, event_id, name, email, phone_normalized")
    .eq("id", args.confirmationId)
    .maybeSingle();
  const conf = confRaw as unknown as ConfLocal | null;
  if (!conf) {
    return { ok: false, error: `Confirmation ${args.confirmationId} no existe.` };
  }
  if (!conf.email) {
    // Sin email, no podemos mandar. No es fatal — el admin puede usar
    // el reenvio por WhatsApp en su lugar.
    return { ok: false, error: "Confirmation sin email. Saltamos el email." };
  }

  // 2. Crear o reusar un QR token. Mismo patron que el endpoint admin
  //    (ver src/app/api/admin/events/[id]/send-qr-pass/route.ts). Si
  //    ya existe uno vigente para este confirmation (phone o sentinel
  //    de email), lo reusamos.
  const phoneSentinel =
    conf.phone_normalized ||
    `+1manual${(conf.email ?? "").replace(/[^a-z0-9]/g, "").slice(0, 12)}`;

  const { data: existingToken } = await supabase
    .from("event_qr_tokens")
    .select("token")
    .eq("event_id", args.event.id)
    .eq("attendee_phone_normalized", phoneSentinel)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const baseUrl = appBaseUrl();
  let qrToken: string | null = null;
  let eventQrTokenId: string | null = null;

  if (existingToken && (existingToken as { token: string }).token) {
    qrToken = (existingToken as { token: string }).token;
  } else {
    const token = randomBytes(24).toString("base64url").slice(0, 32);
    const endsAt = args.event.endsAt ? new Date(args.event.endsAt) : new Date();
    const expiresAt = new Date(endsAt.getTime() + 6 * 60 * 60 * 1000).toISOString();
    const { data: inserted } = await supabase
      .from("event_qr_tokens")
      .insert({
        event_id: args.event.id,
        attendee_phone_normalized: phoneSentinel,
        attendee_name: conf.name,
        attendee_email: conf.email,
        token,
        expires_at: expiresAt,
      } as never)
      .select("id, token")
      .maybeSingle();
    if (inserted && (inserted as { token: string }).token) {
      qrToken = (inserted as { token: string }).token;
      eventQrTokenId = (inserted as { id: string }).id ?? null;
    }
  }

  if (!qrToken) {
    return { ok: false, error: "No se pudo generar/obtener el QR token." };
  }

  const checkInUrl = `${baseUrl}/check-in/${qrToken}`;
  const qrImageUrl = `${baseUrl}/api/event-qr/${qrToken}.png`;

  // 3. Generar el QR data URL para el inline del email.
  //    Si falla, seguimos sin el QR embebido (best-effort) — el email
  //    sale con el link al checkInUrl que ya tiene el QR visual.
  let qrDataUrl: string | undefined;
  try {
    qrDataUrl = await generateQrDataUrl(checkInUrl, { width: 320 });
  } catch (err) {
    infoLog(
      `[email/event-qr-pass] generateQrDataUrl fallo, continuamos sin QR inline`,
      err instanceof Error ? { error: err.message } : {},
    );
  }

  // 4. Link al checkout publico si el evento es de pago (sprint 2026-07-15).
  const paymentUrl =
    args.event.priceMXN && args.event.priceMXN > 0
      ? `${baseUrl}/pagar/evento/${args.event.slug}?confirmation=${conf.id}`
      : undefined;

  // 5. Renderizar y mandar.
  return await sendEventQrPassEmail(
    {
      attendeeName: conf.name,
      attendeeEmail: conf.email,
      eventTitle: args.event.title,
      eventStartsAt: args.event.startsAt,
      eventLocation: args.event.location ?? null,
      qrImageUrl: qrImageUrl ?? `${baseUrl}/check-in/${qrToken}`, // fallback al URL publico
      checkInUrl,
      format: args.event.format,
      priceMXN: args.event.priceMXN,
      paymentUrl,
      // Si el evento es virtual/hybrid, gateUrl lo arma el caller
      // (submitEventRegistration ya genera uno ad-hoc en
      // generateGateUrlForConfirmation). Si lo recibimos via un canal
      // futuro, lo agregamos como param.
    },
    {
      eventId: args.event.id,
      eventQrTokenId,
    },
  );
}

/** Server-only flag. */
function isServerOnly(): boolean {
  return typeof window === "undefined";
}

// `normalizePhone` se importa arriba; lo referenciamos para que no
// tree-shake lo quite si el flujo futuro lo usa.
void normalizePhone;