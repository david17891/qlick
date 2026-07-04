/**
 * Tests del signature gate para el webhook de WhatsApp.
 *
 * Cubre `verifySignature()` y `checkWebhookSignatureGate()` extraídos
 * a `src/lib/whatsapp/webhooks/verify-signature.ts`:
 *   - HMAC SHA256: match, mismatch, hex inválido, longitud distinta.
 *   - Gate: prod sin secret → 503; dev sin secret → skip;
 *           secret set + firma válida → ok; firma inválida → 401;
 *           sin header → 401.
 *
 * Patrón: `node --test`, sin libs externas.
 */

// @ts-check

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import {
  verifySignature,
  checkWebhookSignatureGate,
} from "../src/lib/whatsapp/webhooks/verify-signature.ts";

/* ─────────────────────────────────────────────────────────────
 * Helpers
 * ───────────────────────────────────────────────────────────── */

const TEST_SECRET = "test_webhook_secret_xxx";
const RAW_BODY = JSON.stringify({ entry: [] });
const VALID_HEADER = `sha256=${createHmac("sha256", TEST_SECRET)
  .update(RAW_BODY, "utf8")
  .digest("hex")}`;

function mockRequest(headers = {}) {
  return new Request("http://localhost/api/whatsapp/webhook", { headers });
}

let originalSecret;
let originalNodeEnv;

before(() => {
  originalSecret = process.env.WHATSAPP_WEBHOOK_SECRET;
  originalNodeEnv = process.env.NODE_ENV;
});

after(() => {
  if (originalSecret === undefined) {
    delete process.env.WHATSAPP_WEBHOOK_SECRET;
  } else {
    process.env.WHATSAPP_WEBHOOK_SECRET = originalSecret;
  }
  if (originalNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = originalNodeEnv;
  }
});

beforeEach(() => {
  delete process.env.WHATSAPP_WEBHOOK_SECRET;
  process.env.NODE_ENV = "development";
});

/* ─────────────────────────────────────────────────────────────
 * verifySignature — pure HMAC
 * ───────────────────────────────────────────────────────────── */

test("verifySignature: header sin prefijo sha256= → false", () => {
  const sig = createHmac("sha256", TEST_SECRET).update(RAW_BODY).digest("hex");
  assert.equal(verifySignature(RAW_BODY, sig, TEST_SECRET), false);
});

test("verifySignature: firma válida → true", () => {
  assert.equal(verifySignature(RAW_BODY, VALID_HEADER, TEST_SECRET), true);
});

test("verifySignature: firma con hex random → false", () => {
  const randomHex = "deadbeef".repeat(8); // 64 chars
  assert.equal(
    verifySignature(RAW_BODY, `sha256=${randomHex}`, TEST_SECRET),
    false
  );
});

test("verifySignature: header con longitud distinta al computed → false", () => {
  // Truncar a 32 chars en vez de 64 → mismatch length
  const short = "sha256=deadbeefdeadbeefdeadbeefdeadbeef";
  assert.equal(verifySignature(RAW_BODY, short, TEST_SECRET), false);
});

test("verifySignature: hex inválido (caracteres no-hex) → false (no throw)", () => {
  // 'z' no es hex válido, Buffer.from(hex, 'hex') tira.
  // verifySignature debe capturar y devolver false sin crashear.
  assert.equal(
    verifySignature(RAW_BODY, "sha256=zzznotvalidhex", TEST_SECRET),
    false
  );
});

test("verifySignature: secret distinto al esperado → false", () => {
  // Firma calculada con TEST_SECRET pero validamos con secret distinto
  assert.equal(
    verifySignature(RAW_BODY, VALID_HEADER, "otro_secret_distinto"),
    false
  );
});

test("verifySignature: body distinto al firmado → false", () => {
  const otherBody = JSON.stringify({ entry: [{ different: true }] });
  assert.equal(verifySignature(otherBody, VALID_HEADER, TEST_SECRET), false);
});

/* ─────────────────────────────────────────────────────────────
 * checkWebhookSignatureGate — gate completo
 * ───────────────────────────────────────────────────────────── */

test("gate: prod sin WHATSAPP_WEBHOOK_SECRET → 503 (hard-fail)", () => {
  process.env.NODE_ENV = "production";
  delete process.env.WHATSAPP_WEBHOOK_SECRET;
  const req = mockRequest(); // sin signature
  const result = checkWebhookSignatureGate(req, RAW_BODY);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 503);
    assert.match(result.message, /WHATSAPP_WEBHOOK_SECRET/);
  }
});

test("gate: dev sin WHATSAPP_WEBHOOK_SECRET → ok (skip validación)", () => {
  process.env.NODE_ENV = "development";
  delete process.env.WHATSAPP_WEBHOOK_SECRET;
  const req = mockRequest(); // sin signature
  const result = checkWebhookSignatureGate(req, RAW_BODY);
  assert.equal(result.ok, true);
});

test("gate: secret seteada + firma válida → ok", () => {
  process.env.WHATSAPP_WEBHOOK_SECRET = TEST_SECRET;
  const req = mockRequest({ "x-hub-signature-256": VALID_HEADER });
  const result = checkWebhookSignatureGate(req, RAW_BODY);
  assert.equal(result.ok, true);
});

test("gate: secret seteada + firma inválida → 401", () => {
  process.env.WHATSAPP_WEBHOOK_SECRET = TEST_SECRET;
  const req = mockRequest({
    "x-hub-signature-256": "sha256=deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
  });
  const result = checkWebhookSignatureGate(req, RAW_BODY);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 401);
    assert.match(result.message, /inválida/i);
  }
});

test("gate: secret seteada + sin header X-Hub-Signature-256 → 401", () => {
  process.env.WHATSAPP_WEBHOOK_SECRET = TEST_SECRET;
  const req = mockRequest(); // sin signature
  const result = checkWebhookSignatureGate(req, RAW_BODY);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 401);
    assert.match(result.message, /Falta X-Hub-Signature-256/);
  }
});

test("gate: secret seteada + firma con prefijo incorrecto → 401", () => {
  process.env.WHATSAPP_WEBHOOK_SECRET = TEST_SECRET;
  // Mismo hex válido pero sin el prefijo "sha256="
  const sigWithoutPrefix = VALID_HEADER.replace("sha256=", "");
  const req = mockRequest({ "x-hub-signature-256": sigWithoutPrefix });
  const result = checkWebhookSignatureGate(req, RAW_BODY);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 401);
  }
});