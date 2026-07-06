/**
 * Tests para `calculateLeadScoreFromConfig` (commit 4).
 *
 * Cubre:
 * - Cada Q en Default config suma puntos correctos.
 * - isConsent detectado correctamente.
 * - isCommercialInterest detectado correctamente.
 * - isBusinessDescription mapea al campo businessDescription.
 * - Score clamped 0-100.
 * - Fallback a legacy si no hay config.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateLeadScore,
  calculateLeadScoreFromConfig,
  substituteTemplateVars,
  QUALIFICATION_THRESHOLDS,
} from "../src/lib/crm/lead-scoring.ts";
import { getDefaultSurveyConfig } from "../src/lib/events/survey-config-validator.ts";

test("scoring: max score del Default config (todas las respuestas top)", () => {
  const cfg = getDefaultSurveyConfig();
  const responses = {
    q1_clarity: "very_clear", // 20
    q2_apply: "yes", // 30 + isCommercialInterest
    q3_source: "referred", // 10
    q_consent: "yes", // 10 + isConsent
    q_business: "Vendo café de especialidad", // 5 (engagement)
  };
  const result = calculateLeadScoreFromConfig(responses, cfg);
  assert.equal(result.score, 75, "max = 20+30+10+10+5 = 75");
  assert.equal(result.qualification, "mql");
  assert.equal(result.consentDetected, true);
  assert.equal(result.commercialInterestDetected, "Sí");
  assert.equal(
    result.businessDescription,
    "Vendo café de especialidad",
  );
});

test("scoring: min score del Default config (respuestas tibias + skip business)", () => {
  const cfg = getDefaultSurveyConfig();
  const responses = {
    q1_clarity: "confusing", // 5
    q2_apply: "no", // 0
    q3_source: "other", // 0
    q_consent: "no", // 0
    q_business: "saltar", // skip → no suma
  };
  const result = calculateLeadScoreFromConfig(responses, cfg);
  assert.equal(result.score, 5, "min con default = 5 (claridad confusing)");
  assert.equal(result.qualification, "cold");
  assert.equal(result.consentDetected, false);
});

test("scoring: consent detectado solo si la opción tiene flag", () => {
  const cfg = getDefaultSurveyConfig();
  const responses = {
    q1_clarity: "clear",
    q2_apply: "yes",
    q3_source: "meta",
    q_consent: "no", // explícito NO → consent false
  };
  const result = calculateLeadScoreFromConfig(responses, cfg);
  assert.equal(result.consentDetected, false);
  assert.equal(result.score, 15 + 30 + 5 + 0);
});

test("scoring: commercial interest solo si flag", () => {
  const cfg = getDefaultSurveyConfig();
  const responses = {
    q1_clarity: "clear",
    q2_apply: "no", // SIN flag
    q3_source: "meta",
    q_consent: "yes",
  };
  const result = calculateLeadScoreFromConfig(responses, cfg);
  assert.equal(result.commercialInterestDetected, null);
});

test("scoring: clamp a 100 si config excede el máximo teórico", () => {
  const cfg = {
    questions: [
      {
        id: "q1",
        text: "?",
        type: "buttons",
        options: [{ id: "a", title: "A", score: 80 }],
      },
      {
        id: "q2",
        text: "?",
        type: "buttons",
        options: [{ id: "b", title: "B", score: 80 }],
      },
    ],
  };
  const result = calculateLeadScoreFromConfig({ q1: "a", q2: "b" }, cfg);
  assert.equal(result.score, 100, "clamped a 100");
  assert.equal(result.qualification, "mql");
});

test("scoring: respuestas vacías no suman puntos", () => {
  const cfg = getDefaultSurveyConfig();
  const responses = {
    q1_clarity: "very_clear",
    // resto vacío
  };
  const result = calculateLeadScoreFromConfig(responses, cfg);
  assert.equal(result.score, 20);
});

test("scoring: business text 'saltar' se ignora", () => {
  const cfg = getDefaultSurveyConfig();
  const responses = {
    q1_clarity: "very_clear",
    q_business: "saltar",
  };
  const result = calculateLeadScoreFromConfig(responses, cfg);
  assert.equal(result.businessDescription, null);
  assert.equal(result.score, 20); // solo clarity
});

test("scoring: business text vacío se ignora", () => {
  const cfg = getDefaultSurveyConfig();
  const responses = {
    q1_clarity: "very_clear",
    q_business: "",
  };
  const result = calculateLeadScoreFromConfig(responses, cfg);
  assert.equal(result.businessDescription, null);
});

test("scoring: business text > 500 chars se trunca", () => {
  const cfg = getDefaultSurveyConfig();
  const longText = "a".repeat(800);
  const responses = {
    q1_clarity: "very_clear",
    q_business: longText,
  };
  const result = calculateLeadScoreFromConfig(responses, cfg);
  assert.equal(result.businessDescription?.length, 500);
});

test("scoring: option id no matcheado se ignora", () => {
  const cfg = getDefaultSurveyConfig();
  const responses = {
    q1_clarity: "no_existe", // no matchea con ningún option
  };
  const result = calculateLeadScoreFromConfig(responses, cfg);
  assert.equal(result.score, 0);
});

test("scoring: legacy calculateLeadScore sigue funcionando (compat)", () => {
  const result = calculateLeadScore({
    rating: 5,
    liked: "genial",
    commercialInterest: "info del curso",
    consentToContact: true,
  });
  assert.equal(result.score, 75);
  assert.equal(result.qualification, "mql");
});

test("scoring: qualification thresholds son los correctos", () => {
  assert.equal(QUALIFICATION_THRESHOLDS.mql, 60);
  assert.equal(QUALIFICATION_THRESHOLDS.hot, 40);
  assert.equal(QUALIFICATION_THRESHOLDS.warm, 20);
});

test("substituteTemplateVars: reemplaza {{1}} correctamente", () => {
  const text = "¡Hola {{1}}! Bienvenido a {{2}}";
  const result = substituteTemplateVars(text, { "1": "María", "2": "Qlick" });
  assert.equal(result, "¡Hola María! Bienvenido a Qlick");
});

test("substituteTemplateVars: variables faltantes → vacío", () => {
  const text = "Hola {{1}}, tu código es {{99}}";
  const result = substituteTemplateVars(text, { "1": "Juan" });
  assert.equal(result, "Hola Juan, tu código es ");
});