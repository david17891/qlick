/**
 * Manual Bot Context — wrapper tipado sobre context-store.
 *
 * Define las "llaves semánticas" conocidas del contexto manual y cómo
 * formatearlas para inyección en el prompt del LLM.
 *
 * Llaves reservadas (convención, no enforce):
 *   - tone_override          → modifica el tono (ej. "Hoy más formal")
 *   - event_override_date    → override de fecha del evento
 *   - event_override_location → override de lugar
 *   - event_override_notes   → notas extra sobre el evento
 *   - compliance_notes       → info regulatoria obligatoria (ej. +18)
 *   - extra_notes            → notas libres para el bot
 *   - persona_name           → nombre del bot (ej. "Sofía" vs "Qlick Assistant")
 *   - persona_style          → estilo de conversación
 *
 * Server-only. Importar solo desde Route Handlers / Server Actions.
 *
 * @server
 */

import { loadActiveOverrides } from "./context-store";

/* ------------------------------------------------------------------ */
/*  Tipos                                                              */
/* ------------------------------------------------------------------ */

export type KnownContextKey =
  | "tone_override"
  | "event_override_date"
  | "event_override_location"
  | "event_override_notes"
  | "compliance_notes"
  | "extra_notes"
  | "persona_name"
  | "persona_style";

export interface ManualContextEntry {
  key: string;
  value: string;
  priority: number;
}

export interface ManualContextBundle {
  botName: string;
  entries: ManualContextEntry[];
  /** Bloque formateado para inyectar en el system prompt. */
  promptBlock: string;
  /** Override específico de tono (atajo). */
  toneOverride: string | null;
  /** Override de fecha del evento (atajo). */
  eventDateOverride: string | null;
  /** Override de lugar del evento (atajo). */
  eventLocationOverride: string | null;
  /** Override del nombre del bot. */
  personaName: string | null;
  /** Notas extra del operador. */
  extraNotes: string | null;
  /** Notas de compliance. */
  complianceNotes: string | null;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const DEFAULT_BOT_NAME = "qlick-bot";

/**
 * Formatea una lista de overrides como bloque Markdown listo para prompt.
 * Los overrides se agrupan por categoría lógica.
 */
function formatPromptBlock(entries: ManualContextEntry[]): string {
  if (entries.length === 0) return "";

  const lines: string[] = ["=== INSTRUCCIONES MANUALES DEL OPERADOR ==="];

  // Agrupar por prefijo lógico.
  const grouped: Record<string, ManualContextEntry[]> = {};
  for (const e of entries) {
    const category = e.key.split("_")[0] ?? "misc";
    if (!grouped[category]) grouped[category] = [];
    grouped[category].push(e);
  }

  const categoryLabels: Record<string, string> = {
    tone: "TONO",
    event: "EVENTO",
    persona: "PERSONALIDAD",
    compliance: "COMPLIANCE",
    extra: "NOTAS EXTRA",
    misc: "OTROS"
  };

  for (const [category, items] of Object.entries(grouped)) {
    lines.push("");
    lines.push(`[${categoryLabels[category] ?? category.toUpperCase()}]`);
    for (const item of items) {
      const niceKey = item.key.replace(/_/g, " ");
      lines.push(`- ${niceKey}: ${item.value}`);
    }
  }

  lines.push("=============================================");
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/*  API pública                                                        */
/* ------------------------------------------------------------------ */

/**
 * Carga el contexto manual activo de un bot y lo formatea para el prompt.
 */
export async function loadManualContext(
  botName: string = DEFAULT_BOT_NAME
): Promise<ManualContextBundle> {
  const raw = await loadActiveOverrides(botName);

  const find = (key: string): ManualContextEntry | null =>
    raw.find((e) => e.key === key) ?? null;

  const entries = raw.map((e) => ({
    key: e.key,
    value: e.value,
    priority: e.priority
  }));

  return {
    botName,
    entries,
    promptBlock: formatPromptBlock(entries),
    toneOverride: find("tone_override")?.value ?? null,
    eventDateOverride: find("event_override_date")?.value ?? null,
    eventLocationOverride: find("event_override_location")?.value ?? null,
    personaName: find("persona_name")?.value ?? null,
    extraNotes: find("extra_notes")?.value ?? null,
    complianceNotes: find("compliance_notes")?.value ?? null
  };
}

/**
 * Aplica overrides manuales al ActiveEventContext si existen.
 * Si no hay override, devuelve el evento sin tocar.
 */
export function applyEventOverrides(
  event: import("../ai/event-context-loader").ActiveEventContext,
  manual: ManualContextBundle
): import("../ai/event-context-loader").ActiveEventContext {
  const dateChanged = !!manual.eventDateOverride;
  const locationChanged = !!manual.eventLocationOverride;

  if (!dateChanged && !locationChanged) return event;

  const newLocation = manual.eventLocationOverride ?? event.location;
  const newHumanStartsAt = manual.eventDateOverride ?? event.humanStartsAt;
  const newPromptBlock = [
    "=== EVENTO ACTIVO ===",
    `Nombre: ${event.title}`,
    `Fecha y hora: ${newHumanStartsAt}${dateChanged ? " (overridden por operador)" : ""}`,
    `Duración: ${event.humanDuration}`,
    `Lugar: ${newLocation}${locationChanged ? " (overridden por operador)" : ""}`,
    "======================"
  ].join("\n");

  return {
    ...event,
    location: newLocation,
    humanStartsAt: newHumanStartsAt,
    promptBlock: newPromptBlock
  };
}

/**
 * Compone el system prompt final con: defaults + manual overrides.
 * Útil para previsualización en admin UI (Fase 2).
 */
export function composeSystemPrompt(args: {
  basePrompt: string;
  manualContext: ManualContextBundle;
}): string {
  const { basePrompt, manualContext: ctx } = args;
  if (ctx.promptBlock === "") return basePrompt;
  return [basePrompt, "", ctx.promptBlock].join("\n");
}