/**
 * Contrato común para proveedores del Agente IA de Qlick.
 *
 * Mismo principio que el resto de abstracciones (D-005/D-013): la UI/CRM no se
 * acoplan a un proveedor concreto de LLM.
 *
 * Hoy el único proveedor ACTIVO es `mock` (respuestas pre-escritas, sin llamada
 * a ninguna API). El proveedor `openrouter` es un STUB documentado para activar
 * modelos reales (GPT, Claude, Llama, etc.) en una fase futura.
 *
 * IMPORTANTE — modo sugerencia:
 * El agente está diseñado para operar en MODO SUGERENCIA: nunca envía
 * respuestas automáticamente. Devuelve propuestas que un humano revisa antes de
 * enviar por WhatsApp manual (wa.me). Esto reduce riesgo de alucinaciones y
 * commitments no autorizados.
 *
 * Ver docs/AI_AGENT_GUARDRAILS.md y docs/WHATSAPP_AI_AGENT_STRATEGY.md.
 */

import type { AIAgentProfile, LeadIntent } from "@/types";

export type AIAgentProviderName = "mock" | "openrouter" | "deepseek";

export interface AgentContext {
  /** Perfil del negocio (nombre, tono, reglas). */
  profile: AIAgentProfile;
  /** Nombre del lead, si se conoce. */
  leadName?: string;
  /** Curso de interés del lead. */
  courseOfInterest?: string;
  /** Texto del último mensaje entrante del lead. */
  lastIncomingMessage?: string;
  /** Resumen o transcripción reciente de la conversación. */
  conversationSummary?: string;
  /** Evento activo cargado desde DB (contexto dinámico por evento). */
  activeEvent?: import("./event-context-loader").ActiveEventContext;
  /** Ventana de últimos N mensajes del lead (memoria corta del bot). */
  conversationWindow?: import("./conversation-window").ConversationWindow;
  /** Perfil persistente del lead (memoria larga entre sesiones). */
  leadProfile?: import("./lead-profile").LeadProfile;
}

export type AgentTask =
  | "classify_intent"
  | "suggest_reply"
  | "summarize_conversation"
  | "detect_urgency"
  | "detect_payment_pending"
  | "recommend_course"
  | "escalate_to_human";

export interface AgentResult {
  ok: boolean;
  task: AgentTask;
  /** Proveedor que generó el resultado. */
  provider: AIAgentProviderName;
  /** Texto de salida (sugerencia, resumen, intención…). */
  content: string;
  /** Intención clasificada (solo para task=classify_intent). */
  intent?: LeadIntent;
  /** Confianza simulada 0–1. */
  confidence?: number;
  /** Si requiere revisión humana antes de usarse. */
  needsReview: boolean;
  /** Demo: true si no se llamó a un LLM real. */
  demo?: boolean;
  note: string;
}

export interface AIAgentProvider {
  readonly name: AIAgentProviderName;
  readonly displayName: string;
  /** true si está activo en el MVP (mock). */
  readonly active: boolean;
  /** true si es un stub (no implementado todavía). */
  readonly stub: boolean;
  /** Ejecuta una tarea del agente sobre el contexto dado. */
  run(task: AgentTask, context: AgentContext): Promise<AgentResult>;
}
