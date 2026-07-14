/**
 * Punto de entrada único para la capa del Agente IA.
 *
 * Proveedores:
 *   - mock        → respuestas pre-escritas (sin llamada a API). Fallback.
 *   - openrouter  → stub documentado (no llama a OpenRouter).
 *   - deepseek    → V4-Flash real (DEEPSEEK_API_KEY). Default en prod.
 *
 * Selección del proveedor activo (prioridad):
 *   1. `AI_AGENT_PROVIDER` (override explícito).
 *   2. Si `DEEPSEEK_API_KEY` está seteada → `deepseek`.
 *   3. Fallback → `mock`.
 *
 * FIX housekeeping 2026-07-14 (G-16 collateral): el comentario anterior
 * decía "MODO SUGERENCIA: el bot opera en modo sugerencia". ESTÁ
 * DESACTUALIZADO. El bot soporta DOS modos operativos:
 *
 *   - **Modo automático (default en prod)**: el bot responde
 *     automáticamente por WhatsApp Cloud API en los modos `socratic_*`
 *     y `human_first`. Las respuestas pasan por `validateAgentReply`
 *     (ver `src/lib/ai/guardrails.ts`) ANTES de enviarse — esto es el
 *     guardrail del modo automático, NO una revisión humana. También hay
 *     un safety net post-process (`src/lib/whatsapp/safety-net.ts`) que
 *     strippea saludos redundantes cuando hay historial.
 *   - **Modo admin / laboratorio** (`/admin/bot`): el bot sugiere
 *     respuestas que el admin revisa antes de aprobar el envío. Este sí
 *     es "modo sugerencia" en sentido estricto.
 *
 * En Sprint v15 (PR #2) el modo automático se robusteció con el Cerebro
 * Súper Ejecutivo + dispatch de tools (extract_and_save_contact_info,
 * add_event_guest). En Sprint v0.10 se agregó el modo `human_first` como
 * 4to modo opt-in. Ver docs/AI_AGENT_GUARDRAILS.md.
 */

export * from "./agent-provider";
export { mockAgentProvider } from "./mock-agent-provider";
export { openrouterAgentProvider } from "./openrouter-provider";
export { deepseekAgentProvider } from "./deepseek-provider";
export * from "./guardrails";
export * from "./agent-prompts";
export * from "./per-phone-rate-limit";
export {
  loadActiveEventContext,
  loadAllActiveEvents,
  formatEventsListBlock,
  formatHumanDate,
  formatHumanDuration,
  type ActiveEventContext
} from "./event-context-loader";
export {
  loadConversationWindow,
  type ConversationWindow,
  type ConversationMessage
} from "./conversation-window";
export {
  loadLeadProfile,
  incrementMessageCount,
  regenerateSummary,
  formatLeadProfileBlock,
  SUMMARY_EVERY,
  type LeadProfile
} from "./lead-profile";
/* Agent Tools (Sprint 2 sub-sprint 2A, 2026-07-10). */
export {
  getAgentTools,
  getAgentToolByName,
  TOOL_EXTRACT_AND_SAVE_CONTACT_INFO,
  type AgentToolDefinition,
  type ToolParameterSchema
} from "./agent-tools";
export {
  executeExtractAndSaveContact,
  isValidHumanNameLocal,
  validateAndNormalizeEmail,
  type ExtractContactInput,
  type ExtractContactContext,
  type ExtractContactResult
} from "./tool-executors/extract-contact";

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
