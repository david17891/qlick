"use server";

/**
 * Server Action público: confirmar asistencia a un evento desde la landing.
 *
 * Lo llama el formulario en `src/app/eventos/[slug]/EventView.tsx`.
 * NO requiere auth admin (es público), pero valida input y consentimiento
 * antes de delegar a `createConfirmation` (server lib con service role).
 *
 * Decisión de seguridad (espejo de `submitEventRegistration`):
 * - Corre en el servidor, no en el navegador.
 * - Usa service role server-side, NUNCA expone la key al cliente.
 * - anon NO tiene acceso directo a `event_confirmations` (RLS deny).
 * - Honeypot `hp`: si viene lleno, fingimos éxito silencioso (no le
 *   damos pista al bot sobre qué campo es el honeypot).
 * - El consent para ser LEAD vive en la encuesta post-evento (per
 *   `docs/EVENTS_FUNNEL_CONCEPT.md` §7). Este consent cubre solo los
 *   recordatorios del evento (email/WhatsApp con info logística).
 */

import { randomBytes } from "node:crypto";
import { createConfirmation } from "@/lib/events/confirmations-server";
import { getPublishedEventBySlug } from "@/lib/events/events-server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { normalizePhone } from "@/lib/crm/phone-utils";
import { appBaseUrl } from "@/lib/utils";
import { sendQrPassForConfirmation } from "@/lib/email/event-qr-pass";
import { infoLog } from "@/lib/log";
import type { EventConfirmationSource } from "@/types/events";

/**
 * Genera un QR token ad-hoc para una confirmación recién creada y devuelve
 * la URL del gate virtual "SÍ, VOY". Se usa en eventos virtuales/híbridos
 * para que el visitante pueda confirmar intención de entrar sin esperar
 * el email.
 *
 * Si Supabase no está configurado, devuelve undefined (modo demo).
 */
async function generateGateUrlForConfirmation(args: {
  eventId: string;
  confirmationId: string;
  attendeeName: string;
  attendeeEmail: string | null;
  attendeePhoneRaw: string | null;
}): Promise<string | undefined> {
  if (!checkSupabaseConfig().configured) return undefined;
  const phoneNormalized = normalizePhone(args.attendeePhoneRaw ?? null);
  if (!phoneNormalized) return undefined; // necesitamos phone para el token

  const supabase = createSupabaseAdminClient();
  const token = randomBytes(24).toString("base64url");

  // expires_at: evento.ends_at + 6h, igual que generateEventQrTokens.
  // Si el evento no tiene ends_at, +24h del starts_at. Si tampoco,
  // +7 días del now.
  const { data: eventRow } = await supabase
    .from("events")
    .select("ends_at, starts_at")
    .eq("id", args.eventId)
    .maybeSingle();
  const ev = eventRow as unknown as { ends_at: string | null; starts_at: string } | null;
  const baseIso = ev?.ends_at ?? ev?.starts_at ?? new Date().toISOString();
  const expiresAt = new Date(new Date(baseIso).getTime() + 6 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase.from("event_qr_tokens" as never).insert({
    event_id: args.eventId,
    attendee_phone_normalized: phoneNormalized,
    attendee_name: args.attendeeName,
    attendee_email: args.attendeeEmail,
    token,
    expires_at: expiresAt,
  } as never);

  if (error) {
    // eslint-disable-next-line no-console
    console.error("[eventos/actions] generateGateUrlForConfirmation falló", {
      code: error.code,
    });
    return undefined;
  }

  return `${appBaseUrl()}/api/event-gate/${encodeURIComponent(token)}/click`;
}

export interface SubmitEventRegistrationInput {
  /** Slug del evento (URL pública). El server action hace lookup del id. */
  slug: string;
  name: string;
  email?: string;
  phone?: string;
  /** Checkbox de consentimiento (recordatorios del evento). */
  consent: boolean;
  /** Honeypot anti-bot. Debe llegar vacío. */
  hp?: string;
}

export interface SubmitEventRegistrationResult {
  ok: boolean;
  /** false si ya estaba registrado (dedup). true si se creó una fila nueva. */
  created: boolean;
  /** true si quedó en Supabase. false si Supabase no está configurado (demo). */
  persisted: boolean;
  /** Mensaje listo para mostrar al usuario. */
  note: string;
  /**
   * URL del gate virtual "SÍ, VOY" (`/api/event-gate/[token]/click`).
   * Solo presente si el evento es virtual o híbrido Y el resultado es
   * exitoso. El handler registra intent_attended y redirige al
   * streaming_url del evento.
   */
  gateUrl?: string;
}

// Email regex laxo (mismo criterio que ContactForm). Validación real la hace
// el SMTP cuando mandemos el recordatorio; acá solo evitamos typos obvios.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function submitEventRegistration(
  input: SubmitEventRegistrationInput,
): Promise<SubmitEventRegistrationResult> {
  // Honeypot: si viene lleno, fingimos éxito silencioso. NO loggeamos para
  // no darle al bot info de qué campo es.
  if (input.hp && input.hp.trim() !== "") {
    return {
      ok: true,
      created: false,
      persisted: false,
      note: "Registro recibido.",
    };
  }

  // Validaciones server-side (defensa en profundidad; el cliente también valida).
  if (!input.slug?.trim()) {
    return {
      ok: false,
      created: false,
      persisted: false,
      note: "Falta el identificador del evento.",
    };
  }
  if (!input.consent) {
    return {
      ok: false,
      created: false,
      persisted: false,
      note: "Debes aceptar el consentimiento para confirmar asistencia.",
    };
  }
  const name = input.name?.trim() ?? "";
  if (!name) {
    return {
      ok: false,
      created: false,
      persisted: false,
      note: "El nombre es obligatorio.",
    };
  }
  const email = input.email?.trim().toLowerCase() || undefined;
  const phone = input.phone?.trim() || undefined;
  if (!email && !phone) {
    return {
      ok: false,
      created: false,
      persisted: false,
      note: "Necesitamos al menos un email o teléfono para enviarte recordatorios.",
    };
  }
  if (email && !EMAIL_RE.test(email)) {
    return {
      ok: false,
      created: false,
      persisted: false,
      note: "El email no tiene formato válido.",
    };
  }

  // Lookup eventId por slug. `getPublishedEventBySlug` ya filtra draft/archived
  // (RLS-friendly: solo eventos `status='published'` son visibles al público).
  const event = await getPublishedEventBySlug(input.slug);
  if (!event) {
    return {
      ok: false,
      created: false,
      persisted: false,
      note: "Este evento no está disponible.",
    };
  }

  const source: EventConfirmationSource = "public_form";
  const result = await createConfirmation({
    eventId: event.id,
    name,
    email,
    phoneRaw: phone,
    source,
    // importBatchId queda null: el form público no es un batch de import.
  });

  if (!result.ok) {
    return {
      ok: false,
      created: false,
      persisted: false,
      note: result.note,
    };
  }

  // Sprint pagos-manuales 2026-07-15: si el evento es de cobro (priceMXN > 0)
  // y la confirmation es nueva (created === true), seteamos
  // payment_status='pending' para que el admin pueda registrar el pago
  // desde el panel. Sin esto, las confirmaciones de eventos de pago
  // quedan con el default 'not_required' (bug detectado en E2E).
  if (
    result.created &&
    result.confirmation &&
    typeof event.priceMXN === "number" &&
    event.priceMXN > 0
  ) {
    try {
      const supabase = createSupabaseAdminClient();
      await supabase
        .from("event_confirmations" as never)
        .update({ payment_status: "pending" } as never)
        .eq("id", result.confirmation.id);
    } catch (updErr) {
      infoLog(
        "[eventos/actions] payment_status update fallo (no fatal)",
        updErr instanceof Error ? { error: updErr.message } : {},
      );
    }
  }

  // Si el evento es virtual o híbrido (migration 20260707000000),
  // generamos un QR token ad-hoc para que el visitante pueda usar el
  // gate "SÍ, VOY" desde la página pública (sin esperar el email).
  // El mismo token sirve para el check-in presencial si después
  // decides ir físicamente (caso híbrido).
  let gateUrl: string | undefined;
  if (event.format !== "in_person" && event.streamingUrl) {
    gateUrl = await generateGateUrlForConfirmation({
      eventId: event.id,
      confirmationId: result.confirmation?.id ?? "",
      attendeeName: name,
      attendeeEmail: email ?? null,
      attendeePhoneRaw: phone ?? null,
    });
  }

  // FIX 2026-07-15: disparar email de bienvenida (pase digital) cuando
  // se crea una confirmation nueva. Antes SOLO lo disparaba el botón
  // "Reenviar email" del admin — el form público quedaba en silencio
  // (Luz Elena / biheca8075@buloan.com confirmado a las 09:51, sin email).
  //
  // Best-effort: el helper ya tiene try/catch interno y loggea en
  // event_email_log. Si falla, NO rompe el flow. Fire-and-forget con
  // `void` para no bloquear el response del form.
  if (result.created && result.confirmation && email) {
    void sendQrPassForConfirmation({
      confirmationId: result.confirmation.id,
      event,
    }).catch((err) => {
      infoLog(
        "[eventos/actions] sendQrPassForConfirmation fallo (no fatal)",
        err instanceof Error ? { error: err.message } : {},
      );
    });
  }

  // created=false → ya estaba registrada (dedup atómico por email/phone).
  // Lo tratamos como éxito con copy distinto: no la "molestamos" con otro
  // email de bienvenida, pero sí confirmamos que sigue vigente.
  return {
    ok: true,
    created: result.created,
    persisted: result.persisted,
    note: result.created
      ? "¡Listo! Confirmamos tu asistencia. Te enviaremos los detalles antes del evento."
      : "Ya estás registrada en este evento. Te esperamos.",
    gateUrl,
  };
}
