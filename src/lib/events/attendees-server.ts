/**
 * Servicios server-side para asistentes de eventos (Fase 3).
 *
 * Server-only. Un attendee puede NO matchear con confirmation (la
 * persona pudo haberse presentado sin confirmar antes). El admin
 * puede marcar el match manual en Fase 4+.
 *
 * Privacidad: datos personales solo server-side. RLS deny para anon.
 *
 * @server
 */

import type {
  EventAttendee,
  EventAttendeeSource,
} from "@/types/events";
import {
  mapEventAttendeeRowToEventAttendee,
  type EventAttendeeRow,
} from "./event-mapper";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { normalizePhone } from "../crm/phone-utils.ts";

function isRealMode(): boolean {
  if (typeof window !== "undefined") return false;
  return checkSupabaseConfig().configured;
}

// ─────────────────────────────────────────────────────────────
// Tipos públicos
// ─────────────────────────────────────────────────────────────

export interface CreateAttendeeInput {
  eventId: string;
  confirmationId?: string | null;
  name?: string | null;
  email?: string | null;
  phoneNormalized?: string | null;
  source?: EventAttendeeSource;
  importBatchId?: string | null;
  /**
   * Migration 20260707090000: checked_in_at es nullable. Por default
   * NULL (no asumimos check-in). Para check-in presencial, el caller
   * pasa `new Date().toISOString()`. Para virtual/hybrid via gate,
   * el caller pasa null explícito.
   */
  checkedInAt?: string | null;
  checkedInBy?: string | null;
}

export interface CreateAttendeeResult {
  ok: boolean;
  attendee?: EventAttendee;
  created: boolean;
  persisted: boolean;
  demo: boolean;
  note: string;
}

// ─────────────────────────────────────────────────────────────
// Lecturas
// ─────────────────────────────────────────────────────────────

export async function getAttendeesByEventId(
  eventId: string,
): Promise<EventAttendee[]> {
  if (!isRealMode()) return [];
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("event_attendees")
    .select("*")
    .eq("event_id", eventId)
    .order("checked_in_at", { ascending: false });
  if (error || !data) {
    if (error) {
      // eslint-disable-next-line no-console
      console.error("[attendees-server] getAttendeesByEventId falló", {
        code: error.code,
        eventId,
      });
    }
    return [];
  }
  return (data as EventAttendeeRow[]).map(mapEventAttendeeRowToEventAttendee);
}

/**
 * Devuelve attendees que NO tienen confirmation_id (vinieron sin
 * confirmar antes). Útil para el reporte del admin "X personas
 * asistieron sin confirmación previa".
 */
export async function getUnmatchedAttendees(
  eventId: string,
): Promise<EventAttendee[]> {
  if (!isRealMode()) return [];
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("event_attendees")
    .select("*")
    .eq("event_id", eventId)
    .is("confirmation_id", null);
  if (error || !data) return [];
  return (data as EventAttendeeRow[]).map(mapEventAttendeeRowToEventAttendee);
}

// ─────────────────────────────────────────────────────────────
// Escritura
// ─────────────────────────────────────────────────────────────

/**
 * Crea un attendee. Server-only. Si ya existe (dedup por email dentro
 * del mismo evento), devuelve `created: false`.
 */
export async function createAttendee(
  input: CreateAttendeeInput,
): Promise<CreateAttendeeResult> {
  if (!isRealMode()) {
    return {
      ok: false,
      created: false,
      persisted: false,
      demo: true,
      note: "Supabase no configurado.",
    };
  }
  if (!input.eventId) {
    return {
      ok: false,
      created: false,
      persisted: false,
      demo: false,
      note: "Falta eventId.",
    };
  }

  // FIX 2026-07-12 (C-4 de OPEN_ITEMS): rechazar attendees sin identificador.
  // El bug original era: un asistente sin email que clickea 5 veces el QR
  // del gate virtual producía 5 rows en `event_attendees` porque el UNIQUE
  // (event_id, email) trata NULLs como distintos. Ahora exigimos al menos
  // uno de los dos: email O phone. Esto previene el caso y permite que la
  // migration que agrega UNIQUE (event_id, phone_normalized) sea safe
  // (los call sites ya no pasan null en este path).
  const phoneNormalized = input.phoneNormalized ?? null;
  const hasIdentifier = !!(input.email?.trim() || phoneNormalized);
  if (!hasIdentifier) {
    return {
      ok: false,
      created: false,
      persisted: false,
      demo: false,
      note:
        "Attendee requiere al menos email o phone_normalized para deduplicar.",
    };
  }

  const supabase = createSupabaseAdminClient();
  // UPSERT con ignore: si ya existe (UNIQUE por event_id + phone_normalized),
  // no inserta. Migration 20260707090000: checked_in_at ahora es nullable.
  // Si el caller pasa checkedInAt explicito (gate virtual = null,
  // check-in = Date.now()), lo respetamos. Si no, dejamos null.
  //
  // FIX 2026-07-12 (C-4): cambiamos `onConflict` de "event_id,email" a
  // "event_id,phone_normalized" porque `phone_normalized` es NOT NULL
  // (ver migration 20260712220000) y deduplica correctamente. La validación
  // arriba garantiza que el caller siempre pase phone O email — si pasa
  // ambos, el phone es el dedup key más estable (el email puede cambiar,
  // el phone no).
  const { data, error } = await supabase
    .from("event_attendees")
    .upsert(
      {
        event_id: input.eventId,
        confirmation_id: input.confirmationId ?? null,
        name: input.name?.trim() || null,
        email: input.email?.trim().toLowerCase() || null,
        phone_normalized: phoneNormalized,
        source: input.source ?? "check_in",
        import_batch_id: input.importBatchId ?? null,
        checked_in_at: input.checkedInAt ?? null,
        checked_in_by: input.checkedInBy ?? null,
      },
      { onConflict: "event_id,phone_normalized", ignoreDuplicates: true },
    )
    .select("*")
    .maybeSingle();

  if (error) {
    // eslint-disable-next-line no-console
    console.error("[attendees-server] createAttendee falló", {
      code: error.code,
      eventId: input.eventId,
    });
    return {
      ok: false,
      created: false,
      persisted: false,
      demo: false,
      note: `No se pudo crear el attendee (${error.code ?? "unknown"}).`,
    };
  }

  if (!data) {
    // Ya existía — buscamos el existente.
    if (input.email) {
      const { data: existing } = await supabase
        .from("event_attendees")
        .select("*")
        .eq("event_id", input.eventId)
        .eq("email", input.email.trim().toLowerCase())
        .maybeSingle();
      if (existing) {
        return {
          ok: true,
          attendee: mapEventAttendeeRowToEventAttendee(existing as EventAttendeeRow),
          created: false,
          persisted: true,
          demo: false,
          note: "Ya existía (dedup por email).",
        };
      }
    }
    return {
      ok: false,
      created: false,
      persisted: false,
      demo: false,
      note: "Conflicto desconocido.",
    };
  }

  return {
    ok: true,
    attendee: mapEventAttendeeRowToEventAttendee(data as EventAttendeeRow),
    created: true,
    persisted: true,
    demo: false,
    note: "Attendee registrado en Supabase.",
  };
}

// ─────────────────────────────────────────────────────────────
// Capa 3 de Fase 4: match manual attendee <-> confirmation
// ─────────────────────────────────────────────────────────────

export interface LinkAttendeeResult {
  ok: boolean;
  note: string;
}

/**
 * Vincula manualmente un attendee (walk-in) con una confirmation
 * existente. El attendee se identifica por su nombre/email/phone, y
 * la confirmation es la persona que dijo "si, voy" pero no se
 * checkeo.
 *
 * Reglas:
 * - El attendee DEBE existir y DEBE tener confirmation_id NULL
 *   (no sobreescribimos matches ya hechos).
 * - La confirmation DEBE existir y pertenecer al mismo evento
 *   (no mezclamos eventos).
 * - Si todo OK, UPDATE event_attendees SET confirmation_id = $confirmationId.
 *
 * Devuelve un objeto con `ok` y `note` para feedback al admin.
 */
export async function linkAttendeeToConfirmation(
  attendeeId: string,
  confirmationId: string,
): Promise<LinkAttendeeResult> {
  if (!isRealMode()) {
    return { ok: false, note: "Supabase no configurado." };
  }
  if (!attendeeId || !confirmationId) {
    return { ok: false, note: "Faltan attendeeId o confirmationId." };
  }
  const supabase = createSupabaseAdminClient();

  // 1. Traer el attendee + verificar que es del mismo evento que
  //    la confirmation (anti-cross-evento). Hacemos una sola query
  //    con JOIN.
  const { data: linkData, error: linkErr } = await supabase
    .from("event_attendees")
    .select(
      `
      id,
      event_id,
      confirmation_id,
      confirmation:event_confirmations ( id, event_id )
    `,
    )
    .eq("id", attendeeId)
    .maybeSingle();

  if (linkErr || !linkData) {
    return {
      ok: false,
      note: "No se encontro el attendee.",
    };
  }
  if (linkData.confirmation_id) {
    return {
      ok: false,
      note: "Este attendee ya esta matcheado. No se sobreescribe.",
    };
  }
  // El JOIN devuelve `confirmation` como objeto o null (puede ser
  // array segun version del cliente). Normalizamos.
  type ConfJoin = { id: string; event_id: string };
  const confJoin = linkData.confirmation as ConfJoin | ConfJoin[] | null;
  const linkedConf: ConfJoin | null = Array.isArray(confJoin)
    ? confJoin[0] ?? null
    : confJoin;
  if (linkedConf && linkedConf.id === confirmationId && linkedConf.event_id !== linkData.event_id) {
    return {
      ok: false,
      note: "La confirmation no pertenece al mismo evento.",
    };
  }

  // 2. UPDATE
  const { error: updErr } = await supabase
    .from("event_attendees")
    .update({ confirmation_id: confirmationId })
    .eq("id", attendeeId);

  if (updErr) {
    // eslint-disable-next-line no-console
    console.error("[attendees-server] linkAttendeeToConfirmation falló", {
      code: updErr.code,
      attendeeId,
      confirmationId,
    });
    return {
      ok: false,
      note: `No se pudo matchear (${updErr.code ?? "unknown"}).`,
    };
  }
  return { ok: true, note: "Attendee matcheado con la confirmation." };
}

/**
 * Lista las confirmations que todavia NO estan matcheadas con un
 * attendee. Usado por el dropdown de "Match manual" — la UI solo
 * muestra opciones que tiene sentido matchear (no las ya vinculadas).
 */
export async function getUnmatchedConfirmations(
  eventId: string,
): Promise<
  Array<{
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
  }>
> {
  if (!isRealMode()) return [];
  const supabase = createSupabaseAdminClient();
  // Traemos TODAS las confirmations del evento y FILTRAMOS en memoria
  // las que ya estan matcheadas con un attendee. Esto evita un subquery
  // complejo. Si el volumen crece, cambiar a LEFT JOIN.
  const [{ data: confs, error: confsErr }, { data: links, error: linksErr }] =
    await Promise.all([
      supabase
        .from("event_confirmations")
        .select("id, name, email, phone_normalized, phone_raw")
        .eq("event_id", eventId),
      supabase
        .from("event_attendees")
        .select("confirmation_id")
        .eq("event_id", eventId)
        .not("confirmation_id", "is", null),
    ]);

  if (confsErr || linksErr || !confs) return [];
  const linkedIds = new Set((links ?? []).map((l) => l.confirmation_id).filter(Boolean));
  return confs
    .filter((c) => !linkedIds.has(c.id))
    .map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email ?? null,
      phone: c.phone_normalized ?? c.phone_raw ?? null,
    }));
}

// ─────────────────────────────────────────────────────────────
// Delete
// ─────────────────────────────────────────────────────────────

/**
 * Elimina un attendee por ID.
 *
 * FIX 2026-07-03 (sesion David, admin cleanup): David necesitaba poder
 * borrar attendees que se le quedaron de pruebas. Hasta ahora no habia
 * forma de hacerlo desde el admin.
 *
 * Auditoria: registra `entity_type='event_attendee'` con metadata
 * del attendee eliminado (nombre, phone, email) para trazabilidad.
 *
 * Devuelve `{ ok, note }`.
 */
export async function deleteAttendee(
  attendeeId: string,
): Promise<{ ok: boolean; note: string }> {
  if (!isRealMode()) {
    return { ok: false, note: "Supabase no configurado." };
  }
  if (!attendeeId) {
    return { ok: false, note: "Falta attendeeId." };
  }
  const supabase = createSupabaseAdminClient();

  // Primero leemos el attendee para el audit log (nombre + contacto).
  const { data: row } = await supabase
    .from("event_attendees")
    .select("name, email, phone_normalized, event_id")
    .eq("id", attendeeId)
    .maybeSingle();

  const { error } = await supabase
    .from("event_attendees")
    .delete()
    .eq("id", attendeeId);
  if (error) {
    return {
      ok: false,
      note: `No se pudo eliminar (${error.code ?? "?"}).`,
    };
  }

  // Audit log (best-effort — si falla, no rompemos el flow).
  if (row) {
    try {
      await supabase.from("admin_audit_log").insert({
        actor_email: "admin@qlick",
        action: "event_attendee_delete",
        entity_type: "event_attendee",
        entity_id: attendeeId,
        metadata: {
          eventId: row.event_id,
          attendeeName: row.name,
          attendeeEmail: row.email,
          attendeePhone: row.phone_normalized,
        },
      });
    } catch {
      // ignore
    }
  }

  return { ok: true, note: "Asistente eliminado." };
}

/* ------------------------------------------------------------------ */
/* Lookup por telefono (feat/funnel-survey-scoring, 2026-07-04)       */
/* ------------------------------------------------------------------ */

export interface LatestAttendedEventInfo {
  eventId: string;
  eventSlug: string;
  eventTitle: string;
  checkedInAt: string;
}

/**
 * Devuelve el evento mas reciente al que el telefono hizo check-in.
 *
 * Usado por el bot engine cuando un lead en `event_attended` responde
 * "Si" al survey offer post-evento: necesitamos el event_id para
 * generar el survey token sin re-preguntar.
 *
 * Devuelve `null` si el telefono no tiene check-ins (caso raro — el
 * status event_attended pudo haber sido seteado por otro path).
 *
 * FIX 2026-07-06 (bug reportado por David en sesion nocturna):
 * filtrar por eventos cuyo `ends_at` sea reciente (últimas 72h).
 * Sin este filtro, si el lead tiene check-in en evento viejo (terminó
 * hace semanas) y se inscribe a evento nuevo, el bot le ofrece la
 * encuesta del evento viejo en vez del nuevo. El check de 72h alinea
 * con la ventana del cron de recordatorios (WINDOW_HOURS_BACK = 4h,
 * drift ±1h → ~24h, pero dejamos 72h para holgura).
 */
const SURVEY_OFFER_EVENT_TTL_HOURS = 72;
export async function findLatestAttendedEventForPhone(
  phoneNormalized: string | null | undefined,
): Promise<LatestAttendedEventInfo | null> {
  if (!isRealMode() || !phoneNormalized) return null;
  const supabase = createSupabaseAdminClient();
  const cutoffIso = new Date(
    Date.now() - SURVEY_OFFER_EVENT_TTL_HOURS * 60 * 60 * 1000,
  ).toISOString();
  const { data, error } = await supabase
    .from("event_attendees")
    .select(
      `
      checked_in_at,
      event:events (id, slug, title, ends_at)
    `,
    )
    .eq("phone_normalized", phoneNormalized)
    .gte("event.ends_at", cutoffIso)
    .order("checked_in_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as {
    checked_in_at: string | null;
    event:
      | { id: string; slug: string; title: string; ends_at: string | null }
      | Array<{ id: string; slug: string; title: string; ends_at: string | null }>
      | null;
  };
  const evRaw = row.event;
  const ev = Array.isArray(evRaw) ? evRaw[0] ?? null : evRaw;
  if (!ev || !row.checked_in_at) return null;
  return {
    eventId: ev.id,
    eventSlug: ev.slug,
    eventTitle: ev.title,
    checkedInAt: row.checked_in_at
  };
}

// ─────────────────────────────────────────────────────────────
// Re-export para importador CLI
// ─────────────────────────────────────────────────────────────

export { normalizePhone };
