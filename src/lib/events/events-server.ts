/**
 * Servicios server-side para el catálogo de eventos (Fase 3).
 *
 * Server-only. Usa el cliente admin (service role, bypass RLS) porque el
 * admin necesita leer TODOS los eventos (incluyendo drafts/archived).
 * El cliente público usa `getPublishedEventBySlug` que también podría
 * resolverse con anon + RLS, pero centralizamos acá para mantener el
 * patrón de fallback demo del resto del proyecto.
 *
 * REGLA DE FALLBACK:
 * - Si Supabase NO está configurado → devuelve array vacío / undefined.
 *   (No hay demo data para eventos porque el módulo es nuevo.)
 * - Si Supabase SÍ está configurado → consulta la tabla real.
 *
 * Privacidad: este módulo es server-only. Datos personales nunca se
 * exponen al cliente.
 *
 * @server
 */

import type {
  Event,
  EventStatus,
  EventImportType,
} from "@/types/events";
import { mapEventRowToEvent, type EventRow } from "./event-mapper";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/crm/audit-server";

/** ¿Está activa la persistencia real? Server-only (defensa contra browser). */
function isRealMode(): boolean {
  if (typeof window !== "undefined") return false;
  return checkSupabaseConfig().configured;
}

// ─────────────────────────────────────────────────────────────
// Tipos públicos del server lib
// ─────────────────────────────────────────────────────────────

/** Resumen de un evento para el panel admin. Incluye conteos de los 3 stages. */
export interface AdminEventSummary {
  event: Event;
  confirmationCount: number;
  attendeeCount: number;
  surveyCount: number;
  /** Leads nuevos generados a partir de encuestas de este evento. */
  leadsPromoted: number;
  /** Encuestas con interés comercial que NO se promovieron (visibilidad admin). */
  surveyUnmatchedCount: number;
}

/** Input para crear un evento (admin). */
export interface CreateEventInput {
  slug: string;
  title: string;
  description?: string;
  startsAt: string; // ISO
  endsAt?: string;
  location?: string;
  coverImageUrl?: string;
  /** Si no se pasa, default a 'draft'. */
  status?: EventStatus;
}

/** Input para editar un evento (admin). Todos los campos opcionales salvo los requeridos. */
export interface UpdateEventInput {
  title?: string;
  description?: string | null;
  startsAt?: string; // ISO
  endsAt?: string | null;
  location?: string | null;
  coverImageUrl?: string | null;
}

/** Resultado de operaciones admin sobre eventos. */
export interface AdminEventOpResult {
  ok: boolean;
  event?: Event;
  note?: string;
}

// ─────────────────────────────────────────────────────────────
// Lecturas
// ─────────────────────────────────────────────────────────────

/**
 * Devuelve un evento publicado por slug (público).
 * Si está en draft/archived, devuelve undefined.
 */
export async function getPublishedEventBySlug(
  slug: string,
): Promise<Event | undefined> {
  if (!isRealMode()) return undefined;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  if (error || !data) {
    if (error) {
      // eslint-disable-next-line no-console
      console.error("[events-server] getPublishedEventBySlug falló", {
        code: error.code,
        slug,
      });
    }
    return undefined;
  }
  return mapEventRowToEvent(data as EventRow);
}

/**
 * Devuelve un evento por slug (admin, sin filtro de status).
 */
export async function getEventBySlug(slug: string): Promise<Event | undefined> {
  if (!isRealMode()) return undefined;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (error || !data) {
    if (error) {
      // eslint-disable-next-line no-console
      console.error("[events-server] getEventBySlug falló", {
        code: error.code,
        slug,
      });
    }
    return undefined;
  }
  return mapEventRowToEvent(data as EventRow);
}

/**
 * Devuelve un evento por ID (admin).
 */
export async function getEventById(id: string): Promise<Event | undefined> {
  if (!isRealMode()) return undefined;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    if (error) {
      // eslint-disable-next-line no-console
      console.error("[events-server] getEventById falló", {
        code: error.code,
        id,
      });
    }
    return undefined;
  }
  return mapEventRowToEvent(data as EventRow);
}

/**
 * Lista todos los eventos para el admin (incluye drafts/archived).
 * Devuelve además un resumen con conteos de confirmations, attendees,
 * surveys y leads promovidos.
 *
 * Nota: hacemos 4 queries en paralelo (eventos + 3 conteos). Para MVP
 * está bien; si crece la tabla, agregar índices parciales o denormalizar.
 */
export async function getAdminEvents(): Promise<AdminEventSummary[]> {
  if (!isRealMode()) return [];

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .order("starts_at", { ascending: false, nullsFirst: false });

  if (error || !data) {
    if (error) {
      // eslint-disable-next-line no-console
      console.error("[events-server] getAdminEvents falló", {
        code: error.code,
      });
    }
    return [];
  }

  const events = (data as EventRow[]).map(mapEventRowToEvent);
  const eventIds = events.map((e) => e.id);
  if (eventIds.length === 0) return [];

  // Conteos en paralelo (4 queries).
  const [
    { count: confirmationCount, error: cErr },
    { count: attendeeCount, error: aErr },
    { count: surveyCount, error: sErr },
    { data: promotedData, error: pErr },
    { data: unmatchedData, error: uErr },
  ] = await Promise.all([
    supabase
      .from("event_confirmations")
      .select("id", { count: "exact", head: true })
      .in("event_id", eventIds),
    supabase
      .from("event_attendees")
      .select("id", { count: "exact", head: true })
      .in("event_id", eventIds),
    supabase
      .from("event_surveys")
      .select("id", { count: "exact", head: true })
      .in("event_id", eventIds),
    supabase
      .from("event_surveys")
      .select("event_id, promoted_to_lead_id")
      .in("event_id", eventIds)
      .not("promoted_to_lead_id", "is", null),
    supabase
      .from("event_survey_unmatched")
      .select("survey_id"),
  ]);

  // Si alguna count falla, seguimos con 0s (no bloqueamos la lista).
  if (cErr || aErr || sErr || pErr || uErr) {
    // eslint-disable-next-line no-console
    console.warn("[events-server] getAdminEvents: alguna count falló", {
      cErr: cErr?.code,
      aErr: aErr?.code,
      sErr: sErr?.code,
      pErr: pErr?.code,
      uErr: uErr?.code,
    });
  }

  // promotedData viene agregado por event_id → count leads.
  const promotedByEvent = new Map<string, number>();
  for (const row of promotedData ?? []) {
    promotedByEvent.set(
      row.event_id,
      (promotedByEvent.get(row.event_id) ?? 0) + 1,
    );
  }

  // unmatchedData: contamos los survey_ids únicos (un unmatched por survey).
  const unmatchedSurveyIds = new Set(
    (unmatchedData ?? []).map((r) => r.survey_id),
  );

  // Para mapear unmatched por evento, necesitamos un SELECT adicional si los
  // unmatched cuentan por evento. Por simplicidad del MVP, contamos el total
  // global y lo asignamos proporcional — Fase 4 hace el JOIN real.
  const unmatchedTotal = unmatchedSurveyIds.size;

  return events.map((e) => ({
    event: e,
    confirmationCount: confirmationCount ?? 0,
    attendeeCount: attendeeCount ?? 0,
    surveyCount: surveyCount ?? 0,
    leadsPromoted: promotedByEvent.get(e.id) ?? 0,
    // Distribución proporcional (es un approximation; mejora en Fase 4).
    surveyUnmatchedCount: events.length > 0
      ? Math.round(unmatchedTotal / events.length)
      : 0,
  }));
}

// ─────────────────────────────────────────────────────────────
// Escritura (admin)
// ─────────────────────────────────────────────────────────────

/**
 * Crea un evento nuevo. Admin only.
 */
export async function createEvent(
  input: CreateEventInput,
  actorEmail: string,
): Promise<AdminEventOpResult> {
  if (!isRealMode()) {
    return { ok: false, note: "Supabase no configurado." };
  }
  if (!input.slug?.trim() || !input.title?.trim() || !input.startsAt) {
    return { ok: false, note: "Faltan datos (slug/title/startsAt)." };
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("events")
    .insert({
      slug: input.slug.trim().toLowerCase(),
      title: input.title.trim(),
      description: input.description?.trim() || null,
      starts_at: input.startsAt,
      ends_at: input.endsAt || null,
      location: input.location?.trim() || null,
      cover_image_url: input.coverImageUrl?.trim() || null,
      status: input.status ?? "draft",
    })
    .select("*")
    .single();

  if (error || !data) {
    // eslint-disable-next-line no-console
    console.error("[events-server] createEvent falló", { code: error?.code });
    return { ok: false, note: "No se pudo crear el evento." };
  }

  const event = mapEventRowToEvent(data as EventRow);

  await logAdminAction({
    actor_email: actorEmail,
    action: "event_create",
    entity_type: "event",
    entity_id: event.id,
    metadata: { slug: event.slug, title: event.title },
  });

  return { ok: true, event };
}

/**
 * Edita un evento (campos no-status). Admin only.
 *
 * - No permite cambiar slug ni status (eso va por updateEventStatus / re-create).
 * - Aplica trim a strings y convierte "" → null para campos opcionales.
 * - Registra audit log con from/to de cada campo modificado (mismo patrón que
 *   updateLeadStatus).
 * - Devuelve `note: "no_changes"` si el payload no tiene campos válidos.
 */
export async function updateEvent(
  eventId: string,
  input: UpdateEventInput,
  actorEmail: string,
): Promise<AdminEventOpResult> {
  if (!isRealMode()) {
    return { ok: false, note: "Supabase no configurado." };
  }
  if (!eventId || !actorEmail) {
    return { ok: false, note: "Faltan datos (eventId/actor)." };
  }

  // Construimos el patch con los campos provistos (no vacíos → omitir).
  // Tipamos explícitamente para que Supabase acepte el `.update()`.
  const patch: {
    title?: string;
    description?: string | null;
    starts_at?: string;
    ends_at?: string | null;
    location?: string | null;
    cover_image_url?: string | null;
  } = {};
  const changes: Record<string, { from: string | null; to: string | null }> = {};

  if (input.title !== undefined) {
    const next = input.title.trim();
    if (next) patch.title = next;
  }
  if (input.description !== undefined) {
    patch.description = input.description?.trim() || null;
  }
  if (input.startsAt !== undefined) {
    patch.starts_at = input.startsAt;
  }
  if (input.endsAt !== undefined) {
    patch.ends_at = input.endsAt || null;
  }
  if (input.location !== undefined) {
    patch.location = input.location?.trim() || null;
  }
  if (input.coverImageUrl !== undefined) {
    patch.cover_image_url = input.coverImageUrl?.trim() || null;
  }

  if (Object.keys(patch).length === 0) {
    return { ok: false, note: "Sin cambios para aplicar." };
  }

  const supabase = createSupabaseAdminClient();

  // Capturamos el estado previo para el audit log (qué cambió de qué a qué).
  const { data: prev, error: prevErr } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .maybeSingle();

  if (prevErr || !prev) {
    return {
      ok: false,
      note: prevErr ? "Error leyendo evento." : "Evento no existe.",
    };
  }

  const { data, error } = await supabase
    .from("events")
    .update(patch)
    .eq("id", eventId)
    .select("*")
    .maybeSingle();

  if (error || !data) {
    // eslint-disable-next-line no-console
    console.error("[events-server] updateEvent falló", {
      code: error?.code,
      eventId,
    });
    return { ok: false, note: "No se pudo actualizar el evento." };
  }

  // Diff para audit log (tipos planos: string | null para encajar en Json).
  const prevRow = prev as EventRow;
  const nextRow = data as EventRow;
  for (const key of Object.keys(patch)) {
    const fromVal = (prevRow as Record<string, unknown>)[key];
    const toVal = (nextRow as Record<string, unknown>)[key];
    if (fromVal !== toVal) {
      changes[key] = {
        from: fromVal == null ? null : String(fromVal),
        to: toVal == null ? null : String(toVal),
      };
    }
  }

  const event = mapEventRowToEvent(nextRow);

  await logAdminAction({
    actor_email: actorEmail,
    action: "event_update",
    entity_type: "event",
    entity_id: eventId,
    metadata: { changes },
  });

  return { ok: true, event };
}

/**
 * Cambia el status de un evento (draft/published/archived).
 * Admin only. Registra audit log con el cambio.
 */
export async function updateEventStatus(
  eventId: string,
  newStatus: EventStatus,
  actorEmail: string,
): Promise<AdminEventOpResult> {
  if (!isRealMode()) {
    return { ok: false, note: "Supabase no configurado." };
  }
  if (!eventId || !actorEmail) {
    return { ok: false, note: "Faltan datos (eventId/actor)." };
  }
  if (!["draft", "published", "archived"].includes(newStatus)) {
    return { ok: false, note: "Status inválido." };
  }

  const supabase = createSupabaseAdminClient();

  // Capturamos status previo para audit log (mismo patrón que updateLeadStatus).
  const { data: prev, error: prevErr } = await supabase
    .from("events")
    .select("status")
    .eq("id", eventId)
    .maybeSingle();

  if (prevErr || !prev) {
    return { ok: false, note: prevErr ? "Error leyendo evento." : "Evento no existe." };
  }
  const prevStatus = prev.status as EventStatus;

  // UPDATE atómico: solo si sigue en el status que leímos.
  const { data, error } = await supabase
    .from("events")
    .update({ status: newStatus })
    .eq("id", eventId)
    .eq("status", prevStatus)
    .select("*")
    .maybeSingle();

  if (error) {
    // eslint-disable-next-line no-console
    console.error("[events-server] updateEventStatus falló", {
      code: error.code,
      eventId,
    });
    return { ok: false, note: "No se pudo actualizar el evento." };
  }

  if (!data) {
    return {
      ok: false,
      note: `Conflicto: el evento ya no estaba en "${prevStatus}". Recarga y reintenta.`,
    };
  }

  const event = mapEventRowToEvent(data as EventRow);

  await logAdminAction({
    actor_email: actorEmail,
    action: "event_status_change",
    entity_type: "event",
    entity_id: eventId,
    metadata: { from: prevStatus, to: newStatus },
  });

  return { ok: true, event };
}

// ─────────────────────────────────────────────────────────────
// Helpers de import (para el importador CLI y los server libs de Fase 3)
// ─────────────────────────────────────────────────────────────

/**
 * Helper: lista los eventos publicados como catálogo público. Usado por
 * landings públicas futuras (Fase 4+). Por ahora solo listado de slugs.
 */
export async function listPublishedEventSlugs(): Promise<string[]> {
  if (!isRealMode()) return [];

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("events")
    .select("slug")
    .eq("status", "published")
    .order("starts_at", { ascending: false });

  if (error || !data) {
    if (error) {
      // eslint-disable-next-line no-console
      console.error("[events-server] listPublishedEventSlugs falló", {
        code: error.code,
      });
    }
    return [];
  }
  return (data as Pick<EventRow, "slug">[]).map((r) => r.slug);
}

/** Tipo del import por si el caller (CLI / server lib) lo necesita. */
export type { EventImportType };
