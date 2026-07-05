/**
 * Formateador human-readable de las respuestas del wizard nativo de
 * encuesta (Fase 7d). Convierte el jsonb `responses` que persistimos
 * en `event_surveys.responses` a un texto legible para mostrarlo en la
 * tab Encuestas del admin.
 *
 * El legacy form (Fase 4) usa otro shape (`rating`, `liked`, etc.).
 * Esta función maneja ambos: detecta el shape y formatea lo que tenga.
 *
 * No toca DB — es puro.
 */

const Q1_LABEL: Record<string, string> = {
  very_clear: "Muy claro",
  clear: "Claro",
  confusing: "Confuso"
};

const Q2_LABEL: Record<string, string> = {
  yes: "Sí",
  maybe: "Tal vez",
  no: "No"
};

const Q3_LABEL: Record<string, string> = {
  meta: "Facebook-IG",
  referred: "Referido",
  other: "Otro"
};

const RATING_LABEL: Record<number, string> = {
  1: "Muy malo",
  2: "Malo",
  3: "Regular",
  4: "Bueno",
  5: "Excelente"
};

/**
 * Detecta si las respuestas son del wizard nativo (Fase 7d) o del
 * legacy form (Fase 4). Devuelve 'wizard', 'legacy' o 'unknown'.
 */
export type SurveyShape = "wizard" | "legacy" | "unknown";

export function detectSurveyShape(responses: unknown): SurveyShape {
  if (!responses || typeof responses !== "object") return "unknown";
  const r = responses as Record<string, unknown>;
  // Wizard nativo: tiene q1/q2/q3 keys (Fase 7d) o está vacío parcial.
  if (
    "q1" in r ||
    "q2" in r ||
    "q3" in r ||
    "q4_business" in r
  ) {
    return "wizard";
  }
  // Legacy form: rating 1-5.
  if (typeof r.rating === "number" && r.rating >= 1 && r.rating <= 5) {
    return "legacy";
  }
  return "unknown";
}

/**
 * Formateo principal. Devuelve un objeto con líneas listas para
 * mostrar en un `<ul>` o como texto plano.
 *
 * Ejemplo de salida wizard nativo:
 *   [
 *     "Claridad: Muy claro",
 *     "Aplicabilidad: Sí",
 *     "Fuente: Facebook-IG",
 *     "Negocio: Vendo café de especialidad"
 *   ]
 *
 * Ejemplo de salida legacy:
 *   [
 *     "Rating: Bueno (4/5)",
 *     "Lo mejor: la parte práctica"
 *   ]
 */
export function formatSurveyResponses(
  responses: unknown,
): { shape: SurveyShape; lines: string[] } {
  const shape = detectSurveyShape(responses);
  const lines: string[] = [];
  if (shape === "unknown") {
    return { shape, lines: ["(sin respuestas registradas)"] };
  }
  const r = responses as Record<string, unknown>;

  if (shape === "wizard") {
    if (typeof r.q1 === "string") {
      lines.push(`Claridad: ${Q1_LABEL[r.q1] ?? r.q1}`);
    }
    if (typeof r.q2 === "string") {
      lines.push(`Aplicabilidad: ${Q2_LABEL[r.q2] ?? r.q2}`);
    }
    if (typeof r.q3 === "string") {
      lines.push(`Fuente: ${Q3_LABEL[r.q3] ?? r.q3}`);
    }
    if (typeof r.q4_business === "string" && r.q4_business.trim()) {
      lines.push(`Negocio: ${r.q4_business}`);
    }
    if (lines.length === 0) {
      lines.push("(wizard incompleto — solo algunos campos)");
    }
  } else if (shape === "legacy") {
    if (typeof r.rating === "number") {
      const label = RATING_LABEL[r.rating] ?? `${r.rating}/5`;
      lines.push(`Rating: ${label} (${r.rating}/5)`);
    }
    if (typeof r.liked === "string" && r.liked.trim()) {
      lines.push(`Lo mejor: ${r.liked}`);
    }
    if (typeof r.improvements === "string" && r.improvements.trim()) {
      lines.push(`A mejorar: ${r.improvements}`);
    }
    if (lines.length === 0) {
      lines.push("(encuesta legacy vacía)");
    }
  }
  return { shape, lines };
}
