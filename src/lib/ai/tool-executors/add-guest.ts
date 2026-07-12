/**
 * Tool Executor: add_event_guest — Sprint v0.9.8 Mejora 1.
 *
 * Server-side implementation de la tool `add_event_guest` que el LLM
 * (Súper Ejecutivo) puede llamar durante `suggest_reply` cuando el
 * titular pide registrar a un acompañante (socio, hermano, amigo).
 *
 * Diseño:
 *   - Recibe `(parent_lead_id, guest_name, guest_email?)`.
 *   - Resuelve el evento activo del titular buscando en event_attendees
 *     (la fila del titular, donde se persiste checked_in_at, name, email).
 *   - Hace UPSERT/append en `event_attendees.guests` (JSONB array).
 *     Cada guest tiene `{ id, name, email?, added_at }`.
 *   - Idempotente: si el LLM llama 2 veces con el mismo (lead, name),
 *     NO duplica el guest — actualiza el email/added_at del existente.
 *   - Modo demo: `ctx.supabase === null` → simula el append sin tocar DB.
 *
 * Por qué JSONB y no una tabla aparte:
 *   - El titular es la fila principal de event_attendees; los
 *     acompañantes son sub-entidades del titular. Modelo natural de
 *     "datos del grupo que asiste a un evento".
 *   - Queries típicas del admin (ver quién asiste) ya filtran por
 *     event_attendees; un JSONB anidado evita JOIN extra.
 *   - Migración aditiva: solo agrega la columna guests sin tocar las
 *     existentes.
 *
 * @server
 */

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

/* ------------------------------------------------------------------ */
/* Inputs / Outputs                                                   */
/* ------------------------------------------------------------------ */

export interface AddEventGuestInput {
  /** UUID del lead TITULAR (no del guest). El executor vincula al evento del titular. */
  parent_lead_id: string;
  /** Nombre completo del acompañante. */
  guest_name: string;
  /** Email del acompañante (opcional). */
  guest_email?: string | null;
}

export interface AddEventGuestContext {
  /** Cliente Supabase admin (o null para modo demo). */
  supabase: SupabaseClient<Database> | null;
}

export interface GuestRecord {
  id: string;
  name: string;
  email: string | null;
  added_at: string;
}

export interface AddEventGuestResult {
  /** true si el guest se agregó/actualizó sin error (o se simularía). */
  ok: boolean;
  /** Guest agregado o actualizado (post-validación). */
  guest?: GuestRecord;
  /** true si se persistió en Supabase; false si fue modo demo. */
  persisted: boolean;
  /** true si fue modo demo (sin Supabase real configurado). */
  demo: boolean;
  /** Error de validación del nombre. */
  error_name?: string;
  /** Error de validación del email. */
  error_email?: string;
  /** Nota legible para logging. Sin PII sensible. */
  note: string;
}

/* ------------------------------------------------------------------ */
/* Regex y constantes locales                                         */
/* ------------------------------------------------------------------ */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Misma blocklist que `extract-contact.ts` para consistencia. Si el bot
 * engine agrega nuevos placeholders, sincronizar acá.
 */
const PLACEHOLDER_NAMES_BLOCKLIST: ReadonlySet<string> = new Set([
  "por", "por confirmar", "confirmar", "test", "asistente", "whatsapp",
  "pendiente", "n/a", "na", "anonimo", "anonymous", "sin nombre"
]);

/* ------------------------------------------------------------------ */
/* Helpers puros (testeables sin Supabase)                             */
/* ------------------------------------------------------------------ */

export function isValidGuestNameLocal(text: string | null | undefined): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (trimmed.length < 2 || trimmed.length > 100) return false;
  if (!/[\p{L}]/u.test(trimmed)) return false;
  if (PLACEHOLDER_NAMES_BLOCKLIST.has(trimmed.toLowerCase())) return false;
  const words = trimmed.split(/\s+/).filter(Boolean);
  const wordsWithLetters = words.filter((w) => /[\p{L}]/u.test(w));
  if (wordsWithLetters.length < 2) return false;
  return true;
}

export function validateAndNormalizeGuestEmail(
  raw: string | null | undefined
): string | null {
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase();
  if (!EMAIL_RE.test(normalized)) return null;
  return normalized;
}

/**
 * Encuentra un guest existente en el array por nombre (case-insensitive
 * trim). Usado para idempotencia.
 */
export function findGuestByName(
  guests: GuestRecord[],
  name: string
): GuestRecord | null {
  const target = name.trim().toLowerCase();
  return guests.find((g) => g.name.trim().toLowerCase() === target) ?? null;
}

/**
 * Hace upsert del guest en el array. Si ya existe (por nombre), lo
 * actualiza (email + added_at). Si no, lo agrega.
 *
 * Pure function. Testeable sin Supabase.
 */
export function upsertGuestInArray(
  guests: GuestRecord[],
  newGuest: GuestRecord
): GuestRecord[] {
  const existingIdx = guests.findIndex(
    (g) => g.name.trim().toLowerCase() === newGuest.name.trim().toLowerCase()
  );
  if (existingIdx >= 0) {
    // Update: preservar id, actualizar email/added_at.
    const updated: GuestRecord = {
      ...guests[existingIdx],
      email: newGuest.email,
      added_at: newGuest.added_at
    };
    return [
      ...guests.slice(0, existingIdx),
      updated,
      ...guests.slice(existingIdx + 1)
    ];
  }
  return [...guests, newGuest];
}

/* ------------------------------------------------------------------ */
/* Tool execution                                                      */
/* ------------------------------------------------------------------ */

export async function executeAddEventGuest(
  input: AddEventGuestInput,
  ctx: AddEventGuestContext
): Promise<AddEventGuestResult> {
  // 0. Defensa: parent_lead_id obligatorio.
  if (!input.parent_lead_id || typeof input.parent_lead_id !== "string") {
    return {
      ok: false,
      persisted: false,
      demo: ctx.supabase === null,
      note: "Falta parent_lead_id en el input de la tool."
    };
  }

  // 1. Validar nombre.
  let validatedName: string | null = null;
  let nameError: string | undefined;
  if (isValidGuestNameLocal(input.guest_name)) {
    validatedName = input.guest_name.trim();
  } else {
    nameError =
      "Nombre del acompañante inválido (placeholder, demasiado corto o sin letras).";
  }

  // 2. Validar email (opcional).
  let validatedEmail: string | null = null;
  let emailError: string | undefined;
  if (input.guest_email && input.guest_email.trim() !== "") {
    const normalized = validateAndNormalizeGuestEmail(input.guest_email);
    if (normalized) {
      validatedEmail = normalized;
    } else {
      emailError = "Formato de email del acompañante inválido.";
    }
  }

  if (!validatedName) {
    return {
      ok: false,
      error_name: nameError,
      error_email: emailError,
      persisted: false,
      demo: ctx.supabase === null,
      note: "Nombre del acompañante inválido."
    };
  }

  // 3. Construir el GuestRecord nuevo.
  const newGuest: GuestRecord = {
    id: randomUUID(),
    name: validatedName,
    email: validatedEmail,
    added_at: new Date().toISOString()
  };

  // 4. Modo demo: simular el upsert sin tocar DB.
  if (ctx.supabase === null) {
    return {
      ok: true,
      guest: newGuest,
      error_email: emailError,
      persisted: false,
      demo: true,
      note: `Modo demo: guest "${newGuest.name}" simulado, no persistido.`
    };
  }

  // 5. Modo real: SELECT fila del titular → upsert en guests → UPDATE.
  const { data: row, error: selectError } = await ctx.supabase
    .from("event_attendees")
    .select("id, guests")
    .eq("id", input.parent_lead_id)
    .maybeSingle();

  if (selectError) {
    return {
      ok: false,
      error_email: emailError,
      persisted: false,
      demo: false,
      note: `Error al buscar la fila del titular: ${selectError.code ?? "unknown"}`
    };
  }

  if (!row) {
    return {
      ok: false,
      error_email: emailError,
      persisted: false,
      demo: false,
      note: `No se encontró la fila del titular (parent_lead_id="${input.parent_lead_id}"). ¿El titular está registrado en el evento?`
    };
  }

  const rowAsUnknown = row as unknown as { guests: GuestRecord[] | null };
  const existingGuests: GuestRecord[] = Array.isArray(rowAsUnknown.guests)
    ? rowAsUnknown.guests
    : [];

  const updatedGuests = upsertGuestInArray(existingGuests, newGuest);

  const { error: updateError } = await ctx.supabase
    .from("event_attendees")
    .update({ guests: updatedGuests } as never)
    .eq("id", input.parent_lead_id);

  if (updateError) {
    return {
      ok: false,
      error_email: emailError,
      persisted: false,
      demo: false,
      note: `Error al guardar el guest: ${updateError.code ?? "unknown"}`
    };
  }

  return {
    ok: true,
    guest: newGuest,
    error_email: emailError,
    persisted: true,
    demo: false,
    note: `Acompañante "${newGuest.name}" ${findGuestByName(existingGuests, newGuest.name) ? "actualizado" : "agregado"} al titular.`
  };
}
