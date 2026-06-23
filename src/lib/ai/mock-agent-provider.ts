/**
 * Proveedor de Agente IA MOCK.
 *
 * Es el ÚNICO proveedor activo en el MVP.
 *
 * No llama a ninguna API externa. Devuelve respuestas pre-escritas y
 * deterministas según la tarea y el contexto. Útil para demostrar el flujo del
 * agente (clasificar, sugerir, resumir, escalar) sin costo ni riesgo.
 *
 * Todo lo que devuelve está marcado `demo: true` y `needsReview: true` cuando
 * el contenido se enviaría a un cliente: la UI lo muestra como propuesta.
 */

import type {
  AIAgentProvider,
  AgentContext,
  AgentResult,
  AgentTask
} from "./agent-provider";
import { classifyIntentHeuristic, recommendCourseHeuristic } from "./guardrails";
import type { LeadIntent } from "@/types";

function confidenceFor(task: AgentTask): number {
  // Confianzas simuladas distintas por tarea para que la UI se vea realista.
  const map: Record<AgentTask, number> = {
    classify_intent: 0.86,
    suggest_reply: 0.82,
    summarize_conversation: 0.9,
    detect_urgency: 0.78,
    detect_payment_pending: 0.92,
    recommend_course: 0.8,
    escalate_to_human: 0.95
  };
  return map[task];
}

export const mockAgentProvider: AIAgentProvider = {
  name: "mock",
  displayName: "Agente IA (demo/mock)",
  active: true,
  stub: false,

  async run(task: AgentTask, context: AgentContext): Promise<AgentResult> {
    const { profile, leadName, courseOfInterest, lastIncomingMessage } = context;
    const name = leadName?.split(" ")[0] ?? "";
    const conf = confidenceFor(task);

    switch (task) {
      case "classify_intent": {
        const intent: LeadIntent = classifyIntentHeuristic(lastIncomingMessage ?? "");
        return {
          ok: true,
          task,
          provider: "mock",
          content: `Intención detectada: ${intent}.`,
          intent,
          confidence: conf,
          needsReview: false,
          demo: true,
          note: "Clasificación heurística (mock)."
        };
      }

      case "suggest_reply": {
        const course = courseOfInterest ?? "los cursos de Qlick";
        const reply = name
          ? `Hola ${name}, gracias por escribir a ${profile.businessName}. Sobre ${course}, ¿quieres que te comparta el temario o agendamos una llamada corta?`
          : `Hola, gracias por escribir a ${profile.businessName}. Sobre ${course}, ¿quieres que te comparta el temario o agendamos una llamada corta?`;
        return {
          ok: true,
          task,
          provider: "mock",
          content: reply,
          confidence: conf,
          needsReview: true,
          demo: true,
          note: "Respuesta sugerida (mock). Revisar antes de enviar."
        };
      }

      case "summarize_conversation": {
        const summary =
          context.conversationSummary ??
          `Lead ${name || "sin nombre"} interesado en ${courseOfInterest ?? "cursos"}. Pendiente de confirmar siguiente paso.`;
        return {
          ok: true,
          task,
          provider: "mock",
          content: summary,
          confidence: conf,
          needsReview: false,
          demo: true,
          note: "Resumen (mock)."
        };
      }

      case "detect_urgency": {
        const text = (lastIncomingMessage ?? "").toLowerCase();
        const urgent = /urgente|hoy|ya|no puedo|no me funciona|reembols/.test(text);
        return {
          ok: true,
          task,
          provider: "mock",
          content: urgent
            ? "Lead con señal de urgencia. Responder en menos de 2 h."
            : "Sin señal de urgencia inmediata.",
          confidence: conf,
          needsReview: false,
          demo: true,
          note: "Detección heurística de urgencia (mock)."
        };
      }

      case "detect_payment_pending": {
        const text = (lastIncomingMessage ?? "").toLowerCase();
        const pay = /pago|transferencia|oxxo|spei|tarjeta|rechaz|deposit/.test(text);
        return {
          ok: true,
          task,
          provider: "mock",
          content: pay
            ? "Posible pago pendiente o inconveniente de pago. Derivar a ventas."
            : "No se detecta problema de pago.",
          confidence: conf,
          needsReview: pay,
          demo: true,
          note: "Detección heurística de pago (mock)."
        };
      }

      case "recommend_course": {
        const rec = recommendCourseHeuristic(
          lastIncomingMessage ?? "",
          profile.servicesOrCourses
        );
        return {
          ok: true,
          task,
          provider: "mock",
          content: rec
            ? `Recomendación: "${rec}".`
            : "Sin recomendación clara con la información disponible.",
          confidence: conf,
          needsReview: false,
          demo: true,
          note: "Recomendación heurística (mock)."
        };
      }

      case "escalate_to_human": {
        return {
          ok: true,
          task,
          provider: "mock",
          content: "Escalar a humano: revisar reglas de escalamiento del perfil.",
          confidence: conf,
          needsReview: true,
          demo: true,
          note: "Recomendación de escalamiento (mock)."
        };
      }

      default:
        return {
          ok: false,
          task,
          provider: "mock",
          content: "",
          needsReview: true,
          demo: true,
          note: "Tarea no soportada por el agente mock."
        };
    }
  }
};
