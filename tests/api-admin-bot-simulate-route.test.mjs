/**
 * Tests del Simulador (Sprint v0.9.6).
 *
 * Cubre 2 capas:
 *  1. Validación de payload (parseSimulateRequest) — 8 tests unitarios
 *     del schema, sin HTTP ni mocks.
 *  2. Estructura del route — 2 tests estáticos.
 *
 * NOTA sobre tests HTTP del route: el route importa `next/server` que
 * `node --experimental-strip-types` no resuelve. Probamos el wire-format
 * indirectamente vía los tests de aislamiento del simulador (T4-T7).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const ROUTE_PATH = path.join(ROOT, "src/app/api/admin/bot/simulate/route.ts");
const SCHEMA_PATH = path.join(ROOT, "src/lib/ai/simulator-schema.ts");
const SCHEMA_URL = pathToFileURL(SCHEMA_PATH).href;

/* ================================================================== */
/*  S1. Tests del schema (sin HTTP, sin mocks)                          */
/* ================================================================== */

test("S1.1: payload mínimo válido (solo message) es aceptado", async () => {
  const { parseSimulateRequest } = await import(SCHEMA_URL);
  const r = parseSimulateRequest({ message: "hola" });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value.message, "hola");
    assert.deepEqual(r.value.history, []);
    assert.equal(r.value.modeOverride, null);
    assert.equal(r.value.leadContext, null);
  }
});

test("S1.2: payload sin message es rechazado", async () => {
  const { parseSimulateRequest } = await import(SCHEMA_URL);
  const r = parseSimulateRequest({});
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.error.includes("message"));
});

test("S1.3: modeOverride fuera del enum es rechazado", async () => {
  const { parseSimulateRequest } = await import(SCHEMA_URL);
  const r = parseSimulateRequest({
    message: "hola",
    modeOverride: "modo_inventado"
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.error.includes("modeOverride"));
});

test("S1.4: modeOverride con los 3 valores válidos es aceptado", async () => {
  const { parseSimulateRequest } = await import(SCHEMA_URL);
  for (const m of ["socratic_autopilot_v2", "socratic_no_tools_v1", "super_executive"]) {
    const r = parseSimulateRequest({ message: "x", modeOverride: m });
    assert.equal(r.ok, true, `modeOverride ${m} debe ser aceptado`);
  }
});

test("S1.5: leadContext.leadId que no es UUID es rechazado", async () => {
  const { parseSimulateRequest } = await import(SCHEMA_URL);
  const r = parseSimulateRequest({
    message: "hola",
    leadContext: { leadId: "no-es-uuid" }
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.error.includes("UUID"));
});

test("S1.6: history con direction inválido es rechazado", async () => {
  const { parseSimulateRequest } = await import(SCHEMA_URL);
  const r = parseSimulateRequest({
    message: "hola",
    history: [{ direction: "sideways", body: "x" }]
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.error.includes("direction"));
});

test("S1.7: history con timestamp no-ISO es rechazado", async () => {
  const { parseSimulateRequest } = await import(SCHEMA_URL);
  const r = parseSimulateRequest({
    message: "hola",
    history: [{ direction: "inbound", body: "x", timestamp: "ayer" }]
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.error.includes("timestamp"));
});

test("S1.8: history > 50 mensajes es rechazado", async () => {
  const { parseSimulateRequest } = await import(SCHEMA_URL);
  const big = Array.from({ length: 51 }, () => ({
    direction: "inbound",
    body: "x"
  }));
  const r = parseSimulateRequest({ message: "hola", history: big });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.error.includes("50"));
});

test("S1.9 (Sprint v0.9.7): tierOverride='flash' es aceptado", async () => {
  const { parseSimulateRequest } = await import(SCHEMA_URL);
  const r = parseSimulateRequest({
    message: "hola",
    tierOverride: "flash"
  });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value.tierOverride, "flash");
  }
});

test("S1.10 (Sprint v0.9.7): tierOverride='pro' es aceptado", async () => {
  const { parseSimulateRequest } = await import(SCHEMA_URL);
  const r = parseSimulateRequest({
    message: "hola",
    tierOverride: "pro"
  });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value.tierOverride, "pro");
  }
});

test("S1.11 (Sprint v0.9.7): tierOverride='ultra' (fuera del enum) se normaliza a null", async () => {
  const { parseSimulateRequest } = await import(SCHEMA_URL);
  const r = parseSimulateRequest({
    message: "hola",
    tierOverride: "ultra"
  });
  assert.equal(r.ok, true);
  if (r.ok) {
    // Cualquier valor fuera del enum se trata como null (no error)
    // para que el cliente no se rompa con valores legacy.
    assert.equal(r.value.tierOverride, null);
  }
});

/* ================================================================== */
/*  S2. Estructura del route.ts                                         */
/* ================================================================== */

test("S2.1: el route tiene POST y GET handlers", () => {
  const src = fs.readFileSync(ROUTE_PATH, "utf-8");
  assert.ok(src.includes("export async function POST"));
  assert.ok(src.includes("export async function GET"));
});

test("S2.2: el route delega al simulador y al schema", () => {
  const src = fs.readFileSync(ROUTE_PATH, "utf-8");
  assert.ok(src.includes("simulateConversationTurn("));
  assert.ok(src.includes("parseSimulateRequest("));
  assert.ok(!src.includes("deepseekAgentProvider"));
});

test("S2.3: el route hace requireAdmin y checkSupabaseConfig", () => {
  const src = fs.readFileSync(ROUTE_PATH, "utf-8");
  assert.ok(src.includes("requireAdmin("));
  assert.ok(src.includes("checkSupabaseConfig("));
});

test("S2.4: el route retorna 401, 501, 400 con códigos HTTP explícitos", () => {
  const src = fs.readFileSync(ROUTE_PATH, "utf-8");
  assert.ok(src.includes("{ status: 401 }"), "debe retornar 401 sin admin");
  assert.ok(src.includes("{ status: 501 }"), "debe retornar 501 sin Supabase");
  assert.ok(src.includes("{ status: 400 }"), "debe retornar 400 con payload inválido");
});
