/**
 * Proveedor de Agente IA via DeepSeek (V4-Flash / V4-Pro con escalado).
 *
 * DeepSeek ofrece una API OpenAI-compatible en `https://api.deepseek.com/v1`.
 * Este provider la consume directo (sin pasar por OpenRouter) para minimizar
 * latencia y costos en el bot conversacional de WhatsApp.
 *
 * SWITCH INTELIGENTE Flash↔Pro (Feature flag de Fase 2 Qlick, 2026-06-30):
 *
 *   - Flash (`deepseek-chat` por default): tier rapido y barato.
 *     Default para TODAS las tareas. Costo ~30x menor que Pro.
 *
 *   - Pro (`deepseek-reasoner` por default): tier con razonamiento profundo.
 *     Se invoca SOLO cuando Flash devuelve senales de duda:
 *       * `ok: false` (timeout, 5xx, red)
 *       * `confidence < DEEPSEEK_ESCALATE_THRESHOLD` (default 0.7)
 *       * tarea `suggest_reply` (siempre sensible, outbound directo al lead)
 *
 *   - Si Pro tambien falla: fallback heuristico / mensaje generico.
 *
 * Env vars (server-only, NUNCA NEXT_PUBLIC_*):
 *   - DEEPSEEK_API_KEY           → Bearer token de DeepSeek (obligatorio).
 *   - DEEPSEEK_MODEL_FLASH       → default "deepseek-chat" (V4-Flash).
 *   - DEEPSEEK_MODEL_PRO         → default "deepseek-reasoner" (V4-Pro).
 *   - DEEPSEEK_ESCALATE_THRESHOLD → default "0.7" (corte para escalar).
 *   - DEEPSEEK_TOOLS_ENABLED     → default "false". "true" activa el
 *                                    tool loop de function-calling
 *                                    (Sprint 2 sub-sprint 2C). Es Kill
 *                                    Switch SRE: apagarlo devuelve al
 *                                    comportamiento Sprint 1 sin redeploy.
 *
 * TOOL CALLING (Sprint 2 sub-sprint 2C, FIX 2026-07-10):
 *   Cuando `DEEPSEEK_TOOLS_ENABLED === "true"` Y `task === "suggest_reply"`,
 *   el provider activa el tool loop:
 *     1) Llama 1ª vez CON el array `tools` del registry 2A
 *        (`getAgentTools()`). Timeout duro 1.5s.
 *     2) Si la respuesta trae `tool_calls`, ejecuta la PRIMERA tool vía
 *        el ejecutor del 2A (`executeExtractAndSaveContact`). Timeout 800ms.
 *     3) Hace exactamente UNA 2ª llamada SIN `tools` en payload, con
 *        `max_tokens: 250`, para que el LLM redacte la respuesta humana
 *        final. Timeout duro 1.5s.
 *     4) Si la 2ª llamada falla, ensambla fallback humano desde el
 *        resultado del tool (Escenario C del diseño).
 *   REGLA DURA: nunca más de 2 llamadas a la red por turno.
 *
 * Modo demo:
 *   Si falta DEEPSEEK_API_KEY, el provider devuelve `ok=false` + `demo: true`
 *   y `note` lo explica. Esto evita que el bot rompa en dev sin credenciales.
 *
 * IMPORTANTE — modo AUTOMÁTICO con guardrails:
 *   El bot responde automáticamente por WhatsApp Cloud API. Este provider se usa
 *   para generar respuestas a preguntas abiertas del lead (intent=question), y
 *   el output se filtra por `validateAgentReply` (ver `src/lib/ai/guardrails.ts`)
 *   antes de enviarse. Tambien hay un safety net en `src/lib/whatsapp/safety-net.ts`
 *   que strippea saludos redundantes en mensajes no-iniciales.
 *
 * Ver docs/AI_AGENT_GUARDRAILS.md y docs/SPRINT_2C_DEEPSEEK_TOOL_LOOP.md.
 */

import type {
  AIAgentProvider,
  AgentContext,
  AgentResult,
  AgentTask
} from "./agent-provider";
import type { AgentToolDefinition } from "./agent-tools";
import type { ActiveEventContext } from "./event-context-loader";
import { buildSystemPrompt, buildTaskPrompt } from "./agent-prompts";
import { getAgentTools } from "./agent-tools";
import { executeExtractAndSaveContact } from "./tool-executors/extract-contact";
import {
  readSystemSetting,
  KEY_DEEPSEEK_TOOLS_ENABLED
} from "../admin/system-settings-server";

// ---------------------------------------------------------------------------
// Configuracion
// ---------------------------------------------------------------------------

const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";

/** Tier rapido y barato. Default para todas las tareas. */
const DEFAULT_MODEL_FLASH = "deepseek-chat";
/** Tier con razonamiento profundo. Usado SOLO en escalado. */
const DEFAULT_MODEL_PRO = "deepseek-reasoner";
/** Default temperature para Pro (un poco mas bajo para consistencia). */
const DEFAULT_TEMPERATURE_FLASH = 0.7;
const DEFAULT_TEMPERATURE_PRO = 0.3;
/** Pro requiere mas tokens por el razonamiento. */
const DEFAULT_MAX_TOKENS = 500;
const DEFAULT_MAX_TOKENS_PRO = 1200;

/** Tareas que SIEMPRE inician con Pro (outbound sensible, baja tolerancia a error). */
const PRO_PRIORITY_TASKS: ReadonlySet<AgentTask> = new Set<AgentTask>([
  "suggest_reply"
]);

/* ------------------------------------------------------------------ */
/* Tool loop — constantes duras del Sprint 2 sub-sprint 2C            */
/* ------------------------------------------------------------------ */

/**
 * Timeout duro por llamada a DeepSeek dentro del tool loop. Default 1.5s.
 * El runtime total E2E debe ser <2.5s (1ª 1.5s + tool 0.2s + 2ª 0.7s típico),
 * así que 1.5s por llamada protege la latencia acumulada.
 */
const TOOL_LOOP_TIMEOUT_MS = 1500;

/**
 * Timeout duro para ejecutar la tool localmente (UPDATE a Supabase típico,
 * pero también cubre validaciones). Default 800ms.
 */
const TOOL_EXEC_TIMEOUT_MS = 800;

/**
 * `max_tokens` para la 2ª vuelta del tool loop. Solo necesita redactar
 * un saludo corto ("Listo Juan, ya te tengo registrado..."), así que 250
 * alcanza y reduce latencia. Subirlo después si conversaciones reales
 * muestran que el LLM se queda corto.
 */
const TOOL_REPLY_MAX_TOKENS = 250;

// ---------------------------------------------------------------------------
// Tipos internos
// ---------------------------------------------------------------------------

type DeepSeekTier = "flash" | "pro";

interface DeepSeekChatResponse {
  choices?: Array<{
    message?: {
      role?: string;
      content?: string | null;
      tool_calls?: ToolCall[];
    };
    finish_reason?: string;
  }>;
  error?: { message?: string; type?: string };
}

/** Tool call tal como DeepSeek lo emite (formato OpenAI v1). */
interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string; // JSON string — el LLM lo entrega como string.
  };
}

/** Una sola celda del array `messages` que se manda a DeepSeek. */
type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

interface TierConfig {
  modelName: string;
  temperature: number;
  maxTokens: number;
}

/* ------------------------------------------------------------------ */
/* Opciones y resultado de `callDeepSeekChat`                         */
/* ------------------------------------------------------------------ */

interface CallDeepSeekOptions {
  tier: DeepSeekTier;
  messages: ChatMessage[];
  /** Si se pasa, se incluyen como `tools` en el payload. */
  tools?: AgentToolDefinition[];
  /** Override del max_tokens (default: tier config). */
  maxTokens?: number;
  /** Override del temperature (default: tier config). */
  temperature?: number;
  /** Timeout duro. Default: 10s para compatibilidad con Sprint 1. */
  timeoutMs?: number;
}

interface CallDeepSeekRawResult {
  ok: boolean;
  /** Texto devuelto por el LLM (puede ser vacío si solo hubo tool_call). */
  content: string;
  /** Tool call emitido (solo el primero si el LLM emitió varios). */
  toolCall?: ToolCall;
  /** Latencia del fetch. Útil para métricas y para el assert de Caso 7. */
  latencyMs: number;
  note: string;
  /** Si falló por red/5xx/timeout, detalles. */
  errorMessage?: string;
}

// ---------------------------------------------------------------------------
// Lectura de env vars (con fallbacks)
// ---------------------------------------------------------------------------

function readEnvNumber(key: string, fallback: number): number {
  const raw = process.env[key]?.trim();
  if (!raw) return fallback;
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return fallback;
  return n;
}

function readModel(tier: DeepSeekTier): string {
  const key = tier === "flash" ? "DEEPSEEK_MODEL_FLASH" : "DEEPSEEK_MODEL_PRO";
  const fallback = tier === "flash" ? DEFAULT_MODEL_FLASH : DEFAULT_MODEL_PRO;
  return process.env[key]?.trim() || fallback;
}

function readEscalateThreshold(): number {
  return readEnvNumber("DEEPSEEK_ESCALATE_THRESHOLD", 0.7);
}

function readTierConfig(tier: DeepSeekTier): TierConfig {
  return {
    modelName: readModel(tier),
    temperature:
      tier === "flash" ? DEFAULT_TEMPERATURE_FLASH : DEFAULT_TEMPERATURE_PRO,
    maxTokens: tier === "flash" ? DEFAULT_MAX_TOKENS : DEFAULT_MAX_TOKENS_PRO
  };
}

// ---------------------------------------------------------------------------
// Decision de tier
// ---------------------------------------------------------------------------

/**
 * Decide que tier usar para una tarea dada. Se llama 2 veces:
 *   1) Antes de la primera llamada (sin flashOutcome) → elige tier inicial
 *   2) Despues de Flash (con flashOutcome) → decide si escalar a Pro
 */
function chooseTier(
  task: AgentTask,
  flashOutcome?: AgentResult | undefined
): DeepSeekTier {
  if (PRO_PRIORITY_TASKS.has(task)) {
    return "pro";
  }

  if (flashOutcome) {
    const threshold = readEscalateThreshold();
    if (!flashOutcome.ok) return "pro";
    const conf = flashOutcome.confidence ?? 1;
    if (conf < threshold) return "pro";
  }

  return "flash";
}

// ---------------------------------------------------------------------------
// Helpers varios (sleep, timeout, feature flag, fallback copy)
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Adjunta timeout duro a una promesa. Si expira, rechaza con un Error
 * cuyo message es el `label`.
 *
 * FIX 2026-07-10 (Sprint 2 sub-sprint 2C): los timeouts del tool loop
 * (800ms para tool exec, 1.5s por llamada a DeepSeek) usan este helper
 * para no pegarse al límite de Vercel si DeepSeek se cuelga.
 */
function runWithTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(label)), ms);
  });
  // Cuando la promesa original resuelve, limpiamos el timer para no
  // dejar handles colgando que mantengan vivo el proceso en tests.
  return Promise.race([
    promise.finally(() => {
      if (timer) clearTimeout(timer);
    }),
    timeout
  ]);
}

/**
 * Kill Switch SRE del tool loop.
 *
 * Resolución en orden (FIX 2026-07-10 Sprint 2 sub-sprint 2.1):
 *   1) DB (`system_settings.deepseek_tools_enabled`) si el context trae
 *      un supabase client. Lectura por PK = O(1) en Supabase + caché
 *      30s in-memory -> ~5ms cold, ~0ms hot.
 *   2) Fallback: `process.env.DEEPSEEK_TOOLS_ENABLED === "true"` si la
 *      DB no responde / key no existe / ctx.supabase no está seteado.
 *   3) Default: false (cero inventario, comportamiento Sprint 1).
 *
 * Por seguridad SRE: el default OFF se preserva. Si DB y env var
 * faltan/rompen, el bot corre como Sprint 1 (ya probado).
 *
 * API:
 *   - Sin args → chequea env var (síncrono, útil para tests y CLI).
 *   - Con `AgentContext` → chequea DB primero (async), fallback a env var.
 *
 * Para activar desde el panel admin en runtime: `system_settings`
 * UPSERT de `deepseek_tools_enabled = true`. La caché se invalida
 * automáticamente al escribir (ver `setSystemSetting`).
 */
export function isDeepseekToolsEnabled(
  ctx?: Pick<AgentContext, "supabase"> | null
): boolean {
  // Fallback determinista (env var) usado cuando:
  //   - no se pasa ctx (modo síncrono, tests)
  //   - ctx.supabase es null/undefined (modo demo)
  //   - DB devuelve null/error (resiliencia SRE)
  const envFallback = (): boolean =>
    process.env.DEEPSEEK_TOOLS_ENABLED === "true";

  // Caso síncrono: solo env var (compat con signature previa).
  if (ctx === undefined) return envFallback();

  // Caso async: el provider.run() pasa el contexto con supabase. Hacemos
  // una consulta async al system_settings. Si la DB falla, fallback.
  // NOTA: esta función NO puede ser async porque el provider.run()
  // necesita el flag ANTES de iniciar el flow. La consulta async es
  // la RESPONSABILIDAD del caller (`run()`), no de esta función pura.
  //
  // Esta función devuelve SOLO el fallback inmediato cuando se pasa ctx.
  // El provider.run() ejecuta la consulta con caché via readSystemSetting
  // y pasa el resultado resuelto a runWithToolLoop.
  //
  // Mantenemos esta firma síncrona para no romper callers externos
  // (tests, debug). La lógica async vive en `run()`.
  //
  // Si en el futuro alguien quiere consultar el flag real (no fallback)
  // desde esta función, debe llamar a `await readSystemSetting(...)`.
  return envFallback();
}

/**
 * Mensajes de fallback humano cuando DeepSeek falla.
 *
 * FIX 2026-07-10 (Sprint 2 sub-sprint 2C, escenario C del diseño):
 * El copy previo "Disculpa, tengo un problema técnico. ¿Me repetís la
 * pregunta?" suena a bot. Estos son más humanos y contextuales al evento
 * activo del lead.
 */
function pickFallback(activeEvent: ActiveEventContext | undefined): string {
  if (activeEvent && activeEvent.source !== "no_events") {
    return "Se me fue el hilo un momento. ¿Te puedo ayudar con la info del evento o prefieres que siga en otro momento?";
  }
  return "Se me fue el hilo un momento. Cuéntame en qué te puedo ayudar y con gusto te echo la mano.";
}

/**
 * Construye el mensaje que el bot le manda al lead cuando el tool ejecutó
 * OK pero la 2ª llamada a DeepSeek falló (Escenario C del diseño).
 * El lead YA quedó registrado en DB; solo falta el copy de cierre.
 */
function buildToolOkFallback(toolResult: ExtractOkMessage | null): string {
  if (!toolResult) {
    return "Listo, ya te tengo registrado. En un momento te paso los detalles.";
  }
  const first = toolResult.savedName?.split(/\s+/)[0];
  if (first) {
    return `Listo ${first}, ya te tengo registrado. En un momento te paso los detalles.`;
  }
  return "Listo, ya te tengo registrado. En un momento te paso los detalles.";
}

/** Forma mínima del resultado del tool que usa `buildToolOkFallback`. */
interface ExtractOkMessage {
  savedName?: string;
  savedEmail?: string;
  ok: boolean;
}

// ---------------------------------------------------------------------------
// Llamada universal a DeepSeek (parametrizada por tier)
// ---------------------------------------------------------------------------

/**
 * Función universal que reemplaza al viejo `callDeepSeekTier`. Soporta:
 *   - tools opcionales en el payload (function-calling, sub-sprint 2C)
 *   - historial completo (`messages`) para 2ª vuelta del tool loop
 *   - maxTokens y temperature configurables
 *   - timeout duro via AbortController
 *
 * Devuelve `CallDeepSeekRawResult` con la metadata suficiente para que
 * el runner (tool loop o path viejo) decida qué hacer.
 *
 * Reintentos: 1 retry con backoff de 250ms SOLO en 5xx (Sprint 1).
 * En 4xx, abortamos. Timeout cuenta como error de red.
 */
async function callDeepSeekChat(opts: CallDeepSeekOptions): Promise<CallDeepSeekRawResult> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      content: "",
      latencyMs: 0,
      note: "DEEPSEEK_API_KEY no configurada (modo demo)."
    };
  }

  const cfg = readTierConfig(opts.tier);
  const payload: Record<string, unknown> = {
    model: cfg.modelName,
    messages: opts.messages,
    temperature: opts.temperature ?? cfg.temperature,
    max_tokens: opts.maxTokens ?? cfg.maxTokens
  };
  if (opts.tools && opts.tools.length > 0) {
    payload.tools = opts.tools;
  }

  const timeoutMs = opts.timeoutMs ?? 10_000;
  const MAX_ATTEMPTS = 2;
  let lastError = "Sin respuesta del provider.";
  const startOverall = Date.now();

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(DEEPSEEK_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timer);
      const latencyMs = Date.now() - startOverall;
      const data = (await res.json().catch(() => ({}))) as DeepSeekChatResponse;

      if (!res.ok) {
        lastError = data.error?.message ?? `HTTP ${res.status} ${res.statusText}`;
        // FIX 2026-07-10: solo reintentamos errores de servidor (5xx).
        // 4xx no se reintenta — son errores lógicos del payload.
        const retryable = res.status >= 500;
        if (!retryable || attempt === MAX_ATTEMPTS) break;
        await sleep(250);
        continue;
      }

      const message = data.choices?.[0]?.message;
      const content = (message?.content ?? "").trim();
      const toolCalls = message?.tool_calls;
      const toolCall = toolCalls && toolCalls.length > 0 ? toolCalls[0] : undefined;

      if (content || toolCall) {
        return {
          ok: true,
          content,
          toolCall,
          latencyMs,
          note: `${cfg.modelName} ${latencyMs}ms attempt=${attempt} tier=${opts.tier}`
        };
      }
      lastError = `${cfg.modelName} devolvio respuesta vacia (sin content, sin tool_calls)`;
      break;
    } catch (err) {
      clearTimeout(timer);
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt === MAX_ATTEMPTS) break;
      await sleep(250);
    }
  }
  return {
    ok: false,
    content: "",
    latencyMs: Date.now() - startOverall,
    note: `DeepSeek fallo: ${lastError}`,
    errorMessage: lastError
  };
}

// ---------------------------------------------------------------------------
// TOOL LOOP (Sprint 2 sub-sprint 2C)
//
// Loop principal: hasta 2 llamadas a DeepSeek. La 1ª con `tools`, la 2ª
// (solo si hubo tool_call) sin `tools` y con max_tokens=250.
// ---------------------------------------------------------------------------

/**
 * Loop del Sprint 2 sub-sprint 2C. Se activa solo cuando
 * `isDeepseekToolsEnabled() === true` Y `task === "suggest_reply"`.
 *
 * Estructura:
 *   1ª llamada: `messages = [system, user]`, `tools = getAgentTools()`.
 *   Si el LLM NO emite tool_call → terminamos con el `content` (1 sola).
 *   Si emite tool_call:
 *     - ejecutar la tool localmente (timeout 800ms).
 *     - 2ª llamada: `messages = [system, user, assistant(tool_calls), tool(result)]`,
 *       `max_tokens = 250`, SIN `tools` (regla dura de 1 sola iteración).
 *     - devolver el `content` final.
 *   Si la 2ª llamada falla → fallback humano desde el tool result.
 */
async function runWithToolLoop(
  task: AgentTask,
  context: AgentContext
): Promise<AgentResult> {
  // Construir prompts una sola vez (se reusan en la 2ª vuelta).
  const isFirstMessage =
    typeof context.isFirstMessage === "boolean"
      ? context.isFirstMessage
      : (context.conversationWindow?.messages.length ?? 0) === 0;
  const systemPrompt = buildSystemPrompt(
    context.profile,
    context.activeEvent,
    isFirstMessage,
    context.eventsListBlock
  );
  const userPrompt = buildTaskPrompt(task, context);
  const tools = getAgentTools();

  // 1ª vuelta: Pro (porque suggest_reply es PRO_PRIORITY). Con tools.
  const first = await callDeepSeekChat({
    tier: "pro",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    tools,
    timeoutMs: TOOL_LOOP_TIMEOUT_MS
  });

  // Sin tool call: terminamos con el content tal cual.
  if (!first.ok) {
    return wrapRawAsAgentResult(first, task, /* usedToolLoop */ true);
  }
  if (!first.toolCall) {
    return wrapRawAsAgentResult(first, task, /* usedToolLoop */ true);
  }

  // Hubo tool_call: ejecutar y luego 2ª vuelta.
  const tc = first.toolCall;

  // Parsear argumentos con defensiva. Si JSON inválido, ack con error.
  let parsedArgs: { name?: string; email?: string } = {};
  let parseOk = true;
  try {
    parsedArgs = JSON.parse(tc.function.arguments);
  } catch {
    parseOk = false;
  }

  // Ejecutar la tool con timeout duro (FIX 2026-07-10, escenario B).
  // Si el executor rechaza (timeout, error de Supabase, args inválidos),
  // devolvemos un ack de error al LLM para que la 2ª vuelta redacte
  // una respuesta adaptativa.
  let toolResult: { ok: boolean; persisted: boolean; demo: boolean; note: string;
                     saved_name?: string; saved_email?: string;
                     error_name?: string; error_email?: string };
  if (!parseOk) {
    toolResult = {
      ok: false,
      persisted: false,
      demo: false,
      note: "Tool arguments no son JSON valido."
    };
  } else if (tc.function.name !== "extract_and_save_contact_info") {
    // El LLM emitió una tool que no es la consolidada. Por la invariante
    // del 2A solo se expone UNA tool, pero si DeepSeek alucinara otra,
    // rechazamos silenciosamente.
    toolResult = {
      ok: false,
      persisted: false,
      demo: false,
      note: `Tool '${tc.function.name}' no soportada por este provider.`
    };
  } else {
    try {
      toolResult = await runWithTimeout(
        executeExtractAndSaveContact(parsedArgs, {
          leadId: context.leadId ?? "",
          supabase: (context as { supabase?: never }).supabase ?? null
        }),
        TOOL_EXEC_TIMEOUT_MS,
        `tool_exec_timeout (${TOOL_EXEC_TIMEOUT_MS}ms)`
      );
    } catch (err) {
      const note = err instanceof Error ? err.message : String(err);
      toolResult = {
        ok: false,
        persisted: false,
        demo: false,
        note: note.includes("timeout")
          ? `Tool execution excedio ${TOOL_EXEC_TIMEOUT_MS}ms.`
          : `Tool execution error: ${note}`
      };
    }
  }

  // 2ª y ÚLTIMA llamada: sin tools, max_tokens=250, historial completo.
  // Si DeepSeek respondiera con otro tool_call (no debería porque NO le
  // pasamos `tools`), lo descartamos silenciosamente — solo usamos `content`.
  const second = await callDeepSeekChat({
    tier: "pro",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
      {
        role: "assistant",
        content: first.content || null,
        tool_calls: [tc]
      },
      {
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify(toolResult)
      }
    ],
    maxTokens: TOOL_REPLY_MAX_TOKENS,
    temperature: 0.5,
    timeoutMs: TOOL_LOOP_TIMEOUT_MS
  });

  // Si 2ª llamada OK → devolver su content.
  if (second.ok && second.content) {
    return {
      ok: true,
      task,
      provider: "deepseek",
      content: second.content,
      confidence: 0.85,
      needsReview: false,
      demo: false,
      note: `[2C tool-loop] ${first.note} + ${second.note}; tool=${tc.function.name} ok=${toolResult.ok}`
    };
  }

  // 2ª llamada falló. Escenario C: ensamblar fallback desde el tool result.
  if (toolResult.ok && (toolResult.saved_name || toolResult.saved_email)) {
    // Tool se ejecutó OK y la 2ª falló: el lead YA está guardado.
    const firstName = toolResult.saved_name?.split(/\s+/)[0];
    const fallbackCopy = firstName
      ? `Listo ${firstName}, ya te tengo registrado. En un momento te paso los detalles.`
      : "Listo, ya te tengo registrado. En un momento te paso los detalles.";
    return {
      ok: true,
      task,
      provider: "deepseek",
      content: fallbackCopy,
      confidence: 0.6,
      needsReview: false,
      demo: false,
      note: `[2C fallback] tool OK + 2nd call failed; tool=${tc.function.name}; saved: ${!!toolResult.saved_name}/${!!toolResult.saved_email}`
    };
  }

  // Ni tool OK ni 2ª llamada OK: doble falla. Fallback contextual y admin revisa.
  return {
    ok: true,
    task,
    provider: "deepseek",
    content: pickFallback(context.activeEvent),
    confidence: 0,
    needsReview: true,
    demo: false,
    note: `[2C fallback] tool_failed + 2nd_call_failed; tool_note="${toolResult.note}"`
  };
}

/**
 * Empaqueta un `CallDeepSeekRawResult` como `AgentResult` (formato del
 * provider). Usado cuando la 1ª llamada NO tuvo tool_call (o cuando el
 * loop está deshabilitado).
 *
 * IMPORTANTE — compat Sprint 1:
 *   Cuando `usedToolLoop === false` (Kill Switch apagado, modo Sprint 1),
 *   preservar el comportamiento histórico: si raw.ok es false, devolver
 *   `ok: false` para que el caller (escala a Pro) decida. Solo en el
 *   path 2C (tool_loop activo), un fallo debe convertirse en respuesta
 *   humana (ok:true con fallback) para no colgar al lead.
 */
function wrapRawAsAgentResult(
  raw: CallDeepSeekRawResult,
  task: AgentTask,
  usedToolLoop: boolean
): AgentResult {
  if (raw.ok) {
    return {
      ok: true,
      task,
      provider: "deepseek",
      content: raw.content,
      confidence: 0.85,
      needsReview: usedToolLoop && task === "suggest_reply" ? false : (task === "suggest_reply"),
      demo: false,
      note: `[${usedToolLoop ? "2C" : "1C"}] ${raw.note}`
    };
  }

  // Path tool_loop (2C): SIEMPRE responder con copy humano para no colgar
  // al lead. El caller es el loop, así que ok:true con fallback mantiene
  // la UX continua.
  if (usedToolLoop) {
    return {
      ok: true,
      task,
      provider: "deepseek",
      content: pickFallback(undefined), // activeEvent se inyecta en run() antes
      confidence: 0,
      needsReview: true,
      demo: false,
      note: `${raw.note} Devolviendo respuesta fallback.`
    };
  }

  // Path Sprint 1: compat histórica. Devolver ok:false para que el caller
  // (escala a Pro) pueda tomar la decisión. Si Pro también falla, entonces
  // el fallback textual final ocurre en `run()` después del escalado.
  return {
    ok: false,
    task,
    provider: "deepseek",
    content: "",
    needsReview: true,
    demo: false,
    note: `${raw.note} Devolviendo respuesta fallback.`
  };
}

// ---------------------------------------------------------------------------
// Provider exportado
// ---------------------------------------------------------------------------

export const deepseekAgentProvider: AIAgentProvider = {
  name: "deepseek",
  displayName: "DeepSeek (V4-Flash + V4-Pro escalado)",
  active: true,
  stub: false,

  async run(task: AgentTask, context: AgentContext): Promise<AgentResult> {
    // FIX 2026-07-10 (Sprint 2 sub-sprint 2.1): resolver el flag del Kill
    // Switch SRE con preferencia a la DB (system_settings) sobre el
    // env var. Esto habilita el toggle desde el panel admin sin
    // redeploy. Fallback chain:
    //   1. DB `system_settings.deepseek_tools_enabled` (caché 30s)
    //   2. env var `DEEPSEEK_TOOLS_ENABLED=true`
    //   3. default OFF
    let flagEnabled = process.env.DEEPSEEK_TOOLS_ENABLED === "true";
    if (context.supabase) {
      try {
        const v = await readSystemSetting(KEY_DEEPSEEK_TOOLS_ENABLED);
        if (v === true) {
          flagEnabled = true;
        } else if (v === false) {
          flagEnabled = false;
        }
        // v === null: dejamos el flagEnabled como está (fallback env var).
      } catch {
        // DB falló (red, timeout, RLS). Fallback al env var.
      }
    }

    // ── Path 2C: tool loop (solo suggest_reply + flag ON) ──
    if (task === "suggest_reply" && flagEnabled) {
      const result = await runWithToolLoop(task, context);
      // Inyectar el activeEvent-aware fallback si el wrapper usó el
      // fallback genérico. (El wrapper ya inyecta fallback contextual
      // en el path de doble falla; este es solo defense in depth.)
      if (!result.content || result.content.length === 0) {
        return {
          ...result,
          content: pickFallback(context.activeEvent),
          note: `${result.note} [fallback empty content]`
        };
      }
      return result;
    }

    // ── Path Sprint 1 (compatibilidad total) ──
    const initialTier = chooseTier(task);
    const isFirstMessage =
      typeof context.isFirstMessage === "boolean"
        ? context.isFirstMessage
        : (context.conversationWindow?.messages.length ?? 0) === 0;
    const systemPrompt = buildSystemPrompt(
      context.profile,
      context.activeEvent,
      isFirstMessage,
      context.eventsListBlock
    );
    const userPrompt = buildTaskPrompt(task, context);

    let currentTier: DeepSeekTier = initialTier;
    let result: AgentResult;

    if (initialTier === "flash") {
      const firstRaw = await callDeepSeekChat({
        tier: "flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ]
      });
      result = wrapRawAsAgentResult(firstRaw, task, /* usedToolLoop */ false);
      currentTier = "flash";
      // Decide si escalar a Pro.
      const fakeFlashOutcome: AgentResult = {
        ...result,
        task
      };
      const nextTier = chooseTier(task, fakeFlashOutcome);
      if (nextTier === "pro" && result.provider === "deepseek") {
        const escalatedRaw = await callDeepSeekChat({
          tier: "pro",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ]
        });
        const escalated = wrapRawAsAgentResult(escalatedRaw, task, false);
        escalated.note = `[escalado flash→pro] ${escalated.note}`;
        result = escalated;
        currentTier = "pro";
      }
    } else {
      const proRaw = await callDeepSeekChat({
        tier: "pro",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ]
      });
      result = wrapRawAsAgentResult(proRaw, task, false);
      currentTier = "pro";
    }

    // Si el resultado final fallo despues de todos los reintentos, devolvemos
    // un fallback textual para que el caller tenga algo que mostrar al usuario.
    if (!result.ok) {
      return {
        ok: false,
        task,
        provider: "deepseek",
        content: "Disculpa, tengo un problema tecnico. ?Me repetis la pregunta?",
        confidence: 0,
        needsReview: true,
        demo: result.demo ?? false,
        note: `${result.note} Devolviendo respuesta fallback.`
      };
    }

    if (currentTier === "flash" && !result.note.includes("tier=") && !result.note.includes("[1C]") && !result.note.includes("[2C]")) {
      result.note = `[tier=flash] ${result.note}`;
    }
    return result;
  }
};

// ---------------------------------------------------------------------------
// Helpers exportados (para tests y para debug)
// ---------------------------------------------------------------------------

/** Visible para tests: dado un task (y opcionalmente un flashOutcome previo), que tier elegimos? */
export function _chooseTierForTest(
  task: AgentTask,
  flashOutcome?: AgentResult
): DeepSeekTier {
  return chooseTier(task, flashOutcome);
}

/** Visible para tests: leer la config de un tier sin hacer fetch. */
export function _readTierConfigForTest(tier: DeepSeekTier): TierConfig {
  return readTierConfig(tier);
}

/** Visible para tests: estado del Kill Switch SRE. */
export function _isDeepseekToolsEnabledForTest(): boolean {
  return isDeepseekToolsEnabled();
}

/** Visible para tests: ejecutar el tool loop directamente (bypass del provider.run). */
export const _runWithToolLoopForTest = runWithToolLoop;

/** Visible para tests: el copy de fallback. */
export function _pickFallbackForTest(activeEvent: ActiveEventContext | undefined): string {
  return pickFallback(activeEvent);
}

/** Visible para tests: timeout duro de una promesa. */
export const _runWithTimeoutForTest = runWithTimeout;
