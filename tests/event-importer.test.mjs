/**
 * Tests del importer (src/lib/events/importer.ts).
 *
 * Corre con `node --test` (mismo patrón que phone-utils.test.mjs):
 *   node --experimental-strip-types --test tests/event-importer.test.mjs
 *
 * Coverage:
 * - parseYesNo: variaciones de sí/no (string, number, simbolos)
 * - resolveHeader: sinonimos ES + EN
 * - parseXlsxForImport: parsing end-to-end con Excel sintetico en memoria
 *   (NO commiteamos .xlsx fixtures — los datos son generados en runtime)
 *
 * Privacy: cero PII. Todos los datos son sinteticos (+52XXXXXXXXXX,
 * @example.com). Si querés ver un caso edge, agregalo acá.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import {
  parseYesNo,
  resolveHeader,
  parseXlsxForImport,
  mapSourceToEnum,
  HEADER_SYNONYMS,
} from "../src/lib/events/importer.ts";

// ─────────────────────────────────────────────────────────────
// Helpers para generar Excels sinteticos en memoria.
// ─────────────────────────────────────────────────────────────

/**
 * Crea un buffer de .xlsx a partir de un array 2D (filas).
 * Primera fila puede ser metadata (offset) si se pasa `headerOffset > 0`.
 */
function makeXlsxBuffer(rows, headerOffset = 0) {
  const aoa = [
    // Filas de metadata antes del header (titulo del evento, fecha, etc).
    ...Array(headerOffset).fill([""]),
    ...rows,
  ];
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Sheet1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

// ─────────────────────────────────────────────────────────────
// parseYesNo
// ─────────────────────────────────────────────────────────────

test("parseYesNo: strings 'si' / 'yes' / 'true' / '1' / 'ok' / '✓'", () => {
  for (const v of ["sí", "si", "yes", "true", "1", "ok", "✓", "✔", "x"]) {
    assert.equal(parseYesNo(v), true, `expected true for '${v}'`);
  }
});

test("parseYesNo: strings 'no' / 'false' / '0' / '' / '✗'", () => {
  for (const v of ["no", "false", "0", "", "✗", "✘"]) {
    assert.equal(parseYesNo(v), false, `expected false for '${v}'`);
  }
});

test("parseYesNo: numbers 1 / 0", () => {
  assert.equal(parseYesNo(1), true);
  assert.equal(parseYesNo(0), false);
});

test("parseYesNo: boolean true / false", () => {
  assert.equal(parseYesNo(true), true);
  assert.equal(parseYesNo(false), false);
});

test("parseYesNo: null / undefined / no parseable -> null", () => {
  assert.equal(parseYesNo(null), null);
  assert.equal(parseYesNo(undefined), null);
  assert.equal(parseYesNo("maybe"), null);
  assert.equal(parseYesNo(42), null);
});

// ─────────────────────────────────────────────────────────────
// resolveHeader
// ─────────────────────────────────────────────────────────────

test("resolveHeader: sinonimos ES para name", () => {
  for (const h of ["Nombre", "nombre", "NOMBRE", "Nombres", "Nombre Completo"]) {
    assert.equal(resolveHeader(h), "name");
  }
});

test("resolveHeader: sinonimos ES para phone", () => {
  for (const h of ["Teléfono", "telefono", "Celular", "WhatsApp", "Tel"]) {
    assert.equal(resolveHeader(h), "phone");
  }
});

test("resolveHeader: sinonimos EN para consent", () => {
  for (const h of ["Consent", "consent", "Contact Permission"]) {
    assert.equal(resolveHeader(h), "consent");
  }
});

test("resolveHeader: headers desconocidos -> null", () => {
  assert.equal(resolveHeader("Foo"), null);
  assert.equal(resolveHeader(""), null);
  assert.equal(resolveHeader("XYZ"), null);
});

test("resolveHeader: HEADER_SYNONYMS tiene los 9 campos canonicos", () => {
  for (const key of [
    "name",
    "email",
    "phone",
    "consent",
    "interest",
    "source",
    "attended",
    "status",
  ]) {
    assert.ok(HEADER_SYNONYMS[key], `falta sinonimos para '${key}'`);
    assert.ok(HEADER_SYNONYMS[key].length > 0);
  }
});

// ─────────────────────────────────────────────────────────────
// mapSourceToEnum
// ─────────────────────────────────────────────────────────────

test("mapSourceToEnum: 'Captura Messenger' -> imported_excel", () => {
  assert.equal(mapSourceToEnum("Captura Messenger", "manual"), "imported_excel");
});

test("mapSourceToEnum: 'Captura Messenger / WhatsApp' -> imported_excel (mixto)", () => {
  assert.equal(mapSourceToEnum("Captura Messenger / WhatsApp", "manual"), "imported_excel");
});

test("mapSourceToEnum: source null -> defaultValue", () => {
  assert.equal(mapSourceToEnum(null, "check_in"), "check_in");
});

test("mapSourceToEnum: source desconocido -> defaultValue", () => {
  assert.equal(mapSourceToEnum("Foo Bar", "manual"), "manual");
});

// ─────────────────────────────────────────────────────────────
// parseXlsxForImport — end-to-end con Excel sintetico
// ─────────────────────────────────────────────────────────────

test("parseXlsxForImport: confirmation simple (headers en fila 1, ES)", () => {
  const buffer = makeXlsxBuffer([
    ["Nombre", "Correo", "Teléfono"],
    ["Sintético Uno", "uno@example.com", "+52 33 1234 5678"],
    ["Sintético Dos", "dos@example.com", "523312345679"],
  ]);
  const result = parseXlsxForImport(buffer, "confirmation");
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].name, "Sintético Uno");
  assert.equal(result.rows[0].email, "uno@example.com");
  assert.equal(result.rows[0].phoneNormalized, "+523312345678");
  assert.equal(result.rows[1].phoneNormalized, "+523312345679");
  assert.equal(result.warnings.length, 0);
});

test("parseXlsxForImport: detecta headers en fila 4 (no fila 1) con metadata previa", () => {
  // Replica el Excel real del cliente: 3 filas de metadata + fila de headers.
  const buffer = makeXlsxBuffer(
    [
      ["LISTA DE ASISTENCIA | Marketing + IA"],
      ["Viernes 26 | 1:00 p.m. a 4:00 p.m."],
      [""],
      ["#", "Nombre", "Teléfono", "Fuente", "Asistió"],
      [1, "Sintético A", 6861827263, "Captura Messenger", "✓"],
      [2, "Sintético B", 6863980428, "Captura Messenger", ""],
    ],
    3, // offset: 3 filas vacías ANTES del header (las llenamos arriba)
  );
  const result = parseXlsxForImport(buffer, "attendee");
  assert.equal(result.rows.length, 2, `esperaba 2 rows, recibí ${result.rows.length}`);
  assert.equal(result.rows[0].name, "Sintético A");
  // Phone: 6861827263 son 10 dígitos → +52 automático.
  assert.equal(result.rows[0].phoneNormalized, "+526861827263");
  assert.equal(result.rows[0].attended, true);
  // Sintético B no asistió (vacio) → attended = false (parseYesNo).
  assert.equal(result.rows[1].attended, false);
});

test("parseXlsxForImport: phone con 9 dígitos genera warning pero acepta como null", () => {
  const buffer = makeXlsxBuffer([
    ["Nombre", "Teléfono"],
    ["Sintético X", "686145789"], // 9 dígitos
  ]);
  const result = parseXlsxForImport(buffer, "confirmation");
  assert.equal(result.rows.length, 1);
  // Sin normalización válida, queda null (el caller decide si rechazar).
  assert.equal(result.rows[0].phoneNormalized, null);
  const phoneWarnings = result.warnings.filter((w) => w.field === "phone");
  assert.ok(phoneWarnings.length > 0, "esperaba warning de phone");
});

test("parseXlsxForImport: survey con consent sí/no parsea a boolean", () => {
  const buffer = makeXlsxBuffer([
    ["Correo", "Acepta", "Interés"],
    ["uno@example.com", "Sí", "Ads en Meta"],
    ["dos@example.com", "No", ""],
    ["tres@example.com", "yes", "Estrategia"],
  ]);
  const result = parseXlsxForImport(buffer, "survey");
  assert.equal(result.rows.length, 3);
  assert.equal(result.rows[0].consent, true);
  assert.equal(result.rows[0].interest, "Ads en Meta");
  assert.equal(result.rows[1].consent, false);
  assert.equal(result.rows[1].interest, "");
  assert.equal(result.rows[2].consent, true);
  // Row 1 no tiene interest → consent false queda, pero interest es ''.
  // La promotion.ts evalúa las 3 reglas, no el importer.
});

test("parseXlsxForImport: sin headers reconocibles devuelve warnings, no rows", () => {
  const buffer = makeXlsxBuffer([
    ["Foo", "Bar", "Baz"],
    ["a", "b", "c"],
  ]);
  const result = parseXlsxForImport(buffer, "confirmation");
  assert.equal(result.rows.length, 0);
  assert.ok(
    result.warnings.some((w) => w.field === "_headers"),
    "esperaba warning de headers no reconocidos",
  );
});

test("parseXlsxForImport: --map override funciona cuando el header es raro", () => {
  const buffer = makeXlsxBuffer([
    ["Participante", "MailCorporativo", "NumeroCelular"],
    ["Sintético Map", "m@example.com", "+52 55 1111 2222"],
  ]);
  // Sin override: Participante no matchea, MailCorporativo no matchea,
  // NumeroCelular no matchea → 0 rows.
  const noOverride = parseXlsxForImport(buffer, "confirmation");
  assert.equal(noOverride.rows.length, 0);

  // Con override: los headers raros matchean los canonicos.
  const withOverride = parseXlsxForImport(buffer, "confirmation", {
    mapOverride: {
      name: "Participante",
      email: "MailCorporativo",
      phone: "NumeroCelular",
    },
  });
  assert.equal(withOverride.rows.length, 1);
  assert.equal(withOverride.rows[0].name, "Sintético Map");
  assert.equal(withOverride.rows[0].email, "m@example.com");
  assert.equal(withOverride.rows[0].phoneNormalized, "+525511112222");
});

test("parseXlsxForImport: rows vacías se saltan sin warning", () => {
  const buffer = makeXlsxBuffer([
    ["Nombre", "Correo"],
    ["Sintético Real", "r@example.com"],
    ["", "", ""],
    ["", "", ""],
    ["Sintético Otro", "o@example.com"],
  ]);
  const result = parseXlsxForImport(buffer, "confirmation");
  assert.equal(result.rows.length, 2, `esperaba 2 rows (sin contar vacías), recibí ${result.rows.length}`);
});

test("parseXlsxForImport: confirmation sin email ni phone genera warning _ident", () => {
  const buffer = makeXlsxBuffer([
    ["Nombre"],
    ["Solo Nombre Sin Contacto"],
  ]);
  const result = parseXlsxForImport(buffer, "confirmation");
  assert.equal(result.rows.length, 1);
  const identWarnings = result.warnings.filter((w) => w.field === "_ident");
  assert.ok(identWarnings.length > 0, "esperaba warning de _ident");
});

test("parseXlsxForImport: survey sin consent genera warning de consent", () => {
  const buffer = makeXlsxBuffer([
    ["Correo", "Acepta"],
    ["x@example.com", "tal vez"],
  ]);
  const result = parseXlsxForImport(buffer, "survey");
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].consent, null);
  const consentWarnings = result.warnings.filter((w) => w.field === "consent");
  assert.ok(consentWarnings.length > 0);
});
