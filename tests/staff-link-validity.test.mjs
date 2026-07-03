/**
 * Unit tests para isLinkValid (logica pura de validacion de staff links).
 *
 * Cubre los 4 caminos:
 *   1. Link OK (vigente, no revocado) → ok
 *   2. Link revocado → revoked
 *   3. Link con valid_from en el futuro → not_yet_valid
 *   4. Link con valid_until en el pasado → expired
 *
 * `now` es inyectable para tests deterministas (no usamos Date.now()).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { isLinkValid } from "../src/lib/staff/links.ts";

const NOW = new Date("2026-07-03T15:00:00.000Z").getTime();
const HOUR_MS = 60 * 60 * 1000;

function makeLink(overrides) {
  return {
    revokedAt: overrides.revokedAt ?? null,
    validFrom: overrides.validFrom ?? new Date(NOW - HOUR_MS).toISOString(),
    validUntil:
      overrides.validUntil ?? new Date(NOW + HOUR_MS).toISOString(),
  };
}

test("isLinkValid: link vigente → ok", () => {
  const link = makeLink({});
  const result = isLinkValid(link, NOW);
  assert.deepEqual(result, { ok: true });
});

test("isLinkValid: link revocado → revoked", () => {
  const link = makeLink({
    revokedAt: new Date(NOW - 5 * 60 * 1000).toISOString(), // hace 5 min
  });
  const result = isLinkValid(link, NOW);
  assert.deepEqual(result, { ok: false, reason: "revoked" });
});

test("isLinkValid: link revocado pero todavía vigente → revoked (prioridad)", () => {
  // Aunque la ventana esté abierta, si está revocado, revoked gana.
  const link = makeLink({
    revokedAt: new Date(NOW).toISOString(),
  });
  const result = isLinkValid(link, NOW);
  assert.deepEqual(result, { ok: false, reason: "revoked" });
});

test("isLinkValid: valid_from en el futuro → not_yet_valid", () => {
  const link = makeLink({
    validFrom: new Date(NOW + HOUR_MS).toISOString(), // 1h en el futuro
    validUntil: new Date(NOW + 2 * HOUR_MS).toISOString(),
  });
  const result = isLinkValid(link, NOW);
  assert.deepEqual(result, { ok: false, reason: "not_yet_valid" });
});

test("isLinkValid: valid_until en el pasado → expired", () => {
  const link = makeLink({
    validFrom: new Date(NOW - 2 * HOUR_MS).toISOString(),
    validUntil: new Date(NOW - HOUR_MS).toISOString(), // 1h en el pasado
  });
  const result = isLinkValid(link, NOW);
  assert.deepEqual(result, { ok: false, reason: "expired" });
});

test("isLinkValid: now == valid_from → ok (inclusivo)", () => {
  // El límite inferior es inclusivo (now >= valid_from).
  const link = makeLink({
    validFrom: new Date(NOW).toISOString(),
    validUntil: new Date(NOW + HOUR_MS).toISOString(),
  });
  const result = isLinkValid(link, NOW);
  assert.deepEqual(result, { ok: true });
});

test("isLinkValid: now == valid_until → expired (exclusivo)", () => {
  // El límite superior es exclusivo (now < valid_until).
  // Si now == valid_until, el link ya expiró.
  const link = makeLink({
    validFrom: new Date(NOW - HOUR_MS).toISOString(),
    validUntil: new Date(NOW).toISOString(),
  });
  const result = isLinkValid(link, NOW);
  assert.deepEqual(result, { ok: false, reason: "expired" });
});

test("isLinkValid: 1ms antes de valid_until → ok", () => {
  const link = makeLink({
    validFrom: new Date(NOW - HOUR_MS).toISOString(),
    validUntil: new Date(NOW + 1).toISOString(), // 1ms en el futuro
  });
  const result = isLinkValid(link, NOW);
  assert.deepEqual(result, { ok: true });
});