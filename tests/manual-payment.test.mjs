// tests/manual-payment.test.mjs
//
// Tests del sprint pagos-manuales (2026-07-15).
// Sprint pagos-manuales cubre el flow de pagos manuales (efectivo,
// OXXO, SPEI, tarjeta en puerta, transferencia) que NO pasan por el
// webhook de Stripe. La pieza central es el lib
// `src/lib/payments/manual-payment.ts` que se testea aca.
//
// Alcance de este archivo: tests unitarios de la funcion pura
// `detectTokenKind` (shape detection de los tokens por metodo). El
// resto del lib (registerManualPayment, revokeManualPayment) requiere
// mocks de Supabase + Stripe API, que se agregaran en un test de
// integracion aparte cuando se monte el harness.

import test from "node:test";
import assert from "node:assert/strict";

import { detectTokenKind } from "../src/lib/payments/manual-payment.ts";

test("detectTokenKind: method=card reconoce pi_xxx valido", () => {
  assert.equal(detectTokenKind("card", "pi_51TqgUfRXKOh68uzN"), "pi");
  assert.equal(detectTokenKind("card", "pi_a"), "unknown"); // muy corto
  assert.equal(detectTokenKind("card", "pi_ABC123!@#"), "unknown"); // chars invalidos
});

test("detectTokenKind: method=card ignora formatos que no son pi", () => {
  assert.equal(detectTokenKind("card", "1234567890123456"), "unknown"); // parece oxxo
  assert.equal(detectTokenKind("card", "abcdefghij12345678"), "unknown"); // parece clabe
  assert.equal(detectTokenKind("card", null), "unknown");
  assert.equal(detectTokenKind("card", undefined), "unknown");
  assert.equal(detectTokenKind("card", ""), "unknown");
});

test("detectTokenKind: method=oxxo reconoce voucher de 16 digitos", () => {
  assert.equal(detectTokenKind("oxxo", "1234567890123456"), "oxxo_voucher");
  assert.equal(detectTokenKind("oxxo", "  1234567890123456  "), "oxxo_voucher"); // trim
  assert.equal(detectTokenKind("oxxo", "123456789012345"), "unknown"); // 15 digitos
  assert.equal(detectTokenKind("oxxo", "12345678901234567"), "unknown"); // 17 digitos
  assert.equal(detectTokenKind("oxxo", "123456789012345a"), "unknown"); // con letra
});

test("detectTokenKind: method=spei reconoce CLABE (18 dig) y referencia (8-12)", () => {
  assert.equal(detectTokenKind("spei", "012345678901234567"), "spei_clabe");
  assert.equal(detectTokenKind("spei", "12345678"), "spei_reference");
  assert.equal(detectTokenKind("spei", "123456789012"), "spei_reference"); // 12 digitos
  assert.equal(detectTokenKind("spei", "1234567"), "unknown"); // 7 (fuera de rango)
  assert.equal(detectTokenKind("spei", "1234567890123"), "unknown"); // 13 (fuera de rango)
  // Con 18 digitos exactos: clabe gana sobre reference (mas especifico).
  assert.equal(detectTokenKind("spei", "123456789012345678"), "spei_clabe");
});

test("detectTokenKind: method=cash/transfer nunca esperan voucher", () => {
  assert.equal(detectTokenKind("cash", null), "unknown");
  assert.equal(detectTokenKind("cash", "cualquiercosa"), "unknown");
  assert.equal(detectTokenKind("transfer", null), "unknown");
  assert.equal(detectTokenKind("transfer", ""), "unknown");
});

test("detectTokenKind: input null/undefined retorna unknown", () => {
  assert.equal(detectTokenKind("card", null), "unknown");
  assert.equal(detectTokenKind("oxxo", undefined), "unknown");
  assert.equal(detectTokenKind("spei", ""), "unknown");
});
