/**
 * Lead Profile — memoria larga persistente por lead.
 *
 * Complementa `conversation-window.ts` (memoria corta, últimos N mensajes)
 * con un resumen cumulativo que persiste entre sesiones. El bot-engine:
 *   1. Llama `loadLeadProfile(leadId)` al inicio de cada respuesta para
 *      inyectar el `summary` en el system prompt.
 *   2. Llama `incrementMessageCount(leadId)` después de responder.
 *   3. Si `messages_since_summary >= SUMMARY_EVERY`, llama a su propio
 *      helper de LLM summarization y luego `regenerateSummary(...)` con
 *      el texto resultante.
 *
 * Este módulo es deliberadamente LIBRE DE DEPENDENCIAS DE LLM: el bot-engine
 * orquesta qué LLM usar (mock, deepseek, etc.). lead-profile solo hace
 * DB CRUD. Así evitamos ciclos con `src/lib/ai/index.ts`.
 *
 * Server-only. Importar solo desde Route Handlers / Server Actions.
 *
 * @server
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/supabase";

/* ------------------------------------------------------------------ */
/*  Tipos                                                              */
/* ------------------------------------------------------------------ */

export interface LeadProfile {
  leadId: string;
  /** Resumen cumulativo 1-2 frases. Vacío hasta el primer regenerate. */
  summary: string;
  /** Mensajes procesados desde el último regenerate. */
  messagesSinceSummary: number;
  /** Timestamp del último regenerate (null si nunca se regeneró). */
  lastSummaryAt: Date | null;
  /** Timestamp de creación del row. */
  createdAt: Date;
  /** Timestamp de la última actualización del row. */
  updatedAt: Date;
}

type SupabaseAdmin = SupabaseClient<Database>;

type LeadProfileRow = {
  lead_id: string;
  summary: string;
  messages_since_summary: number;
  last_summary_at: string | null;
  created_at: string;
  updated_at: string;
};

/* ------------------------------------------------------------------ */
/*  Constantes                                                         */
/* ------------------------------------------------------------------ */

/**
 * Cada cuántos mensajes del bot regeneramos el summary. Trade-off:
 *   - Muy bajo (1-2): costoso en LLM calls, summary muy fresco.
 *   - Muy alto (>10): summary desactualizado, bot puede perder contexto.
 *   - 5: balance razonable para conversaciones de venta cortas.
 */
export const SUMMARY_EVERY = 5;

/* ------------------------------------------------------------------ */
/*  Load                                                               */
/* ------------------------------------------------------------------ */

/**
 * Carga el lead_profile de un lead. Si no existe, devuelve null (el caller
 * decide si crear uno nuevo con `incrementMessageCount`).
 */
export async function loadLeadProfile(
  supabase: SupabaseAdmin,
  leadId: string
): Promise<LeadProfile | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("lead_profile" as never)
    .select("*")
    .eq("lead_id", leadId)
    .maybeSingle();

  if (error) {
    // eslint-disable-next-line no-console
    console.error("[lead-profile] loadLeadProfile falló", {
      leadId,
      code: (error as { code?: string }).code
    });
    return null;
  }
  if (!data) return null;
  return rowToProfile(data as unknown as LeadProfileRow);
}

/* ------------------------------------------------------------------ */
/*  Increment + Upsert                                                 */
/* ------------------------------------------------------------------ */

/**
 * Incrementa el counter de mensajes y devuelve el nuevo valor.
 * Crea el row si no existía (upsert).
 *
 * Usar DESPUÉS de que el bot responde al lead. Si el counter alcanza
 * SUMMARY_EVERY, el caller debe llamar a su LLM summarizer y luego
 * a `regenerateSummary` con el resultado.
 */
export async function incrementMessageCount(
  supabase: SupabaseAdmin,
  leadId: string
): Promise<number | null> {
  if (!supabase) return null;

  // Read+upsert (no asumimos que la RPC `lead_profile_increment_message`
  // exista — si la quieres, la agregamos en la migración como atómico).
  const existing = await loadLeadProfile(supabase, leadId);
  const next = (existing?.messagesSinceSummary ?? 0) + 1;
  const { error } = await supabase
    .from("lead_profile" as never)
    .upsert(
      {
        lead_id: leadId,
        messages_since_summary: next,
        updated_at: new Date().toISOString()
      } as never,
      { onConflict: "lead_id" } as never
    );

  if (error) {
    // eslint-disable-next-line no-console
    console.error("[lead-profile] incrementMessageCount falló", {
      leadId,
      code: (error as { code?: string }).code
    });
    return null;
  }
  return next;
}

/* ------------------------------------------------------------------ */
/*  Regenerate summary                                                 */
/* ------------------------------------------------------------------ */

/**
 * Guarda un nuevo summary generado externamente (por el LLM del bot-engine)
 * y resetea el counter a 0. El caller es responsable de invocar al LLM;
 * este módulo solo persiste.
 */
export async function regenerateSummary(
  supabase: SupabaseAdmin,
  leadId: string,
  newSummary: string
): Promise<boolean> {
  if (!supabase) return false;
  const trimmed = newSummary.trim().slice(0, 500);
  if (!trimmed) return false;

  const { error } = await supabase
    .from("lead_profile" as never)
    .upsert(
      {
        lead_id: leadId,
        summary: trimmed,
        messages_since_summary: 0,
        last_summary_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      } as never,
      { onConflict: "lead_id" } as never
    );

  if (error) {
    // eslint-disable-next-line no-console
    console.error("[lead-profile] regenerateSummary falló", {
      leadId,
      code: (error as { code?: string }).code
    });
    return false;
  }
  return true;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function rowToProfile(row: LeadProfileRow): LeadProfile {
  return {
    leadId: row.lead_id,
    summary: row.summary,
    messagesSinceSummary: row.messages_since_summary,
    lastSummaryAt: row.last_summary_at ? new Date(row.last_summary_at) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  };
}

/**
 * Genera el bloque de texto para inyectar en el system prompt.
 * Si no hay profile o el summary está vacío, devuelve string vacío
 * (caller decide si omitir la sección).
 */
export function formatLeadProfileBlock(profile: LeadProfile | null): string {
  if (!profile) return "";
  if (!profile.summary.trim()) return "";
  return `CONTEXTO PREVIO DEL LEAD (resumen cumulativo entre sesiones):\n${profile.summary}`;
}
