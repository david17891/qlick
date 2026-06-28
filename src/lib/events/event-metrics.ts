/**
 * Metricas reales de conversion del evento.
 *
 * Sub-bloque 1C de Fase 4 (cierre). Calcula los ratios clave del funnel
 * para que el admin vea de un vistazo que tan efectivo es el evento:
 * tasa de asistencia, tasa de consent, tasa de conversion a lead, y
 * conversion overall (confirmado -> lead).
 *
 * Si el denominador es 0, devuelve null (la UI muestra "—").
 */

import type { Event } from "@/types/events";

export interface EventMetricsInput {
  event: Event;
  confirmedCount: number;
  attendedCount: number;
  unmatchedCount: number;
  surveysCount: number;
  surveysWithConsent: number;
  leadsPromoted: number;
}

export interface EventMetrics {
  /** Confirmados -> Asistentes (cuantos de los que dijeron 'si, voy' vinieron). */
  attendanceRate: number | null;
  /** Encuestas con consent / total encuestas. */
  consentRate: number | null;
  /** Leads promovidos / encuestas con consent (cuantos acceptaron ser contactados). */
  leadConversionRate: number | null;
  /** Leads promovidos / confirmados (funnel overall: cuanto termina en cliente). */
  overallConversionRate: number | null;
}

export function calculateEventMetrics(input: EventMetricsInput): EventMetrics {
  const {
    confirmedCount,
    attendedCount,
    surveysCount,
    surveysWithConsent,
    leadsPromoted,
  } = input;

  const rate = (numerator: number, denominator: number): number | null => {
    if (denominator === 0) return null;
    return Math.round((numerator / denominator) * 1000) / 10; // 1 decimal
  };

  return {
    attendanceRate: rate(attendedCount, confirmedCount),
    consentRate: rate(surveysWithConsent, surveysCount),
    leadConversionRate: rate(leadsPromoted, surveysWithConsent),
    overallConversionRate: rate(leadsPromoted, confirmedCount),
  };
}
