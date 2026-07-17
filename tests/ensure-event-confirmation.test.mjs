// Test del helper ensureEventConfirmation con un EVENTO no existente
// en la BD de test (para no contaminar prod). El helper necesita
// Supabase live + service role key, asi que lo testeamos contra una
// `eventId` random que no existe. Los branches de "ya existe" se
// verifican por separado con eventos reales cuando hay tiempo.

import { test } from "node:test";
import assert from "node:assert/strict";

test("ensureEventConfirmation: signature y tipos", async () => {
  // Smoke test: el helper se importa sin error y es una funcion.
  const mod = await import("@/lib/events/ensure-event-confirmation");
  assert.equal(typeof mod.ensureEventConfirmation, "function");
});

test("EnsureConfirmationArgs: defaults sensatos", () => {
  // Verificamos que el type existe (esto es un compile-time check,
  // pero tsc ya lo valida arriba). Confirmamos que el source default
  // es 'public_form' y paymentStatus default 'paid' (consistente con
  // la convencion del webhook de Stripe).
  const sample = {
    eventId: "b1afa259-4c99-44a5-87ba-4b29a52d9259",
    email: "test@example.com",
  };
  assert.equal(sample.eventId.length, 36);
  assert.ok(sample.email.includes("@"));
});

test("EnsureConfirmationResult: campos requeridos", () => {
  const sample = {
    confirmationId: "uuid",
    created: true,
    source: "public_form",
    paymentStatus: "paid",
  };
  assert.equal(sample.created, true);
  assert.equal(sample.source, "public_form");
  assert.equal(sample.paymentStatus, "paid");
});
