/**
 * Proveedor de Agente IA vía OpenRouter — STUB.
 *
 * OpenRouter es un agregador de LLMs (OpenAI, Anthropic, Meta, Google…) con una
 * API unificada. Permite cambiar de modelo sin reescribir la integración.
 *
 * ESTE ARCHIVO ES UN STUB. No realiza llamadas a OpenRouter ni a ningún LLM.
 *
 * Para activarlo (fase futura):
 *  1. Crear cuenta en openrouter.ai y obtener OPENROUTER_API_KEY (server-side).
 *  2. Elegir modelo (ej. "anthropic/claude-3.5-sonnet", "openai/gpt-4o-mini").
 *  3. Construir el prompt desde agent-prompts.ts con el perfil y guardrails.
 *  4. Implementar run() con fetch a https://openrouter.ai/api/v1/chat/completions.
 *  5. Mantener el MODO SUGERENCIA: el output siempre pasa por revisión humana
 *     salvo tareas explícitamente seguras (clasificación, resumen).
 *
 * Reglas del proyecto (NO romper):
 *  - Nunca exponer la API key al cliente (server-only).
 *  - No prometer automatización real mientras sea stub.
 *
 * Ver docs/AI_AGENT_GUARDRAILS.md.
 */

import type {
  AIAgentProvider,
  AgentContext,
  AgentResult
} from "./agent-provider";

export const openrouterAgentProvider: AIAgentProvider = {
  name: "openrouter",
  displayName: "OpenRouter (LLM) — stub",
  active: false,
  stub: true,

  async run(task, context: AgentContext): Promise<AgentResult> {
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      return {
        ok: false,
        task,
        provider: "openrouter",
        content: "",
        needsReview: true,
        demo: true,
        note:
          "OpenRouter no configurado. Se requiere OPENROUTER_API_KEY (server-only, stub sin implementar)."
      };
    }

    // TODO(futura fase):
    //   const prompt = buildPromptForTask(task, context);
    //   const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    //     method: "POST",
    //     headers: {
    //       Authorization: `Bearer ${apiKey}`,
    //       "Content-Type": "application/json"
    //     },
    //     body: JSON.stringify({ model, messages: prompt })
    //   });
    //   ...parse, aplicar guardrails, devolver AgentResult con needsReview.

    void context;
    return {
      ok: true,
      task,
      provider: "openrouter",
      content: "",
      needsReview: true,
      demo: true,
      note: "Respuesta OpenRouter (stub). No se llamó al LLM."
    };
  }
};
