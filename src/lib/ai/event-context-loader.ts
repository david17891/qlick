/**
 * Event Context Loader — carga el evento activo desde Supabase.
 *
 * Reemplaza el placeholder de env vars en `bot-engine.ts:getActiveEvent()`.
 * Si la DB no responde o no hay evento publicado, cae al fallback de env vars.
 *
 * Server-only. Importar solo desde Route Handlers / Server Actions.
 *
 * @server
 */

import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/supabase";
import { formatEventDateTimeWithZone } from "../datetime";

/* ------------------------------------------------------------------ */
/*  Tipos                                                              */
/* ------------------------------------------------------------------ */

export interface ActiveEventContext {
  id: string;
  slug: string;
  /**
   * FIX 2026-07-05 (sesión David, "ya estás registrado" con nombre
   * duplicado): ID corto aleatorio (4 chars base32 sin 0/1/O/I, e.g.
   * `7A3X`) UNIQUE por evento. El bot lo usa como match prioritario
   * en `matchTextToEvent` para desambiguar eventos con título
   * similar (e.g. dos "Pinguinos" consecutivos). Es la primera
   * capa del fallback chain, antes de slug/título/location.
   *
   * Si es null (evento legacy pre-migration), el bot usa el resto
   * del chain. La migration 20260705120000 backfillea todos los
   * eventos existentes, así que en práctica nunca debería ser null.
   */
  shortCode: string | null;
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date | null;
  location: string;
  /** Texto formateado humano (ej. "6 de julio, 18:00 hrs"). */
  humanStartsAt: string;
  /** Texto formateado humano (ej. "2 horas"). */
  humanDuration: string;
  /** Bloque listo para inyectar en el system prompt. */
  promptBlock: string;
  /**
   * Fuente de la data:
   *  - "db":        evento real cargado de Supabase.
   *  - "no_events": NO hay datos reales. El bot debe responder con copy
   *                 honesto ("no tenemos eventos próximos") y NO debe
   *                 iniciar el flow de inscripción ni mencionar títulos/
   *                 fechas ficticias al lead.
   *
   * FIX 2026-07-07 (audit David "bot presenta evento fantasma"): los
   * valores "env" y "placeholder" se consolidan en "no_events" porque
   * el bug que motivó el fix es que el bot armaba un evento ficticio
   * cuando caía al fallback hardcoded de `bot-engine.ts:getActiveEvent()`
   * con `"IA y Marketing Básico" / "6 de julio"`. Ahora NUNCA se le
   * muestra al lead un evento que no existe en DB.
   */
  source: "db" | "no_events";
  /**
   * FIX 2026-07-02 (sesion David, Commit A): si true, el bot pide
   * nombre completo del lead ANTES del email en el flow de inscripcion.
   * Usar para eventos con certificado donde el nombre va impreso.
   * Default false (eventos sin certificado, solo email basta).
   */
  requiresName: boolean;
  /**
   * FIX 2026-07-05 (Fase 7b, feat/event-bot-rules): reglas de comportamiento
   * del bot para este evento (personalidad + reglas libres). Inyectado
   * al system prompt via `promptBlock`. Default: empty.
   */
eventRules: import("@/types/events").EventBotRules;
  /**
   * Modalidad del evento (migration 20260707000000).
   * - "in_person": presencial, default legacy
   * - "virtual": 100% online
   * - "hybrid": presencial + online
   */
  format: "in_person" | "virtual" | "hybrid";
  /** Link de streaming (YouTube Live, Zoom, FB Live, etc.). Solo si format != in_person. */
  streamingUrl: string | null;
  /** Provider declarado (analítica + hints en admin UI). */
  streamingProvider: "youtube_live" | "facebook_live" | "zoom" | "other" | null;
  /** Nota visible para el asistente (ej: "el link se desbloquea 10 min antes"). */
  streamingAccessNote: string | null;
  /**
   * FIX 2026-07-16 (sprint pago-en-puerta): precio del evento en MXN.
   * - `null` o `0` o `undefined` = evento gratuito. El welcome NO
   *   menciona "es de pago" y el flow de provide_email NO agrega el
   *   bloque de link de checkout.
   * - `> 0` = evento de pago. El welcome debe mencionarlo, el LLM lo
   *   usa para responder "¿cuánto cuesta?", y el flow de provide_email
   *   agrega el bloque con link de checkout + opción de pagar en
   *   puerta.
   *
   * Antes el bot-engine hacía regex sobre la description para
   * extraer el precio (frágil, dependía de cómo Paul/Admin escribieran
   * el evento en DB). Ahora la fuente de verdad es `events.price_mxn`
   * directamente.
   */
  priceMxn: number | null;
}

type SupabaseAdmin = SupabaseClient<Database>;

/* ------------------------------------------------------------------ */
/*  Fallback honesto (sin datos reales)                                */
/* ------------------------------------------------------------------ */

/**
 * FIX 2026-07-07 (audit David "bot presenta evento fantasma"): el
 * fallback antes armaba un evento ficticio ("IA y Marketing Básico /
 * 6 de julio / Ciudad de México / 2 horas") que se le mostraba al
 * lead como si fuera real. Esto comprometía leads con un evento que
 * no existía, generaba QR tokens apuntando a un placeholder, y rompía
 * el flow de check-in.
 *
 * El nuevo fallback marca la respuesta como `source: "no_events"` y
 * sus campos son placeholders honestos (`"—"`). El promptBlock le dice
 * al LLM que NO invente eventos y que si el lead pregunta por uno,
 * responda con copy honesto.
 */
function fallbackNoEvents(): ActiveEventContext {
  // Hash determinístico basado en un seed fijo (NO cambia entre runs).
  // Sirve para que cualquier llamada que reciba `evt.id` sepa que es
  // un sentinel del sistema, no un evento real.
  const sentinelId = createHash("sha256")
    .update("qlick:no_events:v1")
    .digest("hex")
    .slice(0, 36);
  return {
    id: sentinelId,
    slug: "_no_events",
    shortCode: null,
    title: "—",
    description: null,
    startsAt: new Date(0),
    endsAt: null,
    location: "—",
    humanStartsAt: "—",
    humanDuration: "—",
    promptBlock: formatPromptBlock({
      title: "(sin evento activo)",
      humanStartsAt: "—",
      humanDuration: "—",
      location: "—",
      description: null,
      eventRules: { personality: "", rules: [] },
      priceMxn: null
    }),
    source: "no_events",
    // FIX 2026-07-06: el placeholder DEBE pedir nombre. David decidio
    // que TODO lead necesita nombre real, no hay opcion de skip. Si el
    // evento real lo desactiva (legacy con requires_name=false), lo lee
    // de DB — pero el default siempre es true.
    requiresName: true,
    eventRules: { personality: "", rules: [] },
    // Streaming (migration 20260707000000): defaults seguros.
    format: "in_person",
    streamingUrl: null,
    streamingProvider: null,
    streamingAccessNote: null,
    priceMxn: null,
  };
}

/**
 * @deprecated Solo dejar export por compatibilidad con callers legacy.
 * Usar `fallbackNoEvents()` directamente. Esta funcion ahora SIEMPRE
 * retorna el sentinel `"no_events"` (antes armaba un evento ficticio).
 */
function fallbackFromEnv(): ActiveEventContext {
  return fallbackNoEvents();
}

/* ------------------------------------------------------------------ */
/*  Helpers de formato humano                                          */
/* ------------------------------------------------------------------ */

/**
 * Formatea un timestamptz a un texto humano en español MX en la zona del
 * proyecto (`America/Phoenix`, Pacífico UTC-7 sin DST).
 *
 * Ej: "11 de julio de 2026, 10:00 hrs (hora Pacífico)".
 *
 * FIX 2026-07-07 (sesión David, "bot pone 17:00 UTC cuando admin escribió
 * 10:00"): antes esta función usaba `date.getUTCHours()` con sufijo "(UTC)"
 * hardcodeado. Como el admin escribe hora local del navegador (Phoenix, UTC-7)
 * y la DB guarda timestamptz en UTC, formatear con UTC muestra la hora
 * CONVERTIDA a UTC (17:00) en vez de la hora que el admin escribió (10:00).
 * El lead recibía un mensaje confuso.
 *
 * Ahora delegamos a `formatEventDateTimeWithZone()` en `lib/datetime.ts`,
 * que usa `Intl.DateTimeFormat` con `timeZone: EVENT_TIMEZONE`. Eso garantiza
 * que server (Vercel UTC) y client (navegador del admin) rendericen idéntico
 * y muestra la hora local del evento (10:00 Pacífico) al lead.
 */
export function formatHumanDate(iso: string | Date): string {
  const isoStr = typeof iso === "string" ? iso : iso.toISOString();
  return formatEventDateTimeWithZone(isoStr);
}

/**
 * Calcula duración humana entre dos fechas.
 * Si no hay `endsAt`, devuelve "(duración por confirmar)".
 */
export function formatHumanDuration(
  startsAtIso: string | Date,
  endsAtIso: string | Date | null
): string {
  if (!endsAtIso) return "(duración por confirmar)";
  const start = typeof startsAtIso === "string" ? new Date(startsAtIso) : startsAtIso;
  const end = typeof endsAtIso === "string" ? new Date(endsAtIso) : endsAtIso;
  const diffMs = end.getTime() - start.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 60) return `${diffMin} minutos`;
  const hours = Math.floor(diffMin / 60);
  const remMin = diffMin % 60;
  if (hours < 24) {
    return remMin === 0 ? `${hours} hora${hours === 1 ? "" : "s"}` : `${hours} h ${remMin} min`;
  }
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours === 0
    ? `${days} día${days === 1 ? "" : "s"}`
    : `${days} día${days === 1 ? "" : "s"} ${remHours} h`;
}

/**
 * Construye el bloque de contexto del evento para inyectar en el system prompt.
 * Es texto listo para pegar en un prompt de LLM.
 *
 * FIX 2026-07-02 (sesion David): ahora incluye `description` (donde van precio,
 * modalidad, cupo, etc., porque el schema no tiene columnas dedicadas). Asi
 * el LLM tiene el precio/costo disponible y no tiene que inventar.
 *
 * FIX 2026-07-05 (Fase 7b): incluye `eventRules` (personalidad + reglas del
 * admin). El LLM DEBE responder siguiendo estas reglas.
 *
 * Sprint v15 PR #2 (N-NEW-2): inyecta también la cabecera "TIPO DE OFERTA"
 * derivada de `classifyEventType(args)` para que el LLM sepa con qué
 * copy veraz responder (gratis / pago / b2b / unknown defensivo).
 */
function formatPromptBlock(args: {
  title: string;
  humanStartsAt: string;
  humanDuration: string;
  location: string;
  description: string | null;
  eventRules: import("@/types/events").EventBotRules;
  /**
   * FIX 2026-07-16 (sprint pago-en-puerta): precio real del evento en
   * MXN. Si está presente (> 0), el LLM lo inyecta en respuestas a
   * "¿cuánto cuesta?" y la cabecera de tipo de oferta se vuelve más
   * precisa (antes dependía solo de regex sobre la description).
   */
  priceMxn: number | null;
}): string {
  const lines: string[] = [
    "=== EVENTO ACTIVO ===",
    `Nombre: ${args.title}`,
    `Fecha y hora: ${args.humanStartsAt}`,
    `Duración: ${args.humanDuration}`,
    `Lugar: ${args.location}`
  ];
  // FIX 2026-07-16: línea explícita de precio. Antes el LLM tenía que
  // adivinarlo parseando la description. Si el lead preguntaba
  // "¿cuánto cuesta?", el bot a veces no lo decía.
  if (typeof args.priceMxn === "number" && args.priceMxn > 0) {
    lines.push(`Precio: $${args.priceMxn} MXN (evento de pago)`);
  } else {
    lines.push("Precio: evento gratuito");
  }
  if (args.description) {
    lines.push("", "Detalles:", args.description);
  }
  // Sprint v15 PR #2: cabecera de tipo de oferta. Usa classifyEventType
  // (exportada abajo) con prioridad `price > descripción > unknown`.
  //
  // FIX 2026-07-16 (sprint pago-en-puerta): ahora pasamos el precio
  // real. Antes siempre era `price: null` y caía a la heurística de
  // descripción, que era frágil.
  const offer = classifyEventType({
    price: args.priceMxn,
    description: args.description,
    format: null
  });
  const offerLabel: Record<typeof offer, string> = {
    free_masterclass: "GRATUITA (masterclass / webinar)",
    paid_workshop: "DE PAGO (taller / curso)",
    b2b_service: "SERVICIO B2B (consultoría / retainer)",
    unknown: "DESCONOCIDA (sé veraz, deriva con el equipo si falta info)"
  };
  lines.push(
    "",
    `=== TIPO DE OFERTA: ${offerLabel[offer]} ===`
  );
  // FIX 2026-07-16 (sprint pago-en-puerta): instrucción explícita
  // para que el LLM pueda responder cualquier duda del evento
  // (constancias, temas, requisitos, ubicación, etc) usando el
  // contexto disponible (description + eventRules). Si NO tiene la
  // info, NO inventa — escala a humano.
  lines.push(
    "",
    "=== INSTRUCCIONES PARA EL BOT (OBLIGATORIAS) ===",
    "- Puedes responder CUALQUIER duda sobre el evento: fecha, hora, día, duración, lugar, temas, requisitos, si hay constancia, qué incluye, cómo llegar, etc. Usa SOLO la información del bloque EVENTO ACTIVO y REGLAS DEL BOT.",
    "- Si la respuesta no está en el contexto o en las reglas, NO INVENTES. Responde: 'No tengo esa información, te derivo con el equipo.'",
    "- Para preguntas de PAGO: si el evento es de pago, puedes decir el precio y mencionar que hay 2 opciones (pago en línea y pago en puerta el día del evento). NO confirmes pagos. NO digas 'pago confirmado' ni nada similar.",
    "- Para CONSTANCIAS / CERTIFICADOS: si la description o las reglas lo mencionan, dilo. Si NO, di que no tienes esa info y derivo.",
    "================================================="
  );
  if (args.eventRules.personality || args.eventRules.rules.length > 0) {
    lines.push("", "=== REGLAS DEL BOT (OBLIGATORIAS) ===");
    if (args.eventRules.personality) {
      lines.push(`Personalidad: ${args.eventRules.personality}`);
    }
    if (args.eventRules.rules.length > 0) {
      args.eventRules.rules.forEach((r) => lines.push(`- ${r}`));
    }
    lines.push("");
    lines.push(
      "⚠️ REGLA DURA: Si te preguntan algo que NO está en el contexto del evento",
      "o en estas reglas, NO INVENTES. Responde:",
      '"No tengo esa información, te derivo con el equipo."',
      "No derives por tu cuenta — solo deriva si el admin lo configura."
    );
    lines.push("======================");
  }
  return lines.join("\n");
}

/**
 * Formatea un bloque para LISTAR varios eventos (no solo uno).
 * Usado cuando el lead pregunta "que eventos tienen?" o cuando el LLM
 * necesita ver el catalogo completo para identificar sobre cual le preguntan.
 */
export function formatEventsListBlock(events: ActiveEventContext[]): string {
  if (events.length === 0) return "";
  const lines: string[] = [
    "=== CATALOGO DE EVENTOS PUBLICADOS ===",
    `Hay ${events.length} evento${events.length === 1 ? "" : "s"} activo${
      events.length === 1 ? "" : "s"
    }.`
  ];
  events.forEach((evt, idx) => {
    lines.push(
      "",
      `[${idx + 1}] ${evt.title}`,
      `    Slug: ${evt.slug}`,
      `    Fecha: ${evt.humanStartsAt} · ${evt.humanDuration}`,
      `    Lugar: ${evt.location}`,
      evt.description ? `    Detalles: ${evt.description}` : ""
    );
  });
  lines.push(
    "",
    "INSTRUCCIONES PARA TI (LLM):",
    "- Cuando el lead pregunte 'que eventos tienen?' o algo generico, lista los [1], [2], [3] con nombre, fecha, lugar, duracion, precio (si esta en Detalles).",
    "- Cuando el lead pregunte sobre UNO especifico ('el de CDMX', 'el del 12 de julio', 'el segundo'), identifica cual es por su numero, fecha, lugar, titulo, etc. y responde SOLO sobre ese.",
    "- Si el lead nombra varios a la vez, responde sobre cada uno por separado.",
    "- Si no puedes identificar a cual se refiere (pregunta ambigua), pregunta 'Cual te interesa: [1], [2] o [3]?'.",
    "==================================="
  );
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/*  Carga desde Supabase                                               */
/* ------------------------------------------------------------------ */

/**
 * Carga el evento activo (status='published') más próximo a hoy.
 * Si hay varios publicados, toma el que empieza antes.
 * Si no hay publicados, devuelve fallback de env vars.
 *
 * FIX 2026-07-02 (sesion David): acepta `slug` opcional. Si se pasa,
 * carga ESE evento especifico (en vez del primero). Usado por el bot
 * multi-evento para cargar el evento que el lead esta preguntando.
 */
export async function loadActiveEventContext(
  slug?: string
): Promise<ActiveEventContext> {
  let supabase: SupabaseAdmin | null = null;
  try {
    const { checkSupabaseConfig } = await import("../supabase/health");
    const { createSupabaseAdminClient } = await import("../supabase/admin");
    if (checkSupabaseConfig().configured) {
      supabase = createSupabaseAdminClient();
    }
  } catch {
    supabase = null;
  }

  if (!supabase) {
    return fallbackNoEvents();
  }

  try {
    // FIX 2026-07-02: dos branches separados para evitar lios con el
    // tipo de retorno de la query (PostgrestBuilder vs PostgrestFilterBuilder).
    //
    // FIX 2026-07-05 (sesión David, "ya estás registrado" con nombre duplicado):
    // incluimos `short_code` (4 chars base32) en el SELECT para que el bot
    // pueda desambiguar eventos por código único, no por título.
    // FIX 2026-07-07: typegen regenerado, ya no necesitamos `from("events" as never)`
    // ni el cast inline del row — todo infiere directo del Row type.
    //
    // FIX 2026-07-12 (sprint v17 hotfix #1, post-v0.9.6): filtrar eventos
    // pasados en la carga por defecto (sin slug). Antes, `order starts_at
    // ASC limit 1` podía tomar un evento ya vencido con status=published
    // e inyectarlo al bot como "=== EVENTO ACTIVO ===", provocando que
    // ofreciera cursos pasados. Ahora pedimos solo eventos que inician
    // en el futuro o hace menos de 6h (margen de gracia por si el
    // webinar está en curso o tuvo un delay).
    //
    // FIX 2026-07-15 (sesion David, "los eventos Audit Masterclass /
    // Masterclass Funnels aparecen en el bot"): el smoke de GitHub
    // Actions (.github/workflows/smoke.yml) corre scratch/audit-edge-cases
    // y scratch/simulate-scenarios contra la DB de prod. Esos scripts
    // crean eventos con slug `audit-funnel-${Date.now()}` o
    // `sim-funnel-${Date.now()}` y NO los borran al final, dejando
    // basura. Defense en profundidad: excluimos esos prefijos del query
    // para que el bot nunca los ofrezca aunque vuelvan a aparecer. El
    // fix de raíz va en los scripts (cleanup al final) — esta defense
    // es el segundo candado.
    const graceStartIso = new Date(
      Date.now() - 6 * 60 * 60 * 1000
    ).toISOString();
    const SIMULATOR_SLUG_PREFIXES = ["audit-funnel-", "sim-funnel-"];
    const { data, error } = slug
      ? await supabase
          .from("events")
          .select(
            "id, slug, short_code, title, description, starts_at, ends_at, location, status, requires_name, event_rules, format, streaming_url, streaming_provider, streaming_access_note, price_mxn"
          )
          .eq("status", "published")
          .eq("slug", slug)
          // No excluimos prefijos del simulador si el caller pidió un
          // slug específico (puede ser un admin/debug).
          .limit(1)
          .maybeSingle()
      : await supabase
          .from("events")
          .select(
            "id, slug, short_code, title, description, starts_at, ends_at, location, status, requires_name, event_rules, format, streaming_url, streaming_provider, streaming_access_note, price_mxn"
          )
          .eq("status", "published")
          .gte("starts_at", graceStartIso)
          // Defense: excluir slugs del simulador de matriz de auditoría.
          .not("slug", "like", "audit-funnel-%")
          .not("slug", "like", "sim-funnel-%")
          .order("starts_at", { ascending: true })
          .limit(1)
          .maybeSingle();
    // Referencia para que TypeScript no marque unused y para que
    // conste en el bundle que la constante existe (en caso de refactor).
    void SIMULATOR_SLUG_PREFIXES;

    if (error || !data) {
      return fallbackNoEvents();
    }

    const evt = data as unknown as {
      id: string;
      slug: string;
      short_code?: string | null;
      title: string;
      description: string | null;
      starts_at: string;
      ends_at: string | null;
      location: string | null;
      requires_name?: boolean;
      event_rules?: unknown;
      // Streaming (migration 20260707000000).
      format?: "in_person" | "virtual" | "hybrid" | null;
      streaming_url?: string | null;
      streaming_provider?:
        | "youtube_live"
        | "facebook_live"
        | "zoom"
        | "other"
        | null;
      streaming_access_note?: string | null;
      // FIX 2026-07-16 (sprint pago-en-puerta): precio del evento.
      // numeric en Supabase llega como string (numeric type) o number,
      // dependiendo del cast del driver. Aceptamos ambos.
      price_mxn?: number | string | null;
    };

    const humanStartsAt = formatHumanDate(evt.starts_at);
    const humanDuration = formatHumanDuration(evt.starts_at, evt.ends_at);
    const location = evt.location?.trim() || "Por confirmar";
    const { normalizeEventRules } = await import("../events/event-mapper");
    const eventRules = normalizeEventRules(evt.event_rules);
    // FIX 2026-07-16: normalizar price_mxn a number. Supabase numeric
    // llega como string "599" o "599.00"; lo convertimos a número.
    const priceMxn: number | null =
      typeof evt.price_mxn === "string"
        ? Number.parseFloat(evt.price_mxn)
        : typeof evt.price_mxn === "number"
          ? evt.price_mxn
          : null;
    const promptBlock = formatPromptBlock({
      title: evt.title,
      humanStartsAt,
      humanDuration,
      location,
      description: evt.description,
      eventRules,
      priceMxn
    });

    return {
      id: evt.id,
      slug: evt.slug,
      shortCode: evt.short_code ?? null,
      title: evt.title,
      description: evt.description,
      startsAt: new Date(evt.starts_at),
      endsAt: evt.ends_at ? new Date(evt.ends_at) : null,
      location,
      humanStartsAt,
      humanDuration,
      promptBlock,
      source: "db",
      // FIX 2026-07-06: si requires_name es null/undefined, default true.
      // Solo false si la columna esta explicitamente en false.
      requiresName: evt.requires_name !== false,
      eventRules,
      // Streaming (migration 20260707000000).
      format: evt.format ?? "in_person",
      streamingUrl: evt.streaming_url ?? null,
      streamingProvider: evt.streaming_provider ?? null,
      streamingAccessNote: evt.streaming_access_note ?? null,
      // FIX 2026-07-16: precio del evento (sprint pago-en-puerta).
      priceMxn,
    };
  } catch {
    return fallbackNoEvents();
  }
}

/**
 * Carga TODOS los eventos publicados (status='published'), ordenados
 * por fecha ascendente. Usado por el bot multi-evento para que el LLM
 * vea el catalogo completo cuando el lead pregunta algo generico o
 * hay que identificar sobre cual evento le preguntan.
 *
 * Si Supabase no responde, devuelve array vacio (no fallback — el bot
 * mostrara el placeholder, no inventara eventos).
 */
export async function loadAllActiveEvents(): Promise<ActiveEventContext[]> {
  let supabase: SupabaseAdmin | null = null;
  try {
    const { checkSupabaseConfig } = await import("../supabase/health");
    const { createSupabaseAdminClient } = await import("../supabase/admin");
    if (checkSupabaseConfig().configured) {
      supabase = createSupabaseAdminClient();
    }
  } catch {
    supabase = null;
  }

  if (!supabase) {
    return [];
  }

  try {
    // FIX 2026-07-07: typegen regenerado, sin `as never` ni casts inline.
    const { data, error } = await supabase
      .from("events")
      .select(
        "id, slug, short_code, title, description, starts_at, ends_at, location, status, requires_name, event_rules, format, streaming_url, streaming_provider, streaming_access_note, price_mxn"
      )
      .eq("status", "published")
      // FIX 2026-07-15 (sesion David, E2E human_first): el catálogo
      // multi-evento debe respetar el mismo grace de 6h que
      // `loadActiveEventContext`. Sin este filtro, eventos ya
      // vencidos (e.g. el "Marketing + IA" del 11 de julio) seguían
      // apareciendo en el `eventsListBlock` que el LLM ve, y el LLM
      // los recomendaba en vez del próximo evento activo del 17 de
      // julio. Mismo grace: `now - 6h` (cubre eventos en curso o con
      // delay leve).
      .gte("starts_at", new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString())
      // FIX 2026-07-15 (mismo fix que en loadActiveEventContext):
      // defense contra slugs del simulador de auditoría. El smoke de
      // GitHub Actions crea eventos con prefijo `audit-funnel-` o
      // `sim-funnel-` y los deja en prod. Esta defense evita que el
      // LLM los vea en el catálogo multi-evento.
      .not("slug", "like", "audit-funnel-%")
      .not("slug", "like", "sim-funnel-%")
      .order("starts_at", { ascending: true });

    if (error || !data || data.length === 0) {
      return [];
    }

    const { normalizeEventRules } = await import("../events/event-mapper");
    type Row = {
      id: string;
      slug: string;
      short_code?: string | null;
      title: string;
      description: string | null;
      starts_at: string;
      ends_at: string | null;
      location: string | null;
      requires_name?: boolean;
      event_rules?: unknown;
      format?: "in_person" | "virtual" | "hybrid" | null;
      streaming_url?: string | null;
      streaming_provider?:
        | "youtube_live"
        | "facebook_live"
        | "zoom"
        | "other"
        | null;
      streaming_access_note?: string | null;
      price_mxn?: number | string | null;
    };
    return (data as unknown as Row[]).map((evt) => {
      const humanStartsAt = formatHumanDate(evt.starts_at);
      const humanDuration = formatHumanDuration(evt.starts_at, evt.ends_at);
      const location = evt.location?.trim() || "Por confirmar";
      const eventRules = normalizeEventRules(evt.event_rules);
      const priceMxn: number | null =
        typeof evt.price_mxn === "string"
          ? Number.parseFloat(evt.price_mxn)
          : typeof evt.price_mxn === "number"
            ? evt.price_mxn
            : null;
      const promptBlock = formatPromptBlock({
        title: evt.title,
        humanStartsAt,
        humanDuration,
        location,
        description: evt.description,
        eventRules,
        priceMxn
      });
      return {
        id: evt.id,
        slug: evt.slug,
        shortCode: evt.short_code ?? null,
        title: evt.title,
        description: evt.description,
        startsAt: new Date(evt.starts_at),
        endsAt: evt.ends_at ? new Date(evt.ends_at) : null,
        location,
        humanStartsAt,
        humanDuration,
        promptBlock,
        source: "db" as const,
        requiresName: evt.requires_name !== false,
        format: evt.format ?? "in_person",
        streamingUrl: evt.streaming_url ?? null,
        streamingProvider: evt.streaming_provider ?? null,
        streamingAccessNote: evt.streaming_access_note ?? null,
        eventRules,
        priceMxn,
      };
    });
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/*  Sprint v15 PR #2: clasificación del tipo de oferta                  */
/* ------------------------------------------------------------------ */

/**
 * Tipo de evento para el prompt Súper Ejecutivo. Exportado desde este
 * archivo (NO desde `agent-provider.ts`) para mantener una sola fuente
 * de verdad: el loader tiene acceso al `EventRow` completo, mientras que
 * el provider solo recibe el `AgentContext` con el `eventOfferType` ya
 * calculado. La forma del tipo (`EventOfferType`) SÍ vive en
 * `agent-provider.ts` para que sea importable sin dependencias circulares.
 */
export type { EventOfferType } from "./agent-provider";

/**
 * Clasificador determinista del tipo de oferta de un evento.
 *
 * Sprint v15 PR #2 (N-NEW-2): prioridad dura `price` (verdad de la DB)
 * sobre heurística de texto. Esto garantiza que el prompt Súper Ejecutivo
 * SIEMPRE sepa con qué copy veraz responder (gratis / pago / b2b / unknown).
 *
 * Reglas (en orden de prioridad):
 *   1. `price > 0`         → "paid_workshop" (verdad dura).
 *   2. `price === 0`       → "free_masterclass".
 *   3. description matchea
 *      /gratis|sin costo|entrada libre/i → "free_masterclass".
 *   4. `kind === "b2b"`    → "b2b_service" (configuración explícita del admin).
 *   5. default            → "unknown" (defensivo, copy veraz de "déjame
 *                                     confirmarte con el equipo").
 *
 * El parámetro `kind` se acepta opcional para que el caller pueda pasar
 * el `event_rules.kind` (config del admin) si lo tiene. Default: null
 * (no se considera b2b_service por kind).
 *
 * Pure function, exportada para tests unitarios.
 */
export function classifyEventType(evt: {
  price?: number | null;
  description?: string | null;
  format?: string | null;
  kind?: string | null;
}): import("./agent-provider").EventOfferType {
  // Prioridad 1: price es verdad dura de la DB.
  if (typeof evt.price === "number" && evt.price > 0) return "paid_workshop";
  if (evt.price === 0) return "free_masterclass";

  // Prioridad 2: kind explícito del admin (en event_rules).
  if (evt.kind === "b2b") return "b2b_service";

  // Prioridad 3: heurística de texto en descripción.
  if (evt.description && /gratis|sin costo|entrada libre/i.test(evt.description)) {
    return "free_masterclass";
  }

  // Default defensivo.
  return "unknown";
}

/* ------------------------------------------------------------------ */
/*  Catálogo de Cursos LMS Asincrónicos (Academia 24/7)                  */
/* ------------------------------------------------------------------ */

/**
 * Cache en memoria del catálogo de cursos, con TTL de 5 minutos.
 * Mismo patrón que `loadActiveEventContext` para no martillar Supabase
 * en cada mensaje entrante del bot.
 */
let coursesCatalogCache: { value: string; expiresAt: number } | null = null;
const COURSES_CATALOG_TTL_MS = 5 * 60 * 1000; // 5 min

/**
 * FIX 2026-07-13 (súper-auditoría + plan anti-alucinación, Ola 1):
 * Carga el catálogo de cursos LMS publicados para inyectarlo en el
 * system prompt del Súper Ejecutivo.
 *
 * Por qué existe: cuando no hay eventos en vivo (source = "no_events"),
 * el Súper Ejecutivo quedaba sin producto real que ofrecer y alucinaba
 * inscripciones falsas. Con este catálogo, el bot siempre tiene
 * cursos grabados del LMS que puede vender con verdad 100% factual.
 *
 * - Query: `select('title, slug, price, summary')` sobre `courses`
 *   filtrado por `status = 'published'`.
 * - Formato: bloque canónico con encabezado y enlaces absolutos.
 * - Si falla la query o no hay cursos: devuelve `""` (vacío).
 * - Cache 5 min en memoria (mismo TTL que el catálogo de eventos).
 */
export async function loadCoursesCatalogBlock(): Promise<string> {
  // 1) Cache hit.
  if (coursesCatalogCache && coursesCatalogCache.expiresAt > Date.now()) {
    return coursesCatalogCache.value;
  }

  // 2) Si no hay Supabase configurado (modo demo), devolver vacío.
  let supabase: SupabaseAdmin | null = null;
  try {
    const { checkSupabaseConfig } = await import("../supabase/health");
    const { createSupabaseAdminClient } = await import("../supabase/admin");
    if (checkSupabaseConfig().configured) {
      supabase = createSupabaseAdminClient();
    }
  } catch {
    supabase = null;
  }
  if (!supabase) {
    coursesCatalogCache = { value: "", expiresAt: Date.now() + COURSES_CATALOG_TTL_MS };
    return "";
  }

  // 3) Query a Supabase.
  try {
    const { data, error } = await supabase
      .from("courses")
      .select("title, slug, subtitle, description, price_mxn")
      .eq("status", "published")
      .order("title", { ascending: true });

    if (error || !data || data.length === 0) {
      coursesCatalogCache = { value: "", expiresAt: Date.now() + COURSES_CATALOG_TTL_MS };
      return "";
    }

    // 4) Formatear el bloque canónico.
    const lines: string[] = [
      "=== CATÁLOGO DE CURSOS LMS ASINCRÓNICOS (ACADEMIA 24/7) ===",
      `Hay ${data.length} curso${data.length === 1 ? "" : "s"} grabado${data.length === 1 ? "" : "s"} disponible${data.length === 1 ? "" : "s"} para acceso inmediato en nuestra plataforma:`,
      "",
    ];
    data.forEach((row, idx) => {
      const priceLabel =
        typeof row.price_mxn === "number" || typeof row.price_mxn === "string"
          ? `$${row.price_mxn} MXN`
          : "Gratis";
      lines.push(`[${idx + 1}] ${row.title} — ${priceLabel}`);
      const shortText = row.subtitle ?? row.description ?? "";
      if (shortText) {
        const shortSummary =
          shortText.length > 140 ? shortText.slice(0, 137) + "..." : shortText;
        lines.push(`    Resumen: ${shortSummary}`);
      }
      lines.push(`    Enlace: https://www.qlick.digital/cursos/${row.slug}`);
      lines.push("");
    });
    lines.push("=========================================================");

    const block = lines.join("\n");
    coursesCatalogCache = { value: block, expiresAt: Date.now() + COURSES_CATALOG_TTL_MS };
    return block;
  } catch {
    // En modo defensivo, cualquier excepción devuelve vacío para que
    // el bot no rompa con un error 500. El sistema sigue funcionando
    // sin catálogo; el LLM simplemente no tendrá cursos que ofrecer.
    coursesCatalogCache = { value: "", expiresAt: Date.now() + COURSES_CATALOG_TTL_MS };
    return "";
  }
}