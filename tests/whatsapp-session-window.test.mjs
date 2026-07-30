import { test } from "node:test";
import assert from "node:assert/strict";
import { getWhatsAppSessionWindow } from "../src/lib/whatsapp/session-window.ts";

const now = new Date("2026-07-30T12:00:00.000Z");

test("WhatsApp 24h: una respuesta reciente abre la ventana", () => {
  const result = getWhatsAppSessionWindow("2026-07-30T11:59:59.000Z", now);
  assert.equal(result.state, "open");
  assert.equal(result.openUntil, "2026-07-31T11:59:59.000Z");
});

test("WhatsApp 24h: después de 24 horas exige plantilla", () => {
  const result = getWhatsAppSessionWindow("2026-07-29T11:59:59.000Z", now);
  assert.equal(result.state, "closed");
});

test("WhatsApp 24h: sin inbound no se permite asumir una ventana abierta", () => {
  const result = getWhatsAppSessionWindow(null, now);
  assert.equal(result.state, "unknown");
  assert.equal(result.openUntil, null);
});
