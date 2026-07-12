/**
 * Contrato común para proveedores del Agente IA de Qlick.
 *
 * Mismo principio que el resto de abstracciones (D-005/D-013): la UI/CRM no se
 * acoplan a un proveedor concreto de LLM.
 *
 * Hoy los providers activos son `deepseek` (default Flash con switch automático a Pro
 * si Flash falla o devuelve baja confidence) y `mock` (fallback sin llamada a API).
 * El provider `openrouter` es un STUB documentado para fase futura (GPT, Claude,
 * Llama via OpenRouter como alternativa a DeepSeek directo).
 *
 * IMPORTANTE — modo AUTOMÁTICO con guardrails:
 * El bot envía respuestas por WhatsApp Cloud API automáticamente. Para reducir el
 * riesgo de alucinaciones y commitments no autorizados, el output se filtra por
 * `validateAgentReply` (ver `src/lib/ai/guardrails.ts`) antes de enviarse al lead.
 * Tambien hay un safety net post-process (`src/lib/whatsapp/safety-net.ts`) que
 * strippea saludos redundantes cuando hay historial.
 *
 * Sprint v15 PR #2 (Torre de Control — Cerebro Súper Ejecutivo):
 * `AgentContext` se extiende con tres campos opcionales para que el prompt
 * Súper Ejecutivo (buildSuperExecutivePrompt) pueda:
 *   - `eventOfferType`: clasificación dura del evento (gratis / pago / b2b / unknown).
 *   - `eventRules`:     reglas locales del evento (jerarquía: SSOT gana sobre local).
 *   - `isFreeEvent`:    atajo derivado de `eventOfferType === "free_masterclass"`.
 * Ver docs/DECISIONS.md D-025.
 *
 * Ver docs/AI_AGENT_GUARDRAILS.md y docs/WHATSAPP_AI_AGENT_STRATEGY.md.
 */

import type { AIAgentProfile, LeadIntent } from "@/types";

export type AIAgentProviderName = "mock" | "openrouter" | "deepseek";

/**
 * Sprint v15 PR #2: clasificación de la oferta del evento activo.
 *
 * - "free_masterclass": masterclass / webinar gratuito. price=0 o heurística
 *                       de "gratis|sin costo|entrada libre" en descripción.
 * - "paid_workshop":    taller / curso con precio > 0 (verdad dura en price).
 * - "b2b_service":      servicio empresarial (consultoría, agencia, retainer).
 *                       Lo setea explícitamente el admin en `event_rules.kind`
 *                       o se infiere por descripción.
 * - "unknown":          fallback defensivo cuando ninguna de las anteriores
 *                       aplica. El prompt Súper Ejecutivo trata unknown con
 *                       copy veraz de "déjame confirmarte con el equipo".
 *
 * Exportada desde `agent-provider.ts` (NO desde event-context-loader) para
 * evitar imports circulares entre el loader y los providers / prompts.
 */
export type EventOfferType =
  | "free_masterclass"
  | "paid_workshop"
  | "b2b_service"
  | "unknown";

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
  /**
   * Bloque de catalogo completo de eventos publicados. FIX 2026-07-02
   * (sesion David): bot multi-evento. Si esta presente y tiene mas de
   * 1 evento, el system prompt lo usa en vez de `activeEvent.promptBlock`.
   */
  eventsListBlock?: string;
  /** Ventana de últimos N mensajes del lead (memoria corta del bot). */
  conversationWindow?: import("./conversation-window").ConversationWindow;
  /** Perfil persistente del lead (memoria larga entre sesiones). */
  leadProfile?: import("./lead-profile").LeadProfile;
  /**
   * true si este es el primer mensaje del lead (acaba de ser creado en DB).
   * Más confiable que `conversationWindow?.messages.length === 0` porque el
   * window loader puede fallar silenciosamente con .catch(() => undefined).
   * Calculado por `bot-engine` via `findOrCreateLead().created`.
   */
  isFirstMessage?: boolean;
  /**
   * FIX 2026-07-10 (Sprint 2 sub-sprint 2C): UUID del lead resuelto por
   * el bot-engine. Necesario para que el tool loop pueda hacer
   * `extract_and_save_contact_info` con leadId real. Opcional para tasks
   * que NO usan tools (mock, suggest_reply sin tools, etc.). El caller
   * (bot-engine) lo setea solo cuando el intent ya pasó por `findLead`.
   */
  leadId?: string;
  /**
   * FIX 2026-07-10 (Sprint 2 sub-sprint 2C): cliente Supabase admin
   * pre-instanciado, pasado por el bot-engine para que el tool loop no
   * tenga que crearlo (ahorra ~50ms). Opcional. Si ausente, el tool
   * corre en modo demo.
   */
  supabase?: unknown;
  /**
   * Sprint v15 PR #2 (I-FINAL-4): clasificación de la oferta del evento
   * activo. El bot-engine la calcula con `classifyEventType(activeEvent)`
   * y la pasa al provider. El prompt Súper Ejecutivo la usa para elegir
   * la rama de copy veraz (gratis → "registro gratuito"; pago → "enlace
   * de pago"; b2b → "te conecto con un especialista"; unknown → defensivo).
   */
  eventOfferType?: EventOfferType;
  /**
   * Sprint v15 PR #2 (M-NEW-5): reglas locales del evento activo
   * (texto libre que el admin configuró en `event_rules.rules`).
   *
   * JERARQUÍA (D-025 + AGENTS.md §Jerarquía de Especialización):
   * Si una regla local entra en contradicción con una Regla de Oro
   * Global (`ai_bot_rules`), la GLOBAL PREVALECE. El prompt Súper
   * Ejecutivo inyecta esta cláusula explícitamente.
   */
  eventRules?: string[];
  /**
   * Sprint v15 PR #2 (N-NEW-1): atajo `eventOfferType === "free_masterclass"`.
   * Se pasa a `validateAgentReply(reply, { isFreeEvent })` para excluir
   * la palabra "gratis" del filtro de FORBIDDEN_PHRASES en masterclasses
   * gratuitas (donde decir "registro gratuito" es copy veraz, no alucinación).
   *
   * `validateAgentReply` mantiene prohibidas en todos los modos las frases
   * de falsa confirmación ("te di acceso", "acceso listo", "confirmo tu pago",
   * "pago aprobado") — D-016 sigue vigente para TODO el flujo.
   */
  isFreeEvent?: boolean;
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
