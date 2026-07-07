/**
 * Tests del formatter de fechas de eventos (src/lib/datetime.ts).
 *
 * FIX 2026-07-07 (sesión David, "bot pone 17:00 UTC cuando admin escribió
 * 10:00"): antes `formatHumanDate` usaba `getUTCHours()` con sufijo "(UTC)".
 * Como el admin escribe hora local del navegador (Phoenix, UTC-7) y la DB
 * guarda timestamptz UTC, formatear con UTC mostraba la hora convertida a
 * UTC (17:00) en vez de la hora que el admin escribió (10:00).
 *
 * Estos tests verifican que la zona horaria del proyecto (`America/Phoenix`)
 * se usa consistentemente y que un evento guardado como `17:00Z` (que es
 * 10:00 hora Phoenix) se formatea correctamente como "10:00 hrs (hora
 * Pacífico)".
 *
 * Corre con:
 *   node --experimental-strip-types --test tests/datetime.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  EVENT_TIMEZONE,
  EVENT_TIMEZONE_LABEL,
  formatEventDateOnly,
  formatEventTimeOnly,
  formatEventDateTimeWithZone,
} from "../src/lib/datetime.ts";

// ─────────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────────

test("EVENT_TIMEZONE es America/Phoenix (UTC-7 sin DST)", () => {
  assert.equal(EVENT_TIMEZONE, "America/Phoenix");
});

test("EVENT_TIMEZONE_LABEL es 'hora Pacífico'", () => {
  assert.equal(EVENT_TIMEZONE_LABEL, "hora Pacífico");
});

// ─────────────────────────────────────────────────────────────────
// formatEventDateOnly
// ─────────────────────────────────────────────────────────────────

test("formatEventDateOnly: 17:00 UTC del 11 jul se ve como 11 jul en Pacífico", () => {
  // 2026-07-11T17:00:00Z = 2026-07-11T10:00 hora Phoenix (UTC-7)
  const out = formatEventDateOnly("2026-07-11T17:00:00.000Z");
  assert.match(out, /11 de julio de 2026/, `esperaba día 11 de julio, recibí: ${out}`);
});

test("formatEventDateOnly: input vacío devuelve '—'", () => {
  assert.equal(formatEventDateOnly(""), "—");
  assert.equal(formatEventDateOnly(null), "—");
  assert.equal(formatEventDateOnly(undefined), "—");
});

test("formatEventDateOnly: input inválido devuelve el string original como fallback", () => {
  assert.equal(formatEventDateOnly("not-a-date"), "not-a-date");
});

// ─────────────────────────────────────────────────────────────────
// formatEventTimeOnly
// ─────────────────────────────────────────────────────────────────

test("formatEventTimeOnly: 17:00 UTC se ve como 10:00 hora Phoenix", () => {
  // Caso del bug: admin escribió 10:00, DB guardó 17:00 UTC, formato debe
  // recuperar las 10:00 de la zona del evento.
  const out = formatEventTimeOnly("2026-07-11T17:00:00.000Z");
  assert.equal(out, "10:00");
});

test("formatEventTimeOnly: 00:30 UTC del 11 jul se ve como 17:30 del 10 jul (Phoenix)", () => {
  // Caso cerca de medianoche UTC que era el hydration mismatch original.
  const out = formatEventTimeOnly("2026-07-11T00:30:00.000Z");
  assert.equal(out, "17:30");
});

test("formatEventTimeOnly: input vacío devuelve string vacío", () => {
  assert.equal(formatEventTimeOnly(""), "");
  assert.equal(formatEventTimeOnly(null), "");
});

// ─────────────────────────────────────────────────────────────────
// formatEventDateTimeWithZone (el que usa el bot)
// ─────────────────────────────────────────────────────────────────

test("formatEventDateTimeWithZone: caso del bug de David — 10:00 hora admin = '10:00 hrs (hora Pacífico)'", () => {
  // admin escribió 2026-07-11 10:00 → DB guardó 2026-07-11T17:00:00Z
  // el bot DEBE mostrar 10:00 hora Pacífico, NO 17:00 UTC.
  const out = formatEventDateTimeWithZone("2026-07-11T17:00:00.000Z");
  assert.equal(out, "11 de julio de 2026, 10:00 hrs (hora Pacífico)");
});

test("formatEventDateTimeWithZone: NO contiene '(UTC)' — bug original eliminado", () => {
  const out = formatEventDateTimeWithZone("2026-07-11T17:00:00.000Z");
  assert.doesNotMatch(out, /\(UTC\)/, `el sufijo '(UTC)' ya no debería aparecer: ${out}`);
});

test("formatEventDateTimeWithZone: input null devuelve '—'", () => {
  assert.equal(formatEventDateTimeWithZone(null), "—");
});

test("formatEventDateTimeWithZone: input vacío devuelve '—'", () => {
  assert.equal(formatEventDateTimeWithZone(""), "—");
});

test("formatEventDateTimeWithZone: input Date se convierte correctamente", () => {
  const out = formatEventDateTimeWithZone(new Date("2026-07-11T17:00:00.000Z"));
  assert.equal(out, "11 de julio de 2026, 10:00 hrs (hora Pacífico)");
});

test("formatEventDateTimeWithZone: input inválido devuelve el string original", () => {
  assert.equal(formatEventDateTimeWithZone("not-a-date"), "not-a-date");
});

test("formatEventDateTimeWithZone: minutos con padding cero", () => {
  // 17:05 UTC → 10:05 hora Phoenix
  const out = formatEventDateTimeWithZone("2026-07-11T17:05:00.000Z");
  assert.match(out, /10:05 hrs/, `esperaba 10:05 con padding: ${out}`);
});

test("formatEventDateTimeWithZone: cruza medianoche UTC y se queda en día anterior (Phoenix)", () => {
  // 03:00 UTC del 11 jul = 20:00 hora Phoenix del 10 jul
  const out = formatEventDateTimeWithZone("2026-07-11T03:00:00.000Z");
  assert.match(out, /10 de julio de 2026/);
  assert.match(out, /20:00 hrs/);
});