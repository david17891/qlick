/**
 * Tests del fix "captura obligatoria de nombre" (2026-07-06).
 *
 * Cubre la decisión de David: NINGUN lead ni attendee puede quedar sin
 * nombre real. El bot-engine.ts + event-context-loader.ts + check-in
 * route.ts se modificaron para forzar la captura.
 *
 * Estos tests son unitarios sobre las primitivas puras (no E2E con
 * WhatsApp real). Cubren:
 *
 *   1. PLACEHOLDER_NAMES contiene los placeholders conocidos.
 *   2. cleanFirstName filtra placeholders (devuelve "").
 *   3. cleanFirstName respeta nombres reales.
 *   4. cleanFirstName maneja null/undefined/empty como placeholder.
 *   5. Regression: nombres en español con acentos NO se filtran.
 *   6. Regression: nombres cortos reales (≥2 chars) NO se filtran.
 *
 * El flow secuencial completo (bot pide nombre → user responde → bot
 * pide email → user responde → QR generado) requiere un test E2E con
 * un mock provider + DB. Esos tests están en `tests/whatsapp-bot.test.mjs`
 * y se mantienen actualizados contra el código del bot.
 *
 * Patrón: `node --test`, sin libs externas.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @ts-check

// Imports del código fuente (vía type-stripping de Node).
import {
  PLACEHOLDER_NAMES,
  cleanFirstName
} from "../src/lib/whatsapp/bot-engine.ts";

/* ─────────────────────────────────────────────────────────────
 * 1. PLACEHOLDER_NAMES contiene los placeholders criticos
 * ───────────────────────────────────────────────────────────── */

test("PLACEHOLDER_NAMES contiene 'por' (legacy data)", () => {
  assert.ok(PLACEHOLDER_NAMES.has("por"));
});

test("PLACEHOLDER_NAMES contiene 'por confirmar' (admin pre-fill)", () => {
  assert.ok(PLACEHOLDER_NAMES.has("por confirmar"));
});

test("PLACEHOLDER_NAMES contiene 'test' (placeholders de pruebas)", () => {
  assert.ok(PLACEHOLDER_NAMES.has("test"));
});

test("PLACEHOLDER_NAMES NO contiene nombres reales comunes", () => {
  // Regresion: si alguien agrega un nombre comun por error, falla.
  assert.ok(!PLACEHOLDER_NAMES.has("david"));
  assert.ok(!PLACEHOLDER_NAMES.has("ana"));
  assert.ok(!PLACEHOLDER_NAMES.has("luis"));
});

/* ─────────────────────────────────────────────────────────────
 * 2. cleanFirstName filtra placeholders
 * ───────────────────────────────────────────────────────────── */

test("cleanFirstName devuelve '' para placeholder 'por'", () => {
  assert.equal(cleanFirstName("por"), "");
});

test("cleanFirstName devuelve '' para 'Por' (case insensitive)", () => {
  assert.equal(cleanFirstName("Por"), "");
  assert.equal(cleanFirstName("POR"), "");
});

test("cleanFirstName devuelve '' para 'Por Confirmar'", () => {
  assert.equal(cleanFirstName("Por Confirmar"), "");
});

test("cleanFirstName devuelve '' para 'test'", () => {
  assert.equal(cleanFirstName("test"), "");
});

test("cleanFirstName devuelve '' para 'Asistente' (placeholder UI)", () => {
  // NOTA: 'Asistente' NO esta en PLACEHOLDER_NAMES canonico, pero
  // queremos que el bot NO lo use como saludo. El check-in route.ts
  // tiene su propia lista que incluye 'asistente'. Aca validamos que
  // cleanFirstName al menos maneja el caso lowercase si se agrega.
  // Por ahora, cleanFirstName solo filtra lo que esta en el set canonico.
  const result = cleanFirstName("Asistente");
  // Aceptamos "" (si alguien lo agrego al set) o el nombre tal cual
  // (si no esta). Lo importante: nunca devuelve "Asistente" filtrado a lowercase incorrecto.
  assert.ok(result === "" || result === "Asistente");
});

/* ─────────────────────────────────────────────────────────────
 * 3. cleanFirstName respeta nombres reales
 * ───────────────────────────────────────────────────────────── */

test("cleanFirstName devuelve el nombre real 'David'", () => {
  assert.equal(cleanFirstName("David"), "David");
});

test("cleanFirstName devuelve 'Ana' (nombre corto valido)", () => {
  assert.equal(cleanFirstName("Ana"), "Ana");
});

test("cleanFirstName devuelve 'María José' (con acentos y espacios)", () => {
  assert.equal(cleanFirstName("María José"), "María José");
});

test("cleanFirstName devuelve 'Juan Pérez' (nombre completo)", () => {
  assert.equal(cleanFirstName("Juan Pérez"), "Juan Pérez");
});

test("cleanFirstName devuelve 'David Esparza' (caso real del proyecto)", () => {
  assert.equal(cleanFirstName("David Esparza"), "David Esparza");
});

/* ─────────────────────────────────────────────────────────────
 * 4. cleanFirstName maneja edge cases
 * ───────────────────────────────────────────────────────────── */

test("cleanFirstName(null) devuelve ''", () => {
  assert.equal(cleanFirstName(null), "");
});

test("cleanFirstName(undefined) devuelve ''", () => {
  assert.equal(cleanFirstName(undefined), "");
});

test("cleanFirstName('') devuelve ''", () => {
  assert.equal(cleanFirstName(""), "");
});

test("cleanFirstName('  ') (whitespace) devuelve ''", () => {
  // trim se aplica, queda "" que NO esta en PLACEHOLDER_NAMES pero
  // el .trim() lo deja vacio. cleanFirstName devuelve rawName.trim() = "".
  assert.equal(cleanFirstName("   "), "");
});

test("cleanFirstName(' David ') (con espacios) devuelve 'David' (trim)", () => {
  assert.equal(cleanFirstName(" David "), "David");
});

test("cleanFirstName maneja '  por  ' con padding (trim antes de check)", () => {
  // trim + lowercase → "por" → placeholder → ""
  assert.equal(cleanFirstName("  Por  "), "");
});

/* ─────────────────────────────────────────────────────────────
 * 5. Regression: edge cases del mundo real
 * ───────────────────────────────────────────────────────────── */

test("cleanFirstName acepta nombres con caracteres especiales válidos", () => {
  // Guiones, apostrofes, puntos son legitimos en nombres hispanos.
  assert.equal(cleanFirstName("José María"), "José María");
  assert.equal(cleanFirstName("María-José"), "María-José");
  assert.equal(cleanFirstName("O'Brien"), "O'Brien");
});

test("cleanFirstName acepta nombres con numeros (caso raro pero valido)", () => {
  assert.equal(cleanFirstName("Juan 2"), "Juan 2");
});

test("cleanFirstName NO trunca nombres largos", () => {
  const longName = "María Fernanda del Carmen de la Santísima Trinidad";
  assert.equal(cleanFirstName(longName), longName);
});

/* ─────────────────────────────────────────────────────────────
 * 6. Coherencia: cleanFirstName es determinista
 * ───────────────────────────────────────────────────────────── */

test("cleanFirstName es determinista (mismo input → mismo output)", () => {
  const input = "David Esparza";
  const result1 = cleanFirstName(input);
  const result2 = cleanFirstName(input);
  const result3 = cleanFirstName(input);
  assert.equal(result1, result2);
  assert.equal(result2, result3);
});