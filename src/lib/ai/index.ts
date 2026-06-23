/**
 * Punto de entrada único para la capa del Agente IA.
 *
 * El proveedor ACTIVO hoy es `mock` (sin llamada a ningún LLM). El proveedor
 * `openrouter` es un stub documentado.
 *
 * Todo lo que devuelve el agente es MODO SUGERENCIA: el humano revisa antes de
 * enviar. Ver docs/AI_AGENT_GUARDRAILS.md.
 */

export * from "./agent-provider";
export { mockAgentProvider } from "./mock-agent-provider";
export { openrouterAgentProvider } from "./openrouter-provider";
export * from "./guardrails";
export * from "./agent-prompts";

import type { AIAgentProvider, AIAgentProviderName } from "./agent-provider";
import { mockAgentProvider } from "./mock-agent-provider";
import { openrouterAgentProvider } from "./openrouter-provider";

const REGISTRY: Record<AIAgentProviderName, AIAgentProvider> = {
  mock: mockAgentProvider,
  openrouter: openrouterAgentProvider
};

/** Devuelve el proveedor activo. En el MVP siempre es `mock`. */
export function getActiveAgentProvider(): AIAgentProvider {
  return mockAgentProvider;
}

/** Lista todos los proveedores (para el panel del agente). */
export function listAgentProviders(): AIAgentProvider[] {
  return [mockAgentProvider, openrouterAgentProvider];
}
