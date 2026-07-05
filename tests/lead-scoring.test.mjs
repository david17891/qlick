/**
 * Tests del scoring de leads desde respuestas de encuesta.
 *
 * El scoring es una funcion pura: misma entrada → mismo score + qualification.
 * Cubrimos los thresholds clave (cold/warm/hot/mql) + los edge cases.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculateLeadScore,
  scoreToQualification,
  QUALIFICATION_THRESHOLDS
} from "../src/lib/crm/lead-scoring.ts";

test("score perfecto (rating 5 + liked + interest + consent) = 75, mql", () => {
  const r = calculateLeadScore({
    rating: 5,
    liked: "Las explicaciones fueron claras",
    commercialInterest: "Curso avanzado",
    consentToContact: true
  });
  assert.equal(r.score, 75);
  assert.equal(r.qualification, "mql");
  assert.ok(r.reasons.length >= 4);
});

test("solo rating 5 + consent = 40, hot", () => {
  const r = calculateLeadScore({
    rating: 5,
    consentToContact: true
  });
  assert.equal(r.score, 40);
  assert.equal(r.qualification, "hot");
});

test("rating 4 + interest = 45, hot", () => {
  const r = calculateLeadScore({
    rating: 4,
    commercialInterest: "Consultoria 1:1",
    consentToContact: false
  });
  assert.equal(r.score, 45);
  assert.equal(r.qualification, "hot");
});

test("rating 3 + consent = 20, warm", () => {
  const r = calculateLeadScore({
    rating: 3,
    consentToContact: true
  });
  assert.equal(r.score, 20);
  assert.equal(r.qualification, "warm");
});

test("rating 1 + todo vacio = 0, cold", () => {
  const r = calculateLeadScore({
    rating: 1,
    consentToContact: false
  });
  assert.equal(r.score, 0);
  assert.equal(r.qualification, "cold");
});

test("score clamp a 100 maximo teorico", () => {
  const r = calculateLeadScore({
    rating: 5,
    liked: "todo",
    commercialInterest: "mucho",
    consentToContact: true
  });
  // 30 + 10 + 25 + 10 = 75 (no supera 100 con campos actuales)
  assert.ok(r.score <= 100);
});

test("scoreToQualification mapeo correcto de thresholds", () => {
  assert.equal(scoreToQualification(0), "cold");
  assert.equal(scoreToQualification(19), "cold");
  assert.equal(scoreToQualification(20), "warm");
  assert.equal(scoreToQualification(39), "warm");
  assert.equal(scoreToQualification(40), "hot");
  assert.equal(scoreToQualification(59), "hot");
  assert.equal(scoreToQualification(60), "mql");
  assert.equal(scoreToQualification(100), "mql");
});

test("QUALIFICATION_THRESHOLDS exported y consistente", () => {
  assert.equal(QUALIFICATION_THRESHOLDS.mql, 60);
  assert.equal(QUALIFICATION_THRESHOLDS.hot, 40);
  assert.equal(QUALIFICATION_THRESHOLDS.warm, 20);
});

test("inputs null/undefined no rompen, devuelven 0 points", () => {
  const r = calculateLeadScore({
    rating: 2,
    liked: null,
    commercialInterest: null,
    consentToContact: false
  });
  assert.equal(r.score, 0);
  assert.equal(r.qualification, "cold");
});

test("strings vacios en liked/interest = 0 points (trim)", () => {
  const r = calculateLeadScore({
    rating: 5,
    liked: "   ",
    commercialInterest: "",
    consentToContact: false
  });
  // solo rating 5 → 30 points
  assert.equal(r.score, 30);
  assert.equal(r.qualification, "warm");
});

test("reasons siempre es un array con al menos 1 entrada (rating)", () => {
  const r = calculateLeadScore({
    rating: 4,
    consentToContact: true
  });
  assert.ok(Array.isArray(r.reasons));
  assert.ok(r.reasons.length >= 1);
  assert.ok(r.reasons[0].includes("4/5"));
});