/**
 * Tests para `phone-utils.ts`.
 *
 * Corre con `node --test` (built-in, sin framework externo).
 *   node --test tests/phone-utils.test.mjs
 *
 * Cobertura: 10+ formatos de teléfono MX + edge cases (null, vacío,
 * formatos no-MX, separadores varios, prefijos legacy).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePhone, phonesMatch, isValidMxPhone } from "../src/lib/crm/phone-utils.ts";

test("normalizePhone: 10 dígitos sin código de país", () => {
  assert.equal(normalizePhone("3312345678"), "+523312345678");
  assert.equal(normalizePhone("55 1234 5678"), "+525512345678"); // con espacios
  assert.equal(normalizePhone("55-1234-5678"), "+525512345678"); // con guiones
  assert.equal(normalizePhone("(33) 1234-5678"), "+523312345678"); // con paréntesis
});

test("normalizePhone: 11 dígitos con 1-prefix (algunos carriers)", () => {
  assert.equal(normalizePhone("13312345678"), "+523312345678");
  assert.equal(normalizePhone("1 33 1234 5678"), "+523312345678");
});

test("normalizePhone: 12 dígitos con 52-prefix (código país)", () => {
  assert.equal(normalizePhone("523312345678"), "+523312345678");
  assert.equal(normalizePhone("52 33 1234 5678"), "+523312345678");
});

test("normalizePhone: 13 dígitos con 521-prefix (legacy mobile)", () => {
  assert.equal(normalizePhone("5213312345678"), "+523312345678");
  assert.equal(normalizePhone("521 33 1234 5678"), "+523312345678");
});

test("normalizePhone: con + explícito", () => {
  assert.equal(normalizePhone("+523312345678"), "+523312345678");
  assert.equal(normalizePhone("+52 33 1234 5678"), "+523312345678");
  assert.equal(normalizePhone("+52 (33) 1234-5678"), "+523312345678");
  assert.equal(normalizePhone("+5213312345678"), "+523312345678");
});

test("normalizePhone: CDMX y otros números reales", () => {
  // Ciudad de México (55)
  assert.equal(normalizePhone("5512345678"), "+525512345678");
  // Guadalajara (33)
  assert.equal(normalizePhone("+523312345678"), "+523312345678");
  // Monterrey (81)
  assert.equal(normalizePhone("81 1234 5678"), "+528112345678");
  // Celular (55 + 9 dígitos)
  assert.equal(normalizePhone("+52 55 1234 5678"), "+525512345678");
});

test("normalizePhone: null/undefined/empty → null", () => {
  assert.equal(normalizePhone(null), null);
  assert.equal(normalizePhone(undefined), null);
  assert.equal(normalizePhone(""), null);
  assert.equal(normalizePhone("   "), null);
  assert.equal(normalizePhone("abc"), null);
  assert.equal(normalizePhone("---"), null);
});

test("normalizePhone: formatos no-reconocibles → null", () => {
  // Número demasiado corto
  assert.equal(normalizePhone("123456"), null);
  // Número demasiado largo
  assert.equal(normalizePhone("12345678901234"), null);
  // Letras o símbolos solos
  assert.equal(normalizePhone("abc"), null);
  // Solo separadores
  assert.equal(normalizePhone("---"), null);
});

test("normalizePhone: limitación conocida — US/CA vs MX ambiguous", () => {
  // LIMITACIÓN: un número US/CA (11 dígitos, empieza con 1, ej. +1 212 555 1234)
  // tiene el MISMO formato que un número MX con 1-prefix legacy. La función
  // no puede distinguirlos sin contexto. El caller debe validar el código
  // de país explícito si le importa (ej. desde un select de país).
  // Este test documenta el comportamiento para no olvidarlo.
  assert.equal(normalizePhone("12125551234"), "+522125551234"); // ambiguous
  assert.equal(normalizePhone("+12125551234"), null); // con +1 explícito SÍ rechaza
});

test("phonesMatch: mismo número en distintos formatos", () => {
  assert.equal(phonesMatch("3312345678", "+52 33 1234 5678"), true);
  assert.equal(phonesMatch("(33) 1234-5678", "+523312345678"), true);
  assert.equal(phonesMatch("5213312345678", "+523312345678"), true);
});

test("phonesMatch: números diferentes", () => {
  assert.equal(phonesMatch("3312345678", "3312345679"), false);
  assert.equal(phonesMatch("+523312345678", "+525512345678"), false);
});

test("phonesMatch: null handling", () => {
  assert.equal(phonesMatch(null, null), true);
  assert.equal(phonesMatch(undefined, undefined), true);
  assert.equal(phonesMatch(null, undefined), true);
  assert.equal(phonesMatch("3312345678", null), false);
  assert.equal(phonesMatch(null, "3312345678"), false);
});

test("phonesMatch: inválido devuelve false (no matchea con nada)", () => {
  assert.equal(phonesMatch("abc", "3312345678"), false);
  assert.equal(phonesMatch("3312345678", "xyz"), false);
  assert.equal(phonesMatch("abc", "xyz"), false);
});

test("isValidMxPhone: detección rápida", () => {
  assert.equal(isValidMxPhone("3312345678"), true);
  assert.equal(isValidMxPhone("+52 33 1234 5678"), true);
  assert.equal(isValidMxPhone(null), false);
  assert.equal(isValidMxPhone(""), false);
  assert.equal(isValidMxPhone("abc"), false);
  assert.equal(isValidMxPhone("123"), false); // muy corto
});
