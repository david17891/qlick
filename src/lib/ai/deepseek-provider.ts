/**
 * Proveedor de Agente IA vía DeepSeek (V4-Flash / `deepseek-chat`).
 *
 * DeepSeek ofrece una API OpenAI-compatible en `https://api.deepseek.com/v1`.
 * Este provider la consume directo (sin pasar por OpenRouter) para minimizar
 * latencia y costos en el bot conversacional de WhatsApp.
 *
 * Env vars (server-only, NUNCA NEXT_PUBLIC_*):
 *   - DEEPSEEK_API_KEY   → Bearer token de DeepSeek.
 *   - DEEPSEEK_MODEL     → default "deepseek-chat" (V4-Flash).
 *
 * Modo demo:
 *   Si falta DEEPSEEK_API_KEY, el provider devuelve `ok=false` + `demo: true`
 *   y `note` lo explica. Esto evita que el bot rompa en dev sin credenciales.
 *
 * IMPORTANTE — modo sugerencia:
 *   El bot sigue operando en MODO SUGERENCIA por defecto. Este provider se usa
 *   para generar respuestas a preguntas abiertas del lead, pero el output se
 *   filtra por `validateAgentReply` (ver `guardrails.ts`) antes de enviarse.
 *   El bot engine NUNCA manda respuestas que contengan frases prohibidas
 *   (descuento, gratis, pago aprobado, etc.).
 *
 * Ver docs/AI_AGENT_GUARDRAILS.md.
 */

import type {
  AIAgentProvider,
  AgentContext,
  AgentResult
} from "./agent-provider";
import { buildSystemPrompt, buildTaskPrompt } from "./agent-prompts";

const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";
const DEFAULT_MODEL = "deepseek-chat";
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_TOKENS = 500;

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

/** Lee el modelo desde env, con fallback. */
function readModel(): string {
  return process.env.DEEPSEEK_MODEL?.trim() || DEFAULT_MODEL;
}

/** Sleep helper para reintentos. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const deepseekAgentProvider: AIAgentProvider = {
  name: "deepseek",
  displayName: "DeepSeek (V4-Flash)",
  active: true,
  stub: false,

  async run(task, context: AgentContext): Promise<AgentResult> {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return {
        ok: false,
        task,
        provider: "deepseek",
        content: "",
        needsReview: true,
        demo: true,
        note:
          "DeepSeek no configurado. Se requiere DEEPSEEK_API_KEY (server-only). El bot usa fallback heurístico.",
      };
    }

    const systemPrompt = buildSystemPrompt(context.profile);
    const userPrompt = buildTaskPrompt(task, context);

    const payload: DeepSeekChatRequest = {
      model: readModel(),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: DEFAULT_TEMPERATURE,
      max_tokens: DEFAULT_MAX_TOKENS
    };

    // 1 retry en 5xx / network. 4xx no se reintenta.
    const MAX_ATTEMPTS = 2;
    let lastError = "Sin respuesta del provider.";

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const res = await fetch(DEEPSEEK_API_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        });

        const data = (await res.json().catch(() => ({}))) as DeepSeekChatResponse;

        if (res.ok) {
          const content = data.choices?.[0]?.message?.content?.trim();
          if (content) {
            // Tareas que tocan al cliente en outbound => necesitan revisión humana.
            const outboundTasks: AgentResult["task"][] = [
              "suggest_reply"
            ];
            return {
              ok: true,
              task,
              provider: "deepseek",
              content,
              confidence: 0.85,
              needsReview: outboundTasks.includes(task),
              demo: false,
              note: `DeepSeek ${readModel()} respondió (${content.length} chars).`
            };
          }
          lastError = "DeepSeek devolvió respuesta vacía.";
        } else {
          lastError =
            data.error?.message ?? `HTTP ${res.status} ${res.statusText}`;
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
      task,
      provider: "deepseek",
      content:
        "Disculpá, tengo un problema técnico. ¿Me repetís la pregunta?",
      confidence: 0,
      needsReview: true,
      demo: false,
      note: `DeepSeek error: ${lastError}. Devolviendo respuesta fallback.`
    };
  }
};
