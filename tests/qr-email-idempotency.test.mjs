import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const qrPassSource = await readFile(
  new URL("../src/lib/email/event-qr-pass.ts", import.meta.url),
  "utf8",
);
const paymentNotifierSource = await readFile(
  new URL("../src/lib/payments/notify-lead-payment-confirmed.ts", import.meta.url),
  "utf8",
);

test("el notifier de pago activa la protección contra QR duplicado", () => {
  assert.match(paymentNotifierSource, /skipIfAlreadySent:\s*true/);
});

test("el helper omite solo si existe un qr_pass exitoso para el evento y correo", () => {
  assert.match(qrPassSource, /skipIfAlreadySent\?: boolean/);
  assert.match(qrPassSource, /from\("event_email_log"\)/);
  assert.match(qrPassSource, /\.eq\("event_id", args\.event\.id\)/);
  assert.match(qrPassSource, /\.eq\("recipient", conf\.email\)/);
  assert.match(qrPassSource, /\.eq\("email_type", "qr_pass"\)/);
  assert.match(qrPassSource, /\.eq\("ok", true\)/);
  assert.match(qrPassSource, /skipped:\s*true/);
});
