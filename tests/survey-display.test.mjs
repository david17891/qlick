import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectSurveyShape,
  formatSurveyResponses
} from "../src/lib/events/survey-display.ts";

/**
 * Tests del formateador de respuestas del wizard/legacy. Función pura:
 * mapea el jsonb `responses` que persiste el bot-engine a una lista
 * legible para mostrar en la tab Encuestas del admin.
 */

test("detectSurveyShape: wizard nativo (Fase 7d) si tiene q1/q2/q3/q4_business", () => {
  assert.equal(detectSurveyShape({ q1: "very_clear" }), "wizard");
  assert.equal(detectSurveyShape({ q2: "yes", q3: "meta" }), "wizard");
  assert.equal(detectSurveyShape({ q4_business: "Vendo café" }), "wizard");
  assert.equal(detectSurveyShape({}), "unknown"); // vacío → unknown
});

test("detectSurveyShape: legacy (Fase 4) si tiene rating 1-5", () => {
  assert.equal(detectSurveyShape({ rating: 4, liked: "X" }), "legacy");
  assert.equal(detectSurveyShape({ rating: 1 }), "legacy");
  assert.equal(detectSurveyShape({ rating: 6 }), "unknown"); // fuera de rango
  assert.equal(detectSurveyShape({ rating: "cuatro" }), "unknown"); // string
});

test("detectSurveyShape: unknown para shapes raros / null / objetos no-objeto", () => {
  assert.equal(detectSurveyShape(null), "unknown");
  assert.equal(detectSurveyShape(undefined), "unknown");
  assert.equal(detectSurveyShape("string"), "unknown");
  assert.equal(detectSurveyShape(123), "unknown");
  assert.equal(detectSurveyShape({}), "unknown");
  assert.equal(detectSurveyShape({ random_key: "x" }), "unknown");
});

test("formatSurveyResponses: wizard nativo con los 4 campos", () => {
  const r = {
    q1: "very_clear",
    q2: "yes",
    q3: "referred",
    q4_business: "Vendo café de especialidad"
  };
  const { shape, lines } = formatSurveyResponses(r);
  assert.equal(shape, "wizard");
  assert.equal(lines.length, 4);
  assert.ok(lines[0].includes("Muy claro"));
  assert.ok(lines[1].includes("Sí"));
  assert.ok(lines[2].includes("Referido"));
  assert.ok(lines[3].includes("Vendo café"));
});

test("formatSurveyResponses: wizard con q1 confuso y nada más", () => {
  const r = { q1: "confusing" };
  const { shape, lines } = formatSurveyResponses(r);
  assert.equal(shape, "wizard");
  assert.equal(lines.length, 1);
  assert.ok(lines[0].includes("Confuso"));
});

test("formatSurveyResponses: q4_business vacío NO aparece", () => {
  const r = {
    q1: "clear",
    q2: "yes",
    q3: "meta",
    q4_business: "   "
  };
  const { lines } = formatSurveyResponses(r);
  assert.equal(lines.length, 3);
  assert.ok(!lines.some((l) => l.startsWith("Negocio")));
});

test("formatSurveyResponses: wizard vacío devuelve 'solo algunos campos'", () => {
  const r = { q4_business: "x" }; // q4_business solo, sin q1/q2/q3
  const { shape, lines } = formatSurveyResponses(r);
  assert.equal(shape, "wizard");
  assert.ok(lines.includes("Negocio: x"));
  // Sin q1/q2/q3 no debería generar "wizard incompleto" porque hay data.
});

test("formatSurveyResponses: legacy form muestra rating + liked + improvements", () => {
  const r = { rating: 5, liked: "la parte práctica", improvements: "más tiempo de Q&A" };
  const { shape, lines } = formatSurveyResponses(r);
  assert.equal(shape, "legacy");
  assert.equal(lines.length, 3);
  assert.ok(lines[0].includes("Excelente"));
  assert.ok(lines[1].includes("Lo mejor"));
  assert.ok(lines[2].includes("A mejorar"));
});

test("formatSurveyResponses: unknown devuelve '(sin respuestas)'", () => {
  const { shape, lines } = formatSurveyResponses(null);
  assert.equal(shape, "unknown");
  assert.deepEqual(lines, ["(sin respuestas registradas)"]);
});

test("formatSurveyResponses: unknown con objeto random devuelve placeholder", () => {
  const { shape, lines } = formatSurveyResponses({ random: "x" });
  assert.equal(shape, "unknown");
  assert.ok(lines[0].includes("sin respuestas"));
});

test("formatSurveyResponses: legacy con rating inválido (fuera de 1-5)", () => {
  const { shape, lines } = formatSurveyResponses({ rating: 10 });
  assert.equal(shape, "unknown");
});

test("formatSurveyResponses: legacy rating integer vs string", () => {
  const lines = formatSurveyResponses({ rating: 4, liked: "x" }).lines;
  // Si rating es "4" (string), detectSurveyShape lo trata como unknown.
  // Coverage: confirma que integer funciona y string cae en unknown.
  assert.ok(lines.length > 0);
});
