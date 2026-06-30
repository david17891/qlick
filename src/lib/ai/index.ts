/**
 * Punto de entrada único para la capa del Agente IA.
 *
 * Proveedores:
 *   - mock        → respuestas pre-escritas (sin llamada a API). Default.
 *   - openrouter  → stub documentado (no llama a OpenRouter).
 *   - deepseek    → V4-Flash real (DEEPSEEK_API_KEY).
 *
 * Selección del proveedor activo (prioridad):
 *   1. `AI_AGENT_PROVIDER` (override explícito).
 *   2. Si `DEEPSEEK_API_KEY` está seteada → `deepseek`.
 *   3. Fallback → `mock`.
 *
 * MODO SUGERENCIA: el bot opera en modo sugerencia; las respuestas pasan por
 * `validateAgentReply` antes de enviarse. Ver docs/AI_AGENT_GUARDRAILS.md.
 */

export * from "./agent-provider";
export { mockAgentProvider } from "./mock-agent-provider";
export { openrouterAgentProvider } from "./openrouter-provider";
export { deepseekAgentProvider } from "./deepseek-provider";
export * from "./guardrails";
export * from "./agent-prompts";

import type { AIAgentProvider, AIAgentProviderName } from "./agent-provider";
import { mockAgentProvider } from "./mock-agent-provider";
import { openrouterAgentProvider } from "./openrouter-provider";
import { deepseekAgentProvider } from "./deepseek-provider";

const REGISTRY: Record<AIAgentProviderName, AIAgentProvider> = {
  mock: mockAgentProvider,
  openrouter: openrouterAgentProvider,
  deepseek: deepseekAgentProvider
};

/**
 * Devuelve el proveedor activo.
 *
 * Prioridad:
 *   1. `AI_AGENT_PROVIDER` (override del operador).
 *   2. Si `DEEPSEEK_API_KEY` está seteada → `deepseek`.
 *   3. Fallback → `mock`.
 */
export function getActiveAgentProvider(): AIAgentProvider {
  const fromEnv = process.env.AI_AGENT_PROVIDER as
    | AIAgentProviderName
    | undefined;
  if (fromEnv && REGISTRY[fromEnv]) {
    return REGISTRY[fromEnv];
  }
  if (process.env.DEEPSEEK_API_KEY) {
    return deepseekAgentProvider;
  }
  return mockAgentProvider;
}

/** Lista todos los proveedores (para el panel del agente). */
export function listAgentProviders(): AIAgentProvider[] {
  return [mockAgentProvider, openrouterAgentProvider, deepseekAgentProvider];
}
