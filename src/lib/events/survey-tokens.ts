/**
 * Helpers para tokens de encuesta post-evento (Fase 7a+, G-4).
 *
 * Esta capa maneja la generacion + lookup de tokens URL-safe para la
 * ruta publica `/encuesta/[token]`. Distinct de `event-qr-tokens.ts`
 * (que es para check-in en puerta).
 *
 * Server-only. RLS default-deny. Solo service role.
 *
 * @server
 */

import { randomBytes } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { normalizePhone } from "../crm/phone-utils.ts";

function isRealMode(): boolean {
  if (typeof window !== "undefined") return false;
  return checkSupabaseConfig().configured;
}

// ─────────────────────────────────────────────────────────────
// Tipos publicos
// ─────────────────────────────────────────────────────────────

export interface SurveyToken {
  id: string;
  event_id: string;
  token: string;
  email: string | null;
  phone_normalized: string | null;
  attendee_id: string | null;
  confirmation_id: string | null;
  expires_at: string;
  sent_at: string | null;
  submitted_survey_id: string | null;
  created_at: string;
}

export interface SurveyTokenWithContext extends SurveyToken {
  /** Status derivado para el form publico. */
  status: "valid" | "used" | "expired" | "not_found";
}

export interface GenerateTokensForEventInput {
  eventId: string;
  /** Override del base URL para construir el link. Default: NEXT_PUBLIC_APP_URL o localhost. */
  baseUrl?: string;
  /** Override del TTL. Default: 30 dias. */
  ttlDays?: number;
}

export interface GenerateTokensForEventResult {
  ok: boolean;
  tokens: Array<{ token: SurveyToken; url: string }>;
  note: string;
  totalAttempted: number;
  newlyCreated: number;
  alreadyIssued: number;
}

// ─────────────────────────────────────────────────────────────
// Tipos internos
// ─────────────────────────────────────────────────────────────

interface TokenRow {
  id: string;
  event_id: string;
  token: string;
  email: string | null;
  phone_normalized: string | null;
  attendee_id: string | null;
  confirmation_id: string | null;
  expires_at: string;
  sent_at: string | null;
  submitted_survey_id: string | null;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────
// Helpers puros (testables sin DB)
// ─────────────────────────────────────────────────────────────

function generateRandomToken(): string {
  return randomBytes(24).toString("base64url");
}

function buildSurveyUrl(baseUrl: string, token: string): string {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    base = new URL("http://localhost:3000");
  }
  const url = new URL(`/encuesta/${encodeURIComponent(token)}`, base);
  return url.toString();
}

/**
 * Compara timestamps ISO como > expira?
 * Re-export del helper puro (en `survey-token-expiry.ts`) para evitar
 * acoplar este archivo a `@/` aliases en tests con `node --test`.
 */
import { isSurveyTokenExpired } from "./survey-token-expiry";
export { isSurveyTokenExpired };

// ─────────────────────────────────────────────────────────────
// Generacion
// ─────────────────────────────────────────────────────────────

/**
 * Genera tokens de encuesta para todos los asistentes + confirmados de
 * un evento. Idempotente: si ya existe token activo (no usado, no
 * expirado) para el mismo (event_id, email), lo reutiliza.
 *
 * Devuelve la lista con URLs listas para mandar por email.
 */
export async function generateSurveyTokensForEvent(
  input: GenerateTokensForEventInput,
): Promise<GenerateTokensForEventResult> {
  if (!isRealMode()) {
    return {
      ok: false,
      tokens: [],
      note: "Supabase no configurado.",
      totalAttempted: 0,
      newlyCreated: 0,
      alreadyIssued: 0,
    };
  }

  const supabase = createSupabaseAdminClient();

  // 1. Traer el evento (para ttl + base url).
  const { data: event, error: evErr } = await supabase
    .from("events")
    .select("id, slug, ends_at")
    .eq("id", input.eventId)
    .maybeSingle();
  if (evErr || !event) {
    return {
      ok: false,
      tokens: [],
      note: "Evento no encontrado.",
      totalAttempted: 0,
      newlyCreated: 0,
      alreadyIssued: 0,
    };
  }
  const eventRow = event as { id: string; slug: string; ends_at: string | null };
  const nowMs = Date.now();
  const baseIso = eventRow.ends_at ?? new Date().toISOString();
  const ttlMs = (input.ttlDays ?? 30) * 24 * 60 * 60 * 1000;
  const expiresAt = new Date(
    new Date(baseIso).getTime() + ttlMs,
  ).toISOString();
  const baseUrl = input.baseUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  // 2. Traer confirmados + asistentes del evento.
  //    Hecho en paralelo — 2 queries cortas.
  const [confRes, attRes] = await Promise.all([
    supabase
      .from("event_confirmations")
      .select("id, email, phone_normalized")
      .eq("event_id", input.eventId),
    supabase
      .from("event_attendees")
      .select("id, email, phone_normalized")
      .eq("event_id", input.eventId),
  ]);
  if (confRes.error || attRes.error) {
    return {
      ok: false,
      tokens: [],
      note: "Error leyendo confirmados/asistentes.",
      totalAttempted: 0,
      newlyCreated: 0,
      alreadyIssued: 0,
    };
  }
  type ConfRow = { id: string; email: string | null; phone_normalized: string | null };
  type AttRow = { id: string; email: string | null; phone_normalized: string | null };
  const confs = (confRes.data ?? []) as ConfRow[];
  const atts = (attRes.data ?? []) as AttRow[];

  // 3. Buscar tokens existentes para el evento (idempotencia).
  const { data: existingRows, error: exErr } = await supabase
    .from("event_survey_tokens" as never)
    .select("id, event_id, token, email, phone_normalized, attendee_id, confirmation_id, expires_at, sent_at, submitted_survey_id, created_at")
    .eq("event_id" as never, input.eventId);
  if (exErr) {
    return {
      ok: false,
      tokens: [],
      note: `Error leyendo tokens existentes: ${exErr.code ?? "unknown"}.`,
      totalAttempted: 0,
      newlyCreated: 0,
      alreadyIssued: 0,
    };
  }
  const existingByEmail = new Map<string, TokenRow>();
  for (const row of (existingRows ?? []) as unknown as TokenRow[]) {
    if (row.email && !row.submitted_survey_id && !isSurveyTokenExpired(row.expires_at, nowMs)) {
      existingByEmail.set(row.email.toLowerCase(), row);
    }
  }

  // 4. Generar / reutilizar tokens.
  let newlyCreated = 0;
  let alreadyIssued = 0;
  const out: Array<{ token: SurveyToken; url: string }> = [];

  // Helper para insertar un nuevo token. Si choca por UNIQUE (alguien
  // genero a la vez), lo manejamos fuera.
  async function insertToken(args: {
    email: string | null;
    phone: string | null;
    attendeeId: string | null;
    confirmationId: string | null;
  }): Promise<TokenRow> {
    const token = generateRandomToken();
    const { data, error } = await supabase
      .from("event_survey_tokens" as never)
      .insert({
        event_id: input.eventId,
        token,
        email: args.email,
        phone_normalized: args.phone,
        attendee_id: args.attendeeId,
        confirmation_id: args.confirmationId,
        expires_at: expiresAt,
      } as never)
      .select("*")
      .single();
    if (error || !data) throw error ?? new Error("insert failed");
    return data as unknown as TokenRow;
  }

  // Iterar confirmados primero (tienen email/phone mas confiable).
  const seen = new Set<string>();
  for (const c of confs) {
    const email = c.email?.trim().toLowerCase() || null;
    if (!email) continue;
    if (seen.has(email)) continue;
    seen.add(email);

    const phone = c.phone_normalized ?? normalizePhone(null);
    let row: TokenRow;
    const existing = existingByEmail.get(email);
    if (existing) {
      row = existing;
      alreadyIssued++;
    } else {
      row = await insertToken({ email, phone, attendeeId: null, confirmationId: c.id });
      newlyCreated++;
    }
    out.push({ token: row as SurveyToken, url: buildSurveyUrl(baseUrl, row.token) });
  }

  // Luego asistentes sin confirmation matcheable (tienen email distinto al confirmed).
  for (const a of atts) {
    const email = a.email?.trim().toLowerCase() || null;
    if (!email) continue;
    if (seen.has(email)) continue;
    seen.add(email);

    const phone = a.phone_normalized ?? null;
    let row: TokenRow;
    const existing = existingByEmail.get(email);
    if (existing) {
      row = existing;
      alreadyIssued++;
    } else {
      row = await insertToken({ email, phone, attendeeId: a.id, confirmationId: null });
      newlyCreated++;
    }
    out.push({ token: row as SurveyToken, url: buildSurveyUrl(baseUrl, row.token) });
  }

  return {
    ok: true,
    tokens: out,
    note:
      out.length === 0
        ? "Sin confirmados ni asistentes con email."
        : `${out.length} tokens listos (${newlyCreated} nuevos, ${alreadyIssued} ya emitidos).`,
    totalAttempted: confs.length + atts.length,
    newlyCreated,
    alreadyIssued,
  };
}

// ─────────────────────────────────────────────────────────────
// Lookup (usado por GET /encuesta/[token] y POST /api/submit-survey)
// ─────────────────────────────────────────────────────────────

/**
 * Busca un token y devuelve su estado derivado.
 *
 * `valid`   - usable, no usado, no expirado
 * `used`    - submitted_survey_id != null (ya respondio)
 * `expired` - expirado
 * `not_found` - no existe
 */
export async function lookupSurveyToken(token: string): Promise<SurveyTokenWithContext | null> {
  if (!isRealMode()) return null;
  if (!token || token.length < 16) return null;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("event_survey_tokens" as never)
    .select("*")
    .eq("token" as never, token)
    .maybeSingle();
  if (error || !data) return null;

  const row = data as unknown as TokenRow;
  const status: SurveyTokenWithContext["status"] = row.submitted_survey_id
    ? "used"
    : isSurveyTokenExpired(row.expires_at)
      ? "expired"
      : "valid";

  return { ...(row as SurveyToken), status };
}

/**
 * Marca el token como usado, linkandolo al survey creado.
 *
 * Idempotente: si ya tiene submitted_survey_id, no-op.
 *
 * Devuelve `true` si el row se actualizo, `false` si ya estaba usado o
 * no se encontro.
 */
export async function markSurveyTokenUsed(
  token: string,
  surveyId: string,
): Promise<boolean> {
  if (!isRealMode()) return false;
  if (!token || !surveyId) return false;

  const supabase = createSupabaseAdminClient();
  // SELECT para check.
  const { data: existing, error: sErr } = await supabase
    .from("event_survey_tokens" as never)
    .select("submitted_survey_id")
    .eq("token" as never, token)
    .maybeSingle();
  if (sErr || !existing) return false;
  const row = existing as { submitted_survey_id: string | null };
  if (row.submitted_survey_id) return false;

  const { error: uErr } = await supabase
    .from("event_survey_tokens" as never)
    .update({ submitted_survey_id: surveyId } as never)
    .eq("token" as never, token)
    .is("submitted_survey_id" as never, null);
  return !uErr;
}

/**
 * Marca el token como enviado (sent_at = now).
 *
 * Llamado despues de mandar el email recordatorio. Idempotente: si ya
 * tiene sent_at, no-op.
 */
export async function markSurveyTokenSent(token: string): Promise<boolean> {
  if (!isRealMode()) return false;
  if (!token) return false;

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("event_survey_tokens" as never)
    .update({ sent_at: new Date().toISOString() } as never)
    .eq("token" as never, token)
    .is("sent_at" as never, null);
  return !error;
}

/* ------------------------------------------------------------------ */
/* Single-token helpers (feat/funnel-survey-scoring, 2026-07-04)      */
/* ------------------------------------------------------------------ */

export interface GetOrCreateSurveyTokenInput {
  eventId: string;
  email: string | null;
  phoneNormalized: string | null;
  baseUrl?: string;
}

export interface GetOrCreateSurveyTokenResult {
  ok: boolean;
  url?: string;
  reused: boolean;
  note: string;
}

/**
 * Busca un survey token valido (no usado, no expirado) para
 * (event_id, email) y lo reutiliza; si no existe, crea uno nuevo.
 *
 * Usado por el bot engine cuando el lead hace click en "Sí" del
 * survey offer post-check-in. Mantiene el contrato: cada (evento,
 * contacto) tiene UN solo token activo a la vez.
 *
 * Si email viene vacio, busca por phone_normalized. Si ambos vienen
 * vacios, devuelve ok:false (caso raro — caller deberia haber pedido
 * el email primero).
 */
export async function getOrCreateSurveyTokenForContact(
  input: GetOrCreateSurveyTokenInput,
): Promise<GetOrCreateSurveyTokenResult> {
  if (!isRealMode()) {
    return { ok: false, reused: false, note: "Supabase no configurado." };
  }
  if (!input.eventId) {
    return { ok: false, reused: false, note: "Falta eventId." };
  }
  const email = input.email?.trim().toLowerCase() || null;
  const phone = input.phoneNormalized?.trim() || null;
  if (!email && !phone) {
    return {
      ok: false,
      reused: false,
      note: "Falta email o phone para generar token.",
    };
  }

  const supabase = createSupabaseAdminClient();

  // 1) Buscar token existente valido.
  let existingQuery = supabase
    .from("event_survey_tokens" as never)
    .select("*")
    .eq("event_id" as never, input.eventId)
    .is("submitted_survey_id" as never, null);
  if (email) {
    existingQuery = existingQuery.eq("email" as never, email);
  } else if (phone) {
    existingQuery = existingQuery.eq("phone_normalized" as never, phone);
  }
  const { data: existingRows, error: exErr } = await existingQuery
    .order("created_at" as never, { ascending: false })
    .limit(1);
  if (exErr) {
    return {
      ok: false,
      reused: false,
      note: `Error buscando token: ${exErr.code ?? "unknown"}`,
    };
  }
  const existing = (existingRows ?? [])[0] as TokenRow | undefined;
  if (existing && !isSurveyTokenExpired(existing.expires_at)) {
    const baseUrl =
      input.baseUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    return {
      ok: true,
      url: buildSurveyUrl(baseUrl, existing.token),
      reused: true,
      note: "Token existente reutilizado.",
    };
  }

  // 2) Traer evento para TTL.
  const { data: event, error: evErr } = await supabase
    .from("events")
    .select("ends_at")
    .eq("id", input.eventId)
    .maybeSingle();
  if (evErr || !event) {
    return { ok: false, reused: false, note: "Evento no encontrado." };
  }
  const evRow = event as { ends_at: string | null };
  const baseIso = evRow.ends_at ?? new Date().toISOString();
  const expiresAt = new Date(
    new Date(baseIso).getTime() + 30 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const baseUrl =
    input.baseUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  // 3) Crear token nuevo.
  const token = generateRandomToken();
  const { error: insErr } = await supabase
    .from("event_survey_tokens" as never)
    .insert({
      event_id: input.eventId,
      token,
      email,
      phone_normalized: phone,
      expires_at: expiresAt,
    } as never);
  if (insErr) {
    // Race: alguien inserto a la vez. Buscar de nuevo y usar ese.
    if (insErr.code === "23505") {
      const { data: raced } = await supabase
        .from("event_survey_tokens" as never)
        .select("token")
        .eq("event_id" as never, input.eventId)
        .eq("email" as never, email ?? "")
        .limit(1);
      const racedToken = (raced ?? [])[0] as { token: string } | undefined;
      if (racedToken) {
        return {
          ok: true,
          url: buildSurveyUrl(baseUrl, racedToken.token),
          reused: true,
          note: "Token creado por otra request (race resuelta).",
        };
      }
    }
    return {
      ok: false,
      reused: false,
      note: `No se pudo crear token: ${insErr.code ?? "unknown"}`,
    };
  }

  return {
    ok: true,
    url: buildSurveyUrl(baseUrl, token),
    reused: false,
    note: "Token nuevo creado.",
  };
}
