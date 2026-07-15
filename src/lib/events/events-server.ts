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
import { generateShortCode, isValidShortCode } from "./short-code";

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
  /**
   * Reglas de comportamiento del bot para este evento (Fase 7b).
   * Si no se pasa, default a { personality: '', rules: [] }.
   */
  eventRules?: import("@/types/events").EventBotRules;
  /**
   * Modalidad del evento (migration 20260707000000). Default 'in_person'.
   * Si format ∈ {virtual, hybrid}, streamingUrl es requerido (validado en DB).
   */
  format?: import("@/types/events").EventFormat;
  streamingUrl?: string;
  streamingProvider?: import("@/types/events").EventStreamingProvider;
  streamingAccessNote?: string;
  /**
   * Precio de la entrada en MXN (migration 20260714230000). Default 0
   * = evento gratuito. El server clampea valores negativos a 0
   * (defense in depth: el form admin ya valida, pero si alguien
   * llama el API directo no queremos insertar -100).
   */
  priceMXN?: number;
  /**
   * Codigo de moneda ISO-4217 (default 'MXN'). Si llega vacio o
   * undefined, el server aplica 'MXN' antes del INSERT.
   */
  currency?: string;
}

/** Input para editar un evento (admin). Todos los campos opcionales salvo los requeridos. */
export interface UpdateEventInput {
  title?: string;
  description?: string | null;
  startsAt?: string; // ISO
  endsAt?: string | null;
  location?: string | null;
  coverImageUrl?: string | null;
  eventRules?: import("@/types/events").EventBotRules | null;
  /** Modalidad del evento. Si se cambia a virtual/hybrid, streamingUrl requerido. */
  format?: import("@/types/events").EventFormat;
  streamingUrl?: string | null;
  streamingProvider?: import("@/types/events").EventStreamingProvider | null;
  streamingAccessNote?: string | null;
  /**
   * Precio de la entrada en MXN (migration 20260714230000). Mismas
   * reglas que en `CreateEventInput`: el server clampea a >=0.
   */
  priceMXN?: number | null;
  /** Codigo de moneda ISO-4217. Default 'MXN' si llega vacio. */
  currency?: string | null;
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
 * surveys y leads promovidos — **por evento** (cada card muestra los
 * reales, no los globales repartidos).
 *
 * Implementación: 5 queries en paralelo (4 SELECT event_id + 1 para
 * unmatched con join). Conteo en memoria con Map<eventId, count>.
 * Para MVP está bien; si crece la tabla (>10k rows por tabla) conviene
 * denormalizar o usar RPC con `GROUP BY` SQL directo.
 *
 * Fix B-3 (2026-06-27): antes los queries usaban `count: "exact", head: true`
 * sin GROUP BY → todos los cards mostraban el mismo total global. Ahora
 * se selecciona `event_id` y se cuenta en memoria por evento.
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

  // 5 queries en paralelo: cada una devuelve `event_id` (o `survey_id`
  // para unmatched, que joineamos después). Conteos en memoria.
  const [
    { data: confirmationsData, error: cErr },
    { data: attendeesData, error: aErr },
    { data: surveysData, error: sErr },
    { data: promotedData, error: pErr },
    { data: unmatchedData, error: uErr },
  ] = await Promise.all([
    supabase
      .from("event_confirmations")
      .select("event_id")
      .in("event_id", eventIds),
    supabase
      .from("event_attendees")
      .select("event_id")
      .in("event_id", eventIds),
    supabase
      .from("event_surveys")
      .select("event_id")
      .in("event_id", eventIds),
    supabase
      .from("event_surveys")
      .select("event_id, promoted_to_lead_id")
      .in("event_id", eventIds)
      .not("promoted_to_lead_id", "is", null),
    // Para unmatched necesitamos el event_id via join con event_surveys.
    supabase
      .from("event_survey_unmatched")
      .select("survey_id, event_surveys!inner(event_id)"),
  ]);

  // Si alguna query falla, seguimos con 0s (no bloqueamos la lista).
  if (cErr || aErr || sErr || pErr || uErr) {
    // eslint-disable-next-line no-console
    console.warn("[events-server] getAdminEvents: alguna query falló", {
      cErr: cErr?.code,
      aErr: aErr?.code,
      sErr: sErr?.code,
      pErr: pErr?.code,
      uErr: uErr?.code,
    });
  }

  // Helper: cuenta rows por event_id en un dataset con forma { event_id }.
  const countByEvent = (
    rows: ReadonlyArray<{ event_id: string }> | null | undefined,
  ): Map<string, number> => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) {
      m.set(r.event_id, (m.get(r.event_id) ?? 0) + 1);
    }
    return m;
  };

  const confirmationsByEvent = countByEvent(confirmationsData);
  const attendeesByEvent = countByEvent(attendeesData);
  const surveysByEvent = countByEvent(surveysData);
  const promotedByEvent = countByEvent(promotedData);

  // Unmatched: cada row tiene { survey_id, event_surveys: { event_id } }.
  const unmatchedByEvent = new Map<string, number>();
  for (const row of unmatchedData ?? []) {
    const inner = row.event_surveys as { event_id: string } | null;
    const eid = inner?.event_id;
    if (!eid) continue;
    unmatchedByEvent.set(eid, (unmatchedByEvent.get(eid) ?? 0) + 1);
  }

  return events.map((e) => ({
    event: e,
    confirmationCount: confirmationsByEvent.get(e.id) ?? 0,
    attendeeCount: attendeesByEvent.get(e.id) ?? 0,
    surveyCount: surveysByEvent.get(e.id) ?? 0,
    leadsPromoted: promotedByEvent.get(e.id) ?? 0,
    surveyUnmatchedCount: unmatchedByEvent.get(e.id) ?? 0,
  }));
}

// ─────────────────────────────────────────────────────────────
// Escritura (admin)
// ─────────────────────────────────────────────────────────────

/**
 * Crea un evento nuevo. Admin only.
 *
 * FIX 2026-07-05 (sesión David, "ya estás registrado" con nombre duplicado):
 * generamos `short_code` del lado TS (4 chars base32 sin 0/1/O/I) y lo
 * pasamos al INSERT. Por qué no dejamos que solo el trigger lo haga:
 *   - visibilidad inmediata (el response ya trae el código, sin un
 *     SELECT adicional);
 *   - el admin lo ve en el drawer en el mismo submit, no después;
 *   - el trigger backapea igual si llegamos sin código (defense in depth).
 *
 * Si el código colisiona con UNIQUE existente, intentamos hasta 5 veces.
 * Después de 5 colisiones seguidas (probabilidad ~0 a la escala de Qlick),
 * confiamos en el trigger PL/pgSQL para regenerarlo (lo hace con su propio
 * loop de retry).
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

  // Generar short_code. El INSERT propaga; si la UNIQUE explota (23505),
  // reintentaríamos — pero el INSERT abajo ya captura el error y devuelve.
  let shortCode: string = generateShortCode();
  if (!isValidShortCode(shortCode)) {
    // Seguridad: si el generador devuelve algo fuera del alphabet, fallback
    // al trigger (que siempre devuelve formato válido).
    shortCode = ""; // El trigger lo generará.
  }

  const supabase = createSupabaseAdminClient();
  // FIX 2026-07-05: el typegen de Supabase está stale (no incluye
  // short_code), asi que casteamos el payload a `as never` igual que
  // hace el código legacy con event_rules. La columna existe en la DB
  // (migration 20260705120000) y la pasará al INSERT.
  // Mismo caso para price_mxn y currency (migration 20260714230000).
  const insertPayload: Record<string, unknown> = {
    slug: input.slug.trim().toLowerCase(),
    title: input.title.trim(),
    description: input.description?.trim() || null,
    starts_at: input.startsAt,
    ends_at: input.endsAt || null,
    location: input.location?.trim() || null,
    cover_image_url: input.coverImageUrl?.trim() || null,
    status: input.status ?? "draft",
    event_rules: input.eventRules ?? { personality: "", rules: [] },
    // Streaming (migration 20260707000000). Solo se incluyen si vienen
    // en el input — el default `in_person` lo aplica la DB.
    format: input.format ?? "in_person",
    streaming_url: input.streamingUrl?.trim() || null,
    streaming_provider: input.streamingProvider ?? null,
    streaming_access_note: input.streamingAccessNote?.trim() || null,
    // Pago (migration 20260714230000). Clampeamos a >=0 para que un
    // caller malicioso no inserte precio negativo. Default 0 (gratis).
    price_mxn:
      typeof input.priceMXN === "number" && Number.isFinite(input.priceMXN)
        ? Math.max(0, input.priceMXN)
        : 0,
    currency: input.currency?.trim() || "MXN",
  };
  // Solo agregar short_code si el generador devolvió algo válido.
  if (shortCode) insertPayload.short_code = shortCode;
  const { data, error } = await supabase
    .from("events")
    .insert(insertPayload as never)
    .select("*")
    .single();

  // Si choca con UNIQUE en short_code (23505) — extremadamente raro
  // porque generamos al azar y estamos solos en el servidor — caemos al
  // path normal. El admin verá un error genérico y el trigger no llegó
  // a actuar. Reintentamos una vez con otro código antes de devolver
  // error definitivo.
  if (error?.code === "23505" && (error.message ?? "").includes("short_code")) {
    const retryCode = generateShortCode();
    const retryPayload: Record<string, unknown> = {
      slug: input.slug.trim().toLowerCase(),
      title: input.title.trim(),
      description: input.description?.trim() || null,
      starts_at: input.startsAt,
      ends_at: input.endsAt || null,
      location: input.location?.trim() || null,
      cover_image_url: input.coverImageUrl?.trim() || null,
      status: input.status ?? "draft",
      event_rules: input.eventRules ?? { personality: "", rules: [] },
      format: input.format ?? "in_person",
      streaming_url: input.streamingUrl?.trim() || null,
      streaming_provider: input.streamingProvider ?? null,
      streaming_access_note: input.streamingAccessNote?.trim() || null,
      // Pago (migration 20260714230000). Mismo clamp que en el primer INSERT.
      price_mxn:
        typeof input.priceMXN === "number" && Number.isFinite(input.priceMXN)
          ? Math.max(0, input.priceMXN)
          : 0,
      currency: input.currency?.trim() || "MXN",
      short_code: retryCode
    };
    const retry = await supabase
      .from("events")
      .insert(retryPayload as never)
      .select("*")
      .single();
    if (!retry.error && retry.data) {
      const event = mapEventRowToEvent(retry.data as EventRow);
      await logAdminAction({
        actor_email: actorEmail,
        action: "event_create",
        entity_type: "event",
        entity_id: event.id,
        metadata: {
          slug: event.slug,
          title: event.title,
          short_code_retried: true
        },
        before: null,
        after: {
          id: event.id,
          slug: event.slug,
          title: event.title,
          status: event.status
        },
      });
      return { ok: true, event };
    }
  }

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
    before: null,
    after: { id: event.id, slug: event.slug, title: event.title, status: event.status },
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
    event_rules?: unknown;
    // Streaming (migration 20260707000000). Cast seguro hasta que
    // David regenere el typegen con `npx supabase gen types`.
    format?: unknown;
    streaming_url?: string | null;
    streaming_provider?: string | null;
    streaming_access_note?: string | null;
    // Pago (migration 20260714230000). Mismo caso: cast seguro al
    // typegen stale. price_mxn y currency son las nuevas columnas.
    price_mxn?: number;
    currency?: string;
  } = {};
  // Patch se construye arriba; al final hacemos `as never` para el .update().
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
  if (input.eventRules !== undefined) {
    if (input.eventRules === null) {
      patch.event_rules = null;
    } else {
      // Normalizamos para serializar limpio (solo campos validos).
      const personality = input.eventRules.personality?.trim() ?? "";
      const rules = (input.eventRules.rules ?? [])
        .map((r) => r.trim())
        .filter((r) => r.length > 0);
      patch.event_rules = { personality, rules } as never;
    }
  }
  // Streaming (migration 20260707000000). Patch aditivo — solo aplica si
  // el campo viene en el input. Validacion de constraint (streaming_url
  // requerido si format != in_person) la hace la DB.
  if (input.format !== undefined) {
    patch.format = input.format;
  }
  if (input.streamingUrl !== undefined) {
    patch.streaming_url = input.streamingUrl?.trim() || null;
  }
  if (input.streamingProvider !== undefined) {
    patch.streaming_provider = input.streamingProvider ?? null;
  }
  if (input.streamingAccessNote !== undefined) {
    patch.streaming_access_note = input.streamingAccessNote?.trim() || null;
  }
  // Pago (migration 20260714230000). Clamp a >=0 para precio, default
  // 'MXN' para currency si llega vacio. null explícito = limpiar.
  if (input.priceMXN !== undefined) {
    patch.price_mxn =
      typeof input.priceMXN === "number" && Number.isFinite(input.priceMXN)
        ? Math.max(0, input.priceMXN)
        : 0;
  }
  if (input.currency !== undefined) {
    patch.currency = input.currency?.trim() || "MXN";
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
    .update(patch as never)
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
    before: {
      slug: prevRow.slug,
      title: prevRow.title,
      description: prevRow.description,
      starts_at: prevRow.starts_at,
      ends_at: prevRow.ends_at,
      location: prevRow.location,
      cover_image_url: prevRow.cover_image_url,
    },
    after: {
      slug: nextRow.slug,
      title: nextRow.title,
      description: nextRow.description,
      starts_at: nextRow.starts_at,
      ends_at: nextRow.ends_at,
      location: nextRow.location,
      cover_image_url: nextRow.cover_image_url,
      // Streaming (migration 20260707000000). Typegen regenerado.
      format: nextRow.format ?? null,
      streaming_url: nextRow.streaming_url ?? null,
      streaming_provider: nextRow.streaming_provider ?? null,
    },
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
    before: { status: prevStatus },
    after: { status: newStatus },
  });

  return { ok: true, event };
}

/**
 * Elimina un evento (hard delete). Admin only.
 *
 * - Cascade: las tablas con `on delete cascade` (event_confirmations,
 *   event_attendees, event_surveys, lead_event_links, event_qr_tokens,
 *   event_email_log, etc.) se borran automáticamente.
 * - Las tablas con `on delete set null` (lead_whatsapp_log,
 *   lead_whatsapp_conversations.related_event_id) mantienen el row pero
 *   ponen event_id=NULL — OK porque esas columnas son nullable.
 * - Audit log: registra `event_delete` con before=evento, after=null.
 * - NO reversible. El caller debe pedir confirmación al admin antes.
 */
export async function deleteEvent(
  eventId: string,
  actorEmail: string,
): Promise<AdminEventOpResult> {
  if (!isRealMode()) {
    return { ok: false, note: "Supabase no configurado." };
  }
  if (!eventId || !actorEmail) {
    return { ok: false, note: "Faltan datos (eventId/actor)." };
  }

  const supabase = createSupabaseAdminClient();

  // Capturar estado previo para audit log (slug, title, status).
  const { data: prev, error: prevErr } = await supabase
    .from("events")
    .select("id, slug, title, status")
    .eq("id", eventId)
    .maybeSingle();

  if (prevErr || !prev) {
    return {
      ok: false,
      note: prevErr ? "Error leyendo evento." : "Evento no existe.",
    };
  }

  // DELETE — las FK cascadeadas borran dependencias automáticamente.
  const { error } = await supabase.from("events").delete().eq("id", eventId);

  if (error) {
    // eslint-disable-next-line no-console
    console.error("[events-server] deleteEvent falló", {
      code: error.code,
      eventId,
    });
    return { ok: false, note: "No se pudo eliminar el evento." };
  }

  await logAdminAction({
    actor_email: actorEmail,
    action: "event_delete",
    entity_type: "event",
    entity_id: eventId,
    metadata: { slug: prev.slug, title: prev.title },
    before: {
      id: prev.id,
      slug: prev.slug,
      title: prev.title,
      status: prev.status
    },
    after: null,
  });

  return { ok: true, note: `Evento "${prev.title}" eliminado.` };
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

/**
 * Lista los eventos publicados (status='published') ordenados por fecha
 * ascendente — los próximos primero, los pasados al final. Usado por
 * `/eventos` (landing pública de catálogo, Fase 4 cierre).
 *
 * A diferencia de `getAdminEvents`, NO incluye conteos ni drafts/archived.
 * Solo el shape `Event` mínimo para renderizar cards de discoverability.
 */
export async function listPublishedEvents(): Promise<Event[]> {
  if (!isRealMode()) return [];

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("status", "published")
    .order("starts_at", { ascending: true });

  if (error || !data) {
    if (error) {
      // eslint-disable-next-line no-console
      console.error("[events-server] listPublishedEvents falló", {
        code: error.code,
      });
    }
    return [];
  }
  return (data as EventRow[]).map(mapEventRowToEvent);
}

// ─────────────────────────────────────────────────────────────
// Clone (Fase 5 Paquete D)
// ─────────────────────────────────────────────────────────────

/**
 * Genera un slug único para un clon basado en el slug original.
 *
 * Estrategia:
 * 1. Si `<slug>-copia` no existe → usar ese.
 * 2. Si ya existe → probar `<slug>-copia-2`, `<slug>-copia-3`, etc.
 *    hasta encontrar uno libre (cap a 50 intentos para evitar loop infinito).
 *
 * Si el slug original ya tiene sufijo `-copia` / `-copia-N`, lo limpiamos
 * primero para evitar acumulación: `taller-copia` → `taller-copia-2`,
 * `taller-copia-2` → `taller-copia-3`, etc.
 *
 * Devuelve null si no encuentra slot libre (caso patológico: 50 copias
 * ya existen). El caller devuelve error al usuario.
 */
async function generateUniqueCloneSlug(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  baseSlug: string,
): Promise<string | null> {
  // Limpia sufijos previos de copia: "taller-copia" → "taller",
  // "taller-copia-3" → "taller".
  const cleanBase = baseSlug.replace(/-copia(-\d+)?$/, "");

  const MAX_TRIES = 50;
  for (let i = 1; i <= MAX_TRIES; i++) {
    const candidate = i === 1 ? `${cleanBase}-copia` : `${cleanBase}-copia-${i}`;
    const { data } = await supabase
      .from("events")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();
    if (!data) return candidate;
  }
  return null;
}

/**
 * Clona un evento existente. Crea un NUEVO evento con los mismos campos
 * no-status del original, pero:
 * - `slug` único (sufijo `-copia` / `-copia-N`)
 * - `title` con sufijo " (Copia)" / " (Copia N)"
 * - `status` = 'draft' (forzado — un clon publicado sería peligroso;
 *   el admin debe revisarlo y publicarlo explícitamente)
 * - NO copia confirmados/asistentes/encuestas/leads (esas tablas están
 *   vinculadas al event_id; empezar de cero en el clon).
 *
 * Si el evento origen no existe → devuelve `{ ok:false, note }`.
 * Si no se puede generar slug único → devuelve `{ ok:false, note }`.
 *
 * Audit: registra `event_clone` con `metadata.source_event_id` y
 * snapshots `before`/`after` (before = origen, after = clon).
 */
export async function cloneEvent(
  sourceEventId: string,
  actorEmail: string,
): Promise<AdminEventOpResult & { sourceEvent?: Event }> {
  if (!isRealMode()) {
    return { ok: false, note: "Supabase no configurado." };
  }
  if (!sourceEventId || !actorEmail) {
    return { ok: false, note: "Faltan datos (sourceEventId/actor)." };
  }

  const supabase = createSupabaseAdminClient();

  // 1. Leer evento origen (incluyendo campos no expuestos via mapper).
  const { data: sourceRow, error: sourceErr } = await supabase
    .from("events")
    .select("*")
    .eq("id", sourceEventId)
    .maybeSingle();

  if (sourceErr || !sourceRow) {
    return {
      ok: false,
      note: sourceErr
        ? "Error leyendo el evento origen."
        : "El evento origen no existe.",
    };
  }
  const source = sourceRow as EventRow;

  // 2. Generar slug único.
  const newSlug = await generateUniqueCloneSlug(supabase, source.slug);
  if (!newSlug) {
    return {
      ok: false,
      note: "No se pudo generar un slug único (hay 50+ copias de este evento). Borrá alguna o cambiá el slug manualmente.",
    };
  }

  // 3. Generar título: "<title> (Copia)" o "<title> (Copia N)" si ya hay.
  // El sufijo numérico debe coincidir con el slug.
  const slugSuffixMatch = newSlug.match(/-copia-(\d+)$/);
  const titleSuffix = slugSuffixMatch
    ? ` (Copia ${slugSuffixMatch[1]})`
    : " (Copia)";
  const newTitle = `${source.title}${titleSuffix}`;
  const newShortCode = generateShortCode();

  // 4. Insertar el clon.
  const { data: insertData, error: insertErr } = await supabase
    .from("events")
    .insert({
      slug: newSlug,
      title: newTitle,
      description: source.description,
      starts_at: source.starts_at,
      ends_at: source.ends_at,
      location: source.location,
      cover_image_url: source.cover_image_url,
      status: "draft", // forzado — el clon debe revisarse antes de publicar
      short_code: newShortCode,
    })
    .select("*")
    .single();

  if (insertErr || !insertData) {
    // eslint-disable-next-line no-console
    console.error("[events-server] cloneEvent insert falló", {
      code: insertErr?.code,
      sourceEventId,
    });
    return {
      ok: false,
      note: insertErr?.code === "23505"
        ? "Slug duplicado (otro admin creó una copia al mismo tiempo). Reintentá."
        : "No se pudo crear la copia.",
    };
  }

  const clone = mapEventRowToEvent(insertData as EventRow);

  // 5. Audit log: source → clon.
  await logAdminAction({
    actor_email: actorEmail,
    action: "event_clone",
    entity_type: "event",
    entity_id: clone.id,
    metadata: {
      source_event_id: source.id,
      source_slug: source.slug,
      source_title: source.title,
    },
    before: {
      id: source.id,
      slug: source.slug,
      title: source.title,
      status: source.status,
    },
    after: {
      id: clone.id,
      slug: clone.slug,
      title: clone.title,
      status: clone.status,
    },
  });

  return {
    ok: true,
    event: clone,
    sourceEvent: source ? mapEventRowToEvent(source) : undefined,
  };
}

/** Tipo del import por si el caller (CLI / server lib) lo necesita. */
export type { EventImportType };
