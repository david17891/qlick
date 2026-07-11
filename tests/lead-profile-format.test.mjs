/**
 * Tests de formatLeadProfileBlock + SUMMARY_EVERY del módulo lead-profile.
 * Ver src/lib/ai/lead-profile.ts.
 *
 * formatLeadProfileBlock inyecta el resumen cumulativo del lead en el
 * system prompt del bot. Si devuelve string vacío cuando NO debería, el
 * LLM pierde memoria entre sesiones.
 *
 * Patrón: node --test, sin libs externas.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  formatLeadProfileBlock,
  SUMMARY_EVERY
} from "../src/lib/ai/lead-profile.ts";

function makeProfile(overrides = {}) {
  return {
    leadId: "lead-1",
    summary: "",
    messagesSinceSummary: 0,
    lastSummaryAt: null,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-01T00:00:00.000Z"),
    ...overrides
  };
}

/* ─────────────────────────────────────────────────────────────
 * 1. SUMMARY_EVERY
 * ───────────────────────────────────────────────────────────── */

test("SUMMARY_EVERY: constante exportada y razonable", () => {
  assert.equal(typeof SUMMARY_EVERY, "number");
  assert.ok(SUMMARY_EVERY >= 2 && SUMMARY_EVERY <= 10, "debe estar entre 2 y 10");
  assert.equal(SUMMARY_EVERY, 5);
});

/* ─────────────────────────────────────────────────────────────
 * 2. formatLeadProfileBlock
 * ───────────────────────────────────────────────────────────── */

test("formatLeadProfileBlock: profile null -> string vacio", () => {
  assert.equal(formatLeadProfileBlock(null), "");
});

test("formatLeadProfileBlock: summary vacio -> string vacio", () => {
  const p = makeProfile({ summary: "" });
  assert.equal(formatLeadProfileBlock(p), "");
});

test("formatLeadProfileBlock: summary con solo whitespace -> string vacio", () => {
  const p = makeProfile({ summary: "   \n\t  " });
  assert.equal(formatLeadProfileBlock(p), "");
});

test("formatLeadProfileBlock: summary valido -> bloque con prefijo", () => {
  const p = makeProfile({ summary: "Lead de CDMX, curso de marketing." });
  const block = formatLeadProfileBlock(p);
  assert.ok(block.length > 0);
  assert.ok(block.includes("CONTEXTO PREVIO DEL LEAD"), "debe llevar el prefijo");
  assert.ok(block.includes("Lead de CDMX, curso de marketing."), "debe incluir el summary");
});

test("formatLeadProfileBlock: el summary aparece al final del bloque", () => {
  const p = makeProfile({ summary: "Resumen real" });
  const block = formatLeadProfileBlock(p);
  // El prefijo es de una línea; el summary viene después.
  const lines = block.split("\n");
  assert.equal(lines.length, 2);
  assert.ok(lines[0].startsWith("CONTEXTO PREVIO"));
  assert.equal(lines[1], "Resumen real");
});
