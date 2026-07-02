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
 *
 * Modo demo:
 *   Si falta DEEPSEEK_API_KEY, el provider devuelve `ok=false` + `demo: true`
 *   y `note` lo explica. Esto evita que el bot rompa en dev sin credenciales.
 *
 * IMPORTANTE — modo sugerencia:
 *   El bot sigue operando en MODO SUGERENCIA por defecto. Este provider se usa
 *   para generar respuestas a preguntas abiertas del lead, pero el output se
 *   filtra por `validateAgentReply` (ver `guardrails.ts`) antes de enviarse.
 *
 * Ver docs/AI_AGENT_GUARDRAILS.md.
 */

import type {
  AIAgentProvider,
  AgentContext,
  AgentResult,
  AgentTask
} from "./agent-provider";
import { buildSystemPrompt, buildTaskPrompt } from "./agent-prompts";

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

// ---------------------------------------------------------------------------
// Tipos internos
// ---------------------------------------------------------------------------

type DeepSeekTier = "flash" | "pro";

interface DeepSeekChatRequest {
  model: string;
  messages: Array<{ role: "system" | "user"; content: string }>;
  temperature: number;
  max_tokens: number;
}

interface DeepSeekChatResponse {
  choices?: Array<{
    message?: { role?: string; content?: string };
    finish_reason?: string;
  }>;
  error?: { message?: string; type?: string };
}

interface TierConfig {
  modelName: string;
  temperature: number;
  maxTokens: number;
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
 *
 * Reglas:
 *   - Si la tarea esta en PRO_PRIORITY_TASKS, arranca directo en Pro
 *     (suggest_reply es outbound sensible, mejor pagar el costo que fallar).
 *   - Si Flash fallo o devolvio baja confidence, escala a Pro.
 *   - Caso contrario, devuelve Flash.
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
// Sleep helper (reintentos)
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Llamada al API de DeepSeek (parametrizada por tier)
// ---------------------------------------------------------------------------

async function callDeepSeekTier(
  tier: DeepSeekTier,
  systemPrompt: string,
  userPrompt: string
): Promise<AgentResult> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      task: "suggest_reply", // placeholder, overridden por el caller
      provider: "deepseek",
      content: "",
      needsReview: true,
      demo: true,
      note: "DeepSeek no configurado. Se requiere DEEPSEEK_API_KEY (server-only). El bot usa fallback heuristico."
    };
  }

  const cfg = readTierConfig(tier);
  const payload: DeepSeekChatRequest = {
    model: cfg.modelName,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    temperature: cfg.temperature,
    max_tokens: cfg.maxTokens
  };

  const MAX_ATTEMPTS = 2;
  const FETCH_TIMEOUT_MS = 10_000; // 10s — alineado con Vercel function timeout.
  let lastError = "Sin respuesta del provider.";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      // Auditoría 2026-07-01: agregar timeout vía AbortController. Antes,
      // si la API de DeepSeek se colgaba, el fetch esperaba indefinidamente
      // y el `processInboundMessage` también. Ahora, 10s y abort.
      const controller = new AbortController();
      const timeoutHandle = setTimeout(
        () => controller.abort(),
        FETCH_TIMEOUT_MS
      );
      const res = await fetch(DEEPSEEK_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeoutHandle);

      const data = (await res.json().catch(() => ({}))) as DeepSeekChatResponse;

      if (res.ok) {
        const content = data.choices?.[0]?.message?.content?.trim();
        if (content) {
          const outboundTasks: AgentResult["task"][] = ["suggest_reply"];
          return {
            ok: true,
            task: "suggest_reply", // placeholder, overridden by caller
            provider: "deepseek",
            content,
            confidence: 0.85,
            needsReview: outboundTasks.includes("suggest_reply"),
            demo: false,
            note: `DeepSeek ${cfg.modelName} respondio (${content.length} chars, tier=${tier}).`
          };
        }
        lastError = `DeepSeek ${cfg.modelName} devolvio respuesta vacia.`;
      } else {
        lastError = data.error?.message ?? `HTTP ${res.status} ${res.statusText}`;
        const retryable = res.status >= 500;
        if (!retryable || attempt === MAX_ATTEMPTS) break;
        await sleep(250);
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt === MAX_ATTEMPTS) break;
      await sleep(250);
    }
  }

  return {
    ok: false,
    task: "suggest_reply", // placeholder, overridden by caller
    provider: "deepseek",
    content: "",
    needsReview: true,
    demo: false,
    note: `DeepSeek ${cfg.modelName} (tier=${tier}) error: ${lastError}.`
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
    // Paso 1: tier inicial segun tipo de tarea
    const initialTier = chooseTier(task);
    // Preferimos el flag `isFirstMessage` del context (viene de
    // `findOrCreateLead().created` en bot-engine, que es confiable). Si no
    // viene, caemos al fallback de `conversationWindow` (menos confiable
    // porque el loader puede fallar silenciosamente con .catch).
    const isFirstMessage =
      typeof context.isFirstMessage === "boolean"
        ? context.isFirstMessage
        : (context.conversationWindow?.messages.length ?? 0) === 0;
    const systemPrompt = buildSystemPrompt(context.profile, undefined, isFirstMessage);
    const userPrompt = buildTaskPrompt(task, context);

    let currentTier: DeepSeekTier = initialTier;
    let result: AgentResult;

    // Si la tarea es priority-for-Pro, vamos directo a Pro sin pasar por Flash.
    // Si no, arrancamos en Flash.
    if (initialTier === "flash") {
      result = await callDeepSeekTier("flash", systemPrompt, userPrompt);
      // Inyectamos `task` real (placeholder fue "suggest_reply" en el helper)
      result.task = task;

      // Paso 2: decision de escalado
      const nextTier = chooseTier(task, result);
      if (nextTier === "pro" && result.provider === "deepseek") {
        const escalated = await callDeepSeekTier(
          "pro",
          systemPrompt,
          userPrompt
        );
        result = { ...escalated, task };
        result.note = `[escalado flash→pro] ${result.note}`;
        currentTier = "pro";
      }
    } else {
      // Tarea prioritaria para Pro: directo
      result = await callDeepSeekTier("pro", systemPrompt, userPrompt);
      result.task = task;
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

    // Auditoria para que el caller sepa que tier respondio
    if (currentTier === "flash" && !result.note.includes("tier=")) {
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
