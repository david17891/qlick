/**
 * Tests para `src/lib/events/confirmation-filter.ts` (función pura
 * extraída de Capa 2 del Sub-bloque A de Fase 4).
 *
 * Corre con `node --test` (built-in, sin framework externo):
 *   node --test tests/confirmation-filter.test.mjs
 * O via npm:
 *   npm test
 *
 * Cubre:
 * - `resolveConfirmationSource` — normalización de ?source= (acepta enum, rechaza basura)
 * - `filterConfirmations` — combinaciones de ?q= y ?source=, edge cases de trim,
 *   case-insensitive, búsqueda en name/email/phoneRaw/phoneNormalized,
 *   isFiltered refleja estado real de los filtros.
 *
 * Data sintética (cero PII, convención del repo).
 */

// @ts-check
/**
 * Tests para `src/lib/events/confirmation-filter.ts` (función pura
 * extraída de Capa 2 del Sub-bloque A de Fase 4).
 *
 * Corre con `node --test` (built-in, sin framework externo):
 *   node --test tests/confirmation-filter.test.mjs
 * O via npm:
 *   npm test
 *
 * Cubre:
 * - `resolveConfirmationSource` — normalización de ?source= (acepta enum, rechaza basura)
 * - `filterConfirmations` — combinaciones de ?q= y ?source=, edge cases de trim,
 *   case-insensitive, búsqueda en name/email/phoneRaw/phoneNormalized,
 *   isFiltered refleja estado real de los filtros.
 *
 * Data sintética (cero PII, convención del repo).
 *
 * NOTA: este archivo es .mjs (no .ts) porque el glob del package.json
 * es `tests/*.test.mjs`. No podemos usar `import type` (no se strippea
 * en .mjs). Los fixtures se tipan vía JSDoc para que `@ts-check` los
 * valide en VS Code sin afectar el runtime.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  filterConfirmations,
  resolveConfirmationSource,
} from "../src/lib/events/confirmation-filter.ts";

// ─────────────────────────────────────────────────────────────
// Fixtures: 5 confirmaciones sintéticas para los tests.
// Tipadas via JSDoc para validación en editor (no en runtime).
// ─────────────────────────────────────────────────────────────

/** @type {import("../src/types/events.ts").EventConfirmation} */
const ana = {
  id: "c-1",
  eventId: "e-1",
  name: "Ana Ramirez",
  email: "ana.ramirez@example.com",
  phoneRaw: "33 1234 5678",
  phoneNormalized: "+523312345678",
  source: "imported_excel",
  confirmedAt: "2026-06-25T10:00:00Z",
};

/** @type {import("../src/types/events.ts").EventConfirmation} */
const beto = {
  id: "c-2",
  eventId: "e-1",
  name: "Beto Cardenas",
  email: "beto.cardenas@example.com",
  phoneRaw: "55 8765 4321",
  phoneNormalized: "+525587654321",
  source: "public_form",
  confirmedAt: "2026-06-25T11:00:00Z",
};

/** @type {import("../src/types/events.ts").EventConfirmation} */
const carla = {
  id: "c-3",
  eventId: "e-1",
  name: "Carla Dominguez",
  email: "carla.dominguez@example.com",
  // Sin teléfono (data quality del import).
  source: "manual",
  confirmedAt: "2026-06-25T12:00:00Z",
};

/** @type {import("../src/types/events.ts").EventConfirmation} */
const david = {
  id: "c-4",
  eventId: "e-1",
  name: "David Esparza",
  email: "david.esparza@example.com",
  phoneRaw: "686 555 1234",
  phoneNormalized: "+526865551234",
  source: "imported_excel",
  confirmedAt: "2026-06-25T13:00:00Z",
};

// Solo nombre, sin email ni phone (caso edge).
/** @type {import("../src/types/events.ts").EventConfirmation} */
const eve = {
  id: "c-5",
  eventId: "e-1",
  name: "Eve Solo-Nombre",
  source: "public_form",
  confirmedAt: "2026-06-25T14:00:00Z",
};

const all = [ana, beto, carla, david, eve];

// ─────────────────────────────────────────────────────────────
// resolveConfirmationSource
// ─────────────────────────────────────────────────────────────

test("resolveConfirmationSource: undefined → ''", () => {
  assert.equal(resolveConfirmationSource(undefined), "");
});

test("resolveConfirmationSource: string vacío → ''", () => {
  assert.equal(resolveConfirmationSource(""), "");
});

test("resolveConfirmationSource: cada valor válido del enum se preserva", () => {
  assert.equal(resolveConfirmationSource("imported_excel"), "imported_excel");
  assert.equal(resolveConfirmationSource("public_form"), "public_form");
  assert.equal(resolveConfirmationSource("manual"), "manual");
});

test("resolveConfirmationSource: valor fuera del enum → '' (defensivo)", () => {
  assert.equal(resolveConfirmationSource("xyz"), "");
  assert.equal(resolveConfirmationSource("IMPORTED_EXCEL"), ""); // case-sensitive
  assert.equal(resolveConfirmationSource("imported_excel;"), ""); // injection attempt
  assert.equal(resolveConfirmationSource("imported_excel OR 1=1"), "");
});

// ─────────────────────────────────────────────────────────────
// filterConfirmations — sin filtros
// ─────────────────────────────────────────────────────────────

test("filterConfirmations: sin query ni source → devuelve todo, isFiltered=false", () => {
  const result = filterConfirmations({ confirmations: all });
  assert.equal(result.filtered.length, 5);
  assert.equal(result.isFiltered, false);
});

test("filterConfirmations: query '' y source '' → no filtra, isFiltered=false", () => {
  const result = filterConfirmations({
    confirmations: all,
    query: "",
    source: "",
  });
  assert.equal(result.filtered.length, 5);
  assert.equal(result.isFiltered, false);
});

test("filterConfirmations: array vacío → vacío, isFiltered=false", () => {
  const result = filterConfirmations({
    confirmations: [],
    query: "ana",
  });
  // Query no-vacía SÍ marca isFiltered=true aunque no haya matches.
  assert.equal(result.filtered.length, 0);
  assert.equal(result.isFiltered, true);
});

// ─────────────────────────────────────────────────────────────
// filterConfirmations — source solo
// ─────────────────────────────────────────────────────────────

test("filterConfirmations: source=imported_excel → solo importados", () => {
  const result = filterConfirmations({
    confirmations: all,
    source: "imported_excel",
  });
  assert.equal(result.filtered.length, 2);
  assert.deepEqual(
    result.filtered.map((c) => c.id),
    ["c-1", "c-4"],
  );
  assert.equal(result.isFiltered, true);
});

test("filterConfirmations: source inválido → ignora (no rompe, no filtra)", () => {
  const result = filterConfirmations({
    confirmations: all,
    source: "xyz",
  });
  assert.equal(result.filtered.length, 5);
  assert.equal(result.isFiltered, false);
});

test("filterConfirmations: source=manual → solo carla", () => {
  const result = filterConfirmations({
    confirmations: all,
    source: "manual",
  });
  assert.equal(result.filtered.length, 1);
  assert.equal(result.filtered[0].id, "c-3");
  assert.equal(result.isFiltered, true);
});

// ─────────────────────────────────────────────────────────────
// filterConfirmations — query solo
// ─────────────────────────────────────────────────────────────

test("filterConfirmations: query en name (case-insensitive)", () => {
  const result = filterConfirmations({
    confirmations: all,
    query: "ANA",
  });
  assert.equal(result.filtered.length, 1);
  assert.equal(result.filtered[0].id, "c-1");
  assert.equal(result.isFiltered, true);
});

test("filterConfirmations: query en email", () => {
  const result = filterConfirmations({
    confirmations: all,
    query: "beto.cardenas",
  });
  assert.equal(result.filtered.length, 1);
  assert.equal(result.filtered[0].id, "c-2");
});

test("filterConfirmations: query en phoneRaw (substring)", () => {
  // '686' matchea david.phoneRaw='686 555 1234'
  const result = filterConfirmations({
    confirmations: all,
    query: "686",
  });
  assert.equal(result.filtered.length, 1);
  assert.equal(result.filtered[0].id, "c-4");
});

test("filterConfirmations: query en phoneNormalized (con +)", () => {
  // '+52' aparece en todos los phoneNormalized
  const result = filterConfirmations({
    confirmations: all,
    query: "+52",
  });
  // Solo los que tienen phoneNormalized: ana, beto, david (3)
  // carla y eve no tienen phone → excluidas
  assert.equal(result.filtered.length, 3);
  assert.deepEqual(
    result.filtered.map((c) => c.id).sort(),
    ["c-1", "c-2", "c-4"],
  );
});

test("filterConfirmations: query con solo whitespace → no filtra", () => {
  const result = filterConfirmations({
    confirmations: all,
    query: "   ",
  });
  assert.equal(result.filtered.length, 5);
  assert.equal(result.isFiltered, false);
});

test("filterConfirmations: query con whitespace alrededor → trim antes de match", () => {
  const result = filterConfirmations({
    confirmations: all,
    query: "  ANA  ",
  });
  assert.equal(result.filtered.length, 1);
  assert.equal(result.filtered[0].id, "c-1");
});

test("filterConfirmations: query sin match → array vacío, isFiltered=true", () => {
  const result = filterConfirmations({
    confirmations: all,
    query: "zzzzzz",
  });
  assert.equal(result.filtered.length, 0);
  assert.equal(result.isFiltered, true);
});

// ─────────────────────────────────────────────────────────────
// filterConfirmations — query + source combinados
// ─────────────────────────────────────────────────────────────

test("filterConfirmations: query + source ambos activos (AND lógico)", () => {
  // source=imported_excel + query=ana → solo ana (que es imported_excel y matchea 'ana')
  const result = filterConfirmations({
    confirmations: all,
    query: "ana",
    source: "imported_excel",
  });
  assert.equal(result.filtered.length, 1);
  assert.equal(result.filtered[0].id, "c-1");
  assert.equal(result.isFiltered, true);
});

test("filterConfirmations: query matchea pero source no → vacío", () => {
  // source=public_form + query='ramirez' → 0 (ana es imported_excel, no public_form)
  const result = filterConfirmations({
    confirmations: all,
    query: "ramirez",
    source: "public_form",
  });
  assert.equal(result.filtered.length, 0);
  assert.equal(result.isFiltered, true);
});

test("filterConfirmations: source matchea pero query no → vacío", () => {
  // source=imported_excel + query='carla' → 0 (carla es manual, no imported_excel)
  const result = filterConfirmations({
    confirmations: all,
    query: "carla",
    source: "imported_excel",
  });
  assert.equal(result.filtered.length, 0);
  assert.equal(result.isFiltered, true);
});

// ─────────────────────────────────────────────────────────────
// filterConfirmations — edge cases de data
// ─────────────────────────────────────────────────────────────

test("filterConfirmations: confirmation con solo name (sin email/phone) matchea por name", () => {
  // Eve solo tiene name. query='solo' debe matchearla.
  const result = filterConfirmations({
    confirmations: all,
    query: "solo",
  });
  assert.equal(result.filtered.length, 1);
  assert.equal(result.filtered[0].id, "c-5");
});

test("filterConfirmations: query en email no matchea cuando email es undefined", () => {
  // Eve no tiene email. query='@example.com' no debe matchearla.
  const result = filterConfirmations({
    confirmations: all,
    query: "@example.com",
  });
  // Solo ana/beto/carla/david (4) tienen email.
  assert.equal(result.filtered.length, 4);
  assert.equal(
    result.filtered.find((c) => c.id === "c-5"),
    undefined,
  );
});

test("filterConfirmations: el array original NO se muta", () => {
  const original = [ana, beto, carla];
  const snapshot = JSON.parse(JSON.stringify(original));
  filterConfirmations({ confirmations: original, query: "ana" });
  assert.deepEqual(original, snapshot);
});
