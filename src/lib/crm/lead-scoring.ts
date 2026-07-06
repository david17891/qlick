/**
 * Lead scoring — derivación de calidad del lead desde respuestas de encuesta.
 *
 * Función pura, sin I/O. Toma respuestas de la encuesta post-evento y devuelve
 * un score 0-100 + qualification bucket. La fuente de verdad de las reglas
 * vive aquí; `surveys-server.ts` la invoca al persistir cada encuesta.
 *
 * Diseño (2026-07-04, feat/funnel-survey-scoring):
 * - Reglas simples y auditables. Cada punto suma a `reasons[]` para que el
 *   admin entienda POR QUE el lead tiene ese score desde el panel CRM.
 * - Thresholds:
 *     cold  < 20
 *     warm  20-39
 *     hot   40-59
 *     mql   60+
 *
 * Modos soportados (feat/funnel-dynamic-surveys-crm, 2026-07-05):
 * 1. Legacy (Fase 4): `calculateLeadScore(input)` — campos fijos
 *    (rating, liked, commercialInterest, consent). Se mantiene para
 *    retrocompatibilidad con encuestas ya persistidas.
 * 2. Dinámico (Fase 7d.2): `calculateLeadScoreFromConfig(responses, config)`
 *    — itera las preguntas del JSON de `events.survey_config`, suma
 *    `option.score` por respuesta coincidente, y detecta flags
 *    `isConsent`, `isCommercialInterest` e `isBusinessDescription`.
 *
 * Si en el futuro la encuesta agrega campos (budget, timeline, etc.),
 * los puntos extra se suman en el modo dinámico sin tocar al consumidor.
 */

import type { LeadQualification } from "@/types/crm";
import type { SurveyConfig } from "@/types/events";

export interface SurveyScoreInput {
  /** 1-5 (requerido por la encuesta). */
  rating: number;
  /** "Que fue lo que mas te sirvio?" — opcional. */
  liked?: string | null;
  /** "Te interesa saber mas sobre algo?" — opcional, señal fuerte. */
  commercialInterest?: string | null;
  /** Consentimiento explicito para seguimiento comercial. */
  consentToContact: boolean;
}

export interface SurveyScoreResult {
  /** 0-100, clamped. */
  score: number;
  /** Bucket derivado del score. */
  qualification: LeadQualification;
  /** Human-readable breakdown para mostrar en el CRM (debug/admin). */
  reasons: string[];
  /**
   * Detectado por el modo dinámico (false en legacy o si el JSON no
   * tiene opción con `isConsent: true`).
   */
  consentDetected?: boolean;
  /**
   * Texto del commercial interest detectado (de opción con flag
   * `isCommercialInterest: true` o de pregunta `text` libre).
   */
  commercialInterestDetected?: string | null;
  /**
   * Descripción del negocio (de pregunta con flag
   * `isBusinessDescription: true` y respuesta no vacía).
   */
  businessDescription?: string | null;
}

/**
 * Thresholds score → qualification.
 * 60+ requiere senales fuertes (rating alto + interes comercial + consent).
 */
export const QUALIFICATION_THRESHOLDS = {
  mql: 60,
  hot: 40,
  warm: 20
} as const;

export function calculateLeadScore(input: SurveyScoreInput): SurveyScoreResult {
  let score = 0;
  const reasons: string[] = [];

  // Rating (max 30). El rating es lo mas cercano a NPS que tenemos hoy.
  if (input.rating >= 5) {
    score += 30;
    reasons.push("Califico el evento como excelente (5/5)");
  } else if (input.rating === 4) {
    score += 20;
    reasons.push("Califico el evento como muy bueno (4/5)");
  } else if (input.rating === 3) {
    score += 10;
    reasons.push("Califico el evento como bueno (3/5)");
  } else {
    reasons.push(`Califico bajo el evento (${input.rating}/5)`);
  }

  // Liked (max 10). Engagement signal — si se tomo el tiempo de escribir,
  // esta comprometido con la marca aunque no compre.
  if (input.liked?.trim()) {
    score += 10;
    reasons.push("Comento que fue lo que mas le gusto");
  }

  // Commercial interest (max 25). La senal mas fuerte de intencion de compra.
  if (input.commercialInterest?.trim()) {
    score += 25;
    reasons.push("Declaro interes comercial explicito");
  }

  // Consent (max 10). Sin esto no podemos hacer follow-up — vale poco pero
  // suma porque el lead esta "abierto" a ser contactado.
  if (input.consentToContact) {
    score += 10;
    reasons.push("Acepto seguimiento comercial");
  }

  const clamped = Math.max(0, Math.min(100, score));
  const qualification = scoreToQualification(clamped);

  return { score: clamped, qualification, reasons };
}

/**
 * Modo dinámico: calcula score desde `events.survey_config` (Fase 7d.2).
 *
 * Itera sobre `config.questions` y para cada respuesta del usuario,
 * busca la opción matching por `id` y suma `option.score`. Detecta
 * automáticamente los flags `isConsent`, `isCommercialInterest` e
 * `isBusinessDescription`.
 *
 * Pura — fácil de testear.
 *
 * @example
 *   const result = calculateLeadScoreFromConfig(
 *     { q1_clarity: "very_clear", q2_apply: "yes", q_consent: "yes", q_business: "Vendo café" },
 *     surveyConfig,
 *   );
 *   // → score: 70, qualification: "mql", consentDetected: true, ...
 */
export function calculateLeadScoreFromConfig(
  responses: Record<string, string>,
  config: SurveyConfig,
): SurveyScoreResult {
  let score = 0;
  const reasons: string[] = [];
  let consentDetected = false;
  let commercialInterest: string | null = null;
  let businessDescription: string | null = null;

  for (const question of config.questions) {
    const answer = responses[question.id];
    if (answer === undefined || answer === null || answer === "") continue;

    if (question.type === "buttons") {
      const options = question.options ?? [];
      const matched = options.find((o) => o.id === answer);
      if (!matched) continue;

      score += matched.score;
      if (matched.score > 0) {
        reasons.push(`${question.text} → ${matched.title}`);
      }

      if (matched.isConsent === true) consentDetected = true;
      if (matched.isCommercialInterest === true) {
        commercialInterest = matched.title;
      }
    } else if (question.type === "text") {
      const trimmed = answer.trim();
      // Filtrar "saltar"/"skip" como respuestas vacías (no puntúan).
      if (
        trimmed.length === 0 ||
        /^(saltar|skip|pasar|omitir|next|omit|no\s*gracias|-)$/i.test(trimmed)
      ) {
        continue;
      }
      // Texto libre con `isBusinessDescription` mapea a lead.description.
      if (question.isBusinessDescription === true) {
        businessDescription = trimmed.slice(0, 500);
        // Bonus: engagement (escribió algo) = 5 pts
        score += 5;
        reasons.push("Contanos sobre su negocio o proyecto");
      } else {
        // Texto libre sin flag especial: 5 pts de engagement
        score += 5;
        reasons.push("Dejo un comentario libre");
      }
    }
  }

  const clamped = Math.max(0, Math.min(100, score));
  const qualification = scoreToQualification(clamped);

  if (consentDetected) {
    reasons.push("Acepto seguimiento comercial");
  }

  return {
    score: clamped,
    qualification,
    reasons,
    consentDetected,
    commercialInterestDetected: commercialInterest,
    businessDescription,
  };
}

/**
 * Sustituye placeholders `{{1}}`, `{{2}}`, ... en un template con valores.
 * Usado por el Promotion Engine para personalizar los `followUps.text`.
 *
 * Placeholders no encontrados se reemplazan por string vacío.
 *
 * Pura — fácil de testear.
 */
export function substituteTemplateVars(
  text: string,
  vars: Record<string, string>,
): string {
  return text.replace(/\{\{(\d+)\}\}/g, (_match, key: string) => {
    return vars[key] ?? "";
  });
}

/** Mapeo score → bucket. Exportado para que el UI / tests lo usen directo. */
export function scoreToQualification(score: number): LeadQualification {
  if (score >= QUALIFICATION_THRESHOLDS.mql) return "mql";
  if (score >= QUALIFICATION_THRESHOLDS.hot) return "hot";
  if (score >= QUALIFICATION_THRESHOLDS.warm) return "warm";
  return "cold";
}