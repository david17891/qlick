/**
 * Tests del detector unificado de buttonId del wizard.
 *
 * FIX 2026-07-06 (audit G-15, segundo round): el botón del wizard puede
 * venir en dos formatos:
 *
 *   1. Legacy corto: `survey_q1_very_clear` (emitido por buildSurveyQ1).
 *   2. Dinámico:     `survey_q1_clarity_very_clear` (emitido por
 *                    buildDynamicSurveyStep cuando hay SurveyQuestion
 *                    del survey_config del evento).
 *
 * El detector de intent del bot-engine.ts usaba SOLO el formato legacy
 * (literales SURVEY_BUTTON_IDS) y se rompía cuando el builder dinámico
 * emitía buttonId dinámico (caso real David 2026-07-06).
 *
 * `detectSurveyButtonAny` intenta ambos formatos. Estos tests cubren:
 * - Formato legacy (sin validQuestionIds, no necesario).
 * - Formato dinámico con validQuestionIds completo.
 * - Formato dinámico SIN validQuestionIds (fallback legacy, no match).
 * - q_consent (step 4 buttons) y q_business (step 5 text).
 * - IDs malformados / no match.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SURVEY_BUTTON_IDS,
  detectSurveyButtonAny,
} from "../src/lib/whatsapp/survey-wizard.ts";

const DYNAMIC_Q_IDS = [
  "q1_clarity",
  "q2_apply",
  "q3_source",
  "q_consent",
  "q_business",
];

test("Formato LEGACY: 'survey_q1_very_clear' → step 1, sin validQuestionIds", () => {
  assert.deepEqual(
    detectSurveyButtonAny(SURVEY_BUTTON_IDS.q1_very_clear),
    { step: 1, questionId: "q1", optionId: "very_clear" }
  );
});

test("Formato LEGACY: 'survey_q2_yes' → step 2", () => {
  assert.deepEqual(
    detectSurveyButtonAny(SURVEY_BUTTON_IDS.q2_yes),
    { step: 2, questionId: "q2", optionId: "yes" }
  );
});

test("Formato LEGACY: 'survey_q4_skip' → step 4, optionId='skip'", () => {
  assert.deepEqual(
    detectSurveyButtonAny(SURVEY_BUTTON_IDS.q4_skip),
    { step: 4, questionId: "q4", optionId: "skip" }
  );
});

test("Formato DINÁMICO: 'survey_q1_clarity_very_clear' → step 1 (CON validQuestionIds)", () => {
  // Este es el caso real del bug de David.
  assert.deepEqual(
    detectSurveyButtonAny("survey_q1_clarity_very_clear", DYNAMIC_Q_IDS),
    { step: 1, questionId: "q1_clarity", optionId: "very_clear" }
  );
});

test("Formato DINÁMICO: 'survey_q2_apply_yes' → step 2", () => {
  assert.deepEqual(
    detectSurveyButtonAny("survey_q2_apply_yes", DYNAMIC_Q_IDS),
    { step: 2, questionId: "q2_apply", optionId: "yes" }
  );
});

test("Formato DINÁMICO: 'survey_q3_source_referred' → step 3", () => {
  assert.deepEqual(
    detectSurveyButtonAny("survey_q3_source_referred", DYNAMIC_Q_IDS),
    { step: 3, questionId: "q3_source", optionId: "referred" }
  );
});

test("Formato DINÁMICO: 'survey_q_consent_yes' → step 4 (q_consent)", () => {
  assert.deepEqual(
    detectSurveyButtonAny("survey_q_consent_yes", DYNAMIC_Q_IDS),
    { step: 4, questionId: "q_consent", optionId: "yes" }
  );
});

test("Formato DINÁMICO: 'survey_q_business_skip' → step 5 (q_business text)", () => {
  assert.deepEqual(
    detectSurveyButtonAny("survey_q_business_skip", DYNAMIC_Q_IDS),
    { step: 5, questionId: "q_business", optionId: "skip" }
  );
});

test("Formato DINÁMICO sin validQuestionIds → null (legacy tampoco matchea)", () => {
  // Si no pasamos validQuestionIds y el formato es dinámico, no hay
  // manera de derivar el step. Devuelve null → caller debe manejar.
  assert.equal(detectSurveyButtonAny("survey_q1_clarity_very_clear"), null);
});

test("Longest-prefix match: 'survey_q_consent_yes' NO matchea 'q1_clarity'", () => {
  // Defense contra falsos positivos cuando hay múltiples preguntas
  // con prefijos compartidos. q_consent empieza con "q" pero no es
  // q1/q2/q3. El longest-prefix match garantiza que detecte q_consent
  // primero.
  assert.deepEqual(
    detectSurveyButtonAny("survey_q_consent_yes", DYNAMIC_Q_IDS),
    { step: 4, questionId: "q_consent", optionId: "yes" }
  );
});

test("ID malformado / no matchea ningún formato → null", () => {
  assert.equal(detectSurveyButtonAny("survey_random_button", DYNAMIC_Q_IDS), null);
  assert.equal(detectSurveyButtonAny("not_a_survey_button", DYNAMIC_Q_IDS), null);
  assert.equal(detectSurveyButtonAny("", DYNAMIC_Q_IDS), null);
  assert.equal(detectSurveyButtonAny("evt_yes_next", DYNAMIC_Q_IDS), null);
});

test("Prioriza legacy sobre dinámico cuando ambos podrían matchear", () => {
  // 'survey_q1_very_clear' matchea legacy (q1_very_clear). El caller
  // podría pasar validQuestionIds=["q1", "q2"] para forzar el legacy
  // path. En ese caso, el resultado debe ser el legacy step.
  assert.deepEqual(
    detectSurveyButtonAny("survey_q1_very_clear", ["q1", "q2"]),
    { step: 1, questionId: "q1", optionId: "very_clear" }
  );
});