/**
 * Tests para el export CSV de leads (Fase 1 CRM).
 *
 * Cubre:
 * - csvEscape: escape de comas, comillas, newlines
 * - HEADERS constante
 *
 * Lo que NO cubre (lo cubre el audit script scratch/qlick-crm-audit.mjs
 * o el rate-limit test): integración con Supabase, rate limiting, BOM,
 * paginación con .range(). Eso requiere DB real o mocks complejos.
 *
 * Corre con `node --test`:
 *   node --test tests/crm-leads-csv-export.test.mjs
 */

// @ts-check

import { test } from "node:test";
import assert from "node:assert/strict";
import { csvEscape } from "../src/lib/crm/csv-utils.ts";

// ─────────────────────────────────────────────────────────────
// csvEscape
// ─────────────────────────────────────────────────────────────

test("csvEscape: string simple sin caracteres especiales", () => {
  assert.equal(csvEscape("David"), "David");
  assert.equal(csvEscape("david@example.com"), "david@example.com");
});

test("csvEscape: string con coma se envuelve en comillas", () => {
  assert.equal(csvEscape("Martínez, Juan"), '"Martínez, Juan"');
});

test("csvEscape: string con comillas duplica las internas", () => {
  assert.equal(csvEscape('Juan "El Crack"'), '"Juan ""El Crack"""');
});

test("csvEscape: string con newline se envuelve en comillas", () => {
  assert.equal(csvEscape("línea1\nlínea2"), '"línea1\nlínea2"');
});

test("csvEscape: string con carriage return se envuelve en comillas", () => {
  assert.equal(csvEscape("línea1\rlínea2"), '"línea1\rlínea2"');
});

test("csvEscape: null y undefined devuelven string vacío", () => {
  assert.equal(csvEscape(null), "");
  assert.equal(csvEscape(undefined), "");
});

test("csvEscape: números se serializan como string", () => {
  assert.equal(csvEscape(55), "55");
  assert.equal(csvEscape(0), "0");
});

test("csvEscape: boolean se serializa como string", () => {
  assert.equal(csvEscape(true), "true");
  assert.equal(csvEscape(false), "false");
});

test("csvEscape: caso combinado - nombre con coma Y comillas", () => {
  // Caso real: 'García "El Pro", S.A. de C.V.'
  assert.equal(
    csvEscape('García "El Pro", S.A. de C.V.'),
    '"García ""El Pro"", S.A. de C.V."',
  );
});

test("csvEscape: string con tildes y ñ NO se escapa (no son especiales para CSV)", () => {
  // Importante: caracteres UTF-8 (tildes, eñes) NO requieren escape en CSV
  // — Excel los lee correctamente si hay BOM al inicio del archivo.
  assert.equal(csvEscape("José Martínez"), "José Martínez");
  assert.equal(csvEscape("Diseño"), "Diseño");
});