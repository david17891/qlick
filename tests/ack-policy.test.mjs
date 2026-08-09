import { test } from "node:test";
import assert from "node:assert/strict";
import { buildContextualAck } from "../src/lib/whatsapp/ack-policy.ts";

test("ACK: registro completo cierra sin insistir con el pago", () => {
  const result = buildContextualAck({
    firstName: "Melec",
    registrationComplete: true,
    paymentPending: true,
    awaitingField: null,
    lastOutboundBody: "Hola Melec, ¿quieres completar tu pago?",
  });

  assert.equal(result.reason, "registration_complete");
  assert.match(result.body, /registro ya está confirmado/i);
  assert.doesNotMatch(result.body, /enlace de pago|aparta aquí/i);
});

test("ACK: pago pendiente después de un prompt de pago no repite el enlace", () => {
  const result = buildContextualAck({
    firstName: "Otilio",
    registrationComplete: false,
    paymentPending: true,
    awaitingField: null,
    lastOutboundBody: "¿Quieres que te ayude a completar tu pago? Puedo reenviarte los datos.",
  });

  assert.equal(result.reason, "payment_pending_repeat_guard");
  assert.doesNotMatch(result.body, /enlace de pago|aparta aquí/i);
});

test("ACK: captura el campo pendiente sin pasar por el LLM", () => {
  const result = buildContextualAck({
    registrationComplete: false,
    paymentPending: false,
    awaitingField: "email",
  });

  assert.equal(result.reason, "awaiting_email");
  assert.match(result.body, /solo me falta tu correo/i);
});
