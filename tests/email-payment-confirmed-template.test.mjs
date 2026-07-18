/**
 * Tests del template `payment-confirmed` (reauditoria XSS 2026-07-18).
 *
 * Verifica:
 * - Subject escapa inyeccion en eventTitle.
 * - Body escapa inyeccion en eventTitle.
 * - methodLabel default no devuelve input raw (XSS via methodLabel).
 * - Filas condicionales (location, notes) se omiten si null.
 *
 * Corre con:
 *   node --experimental-strip-types --test tests/email-payment-confirmed-template.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";

const baseInput = {
  attendeeName: "Por",
  attendeeEmail: "david@example.com",
  eventTitle: "Marketing + IA",
  eventStartsAt: "2026-07-21T18:00:00.000Z",
  eventLocation: "CDMX",
  paymentMethod: "card",
  amountMXN: 1000,
  currency: "MXN",
};

test("renderPaymentConfirmedEmail: subject usa eventTitle escapado", async () => {
  const { renderPaymentConfirmedEmail } = await import(
    "../src/lib/email/templates/payment-confirmed.ts"
  );
  const result = renderPaymentConfirmedEmail({
    ...baseInput,
    eventTitle: "</title><script>alert(1)</script>",
  });
  // El subject NO debe contener literal "</title>" ni "<script>".
  assert.doesNotMatch(result.subject, /<\/title>/);
  assert.doesNotMatch(result.subject, /<script>/);
  // Debe contener la version escapada.
  assert.match(result.subject, /&lt;\/title&gt;/);
  assert.match(result.subject, /&lt;script&gt;/);
});

test("renderPaymentConfirmedEmail: body escapa inyeccion en eventTitle", async () => {
  const { renderPaymentConfirmedEmail } = await import(
    "../src/lib/email/templates/payment-confirmed.ts"
  );
  const result = renderPaymentConfirmedEmail({
    ...baseInput,
    eventTitle: '"><img src=x onerror=alert(1)>',
  });
  // El body NO debe contener tags HTML crudos del payload.
  // (El texto 'src=x onerror' aparece en el escape '&lt;img src=x...&gt;'
  // pero los delimitadores de tag DEBEN estar escapados.)
  assert.doesNotMatch(result.html, /<img/);
  assert.doesNotMatch(result.html, /<\/img/);
  // Y los delimitadores de tag DEBEN estar escapados.
  assert.match(result.html, /&lt;img/);
  assert.match(result.html, /&gt;/);
  assert.match(result.html, /&quot;/);
});

test("renderPaymentConfirmedEmail: methodLabel default no devuelve input raw", async () => {
  const { renderPaymentConfirmedEmail } = await import(
    "../src/lib/email/templates/payment-confirmed.ts"
  );
  const result = renderPaymentConfirmedEmail({
    ...baseInput,
    // Metodo NO esta en el switch (card/oxxo/spei/cash/transfer).
    paymentMethod: '<script>alert("method")</script>',
  });
  // El body debe mostrar "Otro" (label seguro), NO el input raw.
  assert.doesNotMatch(result.html, /<script>alert/);
  assert.match(result.html, /Otro/);
});

test("renderPaymentConfirmedEmail: subject incluye eventTitle sin PII (no name ni email)", async () => {
  const { renderPaymentConfirmedEmail } = await import(
    "../src/lib/email/templates/payment-confirmed.ts"
  );
  const result = renderPaymentConfirmedEmail(baseInput);
  assert.match(result.subject, /Pago confirmado/);
  assert.doesNotMatch(result.subject, /Por/);
  assert.doesNotMatch(result.subject, /david@example\.com/);
});

test("renderPaymentConfirmedEmail: location null se omite", async () => {
  const { renderPaymentConfirmedEmail } = await import(
    "../src/lib/email/templates/payment-confirmed.ts"
  );
  const result = renderPaymentConfirmedEmail({
    ...baseInput,
    eventLocation: null,
  });
  assert.doesNotMatch(result.html, /Lugar:/);
});

test("renderPaymentConfirmedEmail: notes null se omite", async () => {
  const { renderPaymentConfirmedEmail } = await import(
    "../src/lib/email/templates/payment-confirmed.ts"
  );
  const result = renderPaymentConfirmedEmail({
    ...baseInput,
    notes: null,
  });
  assert.doesNotMatch(result.html, /Notas del equipo/);
});

test("renderPaymentConfirmedEmail: notes con XSS se escapan", async () => {
  const { renderPaymentConfirmedEmail } = await import(
    "../src/lib/email/templates/payment-confirmed.ts"
  );
  const result = renderPaymentConfirmedEmail({
    ...baseInput,
    notes: '<script>alert("notes")</script>',
  });
  assert.doesNotMatch(result.html, /<script>alert/);
  assert.match(result.html, /&lt;script&gt;/);
});
