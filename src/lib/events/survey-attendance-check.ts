/**
 * Detector puro: ¿la Q0 de la encuesta fue respondida "Sí"?
 *
 * Sprint cierre-eventos-virtuales (FIX 2026-07-11).
 *
 * Extraído de `surveys-server.ts:271-340` para que la decisión
 * "el confirmado asistió" sea testeable sin tocar Supabase. La
 * lógica de DB (UPSERT attendee + promote lead) se queda inline en
 * `surveys-server.ts` por su acoplamiento a `createSupabaseAdminClient`,
 * pero la decisión Booleana sobre si la respuesta de la Q0 cuenta
 * como "Sí, asistí" vive acá.
 *
 * Reglas:
 * - La survey debe tener al menos una pregunta con `isAttendanceCheck=true`.
 * - La respuesta a esa pregunta debe mapear a una opción con `score > 0`.
 * - Sin config o sin respuesta → no es asistencia.
 *
 * Pura: no toca DB, no importa nada de `@/lib/...`. Testeable en aislamiento
 * con `node --test` + `node:experimental-strip-types`.
 */

import type { SurveyConfig } from "@/types/events";

export interface DetectAttendanceCheckInput {
  surveyConfig: SurveyConfig | null | undefined;
  responses: Record<string, unknown>;
}

export interface DetectAttendanceCheckResult {
  /** true si la Q0 fue respondida con score > 0 (cuenta como "Sí, asistí"). */
  attended: boolean;
  /** ID de la pregunta Q0. null si no hay. */
  questionId: string | null;
  /** ID de la opción elegida. null si no respondió. */
  optionId: string | null;
  /** Score de la opción elegida. 0 si no respondió. */
  score: number;
}

/**
 * Detecta si la respuesta del usuario a la pregunta de attendance check
 * (Q0 con `isAttendanceCheck=true`) cuenta como "Sí, asistí".
 *
 * Misma lógica que `surveys-server.ts:282-290` (legacy) — extraída acá
 * para testear sin DB. Si los criterios cambian (ej. cambiar `score > 0`
 * a `option.id === "yes_attended"`), hay que actualizar AMBOS lugares
 * hasta que `surveys-server.ts` llame a este helper (TODO Sprint 3).
 */
export function detectAttendanceCheck(
  input: DetectAttendanceCheckInput,
): DetectAttendanceCheckResult {
  if (!input.surveyConfig) {
    return { attended: false, questionId: null, optionId: null, score: 0 };
  }
  const attQ = input.surveyConfig.questions.find(
    (q) => q.isAttendanceCheck === true,
  );
  if (!attQ) {
    return { attended: false, questionId: null, optionId: null, score: 0 };
  }
  const respValue = input.responses[attQ.id];
  if (typeof respValue !== "string" || !respValue) {
    return {
      attended: false,
      questionId: attQ.id,
      optionId: null,
      score: 0,
    };
  }
  const respOption = attQ.options?.find((o) => o.id === respValue);
  if (!respOption) {
    return {
      attended: false,
      questionId: attQ.id,
      optionId: respValue,
      score: 0,
    };
  }
  const attended = respOption.score > 0;
  return {
    attended,
    questionId: attQ.id,
    optionId: respOption.id,
    score: respOption.score,
  };
}
