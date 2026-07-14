/**
 * Tests de `parseLeadName` (src/lib/crm/leads-mapper.ts).
 *
 * Sprint v0.10 Bloque 3: el mapper ahora extrae firstName/lastName de
 * `leads.name` ignorando tags de origen entre corchetes (ej.
 * "[MASTERCLASS] María López" → firstName="María", lastName="López").
 *
 * Patrón: node --test, sin libs externas. Importa el .ts via path
 * absoluto (no usa @/ alias → safe con --experimental-strip-types).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const MAPPER_URL = pathToFileURL(
  path.join(ROOT, "src/lib/crm/leads-mapper.ts")
).href;

const { parseLeadName } = await import(MAPPER_URL);

// =============================================================
// Casos básicos
// =============================================================

test("N1: nombre simple 'María López' → firstName='María', lastName='López'", () => {
  const r = parseLeadName("María López");
  assert.equal(r.firstName, "María");
  assert.equal(r.lastName, "López");
});

test("N2: solo nombre 'Carlos' → firstName='Carlos', lastName=undefined", () => {
  const r = parseLeadName("Carlos");
  assert.equal(r.firstName, "Carlos");
  assert.equal(r.lastName, undefined);
});

test("N3: tres palabras 'Juan Pérez García' → firstName='Juan', lastName='Pérez García'", () => {
  const r = parseLeadName("Juan Pérez García");
  assert.equal(r.firstName, "Juan");
  assert.equal(r.lastName, "Pérez García");
});

test("N4: 4+ palabras 'María del Carmen López Hernández' → todo en lastName", () => {
  const r = parseLeadName("María del Carmen López Hernández");
  assert.equal(r.firstName, "María");
  assert.equal(r.lastName, "del Carmen López Hernández");
});

// =============================================================
// Tags entre corchetes (caso del sprint)
// =============================================================

test("N5: '[MASTERCLASS] María López' → firstName='María', lastName='López'", () => {
  const r = parseLeadName("[MASTERCLASS] María López");
  assert.equal(r.firstName, "María");
  assert.equal(r.lastName, "López");
});

test("N6: '[WEBINAR] Juan Pérez' → firstName='Juan', lastName='Pérez'", () => {
  const r = parseLeadName("[WEBINAR] Juan Pérez");
  assert.equal(r.firstName, "Juan");
  assert.equal(r.lastName, "Pérez");
});

test("N7: '[REFERRAL]  Pedro  Paramo ' (whitespace extra) → firstName='Pedro', lastName='Paramo'", () => {
  const r = parseLeadName("[REFERRAL]  Pedro  Paramo ");
  assert.equal(r.firstName, "Pedro");
  assert.equal(r.lastName, "Paramo");
});

test("N8: '[TAG1][TAG2] Juan Pérez' (múltiples tags) → firstName='Juan', lastName='Pérez'", () => {
  const r = parseLeadName("[TAG1][TAG2] Juan Pérez");
  assert.equal(r.firstName, "Juan");
  assert.equal(r.lastName, "Pérez");
});

test("N9: tags en minúsculas '[lowercase_tag] María' → firstName='María', lastName=undefined", () => {
  const r = parseLeadName("[lowercase_tag] María");
  assert.equal(r.firstName, "María");
  assert.equal(r.lastName, undefined);
});

test("N10: tags con espacios '[TAG WITH SPACES] Juan Pérez' → firstName='Juan', lastName='Pérez'", () => {
  // El regex permite cualquier cosa entre [], incluyendo espacios.
  const r = parseLeadName("[TAG WITH SPACES] Juan Pérez");
  assert.equal(r.firstName, "Juan");
  assert.equal(r.lastName, "Pérez");
});

test("N11: solo tags '[TAG1]' → firstName=undefined, lastName=undefined", () => {
  const r = parseLeadName("[TAG1]");
  assert.equal(r.firstName, undefined);
  assert.equal(r.lastName, undefined);
});

test("N12: solo tags múltiples '[TAG1][TAG2]' → ambos undefined", () => {
  const r = parseLeadName("[TAG1][TAG2]");
  assert.equal(r.firstName, undefined);
  assert.equal(r.lastName, undefined);
});

// =============================================================
// Edge cases
// =============================================================

test("N13: string vacío '' → ambos undefined", () => {
  const r = parseLeadName("");
  assert.equal(r.firstName, undefined);
  assert.equal(r.lastName, undefined);
});

test("N14: null → ambos undefined", () => {
  const r = parseLeadName(null);
  assert.equal(r.firstName, undefined);
  assert.equal(r.lastName, undefined);
});

test("N15: undefined → ambos undefined", () => {
  const r = parseLeadName(undefined);
  assert.equal(r.firstName, undefined);
  assert.equal(r.lastName, undefined);
});

test("N16: solo whitespace '   ' → ambos undefined", () => {
  const r = parseLeadName("   ");
  assert.equal(r.firstName, undefined);
  assert.equal(r.lastName, undefined);
});

test("N17: tag al final NO se quita 'María [TAG]' → firstName='María', lastName='[TAG]'", () => {
  // Por diseño: solo tags al INICIO se eliminan. Tags al final o en
  // medio se conservan como parte del nombre. Esto evita perder info.
  const r = parseLeadName("María [TAG]");
  assert.equal(r.firstName, "María");
  assert.equal(r.lastName, "[TAG]");
});

test("N18: tag en medio 'María [MIDDLE] López' → firstName='María', lastName='[MIDDLE] López'", () => {
  const r = parseLeadName("María [MIDDLE] López");
  assert.equal(r.firstName, "María");
  assert.equal(r.lastName, "[MIDDLE] López");
});

test("N19: muchos espacios entre palabras 'Ana   Ruiz' → firstName='Ana', lastName='Ruiz'", () => {
  const r = parseLeadName("Ana   Ruiz");
  assert.equal(r.firstName, "Ana");
  assert.equal(r.lastName, "Ruiz");
});

test("N20: nombre con tildes y ñ 'José María Núñez' → preserva Unicode", () => {
  const r = parseLeadName("José María Núñez");
  assert.equal(r.firstName, "José");
  assert.equal(r.lastName, "María Núñez");
});
