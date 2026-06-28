/**
 * Tests para los helpers puros de whatsapp-status (Bloque 2 de Fase 4).
 *
 * Cubre: isValidWhatsAppStatus, getNextStatusOptions.
 * NO mockea Supabase (las funciones que usan DB no se testean aca —
 * las cubre el auditor o tests E2E).
 *
 * Corre con `node --test`:
 *   node --test tests/whatsapp-status.test.mjs
 */

// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isValidWhatsAppStatus,
  getNextStatusOptions,
  WHATSAPP_STATUSES,
  WHATSAPP_STATUS_LABEL,
  WHATSAPP_STATUS_TONE,
} from "../src/lib/leads/whatsapp-status.ts";

// ─────────────────────────────────────────────────────────────
// Constantes exportadas
// ─────────────────────────────────────────────────────────────

test("WHATSAPP_STATUSES tiene los 4 valores del enum", () => {
  assert.equal(WHATSAPP_STATUSES.length, 4);
  assert.ok(WHATSAPP_STATUSES.includes("no_contactado"));
  assert.ok(WHATSAPP_STATUSES.includes("contactado"));
  assert.ok(WHATSAPP_STATUSES.includes("interested"));
  assert.ok(WHATSAPP_STATUSES.includes("lost"));
});

test("WHATSAPP_STATUS_LABEL tiene label para cada estado", () => {
  for (const s of WHATSAPP_STATUSES) {
    assert.ok(WHATSAPP_STATUS_LABEL[s]);
    assert.ok(WHATSAPP_STATUS_LABEL[s].length > 0);
  }
});

test("WHATSAPP_STATUS_TONE tiene tone para cada estado", () => {
  for (const s of WHATSAPP_STATUSES) {
    assert.ok(WHATSAPP_STATUS_TONE[s]);
  }
});

// ─────────────────────────────────────────────────────────────
// isValidWhatsAppStatus
// ─────────────────────────────────────────────────────────────

test("isValidWhatsAppStatus: acepta los 4 valores validos", () => {
  assert.equal(isValidWhatsAppStatus("no_contactado"), true);
  assert.equal(isValidWhatsAppStatus("contactado"), true);
  assert.equal(isValidWhatsAppStatus("interested"), true);
  assert.equal(isValidWhatsAppStatus("lost"), true);
});

test("isValidWhatsAppStatus: rechaza valores invalidos", () => {
  assert.equal(isValidWhatsAppStatus("xyz"), false);
  assert.equal(isValidWhatsAppStatus(""), false);
  assert.equal(isValidWhatsAppStatus("Contactado"), false); // case-sensitive
  assert.equal(isValidWhatsAppStatus("contactado "), false); // trim
  assert.equal(isValidWhatsAppStatus(null), false);
  assert.equal(isValidWhatsAppStatus(undefined), false);
  assert.equal(isValidWhatsAppStatus(42), false);
  assert.equal(isValidWhatsAppStatus({}), false);
});

// ─────────────────────────────────────────────────────────────
// getNextStatusOptions
// ─────────────────────────────────────────────────────────────

test("getNextStatusOptions: no_contactado -> solo contactado", () => {
  const next = getNextStatusOptions("no_contactado");
  assert.deepEqual(next, ["contactado"]);
});

test("getNextStatusOptions: contactado -> interested, lost, o volver a no_contactado", () => {
  const next = getNextStatusOptions("contactado");
  assert.ok(next.includes("interested"));
  assert.ok(next.includes("lost"));
  assert.ok(next.includes("no_contactado"));
  assert.equal(next.length, 3);
});

test("getNextStatusOptions: interested -> contactado o lost", () => {
  const next = getNextStatusOptions("interested");
  assert.ok(next.includes("contactado"));
  assert.ok(next.includes("lost"));
  assert.equal(next.length, 2);
});

test("getNextStatusOptions: lost -> contactado o interested (revivir)", () => {
  const next = getNextStatusOptions("lost");
  assert.ok(next.includes("contactado"));
  assert.ok(next.includes("interested"));
  assert.equal(next.length, 2);
});

test("getNextStatusOptions: nunca devuelve el mismo estado (no-op)", () => {
  for (const s of WHATSAPP_STATUSES) {
    const next = getNextStatusOptions(s);
    assert.ok(!next.includes(s), `${s} no debe estar en sus propios nexts`);
  }
});
