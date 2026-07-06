/**
 * Formateador human-readable de las respuestas del wizard nativo de
 * encuesta (Fase 7d). Convierte el jsonb `responses` que persistimos
 * en `event_surveys.responses` a un texto legible para mostrarlo en la
 * tab Encuestas del admin.
 *
 * Tres shapes soportados:
 * - Legacy (Fase 4): keys `rating`, `liked`, `improvements`.
 * - Wizard Fase 7d legacy (buildSurveyQ1 hardcoded): keys `q1`, `q2`,
 *   `q3`, `q4_business` (formato corto).
 * - Wizard Fase 7d dinámico (buildDynamicSurveyStep, default desde
 *   Fase 7d.2): keys `q1_clarity`, `q2_apply`, `q3_source`, `q_consent`,
 *   `q_business`. Es el formato que el bot-engine emite en producción
 *   (verificado en 2026-07-06 — el bug original "Encuestas tab muestra
 *   '(sin respuestas registradas)' aunque las respuestas SÍ están en
 *   el jsonb" era exactamente porque este detector solo reconocía el
 *   formato legacy corto).
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

const CONSENT_LABEL: Record<string, string> = {
  yes: "Sí",
  no: "No"
};

const RATING_LABEL: Record<number, string> = {
  1: "Muy malo",
  2: "Malo",
  3: "Regular",
  4: "Bueno",
  5: "Excelente"
};

/**
 * Detecta el shape de las respuestas. Devuelve 'dynamic' (formato
 * Fase 7d.2+), 'wizard-legacy' (formato Fase 7d hardcoded),
 * 'legacy' (Fase 4 form HTML) o 'unknown'.
 */
export type SurveyShape =
  | "dynamic"
  | "wizard-legacy"
  | "legacy"
  | "unknown";

export function detectSurveyShape(responses: unknown): SurveyShape {
  if (!responses || typeof responses !== "object") return "unknown";
  const r = responses as Record<string, unknown>;
  // Wizard dinámico (Fase 7d.2+): q1_clarity/q2_apply/q3_source/q_consent/q_business.
  if (
    "q1_clarity" in r ||
    "q2_apply" in r ||
    "q3_source" in r ||
    "q_consent" in r ||
    "q_business" in r
  ) {
    return "dynamic";
  }
  // Wizard Fase 7d hardcoded: keys cortas q1/q2/q3/q4_business.
  if (
    "q1" in r ||
    "q2" in r ||
    "q3" in r ||
    "q4_business" in r
  ) {
    return "wizard-legacy";
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
 * Ejemplo de salida wizard DINÁMICO (Fase 7d.2+, default en prod):
 *   [
 *     "Claridad: Muy claro",
 *     "Aplicabilidad: Sí",
 *     "Fuente: Facebook-IG",
 *     "Consentimiento: Sí",
 *     "Negocio: Vendo café de especialidad"
 *   ]
 *
 * Ejemplo de salida wizard LEGACY (Fase 7d hardcoded):
 *   [
 *     "Claridad: Muy claro",
 *     "Aplicabilidad: Sí",
 *     "Fuente: Facebook-IG",
 *     "Negocio: Vendo café de especialidad"
 *   ]
 *
 * Ejemplo de salida legacy (Fase 4):
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

  if (shape === "dynamic") {
    if (typeof r.q1_clarity === "string") {
      lines.push(`Claridad: ${Q1_LABEL[r.q1_clarity] ?? r.q1_clarity}`);
    }
    if (typeof r.q2_apply === "string") {
      lines.push(`Aplicabilidad: ${Q2_LABEL[r.q2_apply] ?? r.q2_apply}`);
    }
    if (typeof r.q3_source === "string") {
      lines.push(`Fuente: ${Q3_LABEL[r.q3_source] ?? r.q3_source}`);
    }
    if (typeof r.q_consent === "string") {
      lines.push(`Consentimiento: ${CONSENT_LABEL[r.q_consent] ?? r.q_consent}`);
    }
    if (typeof r.q_business === "string" && r.q_business.trim()) {
      lines.push(`Negocio: ${r.q_business}`);
    }
    if (lines.length === 0) {
      lines.push("(wizard dinámico incompleto — sin campos)");
    }
  } else if (shape === "wizard-legacy") {
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
