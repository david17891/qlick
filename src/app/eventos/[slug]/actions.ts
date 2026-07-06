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

import { createConfirmation } from "@/lib/events/confirmations-server";
import { getPublishedEventBySlug } from "@/lib/events/events-server";
import type { EventConfirmationSource } from "@/types/events";

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
  };
}
