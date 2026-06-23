/**
 * Guardrails del Agente IA de Qlick.
 *
 * Reglas duras que el agente (mock o LLM real) debe cumplir SIEMPRE. Estas
 * funciones se usan tanto para construir el prompt del LLM como para validar su
 * salida antes de mostrarla al humano.
 *
 * Ver docs/AI_AGENT_GUARDRAILS.md para la justificación de cada regla.
 */

import type { LeadIntent } from "@/types";

/**
 * Clasificación heurística de intención a partir del texto del lead.
 * Determinista: misma entrada → misma salida. Sirve como fallback cuando no
 * hay LLM y como baseline para comparar contra el modelo real.
 */
export function classifyIntentHeuristic(message: string): LeadIntent {
  const t = message.toLowerCase();
  if (!t.trim()) return "unknown";

  if (/inscrib|entrar al curso|quiero el curso|comprar|acceso al curso/.test(t))
    return "enroll_course";
  if (/precio|costo|cu[aá]nto cuesta|cu[aá]nto vale|pago|cobran/.test(t))
    return "pricing";
  if (/transferencia|spei|oxxo|tarjeta|rechaz|reembols|deposit/.test(t))
    return "payment_help";
  if (/grupo|comunidad|whatsapp de alumnos/.test(t)) return "group_access";
  if (/no me funciona|error|no puedo|soporte|acceso no|bug/.test(t))
    return "support";
  if (/llamada|asesor[aí]a|ll[áa]mame|agendar|cita/.test(t))
    return "schedule_call";
  if (/recomienda|no s[eé] qu[eé]|cu[aá]l curso|por d[oó]nde empiezo/.test(t))
    return "course_recommendation";
  if (/informaci[oó]n|temario|de qu[eé] trata|m[aá]s sobre/.test(t))
    return "course_information";

  return "unknown";
}

/**
 * Recomienda un curso en base al texto y a la lista de cursos que el agente
 * conoce. Empareja palabras clave; si no hay coincidencia, devuelve null
 * (no inventa).
 */
export function recommendCourseHeuristic(
  message: string,
  knownCourses: string[]
): string | null {
  const t = message.toLowerCase();
  if (!t.trim()) return null;

  // Palabras clave → fragmento de título esperado.
  const rules: Array<{ keywords: RegExp; match: RegExp }> = [
    { keywords: /principi|empezar|desde cero|basico|fundamento/, match: /fundamentos/i },
    { keywords: /anuncio|ads|facebook|instagram|publicidad/, match: /ads|publicidad/i },
    { keywords: /automatic|bot|whatsapp|crm|respuesta/, match: /automatizaci/i },
    { keywords: /contenido|redes|post|reel|tiktok|creativ/, match: /contenido/i }
  ];

  for (const rule of rules) {
    if (rule.keywords.test(t)) {
      const found = knownCourses.find((c) => rule.match.test(c));
      if (found) return found;
    }
  }
  return null;
}

/**
 * Decide si el agente DEBE escalar a humano (sin importar el LLM).
 * Reglas no negociables: pagos, quejas, datos sensibles, soporte técnico.
 */
export function mustEscalateToHuman(message: string): {
  escalate: boolean;
  reason?: string;
} {
  const t = message.toLowerCase();

  if (/reembolso|devoluci[oó]n|queja|denuncia|demand|abogad/.test(t))
    return { escalate: true, reason: "Queja/reembolso/jurídico" };
  if (/pago|transferencia|spei|oxxo|tarjeta|rechaz/.test(t))
    return { escalate: true, reason: "Pagos: requiere validación humana" };
  if (/no me funciona|error|bug|no puedo|soporte/.test(t))
    return { escalate: true, reason: "Soporte técnico de plataforma" };
  if (/descuento|promoci[oó]n|m[aá]s barato/.test(t))
    return { escalate: true, reason: "Descuento no autorizado" };
  if (/datos personales|privacidad|baja|eliminar mis datos/.test(t))
    return { escalate: true, reason: "Datos personales / privacidad" };

  return { escalate: false };
}

/** Frases prohibidas que NUNCA deben aparecer en una salida del agente. */
const FORBIDDEN_PHRASES = [
  "descuento",
  "gratis",
  "promocion",
  "reembolso",
  "confirmo tu pago",
  "pago aprobado",
  "te di acceso",
  "acceso listo"
];

/**
 * Valida una propuesta de respuesta del agente. Devuelve {ok, reasons}.
 * Si ok=false, la UI no debe ofrecer ese texto sin editar.
 */
export function validateAgentReply(reply: string): {
  ok: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  const t = reply.toLowerCase();

  for (const phrase of FORBIDDEN_PHRASES) {
    if (t.includes(phrase)) {
      reasons.push(`Contiene término prohibido: "${phrase}"`);
    }
  }

  return { ok: reasons.length === 0, reasons };
}
