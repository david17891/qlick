/**
 * Tests del auth gate para endpoints de Vercel Cron.
 *
 * Cubre `checkCronAuth()` extraído a `src/lib/api/cron-auth.ts`:
 *   - CRON_SECRET vacío → pasa (modo dev).
 *   - CRON_SECRET seteada + Bearer correcto → ok.
 *   - CRON_SECRET seteada + Bearer incorrecto → 401.
 *   - CRON_SECRET seteada + sin Authorization → 401.
 *   - Case-sensitivity del prefijo Bearer.
 *   - Bearer con contenido extra (whitespace, token adicional) → 401.
 *
 * Patrón: `node --test`, sin libs externas.
 */

// @ts-check

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { checkCronAuth } from "../src/lib/api/cron-auth.ts";

/* ─────────────────────────────────────────────────────────────
 * Helpers
 * ───────────────────────────────────────────────────────────── */

function mockRequest(headers = {}) {
  return new Request("http://localhost/api/cron/test", { headers });
}

/** Snapshot/restore de process.env.CRON_SECRET. */
let originalCronSecret;

before(() => {
  originalCronSecret = process.env.CRON_SECRET;
});

after(() => {
  if (originalCronSecret === undefined) {
    delete process.env.CRON_SECRET;
  } else {
    process.env.CRON_SECRET = originalCronSecret;
  }
});

beforeEach(() => {
  // Default para cada test: sin secret. Cada test que quiera secret lo setea.
  delete process.env.CRON_SECRET;
});

/* ─────────────────────────────────────────────────────────────
 * Tests
 * ───────────────────────────────────────────────────────────── */

test("CRON_SECRET no seteada → pasa (modo dev)", () => {
  delete process.env.CRON_SECRET;
  const req = mockRequest(); // sin Authorization
  const result = checkCronAuth(req);
  assert.equal(result.ok, true);
});

test("CRON_SECRET no seteada + Authorization random → pasa (modo dev)", () => {
  delete process.env.CRON_SECRET;
  const req = mockRequest({ authorization: "Bearer algo" });
  const result = checkCronAuth(req);
  assert.equal(result.ok, true);
});

test("CRON_SECRET seteada + Bearer correcto → ok", () => {
  process.env.CRON_SECRET = "test_secret_64chars_xxx";
  const req = mockRequest({ authorization: "Bearer test_secret_64chars_xxx" });
  const result = checkCronAuth(req);
  assert.equal(result.ok, true);
});

test("CRON_SECRET seteada + Bearer incorrecto → 401", () => {
  process.env.CRON_SECRET = "test_secret_64chars_xxx";
  const req = mockRequest({ authorization: "Bearer wrong_secret" });
  const result = checkCronAuth(req);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 401);
    assert.equal(result.error, "unauthorized");
  }
});

test("CRON_SECRET seteada + sin header Authorization → 401", () => {
  process.env.CRON_SECRET = "test_secret_64chars_xxx";
  const req = mockRequest(); // sin headers
  const result = checkCronAuth(req);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 401);
  }
});

test("CRON_SECRET seteada + prefix BEARER en mayuscula → 401 (case-sensitive)", () => {
  process.env.CRON_SECRET = "test_secret_64chars_xxx";
  const req = mockRequest({ authorization: "BEARER test_secret_64chars_xxx" });
  const result = checkCronAuth(req);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 401);
  }
});

test("CRON_SECRET seteada + Bearer con whitespace extra → 401", () => {
  process.env.CRON_SECRET = "test_secret_64chars_xxx";
  const req = mockRequest({
    authorization: "Bearer  test_secret_64chars_xxx", // 2 spaces
  });
  const result = checkCronAuth(req);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 401);
  }
});

test("CRON_SECRET seteada + Bearer con token adicional → 401", () => {
  process.env.CRON_SECRET = "test_secret_64chars_xxx";
  const req = mockRequest({
    authorization: "Bearer test_secret_64chars_xxx extra",
  });
  const result = checkCronAuth(req);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 401);
  }
});

test("CRON_SECRET con caracteres especiales + Bearer correcto → ok", () => {
  // Vercel CRON_SECRET fue generado como 64-char hex; cubre caso hex válido.
  process.env.CRON_SECRET =
    "a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd";
  const req = mockRequest({
    authorization: `Bearer ${process.env.CRON_SECRET}`,
  });
  const result = checkCronAuth(req);
  assert.equal(result.ok, true);
});