/**
 * Prompts del Agente IA de Qlick.
 *
 * Hoy se usan para documentar cómo se le hablará a un LLM cuando se active el
 * proveedor OpenRouter. El mock provider NO los consume (tiene respuestas
 * pre-escritas), pero mantenerlos aquí garantiza que la migración al LLM real
 * sea directa y que las reglas estén centralizadas.
 *
 * Cada prompt inyecta:
 *  - El perfil del negocio (tono, reglas, cursos).
 *  - Las restricciones de guardrails (qué NO hacer).
 *  - El contexto del lead (nombre, curso, último mensaje).
 *
 * Ver docs/AI_AGENT_GUARDRAILS.md.
 */

import type { AIAgentProfile } from "@/types";
import type { AgentContext, AgentTask } from "./agent-provider";

/** System prompt base: identidad, alcance y límites del agente. */
export function buildSystemPrompt(profile: AIAgentProfile): string {
  return [
    `Eres ${profile.name}, asistente conversacional de ${profile.businessName}.`,
    `${profile.businessDescription}`,
    ``,
    `Atiendes en horario: ${profile.businessHours}.`,
    `Tono: ${profile.tone}. Idioma: español de México.`,
    ``,
    `Conoces estos cursos/servicios:`,
    ...profile.servicesOrCourses.map((c) => `- ${c}`),
    ``,
    `LO QUE PUEDES HACER:`,
    ...profile.allowedActions.map((a) => `- ${a}`),
    ``,
    `LO QUE NUNCA DEBES HACER:`,
    ...profile.forbiddenActions.map((a) => `- ${a}`),
    ``,
    `REGLAS DE ESCALAMIENTO:`,
    ...profile.escalationRules.map((r) => `- ${r}`),
    ``,
    `Si no estás seguro o falta información, responde:`,
    `"${profile.fallbackMessage}"`
  ].join("\n");
}

/** Prompt de usuario por tarea, inyectando el contexto del lead. */
export function buildTaskPrompt(task: AgentTask, context: AgentContext): string {
  const { leadName, courseOfInterest, lastIncomingMessage, conversationSummary } =
    context;

  const ctx = [
    leadName ? `Lead: ${leadName}` : "Lead: (sin nombre)",
    courseOfInterest ? `Curso de interés: ${courseOfInterest}` : "Curso de interés: (no definido)",
    lastIncomingMessage ? `Último mensaje del lead: "${lastIncomingMessage}"` : "Último mensaje: (vacío)",
    conversationSummary ? `Resumen de la conversación: ${conversationSummary}` : ""
  ]
    .filter(Boolean)
    .join("\n");

  const instructions: Record<AgentTask, string> = {
    classify_intent:
      "Clasifica la intención del lead en una sola etiqueta. Responde solo con la etiqueta.",
    suggest_reply:
      'Redacta una respuesta corta (máx 2 párrafos) para que un humano la revise. No confirmes pagos, accesos ni descuentos.',
    summarize_conversation:
      "Resume la conversación en 1-2 frases, destacando el siguiente paso.",
    detect_urgency:
      "Indica si el mensaje tiene urgencia y por qué. Sé conservador.",
    detect_payment_pending:
      "Indica si hay señal de pago pendiente o problema de pago. No confirmes ni canceles nada.",
    recommend_course:
      "Recomienda UN curso de la lista conocida. Si no hay suficiente info, di que falta contexto.",
    escalate_to_human:
      "Decide si este caso debe escalar a humano y por qué."
  };

  return `${ctx}\n\nTarea: ${instructions[task]}`;
}
