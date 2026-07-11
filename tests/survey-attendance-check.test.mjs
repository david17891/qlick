// Sprint cierre-eventos-virtuales (FIX 2026-07-11).
//
// Tests del detector puro `detectAttendanceCheck` extraído de
// `surveys-server.ts:271-340` para que la decisión "asistió" sea
// testeable sin DB. La lógica de UPSERT + promote lead sigue
// inline en `surveys-server.ts` (no testeable sin mockear
// Supabase — eso es scope de Sprint 3 con node:test + module mocks).

import { test } from "node:test";
import assert from "node:assert/strict";

const surveyAttendanceCheckMod = await import(
  "../src/lib/events/survey-attendance-check.ts"
);
const { detectAttendanceCheck } = surveyAttendanceCheckMod;

const Q0_ID = "q0_attended";
const YES_OPT = "yes_attended";
const NO_OPT = "no_attended";

function makeConfig() {
  return {
    questions: [
      {
        id: Q0_ID,
        type: "buttons",
        isAttendanceCheck: true,
        options: [
          { id: YES_OPT, title: "Sí, ingresé", score: 20 },
          { id: NO_OPT, title: "No pude", score: 0 },
        ],
      },
    ],
  };
}

// ────────────────────────────────────────────────────────────
// Sin config / sin Q0
// ────────────────────────────────────────────────────────────

test("detectAttendanceCheck: sin surveyConfig → no asistió", () => {
  const r = detectAttendanceCheck({ surveyConfig: null, responses: {} });
  assert.equal(r.attended, false);
  assert.equal(r.questionId, null);
  assert.equal(r.score, 0);
});

test("detectAttendanceCheck: surveyConfig sin Q0 → no asistió", () => {
  const cfg = {
    questions: [
      {
        id: "q1_other",
        type: "buttons",
        options: [{ id: "a", title: "A", score: 5 }],
      },
    ],
  };
  const r = detectAttendanceCheck({
    surveyConfig: cfg,
    responses: { q1_other: "a" },
  });
  assert.equal(r.attended, false);
  assert.equal(r.questionId, null);
});

// ────────────────────────────────────────────────────────────
// Con Q0 — casos normales
// ────────────────────────────────────────────────────────────

test("detectAttendanceCheck: Q0 respondida 'Sí, ingresé' → asistió", () => {
  const cfg = makeConfig();
  const r = detectAttendanceCheck({
    surveyConfig: cfg,
    responses: { [Q0_ID]: YES_OPT },
  });
  assert.equal(r.attended, true);
  assert.equal(r.questionId, Q0_ID);
  assert.equal(r.optionId, YES_OPT);
  assert.equal(r.score, 20);
});

test("detectAttendanceCheck: Q0 respondida 'No pude' → NO asistió", () => {
  const cfg = makeConfig();
  const r = detectAttendanceCheck({
    surveyConfig: cfg,
    responses: { [Q0_ID]: NO_OPT },
  });
  assert.equal(r.attended, false);
  assert.equal(r.questionId, Q0_ID);
  assert.equal(r.optionId, NO_OPT);
  assert.equal(r.score, 0);
});

// ────────────────────────────────────────────────────────────
// Con Q0 — casos edge
// ────────────────────────────────────────────────────────────

test("detectAttendanceCheck: Q0 sin respuesta → NO asistió", () => {
  const cfg = makeConfig();
  const r = detectAttendanceCheck({
    surveyConfig: cfg,
    responses: {},
  });
  assert.equal(r.attended, false);
  assert.equal(r.questionId, Q0_ID);
  assert.equal(r.optionId, null);
  assert.equal(r.score, 0);
});

test("detectAttendanceCheck: Q0 con respuesta que no es opción válida → NO asistió", () => {
  const cfg = makeConfig();
  const r = detectAttendanceCheck({
    surveyConfig: cfg,
    responses: { [Q0_ID]: "id_inventado" },
  });
  assert.equal(r.attended, false);
  assert.equal(r.optionId, "id_inventado");
  assert.equal(r.score, 0);
});

test("detectAttendanceCheck: Q0 con respuesta no-string → NO asistió", () => {
  const cfg = makeConfig();
  const r = detectAttendanceCheck({
    surveyConfig: cfg,
    responses: { [Q0_ID]: 42 },
  });
  assert.equal(r.attended, false);
  assert.equal(r.optionId, null);
  assert.equal(r.score, 0);
});

test("detectAttendanceCheck: Q0 con respuesta string vacía → NO asistió", () => {
  const cfg = makeConfig();
  const r = detectAttendanceCheck({
    surveyConfig: cfg,
    responses: { [Q0_ID]: "" },
  });
  assert.equal(r.attended, false);
  assert.equal(r.optionId, null);
  assert.equal(r.score, 0);
});

// ────────────────────────────────────────────────────────────
// Múltiples Q0 (caso raro, pero válido)
// ────────────────────────────────────────────────────────────

test("detectAttendanceCheck: múltiples Q0 → toma la primera marcada isAttendanceCheck", () => {
  const cfg = {
    questions: [
      {
        id: "q0_first",
        type: "buttons",
        isAttendanceCheck: true,
        options: [{ id: "yes", title: "Sí", score: 10 }],
      },
      {
        id: "q0_second",
        type: "buttons",
        isAttendanceCheck: true,
        options: [{ id: "yes", title: "Sí", score: 10 }],
      },
    ],
  };
  const r = detectAttendanceCheck({
    surveyConfig: cfg,
    responses: { q0_first: "yes", q0_second: "yes" },
  });
  // Toma la primera (find retorna el primer match).
  assert.equal(r.attended, true);
  assert.equal(r.questionId, "q0_first");
});

test("detectAttendanceCheck: Q0 con score negativo → NO asistió (asumimos score > 0)", () => {
  const cfg = {
    questions: [
      {
        id: Q0_ID,
        type: "buttons",
        isAttendanceCheck: true,
        options: [
          { id: "strange", title: "Extraño", score: -5 },
        ],
      },
    ],
  };
  const r = detectAttendanceCheck({
    surveyConfig: cfg,
    responses: { [Q0_ID]: "strange" },
  });
  assert.equal(r.attended, false);
  assert.equal(r.optionId, "strange");
  assert.equal(r.score, -5);
});
