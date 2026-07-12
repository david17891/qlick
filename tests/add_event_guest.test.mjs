/**
 * Tests de la tool add_event_guest (Sprint v0.9.8 Mejora 1).
 *
 * Cubre:
 *   - Validación de guest_name (mín. 2 palabras, sin placeholders).
 *   - Validación de guest_email (regex, opcional).
 *   - upsertGuestInArray: idempotencia (mismo nombre actualiza, no duplica).
 *   - findGuestByName: case-insensitive.
 *   - executeAddEventGuest: modo demo (no persiste) + happy path + errores.
 *
 * Patrón: tests del módulo puro. Modo demo (supabase=null) para no
 * requerir Supabase configurado en el runner de tests.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const TOOL_URL = pathToFileURL(
  path.join(ROOT, "src/lib/ai/tool-executors/add-guest.ts")
).href;
const TOOLS_URL = pathToFileURL(
  path.join(ROOT, "src/lib/ai/agent-tools.ts")
).href;

const VALID_LEAD_ID = "36249ecd-0000-0000-0000-000000000000";

test("A1: isValidGuestNameLocal acepta nombres válidos", async () => {
  const { isValidGuestNameLocal } = await import(TOOL_URL);
  assert.ok(isValidGuestNameLocal("Carlos Pérez"));
  assert.ok(isValidGuestNameLocal("María José López"));
  assert.ok(isValidGuestNameLocal("Ana O'Brien"));
});

test("A2: isValidGuestNameLocal rechaza nombres inválidos", async () => {
  const { isValidGuestNameLocal } = await import(TOOL_URL);
  assert.equal(isValidGuestNameLocal("Por confirmar"), false, "placeholder");
  assert.equal(isValidGuestNameLocal("Asistente"), false, "placeholder");
  assert.equal(isValidGuestNameLocal("test"), false, "placeholder");
  assert.equal(isValidGuestNameLocal("Juan"), false, "1 palabra");
  assert.equal(isValidGuestNameLocal("12345"), false, "solo dígitos");
  assert.equal(isValidGuestNameLocal(""), false);
  assert.equal(isValidGuestNameLocal(null), false);
});

test("A3: validateAndNormalizeGuestEmail acepta emails válidos y rechaza inválidos", async () => {
  const { validateAndNormalizeGuestEmail } = await import(TOOL_URL);
  assert.equal(
    validateAndNormalizeGuestEmail("Carlos@HOTMAIL.COM"),
    "carlos@hotmail.com"
  );
  assert.equal(validateAndNormalizeGuestEmail("no-es-email"), null);
  assert.equal(validateAndNormalizeGuestEmail(null), null);
  assert.equal(validateAndNormalizeGuestEmail(""), null);
});

test("A4: findGuestByName es case-insensitive y trim", async () => {
  const { findGuestByName } = await import(TOOL_URL);
  const guests = [
    { id: "g1", name: "Carlos Pérez", email: null, added_at: "2026-01-01T00:00:00Z" }
  ];
  assert.ok(findGuestByName(guests, "carlos pérez"));
  assert.ok(findGuestByName(guests, "  Carlos Pérez  "));
  assert.equal(findGuestByName(guests, "Otro Nombre"), null);
});

test("A5: upsertGuestInArray agrega nuevo guest sin duplicar", async () => {
  const { upsertGuestInArray } = await import(TOOL_URL);
  const initial = [
    { id: "g1", name: "Carlos Pérez", email: "old@x.com", added_at: "2026-01-01T00:00:00Z" }
  ];
  const newGuest = {
    id: "g2",
    name: "Ana López",
    email: "ana@x.com",
    added_at: "2026-07-12T10:00:00Z"
  };
  const updated = upsertGuestInArray(initial, newGuest);
  assert.equal(updated.length, 2, "guests.length aumenta a 2");
  assert.equal(updated[1].name, "Ana López");
  assert.equal(updated[1].id, "g2");
});

test("A6: upsertGuestInArray actualiza guest existente (mismo nombre)", async () => {
  const { upsertGuestInArray } = await import(TOOL_URL);
  const initial = [
    { id: "g1", name: "Carlos Pérez", email: "old@x.com", added_at: "2026-01-01T00:00:00Z" }
  ];
  const updatedSame = {
    id: "g99", // ID distinto, pero el name coincide.
    name: "  carlos pérez  ", // trim + case-insensitive.
    email: "new@x.com",
    added_at: "2026-07-12T10:00:00Z"
  };
  const updated = upsertGuestInArray(initial, updatedSame);
  assert.equal(updated.length, 1, "guests.length NO aumenta (idempotente)");
  // Preserva el id original.
  assert.equal(updated[0].id, "g1");
  // Actualiza email y added_at.
  assert.equal(updated[0].email, "new@x.com");
  assert.equal(updated[0].added_at, "2026-07-12T10:00:00Z");
});

test("A7: executeAddEventGuest con parent_lead_id faltante devuelve error", async () => {
  const { executeAddEventGuest } = await import(TOOL_URL);
  const r = await executeAddEventGuest(
    { parent_lead_id: "", guest_name: "Carlos Pérez" },
    { supabase: null }
  );
  assert.equal(r.ok, false);
  assert.ok(r.note.includes("parent_lead_id"));
});

test("A8: executeAddEventGuest con nombre inválido devuelve error sin persistir", async () => {
  const { executeAddEventGuest } = await import(TOOL_URL);
  const r = await executeAddEventGuest(
    { parent_lead_id: VALID_LEAD_ID, guest_name: "Por confirmar" },
    { supabase: null }
  );
  assert.equal(r.ok, false);
  assert.ok(r.error_name?.includes("inválido"));
  assert.equal(r.guest, undefined);
});

test("A9: executeAddEventGuest en modo demo devuelve guest válido sin persistir", async () => {
  const { executeAddEventGuest } = await import(TOOL_URL);
  const r = await executeAddEventGuest(
    {
      parent_lead_id: VALID_LEAD_ID,
      guest_name: "Carlos Pérez",
      guest_email: "carlos@example.com"
    },
    { supabase: null }
  );
  assert.equal(r.ok, true);
  assert.equal(r.demo, true);
  assert.equal(r.persisted, false);
  assert.equal(r.guest?.name, "Carlos Pérez");
  assert.equal(r.guest?.email, "carlos@example.com");
  assert.ok(r.guest?.id, "el guest tiene un UUID generado");
  assert.ok(r.guest?.added_at, "el guest tiene un timestamp added_at");
});

test("A10: executeAddEventGuest con email inválido lo reporta pero guarda el nombre igual", async () => {
  const { executeAddEventGuest } = await import(TOOL_URL);
  const r = await executeAddEventGuest(
    {
      parent_lead_id: VALID_LEAD_ID,
      guest_name: "Ana López",
      guest_email: "esto-no-es-email"
    },
    { supabase: null }
  );
  // En modo demo, el email es opcional. Si es inválido, se reporta
  // error_email PERO el guest se simula con email=null (no se rechaza
  // el guest entero por un email mal escrito).
  assert.equal(r.ok, true);
  assert.equal(r.guest?.name, "Ana López");
  assert.equal(r.guest?.email, null);
  assert.ok(r.error_email?.includes("inválido"));
});

test("A11: getAgentTools() ahora retorna 2 tools (Sprint v0.9.8)", async () => {
  const { getAgentTools, getAgentToolByName, TOOL_ADD_EVENT_GUEST, TOOL_EXTRACT_AND_SAVE_CONTACT_INFO } =
    await import(TOOLS_URL);
  const tools = getAgentTools();
  assert.equal(tools.length, 2, "el invariante ahora es length === 2");
  // La tool de captura del titular sigue existiendo.
  assert.ok(getAgentToolByName(TOOL_EXTRACT_AND_SAVE_CONTACT_INFO));
  // La nueva tool de acompañantes está registrada.
  assert.ok(getAgentToolByName(TOOL_ADD_EVENT_GUEST));
  // Los nombres canónicos exportados coinciden.
  assert.equal(TOOL_ADD_EVENT_GUEST, "add_event_guest");
  assert.equal(
    TOOL_EXTRACT_AND_SAVE_CONTACT_INFO,
    "extract_and_save_contact_info"
  );
});

test("A12: la tool add_event_guest tiene schema correcto (parent_lead_id, guest_name required; guest_email optional)", async () => {
  const { getAgentToolByName } = await import(TOOLS_URL);
  const tool = getAgentToolByName("add_event_guest");
  assert.ok(tool, "la tool existe");
  const params = tool.function.parameters;
  // parent_lead_id y guest_name son required.
  assert.deepEqual(
    params.required,
    ["parent_lead_id", "guest_name"],
    "parent_lead_id y guest_name son required"
  );
  // Las 3 properties están definidas.
  assert.ok(params.properties.parent_lead_id);
  assert.ok(params.properties.guest_name);
  assert.ok(params.properties.guest_email);
  // additionalProperties: false (strict).
  assert.equal(params.additionalProperties, false);
});
