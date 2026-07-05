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
 * - Max teorico = 75 con los campos actuales (rating 30 + liked 10 +
 *   commercial_interest 25 + consent 10). Subimos los thresholds un poco
 *   para que "llenar la encuesta con respuestas tibias" no promueva a MQL
 *   automaticamente — MQL requiere senales fuertes de intencion comercial.
 *
 * Si en el futuro la encuesta agrega campos (budget, timeline, etc.),
 * los puntos extra se suman aquí sin tocar al consumidor.
 */

import type { LeadQualification } from "@/types/crm";

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

/** Mapeo score → bucket. Exportado para que el UI / tests lo usen directo. */
export function scoreToQualification(score: number): LeadQualification {
  if (score >= QUALIFICATION_THRESHOLDS.mql) return "mql";
  if (score >= QUALIFICATION_THRESHOLDS.hot) return "hot";
  if (score >= QUALIFICATION_THRESHOLDS.warm) return "warm";
  return "cold";
}