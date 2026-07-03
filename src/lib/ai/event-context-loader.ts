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

/* ------------------------------------------------------------------ */
/*  Tipos                                                              */
/* ------------------------------------------------------------------ */

export interface ActiveEventContext {
  id: string;
  slug: string;
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
  /** Fuente de la data: "db" (real) | "env" (fallback) | "placeholder". */
  source: "db" | "env" | "placeholder";
  /**
   * FIX 2026-07-02 (sesion David, Commit A): si true, el bot pide
   * nombre completo del lead ANTES del email en el flow de inscripcion.
   * Usar para eventos con certificado donde el nombre va impreso.
   * Default false (eventos sin certificado, solo email basta).
   */
  requiresName: boolean;
}

type SupabaseAdmin = SupabaseClient<Database>;

/* ------------------------------------------------------------------ */
/*  Fallback de env vars (placeholder)                                 */
/* ------------------------------------------------------------------ */

/**
 * Devuelve el contexto de fallback (env vars). Usado si la DB no responde
 * o no hay evento publicado. NO usar en producción sin verificar primero.
 */
function fallbackFromEnv(): ActiveEventContext {
  const title = process.env.EVENT_NAME?.trim() || "IA y Marketing Básico";
  const date = process.env.EVENT_DATE?.trim() || "6 de julio";
  const location = process.env.EVENT_LOCATION?.trim() || "Ciudad de México";
  const duration = process.env.EVENT_DURATION?.trim() || "2 horas";
  const placeholderId = createHash("sha256")
    .update(`placeholder:${title}:${date}`)
    .digest("hex")
    .slice(0, 36);
  return {
    id: placeholderId,
    slug: "placeholder",
    title,
    description: null,
    startsAt: new Date(),
    endsAt: null,
    location,
    humanStartsAt: date,
    humanDuration: duration,
    promptBlock: formatPromptBlock({
      title,
      humanStartsAt: date,
      humanDuration: duration,
      location,
      description: null
    }),
    source: process.env.EVENT_NAME ? "env" : "placeholder",
    // FIX 2026-07-02: fallback conservador — el placeholder no sabe
    // si requiere nombre. False por default; si el evento real lo
    // requiere, lo lee de DB.
    requiresName: false
  };
}

/* ------------------------------------------------------------------ */
/*  Helpers de formato humano                                          */
/* ------------------------------------------------------------------ */

/**
 * Formatea un timestamptz a un texto humano en español MX.
 * Ej: "6 de julio, 18:00 hrs (Centro)"
 */
export function formatHumanDate(iso: string | Date): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  const months = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
  ];
  const day = date.getUTCDate();
  const month = months[date.getUTCMonth()];
  const year = date.getUTCFullYear();
  const hours = date.getUTCHours().toString().padStart(2, "0");
  const minutes = date.getUTCMinutes().toString().padStart(2, "0");
  return `${day} de ${month} de ${year}, ${hours}:${minutes} hrs (UTC)`;
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
 */
function formatPromptBlock(args: {
  title: string;
  humanStartsAt: string;
  humanDuration: string;
  location: string;
  description: string | null;
}): string {
  const lines: string[] = [
    "=== EVENTO ACTIVO ===",
    `Nombre: ${args.title}`,
    `Fecha y hora: ${args.humanStartsAt}`,
    `Duración: ${args.humanDuration}`,
    `Lugar: ${args.location}`
  ];
  if (args.description) {
    lines.push("", "Detalles:", args.description);
  }
  lines.push("======================");
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
    return fallbackFromEnv();
  }

  try {
    // FIX 2026-07-02: dos branches separados para evitar lios con el
    // tipo de retorno de la query (PostgrestBuilder vs PostgrestFilterBuilder).
    const { data, error } = slug
      ? await supabase
          .from("events" as never)
          .select(
            "id, slug, title, description, starts_at, ends_at, location, status, requires_name"
          )
          .eq("status", "published")
          .eq("slug", slug)
          .limit(1)
          .maybeSingle()
      : await supabase
          .from("events" as never)
          .select(
            "id, slug, title, description, starts_at, ends_at, location, status, requires_name"
          )
          .eq("status", "published")
          .order("starts_at", { ascending: true })
          .limit(1)
          .maybeSingle();

    if (error || !data) {
      return fallbackFromEnv();
    }

    const evt = data as {
      id: string;
      slug: string;
      title: string;
      description: string | null;
      starts_at: string;
      ends_at: string | null;
      location: string | null;
      requires_name?: boolean;
    };

    const humanStartsAt = formatHumanDate(evt.starts_at);
    const humanDuration = formatHumanDuration(evt.starts_at, evt.ends_at);
    const location = evt.location?.trim() || "Por confirmar";
    const promptBlock = formatPromptBlock({
      title: evt.title,
      humanStartsAt,
      humanDuration,
      location,
      description: evt.description
    });

    return {
      id: evt.id,
      slug: evt.slug,
      title: evt.title,
      description: evt.description,
      startsAt: new Date(evt.starts_at),
      endsAt: evt.ends_at ? new Date(evt.ends_at) : null,
      location,
      humanStartsAt,
      humanDuration,
      promptBlock,
      source: "db",
      requiresName: Boolean(evt.requires_name)
    };
  } catch {
    return fallbackFromEnv();
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
    const { data, error } = await supabase
      .from("events" as never)
      .select(
        "id, slug, title, description, starts_at, ends_at, location, status, requires_name"
      )
      .eq("status", "published")
      .order("starts_at", { ascending: true });

    if (error || !data || data.length === 0) {
      return [];
    }

    return (data as Array<{
      id: string;
      slug: string;
      title: string;
      description: string | null;
      starts_at: string;
      ends_at: string | null;
      location: string | null;
      requires_name?: boolean;
    }>).map((evt) => {
      const humanStartsAt = formatHumanDate(evt.starts_at);
      const humanDuration = formatHumanDuration(evt.starts_at, evt.ends_at);
      const location = evt.location?.trim() || "Por confirmar";
      const promptBlock = formatPromptBlock({
        title: evt.title,
        humanStartsAt,
        humanDuration,
        location,
        description: evt.description
      });
      return {
        id: evt.id,
        slug: evt.slug,
        title: evt.title,
        description: evt.description,
        startsAt: new Date(evt.starts_at),
        endsAt: evt.ends_at ? new Date(evt.ends_at) : null,
        location,
        humanStartsAt,
        humanDuration,
        promptBlock,
        source: "db" as const,
        requiresName: Boolean(evt.requires_name)
      };
    });
  } catch {
    return [];
  }
}