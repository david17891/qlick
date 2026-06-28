/**
 * Tests para calculateEventMetrics (Sub-bloque 1C de Fase 4).
 *
 * Casos: division por cero, ratios tipicos, redondeo a 1 decimal.
 */

// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateEventMetrics } from "../src/lib/events/event-metrics.ts";

const baseInput = {
  event: { id: "e-1", slug: "x", title: "T", startsAt: "2026-01-01", status: "published", createdAt: "", updatedAt: "" },
  confirmedCount: 100,
  attendedCount: 80,
  unmatchedCount: 5,
  surveysCount: 60,
  surveysWithConsent: 40,
  leadsPromoted: 10,
};

test("attendanceRate = attendedCount / confirmedCount", () => {
  const m = calculateEventMetrics(baseInput);
  assert.equal(m.attendanceRate, 80);
});

test("consentRate = surveysWithConsent / surveysCount", () => {
  const m = calculateEventMetrics(baseInput);
  assert.equal(m.consentRate, 66.7); // 40/60 = 66.666... -> 66.7
});

test("leadConversionRate = leadsPromoted / surveysWithConsent", () => {
  const m = calculateEventMetrics(baseInput);
  assert.equal(m.leadConversionRate, 25); // 10/40 = 25
});

test("overallConversionRate = leadsPromoted / confirmedCount", () => {
  const m = calculateEventMetrics(baseInput);
  assert.equal(m.overallConversionRate, 10); // 10/100 = 10
});

test("todos los rates son null si los denominadores son 0", () => {
  const m = calculateEventMetrics({
    ...baseInput,
    confirmedCount: 0,
    attendedCount: 0,
    surveysCount: 0,
    surveysWithConsent: 0,
    leadsPromoted: 0,
  });
  assert.equal(m.attendanceRate, null);
  assert.equal(m.consentRate, null);
  assert.equal(m.leadConversionRate, null);
  assert.equal(m.overallConversionRate, null);
});

test("redondeo a 1 decimal", () => {
  // 1/3 = 33.333... -> 33.3
  const m = calculateEventMetrics({
    ...baseInput,
    confirmedCount: 3,
    attendedCount: 1,
    surveysCount: 0,
    surveysWithConsent: 0,
    leadsPromoted: 0,
  });
  assert.equal(m.attendanceRate, 33.3);
});

test("rate = 100 cuando numerador == denominador", () => {
  const m = calculateEventMetrics({
    ...baseInput,
    confirmedCount: 50,
    attendedCount: 50,
  });
  assert.equal(m.attendanceRate, 100);
});
