/**
 * Helpers para generar tokens QR de check-in por asistente.
 *
 * Para cada confirmado del evento se genera un token URL-safe único
 * (crypto.randomBytes(24).toString('base64url') = 32 chars), se inserta
 * en `event_qr_tokens` con expires_at = event.endsAt + 6h, y se devuelve
 * la URL completa `${NEXT_PUBLIC_APP_URL}/check-in/${token}`.
 *
 * El QR se genera como data URL vía `generateQrDataUrl()` (reutilizando
 * el helper de `src/lib/qr/generate.ts`). La página pública
 * `/check-in/[token]` muestra el nombre del asistente y un botón grande
 * "Confirmar asistencia" que pega contra `/api/check-in/[token]`.
 *
 * Idempotencia: si el (event_id, attendee_phone_normalized) ya tiene
 * un token activo (no expirado, no checkeado), lo reutilizamos en lugar
 * de generar uno nuevo. Esto evita que un asistente que recibe el QR
 * dos veces (ej. reenvío de WhatsApp) genere links distintos.
 *
 * Server-only. Datos personales solo aquí.
 *
 * @server
 */

import { randomBytes } from "node:crypto";
import { generateQrDataUrl } from "./generate";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { normalizePhone } from "@/lib/crm/phone-utils";
import { getEventById } from "@/lib/events/events-server";
import type { EventConfirmation } from "@/types/events";

// ─────────────────────────────────────────────────────────────
// Tipos públicos
// ─────────────────────────────────────────────────────────────

export interface EventQrToken {
  /** Token URL-safe (32 chars base64url). */
  token: string;
  /** URL completa que codifica el QR. */
  url: string;
  /** Data URL del QR PNG (base64), listo para <img src=...> o para descargar. */
  qrDataUrl: string;
  /** Nombre del asistente (snapshot del momento de generación). */
  attendeeName: string;
  /** Teléfono normalizado (+52XXXXXXXXXX). */
  attendeePhone: string | null;
  /** Email del asistente (puede ser null). */
  attendeeEmail: string | null;
  /** ID del evento al que pertenece. */
  eventId: string;
  /** Si ya tenía check-in previo al regenerar. */
  alreadyCheckedIn: boolean;
  /** ISO timestamp del check-in si existed. */
  checkedInAt: string | null;
}

export interface GenerateTokensInput {
  eventId: string;
  /**
   * Asistentes a generar token. Si se omite, usa las confirmaciones del
   * evento (las trae `getConfirmationsByEventId` internamente).
   */
  attendees?: EventConfirmation[];
  /**
   * Override del base URL. Si no, usa `NEXT_PUBLIC_APP_URL` o cae a
   * `http://localhost:3000`.
   */
  baseUrl?: string;
}

export interface GenerateTokensResult {
  ok: boolean;
  tokens: EventQrToken[];
  note: string;
  /** Total de confirmados que se intentaron procesar. */
  totalAttempted: number;
  /** Cuántos se generaron NUEVOS (vs reutilizados). */
  newlyCreated: number;
  /** Cuántos ya tenían check-in previo (visibilidad admin). */
  alreadyCheckedIn: number;
}

// ─────────────────────────────────────────────────────────────
// Helpers internos
// ─────────────────────────────────────────────────────────────

function buildCheckInUrl(baseUrl: string, token: string): string {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    base = new URL("http://localhost:3000");
  }
  const url = new URL(`/check-in/${encodeURIComponent(token)}`, base);
  return url.toString();
}

function generateRandomToken(): string {
  // 24 bytes → 32 chars base64url (URL-safe). Cumple la constraint
  // del schema (`text not null unique`) y es human-impossible de
  // adivinar.
  return randomBytes(24).toString("base64url");
}

function isRealMode(): boolean {
  if (typeof window !== "undefined") return false;
  return checkSupabaseConfig().configured;
}

/**
 * Calcula la fecha de expiración del QR: event.endsAt + 6h, o si no
 * tiene endsAt, event.startsAt + 24h.
 */
function computeExpiresAt(
  endsAt: string | undefined,
  startsAt: string,
): string {
  const baseIso = endsAt ?? startsAt;
  const base = new Date(baseIso);
  const sixHoursMs = 6 * 60 * 60 * 1000;
  const fallbackMs = 24 * 60 * 60 * 1000;
  const offset = endsAt ? sixHoursMs : fallbackMs;
  return new Date(base.getTime() + offset).toISOString();
}

// ─────────────────────────────────────────────────────────────
// API pública
// ─────────────────────────────────────────────────────────────

/**
 * Genera tokens QR para todos los confirmados (o attendees provistos) de
 * un evento. Reutiliza tokens activos no-expirados si ya existen.
 *
 * No falla si Supabase no está configurado: devuelve array vacío con
 * `ok: false` y `note` explicativo.
 */
export async function generateEventQrTokens(
  input: GenerateTokensInput,
): Promise<GenerateTokensResult> {
  if (!isRealMode()) {
    return {
      ok: false,
      tokens: [],
      note: "Supabase no configurado.",
      totalAttempted: 0,
      newlyCreated: 0,
      alreadyCheckedIn: 0,
    };
  }

  // 1. Resolver attendees: si no se pasan, traer confirmaciones del evento.
  let attendees = input.attendees ?? null;
  if (!attendees) {
    const { getConfirmationsByEventId } = await import(
      "@/lib/events/confirmations-server"
    );
    attendees = await getConfirmationsByEventId(input.eventId);
  }
  if (!attendees || attendees.length === 0) {
    return {
      ok: true,
      tokens: [],
      note: "Sin confirmados para generar tokens.",
      totalAttempted: 0,
      newlyCreated: 0,
      alreadyCheckedIn: 0,
    };
  }

  // 2. Resolver el evento (para expires_at).
  const event = await getEventById(input.eventId);
  if (!event) {
    return {
      ok: false,
      tokens: [],
      note: "Evento no existe.",
      totalAttempted: attendees.length,
      newlyCreated: 0,
      alreadyCheckedIn: 0,
    };
  }
  const expiresAt = computeExpiresAt(event.endsAt, event.startsAt);

  // 3. Buscar tokens existentes para este evento (idempotencia).
  // `event_qr_tokens` no está en el typegen pre-migration
  // (20260629223747_whatsapp_funnel_v1.sql) — la agregaremos en un
  // typegen refresh futuro. Mientras tanto, casteamos via `as never`
  // (mismo patrón que `audit-server.ts` con `before`/`after`).
  const supabase = createSupabaseAdminClient();
  const { data: existingRows } = await supabase
    .from("event_qr_tokens" as never)
    .select("*")
    .eq("event_id" as never, input.eventId);
  type ExistingRow = {
    token: string;
    attendee_phone_normalized: string;
    attendee_name: string;
    attendee_email: string | null;
    checked_in_at: string | null;
    expires_at: string;
  };
  const existingByPhone = new Map<string, ExistingRow>();
  for (const row of (existingRows ?? []) as unknown as ExistingRow[]) {
    if (!row.checked_in_at) {
      existingByPhone.set(row.attendee_phone_normalized, row);
    }
  }

  // 4. Resolver base URL.
  const baseUrl =
    input.baseUrl ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000";

  // 5. Generar / reutilizar tokens.
  let newlyCreated = 0;
  let alreadyCheckedIn = 0;
  const tokens: EventQrToken[] = [];

  for (const c of attendees) {
    const phone = c.phoneNormalized ?? normalizePhone(c.phoneRaw ?? null);
    const name = c.name?.trim() || "(sin nombre)";
    const email = c.email ?? null;

    if (!phone) {
      // Sin phone no podemos hacer key de idempotencia ni enviar QR.
      // Lo saltamos silenciosamente; el admin verá el gap en el log.
      continue;
    }

    let token: string;
    let row: ExistingRow | null = existingByPhone.get(phone) ?? null;
    let checkedInAt: string | null = null;
    let alreadyCheckedInFlag = false;

    if (row) {
      // Reutilizar token existente (idempotencia).
      token = row.token;
      if (row.checked_in_at) {
        alreadyCheckedInFlag = true;
        alreadyCheckedIn++;
        checkedInAt = row.checked_in_at;
      }
    } else {
      // Generar nuevo token.
      token = generateRandomToken();
      // Insert en la DB. Si choca por UNIQUE (race), capturamos y
      // volvemos a buscar.
      const insertPayload = {
        event_id: input.eventId,
        attendee_phone_normalized: phone,
        attendee_name: name,
        attendee_email: email,
        token,
        expires_at: expiresAt,
      };
      const { error: insErr } = await supabase
        .from("event_qr_tokens" as never)
        .insert(insertPayload as never);
      if (insErr) {
        // Si es unique violation, alguien insertó a la vez. Buscamos
        // el existente y usamos ese.
        if (insErr.code === "23505") {
          const { data: raceRow } = await supabase
            .from("event_qr_tokens" as never)
            .select("*")
            .eq("event_id" as never, input.eventId)
            .eq("attendee_phone_normalized" as never, phone)
            .maybeSingle();
          if (raceRow) {
            const r = raceRow as unknown as ExistingRow;
            token = r.token;
            row = r;
            if (r.checked_in_at) {
              alreadyCheckedInFlag = true;
              alreadyCheckedIn++;
              checkedInAt = r.checked_in_at;
            }
          } else {
            continue;
          }
        } else {
          // Otro error → lo loggeamos y seguimos con el próximo.
          // eslint-disable-next-line no-console
          console.error("[event-tokens] insert falló", {
            code: insErr.code,
            phone,
          });
          continue;
        }
      } else {
        newlyCreated++;
      }
    }

    const url = buildCheckInUrl(baseUrl, token);
    const qrDataUrl = await generateQrDataUrl(url, { width: 512 });
    tokens.push({
      token,
      url,
      qrDataUrl,
      attendeeName: name,
      attendeePhone: phone,
      attendeeEmail: email,
      eventId: input.eventId,
      alreadyCheckedIn: alreadyCheckedInFlag,
      checkedInAt: checkedInAt,
    });
  }

  return {
    ok: true,
    tokens,
    note: `${tokens.length} tokens listos (${newlyCreated} nuevos, ${alreadyCheckedIn} ya con check-in).`,
    totalAttempted: attendees.length,
    newlyCreated,
    alreadyCheckedIn,
  };
}

/**
 * Devuelve los tokens existentes para un evento (sin generar nuevos).
 * Útil para el admin que quiere ver qué QRs ya están emitidos.
 */
export interface ExistingTokensResult {
  ok: boolean;
  tokens: EventQrToken[];
  note: string;
}

export async function getEventQrTokens(
  eventId: string,
  baseUrlOverride?: string,
): Promise<ExistingTokensResult> {
  if (!isRealMode()) {
    return {
      ok: false,
      tokens: [],
      note: "Supabase no configurado.",
    };
  }
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("event_qr_tokens" as never)
    .select("*")
    .eq("event_id" as never, eventId)
    .order("created_at", { ascending: false });
  if (error) {
    return {
      ok: false,
      tokens: [],
      note: `No se pudo leer tokens (${error.code ?? "unknown"}).`,
    };
  }
  const baseUrl =
    baseUrlOverride ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000";
  type Row = {
    token: string;
    attendee_name: string;
    attendee_phone_normalized: string;
    attendee_email: string | null;
    checked_in_at: string | null;
  };
  const tokens: EventQrToken[] = [];
  for (const row of (data ?? []) as unknown as Row[]) {
    const url = buildCheckInUrl(baseUrl, row.token);
    const qrDataUrl = await generateQrDataUrl(url, { width: 512 });
    tokens.push({
      token: row.token,
      url,
      qrDataUrl,
      attendeeName: row.attendee_name,
      attendeePhone: row.attendee_phone_normalized,
      attendeeEmail: row.attendee_email,
      eventId,
      alreadyCheckedIn: Boolean(row.checked_in_at),
      checkedInAt: row.checked_in_at,
    });
  }
  return { ok: true, tokens, note: `${tokens.length} tokens.` };
}