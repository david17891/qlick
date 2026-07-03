/**
 * Unit tests para extractQrToken.
 *
 * Cubre los 2 formatos que puede codificar el QR:
 *   1. URL completa: https://qlick.mx/check-in/<token>
 *   2. Solo el token: <20-40 chars base64url>
 *
 * Casos extra: trailing slash, query params, fragment, espacios, raw basura.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { extractQrToken } from "../src/lib/staff/qr-token.ts";

test("extractQrToken: URL completa con token", () => {
  const token = "abcDEF123_-xyzABC456_-";
  const result = extractQrToken(`https://qlick.mx/check-in/${token}`);
  assert.equal(result, token);
});

test("extractQrToken: URL completa con query params", () => {
  const token = "abcDEF123_-xyzABC456_-";
  const result = extractQrToken(
    `https://qlick.mx/check-in/${token}?utm_source=qr`,
  );
  assert.equal(result, token);
});

test("extractQrToken: URL completa con fragment", () => {
  const token = "abcDEF123_-xyzABC456_-";
  const result = extractQrToken(
    `https://qlick.mx/check-in/${token}#section`,
  );
  assert.equal(result, token);
});

test("extractQrToken: URL con trailing slash", () => {
  const token = "abcDEF123_-xyzABC456_-";
  const result = extractQrToken(`https://qlick.mx/check-in/${token}/`);
  // El regex captura solo hasta el primer slash extra → sigue siendo válido.
  // (Si el staff escanea un QR con trailing slash, no rompe.)
  assert.equal(result, token);
});

test("extractQrToken: solo el token (sin URL)", () => {
  const token = "abcDEF123_-xyzABC456_-";
  const result = extractQrToken(token);
  assert.equal(result, token);
});

test("extractQrToken: ignora espacios en los extremos", () => {
  const token = "abcDEF123_-xyzABC456_-";
  const result = extractQrToken(`  ${token}  `);
  assert.equal(result, token);
});

test("extractQrToken: null si es texto random", () => {
  assert.equal(extractQrToken("hello world"), null);
  assert.equal(extractQrToken("not a qr"), null);
  assert.equal(extractQrToken(""), null);
});

test("extractQrToken: null si es URL sin /check-in/", () => {
  assert.equal(extractQrToken("https://example.com/foo/bar"), null);
  assert.equal(extractQrToken("https://qlick.mx/admin"), null);
});

test("extractQrToken: null si el token es muy corto", () => {
  // < 20 chars no es válido (192 bits entropía = 32 chars).
  assert.equal(extractQrToken("abc123"), null);
});

test("extractQrToken: null si el token tiene chars invalidos", () => {
  // Solo base64url: A-Z, a-z, 0-9, _, -
  assert.equal(extractQrToken("abc.def.ghi"), null);
  assert.equal(extractQrToken("abc def ghi"), null);
});

test("extractQrToken: acepta token de exactamente 20 chars (edge inferior)", () => {
  const token = "a".repeat(20);
  assert.equal(extractQrToken(token), token);
});

test("extractQrToken: acepta token de exactamente 40 chars (edge superior)", () => {
  const token = "a".repeat(40);
  assert.equal(extractQrToken(token), token);
});

test("extractQrToken: null si token es de 41 chars (fuera de rango)", () => {
  const token = "a".repeat(41);
  assert.equal(extractQrToken(token), null);
});