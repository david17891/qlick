/**
 * Respuestas deterministas para dudas frecuentes del evento.
 *
 * Estas reglas viven antes de la escalación y del LLM porque son preguntas
 * comerciales de bajo riesgo: responderlas con contexto conocido evita que
 * una palabra ambigua termine en un handoff genérico.
 */

const DEVICE_WORD_RE = /\b(?:laptop|computadora|ordenador|celular|tel[eé]fono|m[oó]vil)\b/i;
const DEVICE_USE_RE = /\b(?:lleva(?:r)?|usar|trabajar|necesit(?:o|a|an)?|sirve|pued(?:o|es|en)?|se puede|requiere)\b/i;
const DEVICE_INCIDENT_RE = /\b(?:no funciona|no puedo|error|problema|falla|fall[oó]|soporte)\b/i;

/** Devuelve true solo para dudas de equipo, no para incidencias técnicas. */
export function isEventDeviceQuestion(message: string): boolean {
  const text = message.trim();
  return Boolean(
    text &&
      DEVICE_WORD_RE.test(text) &&
      DEVICE_USE_RE.test(text) &&
      !DEVICE_INCIDENT_RE.test(text),
  );
}

/**
 * El taller no exige un equipo específico. No afirmamos que Qlick entregue
 * una laptop: el participante puede trabajar con su celular o llevar la
 * propia laptop si le resulta más cómodo.
 */
export function buildEventDeviceReply(): string {
  return "No es obligatorio llevar laptop. Puedes realizar el taller con tu celular sin problema; si prefieres, también puedes llevar tu propia laptop para la parte práctica.";
}

