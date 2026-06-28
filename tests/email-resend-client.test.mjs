/**
 * Tests del wrapper de Resend (src/lib/email/resend-client.ts).
 *
 * Cubre los paths sin red:
 * - Dev mode sin API key → log + ok (no se intenta enviar).
 * - Prod sin API key → error (no se intenta enviar).
 * - Prod sin RESEND_FROM_ADDRESS → error.
 * - to vacío → error (no recipients).
 * - to CSV string → normaliza a array trimmed.
 * - to array con strings vacíos → filtra.
 *
 * Para tests con API key real / mock del SDK, ver docs/SMTP_SETUP.md y
 * tests/email-resend-client-integration.test.mjs (placeholder para Fase 5
 * Bloque 1 commit 3 cuando David confirme setup de Resend).
 *
 * Corre con:
 *   node --experimental-strip-types --test tests/email-resend-client.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// IMPORTANTE: setear env ANTES de importar el módulo, porque el wrapper
// lazy-inits el cliente de Resend al primer uso, no al import.
const ORIGINAL_ENV = { ...process.env };

function resetEnv() {
  process.env = { ...ORIGINAL_ENV };
}

test("sendEmail: dev mode sin API key → ok + mode='dev'", async () => {
  resetEnv();
  process.env.NODE_ENV = "development";
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_FROM_ADDRESS;

  const { sendEmail } = await import("../src/lib/email/resend-client.ts");
  const result = await sendEmail({
    to: "test@example.com",
    subject: "Hola dev",
    html: "<p>x</p>",
  });
  assert.equal(result.ok, true);
  assert.equal(result.mode, "dev");
  assert.equal(result.id, undefined);
});

test("sendEmail: prod sin API key → error + mode='prod'", async () => {
  resetEnv();
  process.env.NODE_ENV = "production";
  delete process.env.RESEND_API_KEY;
  process.env.RESEND_FROM_ADDRESS = "no-reply@qlick.marketing";

  const { sendEmail } = await import("../src/lib/email/resend-client.ts");
  const result = await sendEmail({
    to: "test@example.com",
    subject: "Hola prod sin key",
    html: "<p>x</p>",
  });
  assert.equal(result.ok, false);
  assert.equal(result.mode, "prod");
  assert.match(result.error ?? "", /RESEND_API_KEY/);
});

test("sendEmail: prod con API key pero sin FROM → error", async () => {
  resetEnv();
  process.env.NODE_ENV = "production";
  process.env.RESEND_API_KEY = "re_test_key_xxx";
  delete process.env.RESEND_FROM_ADDRESS;

  const { sendEmail } = await import("../src/lib/email/resend-client.ts");
  const result = await sendEmail({
    to: "test@example.com",
    subject: "Sin from",
    html: "<p>x</p>",
  });
  assert.equal(result.ok, false);
  assert.equal(result.mode, "prod");
  assert.match(result.error ?? "", /RESEND_FROM_ADDRESS/);
});

test("sendEmail: to vacío (string vacío) → error", async () => {
  resetEnv();
  process.env.NODE_ENV = "development";
  delete process.env.RESEND_API_KEY;

  const { sendEmail } = await import("../src/lib/email/resend-client.ts");
  const result = await sendEmail({
    to: "",
    subject: "Sin destinatario",
    html: "<p>x</p>",
  });
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /empty/i);
});

test("sendEmail: to array con un solo string vacío → filtra y devuelve error", async () => {
  resetEnv();
  process.env.NODE_ENV = "development";
  delete process.env.RESEND_API_KEY;

  const { sendEmail } = await import("../src/lib/email/resend-client.ts");
  const result = await sendEmail({
    to: ["", "  ", undefined],
    subject: "Sin destinatario valido",
    html: "<p>x</p>",
  });
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /empty/i);
});

test("sendEmail: CSV string con espacios → normaliza a array trimmed", async () => {
  resetEnv();
  process.env.NODE_ENV = "development";
  delete process.env.RESEND_API_KEY;

  const { sendEmail } = await import("../src/lib/email/resend-client.ts");

  // Capturar console.log para verificar que los recipients están normalizados.
  const originalLog = console.log;
  let captured = "";
  console.log = (...args) => {
    captured += args.join(" ") + "\n";
  };

  try {
    await sendEmail({
      to: "  a@example.com , b@example.com  ,, c@example.com",
      subject: "CSV",
      html: "<p>x</p>",
    });
  } finally {
    console.log = originalLog;
  }

  // El log debe mostrar los 3 emails normalizados, sin strings vacíos.
  assert.match(captured, /a@example\.com/);
  assert.match(captured, /b@example\.com/);
  assert.match(captured, /c@example\.com/);
  assert.doesNotMatch(captured, /,,/);
});