/**
 * Tests del fallback "text→buttonId synth" del wizard de encuesta.
 *
 * FIX 2026-07-06 (audit G-15, "Muy claro no avanza wizard"): Meta a
 * veces NO manda el buttonId en el webhook del segundo click (dedupe,
 * formato, retry, button reply reentrega). El helper
 * `synthesizeSurveyButtonFromText` mapea texto crudo a buttonId
 * equivalente para que el wizard avance aunque Meta no mande buttonId.
 *
 * Cubre:
 * - Q1 (step=1): "muy claro" / "claro" / "confuso" → buttonId
 * - Q2 (step=2): "sí" / "tal vez" / "no" → buttonId
 * - Q3 (step=3): "facebook" / "referido" / "otro" → buttonId
 * - Edge cases: case-insensitive, trim, regex estricto (no matchea frases)
 * - Step inválido (0, 4, 5) → null
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SURVEY_BUTTON_IDS,
  synthesizeSurveyButtonFromText,
} from "../src/lib/whatsapp/survey-wizard.ts";

test("Q1 step=1: 'Muy claro' (case-insensitive) → q1_very_clear", () => {
  assert.equal(
    synthesizeSurveyButtonFromText("Muy claro", 1),
    SURVEY_BUTTON_IDS.q1_very_clear
  );
  assert.equal(
    synthesizeSurveyButtonFromText("muy claro", 1),
    SURVEY_BUTTON_IDS.q1_very_clear
  );
  assert.equal(
    synthesizeSurveyButtonFromText("MUY CLARO", 1),
    SURVEY_BUTTON_IDS.q1_very_clear
  );
  // Acepta solo "muy" como abreviatura (caso real visto en producción)
  assert.equal(synthesizeSurveyButtonFromText("muy", 1), SURVEY_BUTTON_IDS.q1_very_clear);
});

test("Q1 step=1: 'Claro' → q1_clear", () => {
  assert.equal(synthesizeSurveyButtonFromText("Claro", 1), SURVEY_BUTTON_IDS.q1_clear);
  assert.equal(synthesizeSurveyButtonFromText("claro", 1), SURVEY_BUTTON_IDS.q1_clear);
});

test("Q1 step=1: 'Confuso' → q1_confusing", () => {
  assert.equal(
    synthesizeSurveyButtonFromText("Confuso", 1),
    SURVEY_BUTTON_IDS.q1_confusing
  );
});

test("Q1 step=1: NO matchea frases largas (cae al LLM, no rompe wizard)", () => {
  // "muy claro que sí" no es una respuesta pura de Q1; si llega,
  // lo mejor es dejar que el LLM responda.
  assert.equal(synthesizeSurveyButtonFromText("muy claro que sí", 1), null);
  assert.equal(
    synthesizeSurveyButtonFromText("no entendí nada, fue confuso", 1),
    null
  );
  // Empty / whitespace
  assert.equal(synthesizeSurveyButtonFromText("", 1), null);
  assert.equal(synthesizeSurveyButtonFromText("   ", 1), null);
});

test("Q2 step=2: 'sí' (con/sin tilde) → q2_yes", () => {
  assert.equal(synthesizeSurveyButtonFromText("sí", 2), SURVEY_BUTTON_IDS.q2_yes);
  assert.equal(synthesizeSurveyButtonFromText("si", 2), SURVEY_BUTTON_IDS.q2_yes);
  assert.equal(synthesizeSurveyButtonFromText("SI", 2), SURVEY_BUTTON_IDS.q2_yes);
  // Variantes coloquiales
  assert.equal(
    synthesizeSurveyButtonFromText("claro que sí", 2),
    SURVEY_BUTTON_IDS.q2_yes
  );
  assert.equal(
    synthesizeSurveyButtonFromText("por supuesto", 2),
    SURVEY_BUTTON_IDS.q2_yes
  );
  assert.equal(
    synthesizeSurveyButtonFromText("desde luego", 2),
    SURVEY_BUTTON_IDS.q2_yes
  );
});

test("Q2 step=2: 'tal vez' → q2_maybe", () => {
  assert.equal(
    synthesizeSurveyButtonFromText("tal vez", 2),
    SURVEY_BUTTON_IDS.q2_maybe
  );
  assert.equal(
    synthesizeSurveyButtonFromText("Tal Vez", 2),
    SURVEY_BUTTON_IDS.q2_maybe
  );
  // Variantes coloquiales
  assert.equal(synthesizeSurveyButtonFromText("quizás", 2), SURVEY_BUTTON_IDS.q2_maybe);
  assert.equal(synthesizeSurveyButtonFromText("depende", 2), SURVEY_BUTTON_IDS.q2_maybe);
});

test("Q2 step=2: 'no' → q2_no", () => {
  assert.equal(synthesizeSurveyButtonFromText("no", 2), SURVEY_BUTTON_IDS.q2_no);
  assert.equal(synthesizeSurveyButtonFromText("No", 2), SURVEY_BUTTON_IDS.q2_no);
  assert.equal(synthesizeSurveyButtonFromText("NO", 2), SURVEY_BUTTON_IDS.q2_no);
});

test("Q2 step=2: NO matchea frases largas", () => {
  assert.equal(synthesizeSurveyButtonFromText("sí, pero con dudas", 2), null);
  assert.equal(synthesizeSurveyButtonFromText("no gracias", 2), null);
});

test("Q3 step=3: 'facebook' / 'ig' / 'meta' → q3_meta", () => {
  assert.equal(synthesizeSurveyButtonFromText("facebook", 3), SURVEY_BUTTON_IDS.q3_meta);
  assert.equal(synthesizeSurveyButtonFromText("Facebook", 3), SURVEY_BUTTON_IDS.q3_meta);
  assert.equal(synthesizeSurveyButtonFromText("ig", 3), SURVEY_BUTTON_IDS.q3_meta);
  assert.equal(synthesizeSurveyButtonFromText("instagram", 3), SURVEY_BUTTON_IDS.q3_meta);
  assert.equal(synthesizeSurveyButtonFromText("meta", 3), SURVEY_BUTTON_IDS.q3_meta);
  assert.equal(synthesizeSurveyButtonFromText("fb", 3), SURVEY_BUTTON_IDS.q3_meta);
});

test("Q3 step=3: 'referido' / 'amigo' / 'recomendación' → q3_referred", () => {
  assert.equal(
    synthesizeSurveyButtonFromText("referido", 3),
    SURVEY_BUTTON_IDS.q3_referred
  );
  assert.equal(synthesizeSurveyButtonFromText("amigo", 3), SURVEY_BUTTON_IDS.q3_referred);
  assert.equal(
    synthesizeSurveyButtonFromText("recomendación", 3),
    SURVEY_BUTTON_IDS.q3_referred
  );
});

test("Q3 step=3: 'otro' → q3_other", () => {
  assert.equal(synthesizeSurveyButtonFromText("otro", 3), SURVEY_BUTTON_IDS.q3_other);
  assert.equal(synthesizeSurveyButtonFromText("Otro", 3), SURVEY_BUTTON_IDS.q3_other);
});

test("Step inválido (0, 4, 5, negativos) → null", () => {
  // Step=4 es texto libre (ya cubierto por override 3.0 en bot-engine).
  assert.equal(synthesizeSurveyButtonFromText("muy claro", 4), null);
  // Step fuera de rango
  assert.equal(synthesizeSurveyButtonFromText("muy claro", 0), null);
  assert.equal(synthesizeSurveyButtonFromText("muy claro", 5), null);
  assert.equal(synthesizeSurveyButtonFromText("muy claro", -1), null);
});

test("Trim: espacios al inicio/fin se ignoran", () => {
  assert.equal(
    synthesizeSurveyButtonFromText("  Muy claro  ", 1),
    SURVEY_BUTTON_IDS.q1_very_clear
  );
  assert.equal(
    synthesizeSurveyButtonFromText("\tsí\n", 2),
    SURVEY_BUTTON_IDS.q2_yes
  );
});

test("Body vacío / null / undefined → null (defensivo)", () => {
  assert.equal(synthesizeSurveyButtonFromText("", 1), null);
  assert.equal(synthesizeSurveyButtonFromText("", 2), null);
  assert.equal(synthesizeSurveyButtonFromText("", 3), null);
});