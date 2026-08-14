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
import { findIncorrectEventWeekdayMentions } from "../datetime.ts";
import { hasInternalReasoningLeak } from "../whatsapp/bot-quality";

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

  // Las preguntas operativas de preventa como "¿cómo pago?" o "¿dónde
  // aparto?" deben ser contestadas por el flujo determinista de pago cuando
  // existe un evento pendiente. No son, por sí solas, una incidencia humana.
  // Las quejas, rechazos, cobros no reconocidos y reembolsos siguen pasando
  // por handoff aunque contengan la palabra "pago".
  const routinePaymentHelp =
    /(?:\b(?:como|cómo)\s+(?:pago|aparto|reservo|confirmo)\b|\b(?:donde|dónde)\s+(?:pago|pagar)\b|\b(?:link|enlace)\s+(?:de\s+)?pago\b|\b(?:quiero|necesito)\s+pagar\b|\bexpl[ií]came\b)/i.test(t) &&
    !/(?:reembolso|devoluci[oó]n|rechaz|no aparece|no recib[ií]|no se reflej|cobro no|cargo no|duplicad|error|problema)/i.test(t);

  if (/reembolso|devoluci[oó]n|queja|denuncia|demand|abogad/.test(t))
    return { escalate: true, reason: "Queja/reembolso/jurídico" };
  if (/no me funciona|error|bug|no puedo|soporte/.test(t))
    return { escalate: true, reason: "Soporte técnico de plataforma" };
  if (
    !routinePaymentHelp &&
    /pago|pagu[eé]|transferencia|spei|oxxo|tarjeta|rechaz|deposit[eé]|cobr[ée]|cargo/.test(t)
  )
    return { escalate: true, reason: "Pagos: requiere validación humana" };
  if (/datos personales|privacidad|baja|eliminar mis datos/.test(t))
    return { escalate: true, reason: "Datos personales / privacidad" };

  // FIX 2026-07-10 (Sprint 2 hotfix David, sesion 03:27 AM): eliminar
  // el trigger de descuento/promocion/mas barato del handler pre-LLM.
  // Preguntar por descuentos o precio de estudiantes es una INTENCION DE
  // COMPRA en el flujo de pre-venta, no un problema de soporte. El LLM
  // Socratico v2 (agent-prompts.ts line 77 y 295) ya tiene prohibicion
  // dura de "confirmar pagos, accesos, descuentos o promociones no
  // autorizadas" + "prometer descuentos no en EVENTO ACTIVO.detalles".
  // validateAgentReply (linea 95-104) tambien bloquea FORBIDDEN_PHRASES
  // ('descuento', 'gratis', 'promocion', 'reembolso'...). Resultado:
  // las preguntas legitimas de pre-venta llegan al LLM, que explica el
  // valor oficial del taller con el Metodo Comercial, sin barreras.

  return { escalate: false };
}

/**
 * Frases prohibidas que NUNCA deben aparecer en una salida del agente.
 *
 * FIX 2026-07-10 (Sprint 2 hotfix David 03:40 AM): eliminar `descuento`
 * y `promocion` de la lista ciega. El system prompt (agent-prompts.ts
 * l-77 + l-295) ya prohíbe al LLM "Confirmar pagos, accesos, descuentos
 * o promociones no autorizadas" y "prometer descuentos no en EVENTO
 * ACTIVO.detalles". Filtrar la palabra `descuento` o `promocion` en la
 * salida cazaba falsos positivos como "no manejamos descuento de
 * estudiantes" — respuesta honesta y correcta que NO debe bloquearse.
 *
 * Decisión de diseño (alineada con regla LLM-first del sprint 2 v2):
 *   - El system prompt es la fuente de verdad para reglas de negocio
 *     (descuentos, ofertas, pagos no autorizados).
 *   - `validateAgentReply` solo bloquea errores FATALES de proceso
 *     (confirmaciones de pago/aprobación de acceso, reembolso, gratis
 *     sin contexto) que NO deberían salir al lead de ninguna forma.
 *   - Si el LLM alucina "tienes un 20% de descuento" será bloqueado
 *     por el system prompt + revisión humana del operario, NO por el
 *     filtro ciego.
 */
const FORBIDDEN_PHRASES = [
  "gratis",
  "reembolso",
  "confirmo tu pago",
  "pago aprobado",
  "te di acceso",
  "acceso listo"
];

/**
 * Sprint v15 PR #2 (N-NEW-1 / I-FINAL-11): helper que limpia el flag
 * `[[ESCALATE_HUMAN]]` del output del LLM antes de enviarlo al lead.
 *
 * Por qué:
 *   El prompt Súper Ejecutivo (buildSuperExecutivePrompt) emite este flag
 *   como convención interna cuando detecta que el caso requiere escalación
 *   a humano (ej. servicio b2b, queja, duda sensible). Es una MARCA para
 *   el orquestador, NO algo que el lead deba ver.
 *
 *   El orquestador (bot-engine) usa la presencia de `[[ESCALATE_HUMAN]]`
 *   para:
 *     1. Marcar el metadata con `auto_escalate: true`.
 *     2. Inyectar el handoff en `human_handoff`.
 *     3. Strippearlo del texto que SÍ se le manda al lead (con esta función).
 *
 * Uso:
 *   const cleanContent = stripEscalateFlag(agentResult.content);
 *   if (cleanContent !== agentResult.content) { /* escalación detectada *\/ }
 *
 * Pure function, exportada para tests.
 */
export function stripEscalateFlag(text: string): string {
  if (!text) return "";
  return text.replace(/\[\[ESCALATE_HUMAN\]\]/gi, "").trim();
}

/**
 * Limpia cualquier meta-razonamiento, pensamiento de modelo (<think>),
 * o párrafos introductorios de análisis interno que el LLM pudiera haber emitido
 * antes del mensaje real para el lead.
 *
 * Previene fugas graves tipo:
 *   'El lead escribió "hol" (saludo incompleto). Respondo directo...'
 *   '<think>El usuario pregunta sobre el curso</think> ¡Hola!...'
 */
export function sanitizeLLMOutput(rawText: string): string {
  if (!rawText) return "";
  let text = rawText.trim();

  // 1. Tag de razonamiento de DeepSeek / OpenAI (<think>...</think>)
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, "");

  // 2. Prefijos o etiquetas en corchetes
  text = text.replace(/^\[(?:Pensamiento|Análisis|Analysis|Thinking|Reasoning|Nota interna)[^\]]*\]\s*/gi, "");

  // 3. Remoción robusta por párrafos de todo meta-razonamiento / auto-instrucción inicial
  const isMetaParagraph = (p: string): boolean => {
    const l = p.trim();
    if (!l) return false;
    // Si el párrafo empieza con saludo o afirmación directa al cliente, NUNCA es meta-párrafo.
    if (/^(?:¡?Hola|¡?Claro|¡?Excelente|¡?Perfecto|¡?Buen|Buenas|Estimado)/i.test(l)) {
      return false;
    }
    // Párrafos que arrancan con análisis de intención o meta-razonamiento
    // Ejemplos: "Aquí tengo dos opciones...", "El lead puede referirse...", "Dado que preguntó...", "aplico el protocolo...", "Respondo directo..."
    if (
      /^(?:El\s+(?:lead|usuario|prospecto|cliente)|Respondo|Respuesta:|Análisis:|Razonamiento:|Diagnóstico:|Estrategia:|Pensamiento:|Aquí\s+(?:tengo|hay|el|opción)|Dado\s+que|Como\s+(?:el|la|preguntó|mencionó)|Analizando|Aplicando|Aplico|Procedo|Voy\s+a|En\s+este\s+caso|Para\s+esta\s+consulta)/i.test(
        l
      )
    ) {
      return true;
    }
    if (/aplico\s+el\s+protocolo/i.test(l) || /aplico\s+la\s+regla/i.test(l)) {
      return true;
    }
    if (/el\s+lead\s+puede\s+referirse/i.test(l) || /el\s+usuario\s+pregunta/i.test(l)) {
      return true;
    }
    // Párrafos donde el LLM resume internamente lo que dirá sin ser el mensaje final directo al usuario
    if (
      /^El curso (?:es|trabaja|ofrece|consta)/i.test(l) &&
      !/(?:¡?Hola|¿|Te invito|Aparta|Reserva|Confirma|Escríbeme)/i.test(l)
    ) {
      return true;
    }
    return false;
  };

  const paragraphs = text.split(/\n+/);
  let startIdx = 0;
  while (startIdx < paragraphs.length && isMetaParagraph(paragraphs[startIdx])) {
    startIdx++;
  }

  if (startIdx < paragraphs.length) {
    text = paragraphs.slice(startIdx).join("\n\n");
  }

  // 4. Limpieza secundaria de prefijos de sección
  text = text.replace(/^(?:Análisis|Razonamiento|Pensamiento|Diagnóstico|Estrategia|Respuesta):\s*/gi, "");

  return text.trim();
}

/**
 * Sprint v15 PR #2 (N-NEW-1 / I-FINAL-11): contexto opcional de
 * `validateAgentReply` para afinar el filtro por tipo de oferta.
 *
 * - `isFreeEvent`:    si true, excluye "gratis" del filtro (copy veraz en
 *                     masterclass gratuita — el bot SÍ puede decir
 *                     "registro gratuito" sin que sea alucinación).
 * - `allowedPhrases`: lista adicional de frases que NO se filtran
 *                     (escape hatch explícito; usar con cuidado).
 *
 * Las frases de falsa confirmación ("te di acceso", "acceso listo",
 * "confirmo tu pago", "pago aprobado") SIGUEN prohibidas en TODOS los
 * modos (D-016 sigue vigente) — no se desactivan vía contexto.
 */
export interface ValidateReplyContext {
  isFreeEvent?: boolean;
  allowedPhrases?: string[];
  /** Timestamptz oficial para validar días de la semana mencionados. */
  eventStartsAt?: string | Date;
}

/**
 * Valida una propuesta de respuesta del agente. Devuelve {ok, reasons}.
 * Si ok=false, la UI no debe ofrecer ese texto sin editar.
 *
 * Sprint v15 PR #2: el segundo parámetro `context` es opcional. Si
 * `context.isFreeEvent === true`, se excluye la palabra "gratis" del
 * filtro de FORBIDDEN_PHRASES (la masterclass gratuita SÍ puede usar
 * la palabra "gratis" en copy veraz). El resto de frases prohibidas
 * permanecen inamovibles.
 */
export function validateAgentReply(
  reply: string,
  context?: ValidateReplyContext
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const t = reply.toLowerCase();

  // No intentamos rescatar pensamientos embebidos en el mismo párrafo. Si
  // aparecen, se bloquea la respuesta completa y el caller usa fallback.
  if (hasInternalReasoningLeak(reply)) {
    reasons.push("Contiene razonamiento interno o meta-análisis.");
  }
  if (reply.length > 700) {
    reasons.push("Respuesta demasiado larga.");
  }

  // Construir lista efectiva de frases prohibidas respetando el contexto.
  // Sprint v15 PR #2: si `isFreeEvent`, "gratis" NO se filtra (copy veraz
  // en masterclass gratuita). El resto sigue prohibido.
  const effectiveForbidden = context?.isFreeEvent
    ? FORBIDDEN_PHRASES.filter((p) => p !== "gratis")
    : FORBIDDEN_PHRASES;

  // Si el caller pasó `allowedPhrases`, esas se quitan del filtro
  // (escape hatch explícito; default: lista vacía).
  const allowed = new Set((context?.allowedPhrases ?? []).map((s) => s.toLowerCase()));
  const finalForbidden = effectiveForbidden.filter((p) => !allowed.has(p));

  for (const phrase of finalForbidden) {
    if (t.includes(phrase)) {
      reasons.push(`Contiene término prohibido: "${phrase}"`);
    }
  }

  if (context?.eventStartsAt) {
    const incorrectWeekdays = findIncorrectEventWeekdayMentions(
      reply,
      context.eventStartsAt,
    );
    if (incorrectWeekdays.length > 0) {
      reasons.push(
        `Día de la semana incorrecto: ${incorrectWeekdays.join(", ")}`,
      );
    }
  }

  return { ok: reasons.length === 0, reasons };
}
