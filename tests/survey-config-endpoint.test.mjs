/**
 * Tests de integración para el guardado de survey_config (deuda #1).
 *
 * Cubre la lógica que corre EN EL ENDPOINT antes del save:
 * - Validator rechaza payloads inválidos con mensajes claros.
 * - Validator acepta payloads válidos con flags correctos.
 *
 * El test E2E end-to-end del endpoint (auth + UPDATE + audit) requiere
 * Supabase real o un sistema de mocks más complejo. Eso queda como
 * Fase 8+ (test runner que levante Next.js + NextRequest).
 *
 * Tests con mocks ligeros del save helper requieren runtime que
 * resuelva el alias `@/lib/...` de Next.js (no soportado por
 * `node --experimental-strip-types` directamente).
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  validateSurveyConfig,
} from "../src/lib/events/survey-config-validator.ts";

// ─────────────────────────────────────────────────────────────
// Validator: rechaza payloads inválidos
// ─────────────────────────────────────────────────────────────

test("validator: rechaza config con 1 opción en buttons (mínimo 2)", () => {
  const invalid = {
    questions: [
      {
        id: "q1",
        text: "?",
        type: "buttons",
        options: [{ id: "a", title: "Solo A", score: 10 }],
      },
    ],
  };
  const result = validateSurveyConfig(invalid);
  assert.equal(result, null, "debe rechazar con 1 opción");
});

test("validator: rechaza config con 4 opciones en buttons (máximo 3, límite Meta)", () => {
  const invalid = {
    questions: [
      {
        id: "q1",
        text: "?",
        type: "buttons",
        options: [
          { id: "a", title: "A", score: 1 },
          { id: "b", title: "B", score: 1 },
          { id: "c", title: "C", score: 1 },
          { id: "d", title: "D", score: 1 },
        ],
      },
    ],
  };
  const result = validateSurveyConfig(invalid);
  assert.equal(result, null);
});

test("validator: rechaza título >20 chars (límite Meta Cloud API)", () => {
  const invalid = {
    questions: [
      {
        id: "q1",
        text: "?",
        type: "buttons",
        options: [
          { id: "a", title: "x".repeat(25), score: 1 },
          { id: "b", title: "OK", score: 1 },
        ],
      },
    ],
  };
  const result = validateSurveyConfig(invalid);
  assert.equal(result, null);
});

test("validator: rechaza questions array vacío", () => {
  const result = validateSurveyConfig({ questions: [] });
  assert.equal(result, null);
});

test("validator: rechaza >1 flag isConsent (LFPDPPP: consent debe ser único)", () => {
  const invalid = {
    questions: [
      {
        id: "q1",
        text: "?",
        type: "buttons",
        options: [
          { id: "a", title: "A", score: 1, isConsent: true },
          { id: "b", title: "B", score: 1 },
        ],
      },
      {
        id: "q2",
        text: "?",
        type: "buttons",
        options: [
          { id: "c", title: "C", score: 1, isConsent: true },
          { id: "d", title: "D", score: 1 },
        ],
      },
    ],
  };
  const result = validateSurveyConfig(invalid);
  assert.equal(result, null);
});

test("validator: rechaza >1 flag isBusinessDescription", () => {
  const invalid = {
    questions: [
      {
        id: "q1",
        text: "?",
        type: "text",
        isBusinessDescription: true,
      },
      {
        id: "q2",
        text: "?",
        type: "text",
        isBusinessDescription: true,
      },
    ],
  };
  const result = validateSurveyConfig(invalid);
  assert.equal(result, null);
});

test("validator: rechaza preguntas sin id", () => {
  const invalid = {
    questions: [
      {
        text: "?",
        type: "buttons",
        options: [
          { id: "a", title: "A", score: 1 },
          { id: "b", title: "B", score: 1 },
        ],
      },
    ],
  };
  const result = validateSurveyConfig(invalid);
  assert.equal(result, null);
});

// ─────────────────────────────────────────────────────────────
// Validator: acepta payloads válidos
// ─────────────────────────────────────────────────────────────

test("validator: acepta payload válido con isConsent + isCommercialInterest", () => {
  const valid = {
    questions: [
      {
        id: "q1",
        text: "?",
        type: "buttons",
        options: [
          {
            id: "yes",
            title: "Sí",
            score: 10,
            isConsent: true,
            isCommercialInterest: true,
          },
          { id: "no", title: "No", score: 0 },
        ],
      },
    ],
    followUps: {
      mql: { text: "Hola {{1}}", templateName: null },
    },
  };
  const result = validateSurveyConfig(valid);
  assert.notEqual(result, null);
  assert.equal(result.questions.length, 1);
  assert.equal(result.followUps?.mql?.text, "Hola {{1}}");
});

test("validator: acepta payload válido con pregunta text + buttons mixto", () => {
  const valid = {
    questions: [
      {
        id: "q1",
        text: "?",
        type: "buttons",
        options: [
          { id: "a", title: "A", score: 10 },
          { id: "b", title: "B", score: 5 },
        ],
      },
      {
        id: "q2",
        text: "Contanos",
        type: "text",
        isBusinessDescription: true,
      },
    ],
  };
  const result = validateSurveyConfig(valid);
  assert.notEqual(result, null);
  assert.equal(result.questions.length, 2);
  assert.equal(result.questions[1].type, "text");
});

test("validator: rechaza null/undefined/empty", () => {
  assert.equal(validateSurveyConfig(null), null);
  assert.equal(validateSurveyConfig(undefined), null);
  assert.equal(validateSurveyConfig("{}"), null);
  assert.equal(validateSurveyConfig(42), null);
  assert.equal(validateSurveyConfig([]), null);
});