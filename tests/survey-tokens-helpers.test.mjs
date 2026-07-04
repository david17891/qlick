/**
 * Unit tests para survey-tokens.
 *
 * FIX 2026-07-03 (sesion David G-4): la pieza que faltaba para cerrar
 * el funnel post-evento es la ruta publica /encuesta/[token]. Esta
 * suite cubre las funciones puras (no toca DB).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { isSurveyTokenExpired } from "../src/lib/events/survey-token-expiry.ts";

// ─────────────────────────────────────────────────────────────
// isSurveyTokenExpired
// ─────────────────────────────────────────────────────────────

test("isSurveyTokenExpired: fecha futura devuelve false (vigente)", () => {
  const future = new Date(Date.now() + 60_000).toISOString();
  assert.equal(isSurveyTokenExpired(future), false);
});

test("isSurveyTokenExpired: fecha pasada devuelve true (expirado)", () => {
  const past = new Date(Date.now() - 60_000).toISOString();
  assert.equal(isSurveyTokenExpired(past), true);
});

test("isSurveyTokenExpired: si expires_at == nowMs estricto devuelve false (no cross threshold)", () => {
  // Boundary: < es estricto. Si expires_at === nowMs, no esta expirado todavia.
  const nowMs = 1_700_000_000_000;
  const expiresAtIso = new Date(nowMs).toISOString();
  assert.equal(isSurveyTokenExpired(expiresAtIso, nowMs), false);
});

test("isSurveyTokenExpired: 1ms antes del nowMs devuelve true (ya expirado)", () => {
  const nowMs = 1_700_000_000_000;
  const expiresAtIso = new Date(nowMs - 1).toISOString();
  assert.equal(isSurveyTokenExpired(expiresAtIso, nowMs), true);
});

test("isSurveyTokenExpired: 1ms despues del nowMs devuelve false (todavia vigente)", () => {
  const nowMs = 1_700_000_000_000;
  const expiresAtIso = new Date(nowMs + 1).toISOString();
  assert.equal(isSurveyTokenExpired(expiresAtIso, nowMs), false);
});

test("isSurveyTokenExpired: soporta Date.now override", () => {
  const fixedNow = 1_700_000_000_000;
  const before = new Date(fixedNow - 100).toISOString();
  const after = new Date(fixedNow + 100).toISOString();
  assert.equal(isSurveyTokenExpired(before, fixedNow), true);
  assert.equal(isSurveyTokenExpired(after, fixedNow), false);
});
