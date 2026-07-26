import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const actionSource = await readFile(
  new URL("../src/app/eventos/[slug]/actions.ts", import.meta.url),
  "utf8",
);
const qrPassSource = await readFile(
  new URL("../src/lib/email/event-qr-pass.ts", import.meta.url),
  "utf8",
);

test("public event registration awaits QR email delivery", () => {
  assert.match(actionSource, /const emailResult = await sendQrPassForConfirmation/);
  assert.doesNotMatch(actionSource, /void sendQrPassForConfirmation/);
  assert.match(actionSource, /emailSent === false/);
});

test("event QR email selects reservation checkout when configured", () => {
  assert.match(qrPassSource, /reservation_enabled/);
  assert.match(qrPassSource, /payment_option.*reservation/);
});