/**
 * Sprint v0.9.6 — Laboratorio IA / Simulador de WhatsApp (server-only).
 *
 * Entry point puro `simulateConversationTurn` que ejecuta el motor
 * conversacional del bot (clasificación + prompt + LLM) SIN tocar:
 *   - El provider de WhatsApp (cero tráfico a Meta Cloud API).
 *   - La persistencia de leads / conversaciones (cero escrituras en DB).
 *   - El contador diario DeepSeek (cero escrituras en `bot_usage_daily`).
 *
 * AISLAMIENTO — REGLA DURA:
 *   Este archivo NO importa nada de los módulos prohibidos (ver tests
 *   de aislamiento). Los tests `tests/bot-simulator-isolation.test.mjs`
 *   lo verifican estáticamente + con spy en runtime.
 *
 * Lo que el simulador SÍ puede hacer (lectura best-effort):
 *   - Leer `bot_global_mode` de `system_settings` (vía `readSystemSetting`,
 *     caché 30s). Si hay `modeOverride`, no se lee DB.
 *   - Leer el evento activo si el cliente lo pide.
 *   - Leer las reglas activas (top 8 por prioridad). NO escribe nada.
 *   - Leer el perfil del lead si el cliente provee un leadId.
 *
 * El LLM (DeepSeek) SÍ se invoca — es lo que hace la simulación útil.
 * El provider expone `result.usage` (sprint v0.9.6) con tokens y costo.
 *
 * @server
 */

import type {
  AgentContext,
  AgentResult,
  AgentUsage,
  EventOfferType
} from "./agent-provider";
import type { LeadProfile } from "./lead-profile";
import type { ConversationMessage, ConversationWindow } from "./conversation-window";
import type { ActiveEventContext } from "./event-context-loader";
import type { BotRule } from "./ai-bot-rules-server";

import { aiAgentProfile } from "@/lib/data/crm-data";
import {
  readSystemSetting,
  KEY_BOT_GLOBAL_MODE,
  isBotGlobalMode
} from "@/lib/admin/system-settings-server";
import { classifyIntentHeuristic } from "./guardrails";
import { buildSystemPrompt, buildSuperExecutivePrompt } from "./agent-prompts";
import { deepseekAgentProvider } from "./deepseek-provider";
import { getActiveBotRules } from "./ai-bot-rules-server";
import { loadActiveEventContext, loadCoursesCatalogBlock } from "./event-context-loader";
import { loadLeadProfile } from "./lead-profile";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/* ------------------------------------------------------------------ */
/* Tipos públicos del simulador                                       */
/* ------------------------------------------------------------------ */

/** SSOT del modo del bot. Re-exportamos desde la lib de system-settings. */
export type BotMode =
  | "socratic_autopilot_v2"
  | "socratic_no_tools_v1"
  | "super_executive"
  | "human_first"
  // FIX 2026-07-19 (sprint bot v2): sync con BotGlobalMode.
  | "super_executive_v2";
// FIXME: la SSOT vive en `src/lib/admin/system-settings-server.ts` (`BotGlobalMode`).
// Esta declaración está duplicada en `BotConfigTab.tsx` y `BotSimulatorTab.tsx`.
// Refactor pendiente: unificar en `src/lib/ai/bot-mode.ts` (solo types, sin imports runtime).
// Sprint v0.9.x PR #1 agregó `human_first` a las 4 declaraciones en sync manual.
// Sprint v0.9.x PR #2 agregó `super_executive_v2` a las 3 declaraciones.

/** Un mensaje del historial simulado (in-memory, NO viene de la DB). */
export interface SimulateHistoryMessage {
  direction: "inbound" | "outbound";
  body: string;
  /** ISO 8601. Opcional — si falta se usa `Date.now()` en orden. */
  timestamp?: string;
}

/** Request del simulador. `message` es el turno actual del "lead". */
export interface SimulateRequest {
  message: string;
  history: SimulateHistoryMessage[];
  /**
   * Override del modo. Si está presente, bypasea la lectura de
   * `bot_global_mode` en DB. Si es null, se usa el modo de la DB.
   */
  modeOverride?: BotMode | null;
  /**
   * Contexto del lead opcional. Si está presente, el simulador puede
   * hidratar `leadProfile` desde la DB. Si es null, todo es en memoria.
   */
  leadContext?: {
    leadId: string;
    /** Perfil pre-cargado por el cliente (evita SELECT extra). */
    profile?: LeadProfile | null;
    isFirstMessage?: boolean;
  } | null;
  /** Si true, ignora `bot_paused_for_lead`. Default false (respeta la pausa). */
  ignoreLeadPause?: boolean;
  /** Si true, carga el evento activo de la DB para la simulación. Default true. */
  includeEventContext?: boolean;
  /** Si true, carga las reglas de oro activas. Default true. */
  includeInjectedRules?: boolean;
  /**
   * Sprint v0.9.7 (Switch Flash/Pro): override del tier del modelo.
   * `null` o ausente = default Flash con escalación automática.
   * `"flash"` = fuerza deepseek-chat (rápido).
   * `"pro"` = fuerza deepseek-reasoner (lento pero más preciso).
   * El simulador propaga este valor al `AgentContext.tierOverride`
   * que el provider deepseek respeta estrictamente.
   */
  tierOverride?: "flash" | "pro" | null;
}

export interface InjectedRule {
  instruction: string;
  priority: number;
  scope: string;
}

export interface SimulateTelemetry {
  modeUsed: BotMode;
  intent: string;
  /** Tools ejecutadas por el LLM. Viene de la metadata del result. */
  toolsCalled: string[];
  injectedRules: InjectedRule[];
  /** Nombre del evento activo cargado (si includeEventContext=true). */
  eventContext: string | null;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCostCents: number;
    model: string;
  };
}

export interface SimulateResponse {
  ok: boolean;
  reply: string;
  telemetry: SimulateTelemetry;
  note?: string;
}

/* ------------------------------------------------------------------ */
/* Helpers internos                                                   */
/* ------------------------------------------------------------------ */

/** Construye un `ConversationWindow` en memoria desde el history del cliente. */
function buildConversationWindowFromHistory(
  history: SimulateHistoryMessage[]
): ConversationWindow {
  const messages: ConversationMessage[] = history.map((m, i) => ({
    id: `sim-${i}-${m.timestamp ?? "noid"}`,
    direction: m.direction,
    messageType: "text",
    body: m.body,
    timestamp: m.timestamp ?? new Date(Date.now() - (history.length - i) * 60_000).toISOString(),
    metadata: null
  }));
  const promptBlock = formatHistoryBlock(messages);
  return {
    phoneNormalized: "+525555555555", // ficticio para sandbox
    leadId: null,
    messages,
    promptBlock
  };
}

function formatHistoryBlock(messages: ConversationMessage[]): string {
  if (messages.length === 0) {
    return "=== HISTORIAL DE CONVERSACION ===\n(primer mensaje del usuario)\n=================================";
  }
  const lines = messages.map((m) => {
    const date = new Date(m.timestamp);
    const hh = date.getUTCHours().toString().padStart(2, "0");
    const mm = date.getUTCMinutes().toString().padStart(2, "0");
    const actor = m.direction === "inbound" ? "lead" : "bot";
    const body = (m.body ?? "").slice(0, 300).replace(/\n+/g, " ");
    return `[${hh}:${mm}] ${actor}: ${body}`;
  });
  return ["=== HISTORIAL DE CONVERSACION ===", ...lines, "================================="].join("\n");
}

/** Resuelve el modo final: override (si válido) → DB → default. */
async function resolveMode(modeOverride?: BotMode | null): Promise<BotMode> {
  if (modeOverride && isBotGlobalMode(modeOverride)) {
    return modeOverride;
  }
  try {
    const dbMode = await readSystemSetting(KEY_BOT_GLOBAL_MODE);
    if (isBotGlobalMode(dbMode)) return dbMode;
  } catch {
    // DB falló. Default.
  }
  return "socratic_autopilot_v2";
}

/** Empty response con telemetría mínima. */
function emptyResponse(
  intent: string,
  note: string,
  modeUsed: BotMode,
  injectedRules: InjectedRule[] = []
): SimulateResponse {
  return {
    ok: false,
    reply: "",
    telemetry: {
      modeUsed,
      intent,
      toolsCalled: [],
      injectedRules,
      eventContext: null,
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        estimatedCostCents: 0,
        model: "unknown"
      }
    },
    note
  };
}

/* ------------------------------------------------------------------ */
/* Entry point principal                                                */
/* ------------------------------------------------------------------ */

/**
 * Ejecuta un turno de conversación simulado sin enviar a Meta ni
 * persistir nada. Devuelve la respuesta del LLM + telemetría.
 *
 * @example
 *   const r = await simulateConversationTurn({
 *     message: "Hola, me interesa el taller",
 *     history: [],
 *     modeOverride: "super_executive"
 *   });
 *   console.log(r.reply, r.telemetry.usage.costCents);
 */
export async function simulateConversationTurn(
  req: SimulateRequest
): Promise<SimulateResponse> {
  // 1. Validar inputs.
  if (!req.message || typeof req.message !== "string" || req.message.trim() === "") {
    return emptyResponse("invalid_input", "El mensaje no puede estar vacío.", "socratic_autopilot_v2");
  }
  if (!Array.isArray(req.history)) {
    return emptyResponse("invalid_input", "history debe ser un array.", "socratic_autopilot_v2");
  }

  // 2. Resolver modo.
  const modeUsed = await resolveMode(req.modeOverride ?? null);

  // 3. Cargar contexto opcional (evento activo, reglas, perfil del lead).
  //    TODO sprint futuro: aceptar `eventRules` cargadas de DB y propagarlas al Súper Ejecutivo.
  let activeEvent: ActiveEventContext | undefined;
  let eventTitle: string | null = null;
  if (req.includeEventContext !== false) {
    try {
      activeEvent = await loadActiveEventContext();
      eventTitle = activeEvent?.title ?? null;
    } catch {
      // best-effort
    }
  }

  let injectedRules: InjectedRule[] = [];
  if (req.includeInjectedRules !== false) {
    try {
      const rules: BotRule[] = await getActiveBotRules({ limit: 8 });
      injectedRules = rules.map((r) => ({
        instruction: r.instruction,
        priority: r.priority,
        scope: r.scope
      }));
    } catch {
      // best-effort
    }
  }

  // 4. Hidratar perfil del lead si el cliente dio un leadId y no proveyó
  //    el perfil pre-cargado. Lectura best-effort: si Supabase falla, sigue
  //    con perfil vacío.
  let leadProfile: LeadProfile | null = req.leadContext?.profile ?? null;
  if (req.leadContext?.leadId && !leadProfile) {
    try {
      const supabase = createSupabaseAdminClient();
      leadProfile = await loadLeadProfile(supabase, req.leadContext.leadId);
    } catch {
      // best-effort
    }
  }

  // 5. Clasificar intent (heurística regex barata, sin LLM). Esto da a la
  //    UI una pista de qué entendió el bot sin tener que esperar al LLM.
  const intent = classifyIntentHeuristic(req.message);

  // 6. Respetar `bot_paused_for_lead` (a menos que el cliente lo ignore).
  //    En el simulador NO leemos `leads.bot_paused` de la DB (sería 1 SELECT
  //    extra por turno). El cliente pasa el flag si quiere saltarse la pausa.
  //    Para el sprint v17 esto es suficiente: el admin decide explícitamente.
  const isPaused =
    !!req.leadContext?.leadId && req.ignoreLeadPause !== true
      ? await checkLeadPausedFromProfile(req.leadContext.leadId, leadProfile)
      : false;
  if (isPaused) {
    return {
      ok: true,
      reply:
        "[bot pausado para este lead] El bot no respondería a este mensaje. " +
        "Activa la casilla 'Ignorar pausa per-lead' para forzar la simulación.",
      telemetry: {
        modeUsed,
        intent,
        toolsCalled: [],
        injectedRules,
        eventContext: eventTitle,
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          estimatedCostCents: 0,
          model: "skipped"
        }
      },
      note: "bot_paused_for_lead: simulación omitida por pausa per-lead."
    };
  }

  // 7. Construir el system prompt según el modo.
  //    Sprint v0.9.6: usamos `systemPromptOverride` (campo opcional
  //    agregado a `AgentContext`) para que `pickSystemPromptForMode` lo
  //    respete y no lea DB. Esto es crucial para que el override de UI
  //    funcione sin esperar el caché 30s de `bot_global_mode`.
  let systemPrompt: string;
  if (modeUsed === "super_executive") {
    systemPrompt = buildSuperExecutivePrompt({
      profile: aiAgentProfile,
      activeEvent,
      eventOfferType: (activeEvent
        ? classifyOfferFromEvent(activeEvent)
        : "unknown") as EventOfferType,
      eventRules: []
    });
  } else {
    // Modos socráticos: primer mensaje si el historial está vacío.
    const isFirstMessage =
      req.leadContext?.isFirstMessage ?? req.history.filter((m) => m.direction === "inbound").length === 0;
    systemPrompt = buildSystemPrompt(aiAgentProfile, activeEvent, isFirstMessage);
  }

  // 8. Construir el contexto del agente.
  const conversationWindow = buildConversationWindowFromHistory(req.history);
  // FIX 2026-07-13 (súper-auditoría + plan anti-alucinación, Ola 1):
  // Cargar el catálogo de cursos LMS asincrónicos. Mismo TTL 5 min
  // que el catálogo de eventos. Si falla, se inyecta string vacío
  // y el sistema sigue funcionando (el prompt no se rompe).
  const coursesCatalogBlock = await loadCoursesCatalogBlock().catch(() => "");
  const context: AgentContext = {
    profile: aiAgentProfile,
    lastIncomingMessage: req.message,
    conversationWindow,
    coursesCatalogBlock,
    ...(leadProfile ? { leadProfile } : {}),
    // FIX 2026-07-14 (safety net human_first): el simulador debe pasar
    // el activeEvent al context del provider (no solo embebido en el
    // system prompt), porque el safety net de runtime
    // `applyHumanFirstSaleGuard` lo lee de `context.activeEvent` para
    // decidir si agrega el cierre de inscripción. Antes el simulador
    // solo inyectaba el evento en el system prompt, dejando al provider
    // sin acceso estructurado al evento. Esto rompía el safety net.
    ...(activeEvent ? { activeEvent } : {}),
    // Override del system prompt (clave del aislamiento de modo).
    systemPromptOverride: systemPrompt,
    // Sprint v0.9.7 (Switch Flash/Pro): propagamos el override del tier
    // al provider. Si está ausente o null, el provider usa Flash con
    // escalación automática a Pro. Si es "flash" o "pro", se respeta
    // ESTRICTAMENTE (incluso en la escalación flash→pro).
    ...(req.tierOverride === "flash" || req.tierOverride === "pro"
      ? { tierOverride: req.tierOverride }
      : {}),
    // NO pasamos supabase. Esto evita que el provider grabe en
    // `bot_usage_daily` y que las tools intenten persistir en Supabase.
    // (El path 2C con tools tiene su propio flujo; ver nota abajo.)
  };

  // 9. Llamar al LLM.
  let result: AgentResult;
  try {
    result = await deepseekAgentProvider.run("suggest_reply", context);
  } catch (err) {
    return {
      ok: false,
      reply: "",
      telemetry: {
        modeUsed,
        intent,
        toolsCalled: [],
        injectedRules,
        eventContext: eventTitle,
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          estimatedCostCents: 0,
          model: "error"
        }
      },
      note: `LLM call falló: ${err instanceof Error ? err.message : String(err)}`
    };
  }

  // 10. Construir telemetría final.
  const usage: AgentUsage | undefined = result.usage;
  return {
    ok: result.ok,
    reply: result.content,
    telemetry: {
      modeUsed,
      intent,
      // Tools llamadas: el path 2C (tool loop) puede emitir tool_call.
      // Por ahora el simulador solo detecta del note. v0.9.7 lo mejora.
      toolsCalled: extractToolsFromNote(result.note),
      injectedRules,
      eventContext: eventTitle,
      usage: usage
        ? {
            promptTokens: usage.promptTokens,
            completionTokens: usage.completionTokens,
            totalTokens: usage.totalTokens,
            estimatedCostCents: usage.costCents,
            model: usage.model
          }
        : {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            estimatedCostCents: 0,
            model: result.provider ?? "deepseek"
          }
    },
    note: result.note
  };
}

/* ------------------------------------------------------------------ */
/* Helpers opacos (no exportados — internos del simulador)              */
/* ------------------------------------------------------------------ */

/**
 * Heurística mínima para clasificar el `eventOfferType` desde un
 * `ActiveEventContext`. Replica la lógica de `classifyEventType` pero
 * in-process (no lee DB). Si no se reconoce, devuelve "unknown".
 *
 * La función canónica `classifyEventType` está en event-context-loader.ts
 * pero requiere el shape completo. Esta versión es best-effort.
 */
function classifyOfferFromEvent(
  event: ActiveEventContext
): "free_masterclass" | "paid_workshop" | "b2b_service" | "unknown" {
  const haystack = `${event.title} ${event.promptBlock}`.toLowerCase();
  if (
    haystack.includes("gratis") ||
    haystack.includes("gratuita") ||
    haystack.includes("masterclass") ||
    haystack.includes("entrada libre") ||
    haystack.includes("sin costo")
  ) {
    return "free_masterclass";
  }
  if (haystack.includes("taller") || haystack.includes("pago")) {
    return "paid_workshop";
  }
  if (haystack.includes("b2b") || haystack.includes("consultoria") || haystack.includes("agencia")) {
    return "b2b_service";
  }
  return "unknown";
}

/** Extrae nombres de tools ejecutadas del note del provider. */
function extractToolsFromNote(note: string | undefined): string[] {
  if (!note) return [];
  const tools: string[] = [];
  if (note.includes("extract") || note.includes("[tool]")) {
    tools.push("extract-contact");
  }
  if (note.includes("2C")) {
    // Path 2C: tool loop activo. Sin más detalle, el nombre genérico.
    tools.push("tool-loop");
  }
  return tools;
}

/**
 * Lee `bot_paused` del lead desde la DB. Best-effort: si falla, devuelve
 * false (asume no pausado, deja que la simulación continúe). Esta función
 * es la única excepción al aislamiento "no escribir" — hace 1 SELECT
 * pequeño y no toca ninguna tabla que el simulador deba evitar.
 */
async function checkLeadPausedFromProfile(
  leadId: string,
  profile: LeadProfile | null
): Promise<boolean> {
  if (!leadId) return false;
  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("leads" as never)
      .select("bot_paused" as never)
      .eq("id" as never, leadId)
      .maybeSingle();
    if (error || !data) return false;
    return Boolean((data as { bot_paused?: boolean }).bot_paused);
  } catch {
    return false;
  }
}
