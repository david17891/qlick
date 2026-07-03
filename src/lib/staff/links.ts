/**
 * Helpers para event_staff_links (Commit B, 2026-07-03).
 *
 * David (admin) genera links temporales que cualquier persona del staff
 * puede usar para escanear QRs en puerta, sin login. El staff puede ser
 * externo (institución que cede el espacio) — David le manda el link por
 * WhatsApp/SMS/email.
 *
 * **Funciones principales:**
 *   - `generateStaffLink({ eventId, validUntil, label?, createdBy })` →
 *     crea un link nuevo con token random (192 bits).
 *   - `validateStaffLink(token)` → resuelve el link y valida ventana +
 *     revocation. Devuelve `{ ok, link }` o `{ ok: false, reason }`.
 *   - `revokeStaffLink(linkId, revokedBy, reason?)` → marca `revoked_at`.
 *   - `listStaffLinks(eventId)` → lista links (activos + revocados) con
 *     stats de uso.
 *   - `recordStaffLinkUse(linkId)` → bump `use_count` + `last_used_at`.
 *
 * **Reglas:**
 *   - `valid_until` por default es `event.starts_at + 4h` (configurable
 *     por el admin al crear).
 *   - Validación: `valid_from <= now < valid_until AND revoked_at IS NULL`.
 *   - Si el token es válido pero el link está revocado → 410 Gone.
 *   - Si el token no existe → 404.
 *
 * **Server-only.** Service role para todo (RLS default-deny).
 *
 * @server
 */

import { randomBytes } from "node:crypto";
import { createSupabaseAdminClient } from "../supabase/admin";
import { checkSupabaseConfig } from "../supabase/health";
import { appBaseUrl } from "../utils";

export interface EventStaffLink {
  id: string;
  eventId: string;
  token: string;
  validFrom: string;
  validUntil: string;
  createdBy: string;
  createdAt: string;
  label: string | null;
  lastUsedAt: string | null;
  useCount: number;
  revokedAt: string | null;
  revokedBy: string | null;
  revokeReason: string | null;
}

interface EventStaffLinkRow {
  id: string;
  event_id: string;
  token: string;
  valid_from: string;
  valid_until: string;
  created_by: string;
  created_at: string;
  label: string | null;
  last_used_at: string | null;
  use_count: number;
  revoked_at: string | null;
  revoked_by: string | null;
  revoke_reason: string | null;
}

function mapRowToLink(row: EventStaffLinkRow): EventStaffLink {
  return {
    id: row.id,
    eventId: row.event_id,
    token: row.token,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    createdBy: row.created_by,
    createdAt: row.created_at,
    label: row.label,
    lastUsedAt: row.last_used_at,
    useCount: row.use_count,
    revokedAt: row.revoked_at,
    revokedBy: row.revoked_by,
    revokeReason: row.revoke_reason,
  };
}

function generateRandomToken(): string {
  // 24 bytes → 32 chars base64url = 192 bits entropia.
  return randomBytes(24).toString("base64url");
}

function isRealMode(): boolean {
  if (typeof window !== "undefined") return false;
  return checkSupabaseConfig().configured;
}

// ─────────────────────────────────────────────────────────────
// Escritura
// ─────────────────────────────────────────────────────────────

export interface GenerateStaffLinkInput {
  eventId: string;
  /** ISO string. Si no se pasa, default = event.starts_at + 4h. */
  validUntil?: string;
  /** ISO string. Default = now(). */
  validFrom?: string;
  label?: string | null;
  /** Email del admin que lo generó (audit). */
  createdBy: string;
}

export interface GenerateStaffLinkResult {
  ok: boolean;
  link?: EventStaffLink;
  /** URL publica completa (lista para mandar al staff). */
  url?: string;
  note: string;
}

/**
 * Crea un link nuevo. Genera el token random, calcula valid_until si
 * no se pasa (event.starts_at + 4h), inserta la fila y devuelve la URL
 * publica.
 */
export async function generateStaffLink(
  input: GenerateStaffLinkInput,
): Promise<GenerateStaffLinkResult> {
  if (!isRealMode()) {
    return { ok: false, note: "Supabase no configurado." };
  }
  const supabase = createSupabaseAdminClient();

  // Si no se pasa validUntil, default = event.starts_at + 4h.
  let validUntil = input.validUntil;
  if (!validUntil) {
    const { data: evt, error: evtErr } = await supabase
      .from("events")
      .select("starts_at")
      .eq("id", input.eventId)
      .maybeSingle();
    if (evtErr || !evt) {
      return {
        ok: false,
        note: `No se encontro el evento (${evtErr?.code ?? "?"}).`,
      };
    }
    const startsAt = new Date((evt as { starts_at: string }).starts_at);
    validUntil = new Date(startsAt.getTime() + 4 * 60 * 60 * 1000).toISOString();
  }

  const token = generateRandomToken();
  const validFrom = input.validFrom ?? new Date().toISOString();

  const { data, error } = await supabase
    .from("event_staff_links" as never)
    .insert({
      event_id: input.eventId,
      token,
      valid_from: validFrom,
      valid_until: validUntil,
      created_by: input.createdBy,
      label: input.label ?? null,
    } as never)
    .select("*")
    .maybeSingle();
  if (error || !data) {
    return {
      ok: false,
      note: `No se pudo crear el link (${(error as { code?: string } | null)?.code ?? "?"}).`,
    };
  }

  const link = mapRowToLink(data as unknown as EventStaffLinkRow);
  // FIX 2026-07-03 (bug post-deploy): el path correcto es /api/staff/scan/
  // (endpoint que valida y redirige a la página del scanner). Antes era
  // /staff/scan/ que NO existe → 404 en Vercel.
  const url = `${appBaseUrl()}/api/staff/scan/${encodeURIComponent(token)}`;
  return {
    ok: true,
    link,
    url,
    note: `Link creado. Expira ${new Date(validUntil).toLocaleString("es-MX")}.`,
  };
}

export interface RevokeStaffLinkResult {
  ok: boolean;
  note: string;
}

/**
 * Revoca un link. Si ya estaba revocado, devuelve ok=true con nota
 * informativa (idempotente).
 */
export async function revokeStaffLink(
  linkId: string,
  revokedBy: string,
  reason?: string | null,
): Promise<RevokeStaffLinkResult> {
  if (!isRealMode()) {
    return { ok: false, note: "Supabase no configurado." };
  }
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("event_staff_links" as never)
    .update({
      revoked_at: new Date().toISOString(),
      revoked_by: revokedBy,
      revoke_reason: reason ?? null,
    } as never)
    .eq("id" as never, linkId)
    .is("revoked_at" as never, null)
    .select("id")
    .maybeSingle();
  if (error) {
    return {
      ok: false,
      note: `No se pudo revocar (${(error as { code?: string }).code ?? "?"}).`,
    };
  }
  if (!data) {
    return { ok: true, note: "Link ya estaba revocado (idempotente)." };
  }
  return { ok: true, note: "Link revocado." };
}

// ─────────────────────────────────────────────────────────────
// Lectura
// ─────────────────────────────────────────────────────────────

export type ValidateResult =
  | { ok: true; link: EventStaffLink }
  | { ok: false; reason: "not_found" | "expired" | "not_yet_valid" | "revoked" };

/**
 * Valida un token y devuelve el link si está vigente.
 *
 * Orden de checks:
 *   1. ¿Existe? (not_found)
 *   2. ¿Revocado? (revoked)
 *   3. ¿Vigente? valid_from <= now < valid_until (expired / not_yet_valid)
 *
 * **Importante:** esta función NO checkea rate limit ni nada operacional.
 * Solo validación de ventana + estado. La auditoría operacional
 * (use_count, last_used_at) se actualiza DESPUES del check-in exitoso
 * via `recordStaffLinkUse`.
 */
export async function validateStaffLink(token: string): Promise<ValidateResult> {
  if (!isRealMode()) {
    return { ok: false, reason: "not_found" };
  }
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("event_staff_links" as never)
    .select("*")
    .eq("token" as never, token)
    .maybeSingle();
  if (error || !data) {
    return { ok: false, reason: "not_found" };
  }
  const link = mapRowToLink(data as unknown as EventStaffLinkRow);
  const validity = isLinkValid(link);
  if (!validity.ok) {
    return validity;
  }
  return { ok: true, link };
}

/**
 * Logica pura de validacion de un link (sin DB). Usado por tests y por
 * `validateStaffLink` despues del SELECT.
 *
 * Reglas:
 *   1. ¿Revocado? → revoked
 *   2. ¿now < valid_from? → not_yet_valid
 *   3. ¿now >= valid_until? → expired
 *   4. Todo OK → ok
 *
 * `now` es inyectable para tests deterministas.
 */
export function isLinkValid(
  link: Pick<EventStaffLink, "revokedAt" | "validFrom" | "validUntil">,
  now: number = Date.now(),
): { ok: true } | { ok: false; reason: "expired" | "not_yet_valid" | "revoked" } {
  if (link.revokedAt) {
    return { ok: false, reason: "revoked" };
  }
  const validFrom = new Date(link.validFrom).getTime();
  const validUntil = new Date(link.validUntil).getTime();
  if (now < validFrom) {
    return { ok: false, reason: "not_yet_valid" };
  }
  if (now >= validUntil) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true };
}

/**
 * Lista todos los links de un evento (activos + revocados), ordenados
 * por más recientes primero.
 */
export async function listStaffLinks(eventId: string): Promise<EventStaffLink[]> {
  if (!isRealMode()) {
    return [];
  }
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("event_staff_links" as never)
    .select("*")
    .eq("event_id" as never, eventId)
    .order("created_at" as never, { ascending: false });
  if (error || !data) {
    return [];
  }
  return (data as unknown as EventStaffLinkRow[]).map(mapRowToLink);
}

// ─────────────────────────────────────────────────────────────
// Operacional
// ─────────────────────────────────────────────────────────────

/**
 * Bump `use_count` y `last_used_at` después de un check-in exitoso.
 * No falla si el link ya no existe (race con revoke) — loggea y sigue.
 */
export async function recordStaffLinkUse(linkId: string): Promise<void> {
  if (!isRealMode()) {
    return;
  }
  const supabase = createSupabaseAdminClient();
  // El RPC `increment` no existe en Supabase JS sin crear funcion. Usamos
  // SELECT + UPDATE. Si concurrencia es un problema, se cambia a RPC.
  const { data: current, error: selErr } = await supabase
    .from("event_staff_links" as never)
    .select("use_count")
    .eq("id" as never, linkId)
    .maybeSingle();
  if (selErr || !current) return;
  const useCount = ((current as { use_count: number }).use_count ?? 0) + 1;
  await supabase
    .from("event_staff_links" as never)
    .update({
      use_count: useCount,
      last_used_at: new Date().toISOString(),
    } as never)
    .eq("id" as never, linkId);
}