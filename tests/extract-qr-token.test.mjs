/**
 * Unit tests para extractQrToken.
 *
 * Cubre los 2 formatos que puede codificar el QR:
 *   1. URL completa: https://qlick.mx/check-in/<token>
 *   2. Solo el token: <20-40 chars base64url>
 *
 * Casos extra: trailing slash, query params, fragment, espacios, raw basura.
 *
 * Defense in depth (FIX 2026-07-03 "QR no encontrado"): casos con
 * `.png` suffix pegado al token, de generaciones viejas del endpoint
 * `/api/event-qr/[token].png`.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractQrToken,
  stripQrTokenExtension,
} from "../src/lib/staff/qr-token.ts";

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

// ───────────────────────────────────────────────────────────────────
// Defense in depth: stripQrTokenExtension
// (FIX 2026-07-03 "QR no encontrado" — QRs viejos con `.png` pegado)
// ───────────────────────────────────────────────────────────────────

test("stripQrTokenExtension: remueve .png al final", () => {
  assert.equal(stripQrTokenExtension("abc123.png"), "abc123");
});

test("stripQrTokenExtension: remueve .json y .html al final", () => {
  assert.equal(stripQrTokenExtension("abc123.json"), "abc123");
  assert.equal(stripQrTokenExtension("abc123.html"), "abc123");
});

test("stripQrTokenExtension: deja el string igual si no termina en extension", () => {
  assert.equal(stripQrTokenExtension("abc123"), "abc123");
  assert.equal(stripQrTokenExtension("abc.123"), "abc.123"); // punto en medio, no final
  assert.equal(stripQrTokenExtension(""), "");
});

test("stripQrTokenExtension: solo remueve 1 extension (no multiples)", () => {
  // `abc.png.json` no es un caso real, pero documentamos que no es recursivo.
  assert.equal(stripQrTokenExtension("abc.png.json"), "abc.png");
});

// ───────────────────────────────────────────────────────────────────
// extractQrToken + .png suffix (defense in depth)
// ───────────────────────────────────────────────────────────────────

test("extractQrToken: URL con .png suffix al final del path", () => {
  // Simula un QR viejo cacheado que codificaba `/check-in/<token>.png`.
  const token = "abcDEF123_-xyzABC456_-";
  const result = extractQrToken(`https://qlick.digital/check-in/${token}.png`);
  assert.equal(result, token);
});

test("extractQrToken: URL con .png suffix + query params", () => {
  const token = "abcDEF123_-xyzABC456_-";
  const result = extractQrToken(
    `https://qlick.digital/check-in/${token}.png?utm_source=qr`,
  );
  assert.equal(result, token);
});

test("extractQrToken: solo el token con .png suffix (manual)", () => {
  // Si el staff tipea manualmente `<token>.png` en el fallback input.
  const token = "abcDEF123_-xyzABC456_-";
  const result = extractQrToken(`${token}.png`);
  assert.equal(result, token);
});

test("extractQrToken: URL con .json suffix (defensiva, ruta alternativa)", () => {
  const token = "abcDEF123_-xyzABC456_-";
  const result = extractQrToken(`https://qlick.digital/check-in/${token}.json`);
  assert.equal(result, token);
});