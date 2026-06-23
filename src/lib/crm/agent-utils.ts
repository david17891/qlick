/**
 * Utilidades del agente IA (modo demo/mock): perfil, sugerencias y builder
 * de mensajes sugeridos por intención.
 *
 * Hoy NO hay conexión a OpenRouter ni a ninguna API externa. Estas funciones
 * devuelven contenido pre-escrito (mock) pensado para que un humano lo revise
 * antes de enviarlo por WhatsApp manual (wa.me).
 *
 * Ver docs/AI_AGENT_GUARDRAILS.md y docs/WHATSAPP_AI_AGENT_STRATEGY.md.
 */

import type {
  AIAgentProfile,
  AIAgentSuggestion,
  Lead,
  LeadIntent
} from "@/types";
import {
  aiAgentProfile,
  aiAgentSuggestions
} from "@/lib/data/crm-data";
import { leadIntentLabel } from "./lead-utils";

export function getAIAgentProfile(): AIAgentProfile {
  return aiAgentProfile;
}

export function getAISuggestionsForLead(leadId: string): AIAgentSuggestion[] {
  return aiAgentSuggestions
    .filter((s) => s.leadId === leadId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Mensaje sugerido por intención del lead.
 * Es texto base, no se envía automáticamente: la UI lo muestra para revisión
 * humana y lo abre en wa.me si el número está configurado.
 */
export function getAgentReplyTemplate(intent: LeadIntent, lead: Lead): string {
  const name = lead.name.split(" ")[0] ?? "";
  const course = lead.courseOfInterest ?? "los cursos de Qlick";

  switch (intent) {
    case "course_information":
      return `Hola ${name}, gracias por tu interés en Qlick. Te comparto información sobre "${course}". ¿Quieres que te apoye por aquí o agendamos una llamada corta?`;
    case "enroll_course":
      return `Hola ${name}, perfecto. Para inscribirte a "${course}" te comparto el siguiente paso. ¿Confirmas que es el curso que buscabas?`;
    case "pricing":
      return `Hola ${name}, te comparto el precio y las formas de pago de "${course}". Tenemos opciones con tarjeta, transferencia y efectivo (OXXO).`;
    case "payment_help":
      return `Hola ${name}, te ayudamos a completar tu pago. ¿Puedes contarme en qué paso se atoró? (tarjeta, transferencia o efectivo)`;
    case "group_access":
      return `Hola ${name}, para darte acceso al grupo de alumnos de Qlick necesito confirmar tu inscripción. ¿Ya estás inscrito a un curso?`;
    case "support":
      return `Hola ${name}, lamento el inconveniente. Cuéntame qué pasa con tu acceso a la plataforma y lo reviso de inmediato.`;
    case "schedule_call":
      return `Hola ${name}, con gusto agendamos una llamada sobre "${course}". ¿Qué horario te queda mejor entre semana?`;
    case "course_recommendation":
      return `Hola ${name}, según lo que me cuentas te recomiendo empezar por "${course}". ¿Quieres que te mande el temario?`;
    case "unknown":
    default:
      return `Hola ${name}, gracias por escribir a Qlick. ¿En qué te puedo ayudar con nuestros cursos de marketing?`;
  }
}

/** Resume en una línea la intención detectada para mostrarla en la UI. */
export function describeIntent(intent: LeadIntent): string {
  return `Intención detectada: ${leadIntentLabel[intent].toLowerCase()}.`;
}
