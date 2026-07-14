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

test("A12: la tool add_event_guest tiene schema correcto (parent_lead_id opcional, guest_name required; guest_email optional)", async () => {
  const { getAgentToolByName } = await import(TOOLS_URL);
  const tool = getAgentToolByName("add_event_guest");
  assert.ok(tool, "la tool existe");
  const params = tool.function.parameters;
  // FIX 2026-07-14 (Sprint v0.10 post-E2E #4): parent_lead_id es ahora
  // OPCIONAL. El LLM en el E2E con DeepSeek real NO emitía
  // add_event_guest cuando el titular pedía inscribir a un acompañante
  // sin UUID, porque el schema declaraba parent_lead_id como required
  // y el LLM es conservador. La solución: quitar parent_lead_id de
  // `required` y declarar en la description que el sistema usa
  // automáticamente el titular del chat actual si se omite (defense in
  // depth en el dispatch del provider).
  assert.deepEqual(
    params.required,
    ["guest_name"],
    "solo guest_name es required; parent_lead_id es opcional (fallback automático al titular del chat)"
  );
  // Las 3 properties están definidas.
  assert.ok(params.properties.parent_lead_id);
  assert.ok(params.properties.guest_name);
  assert.ok(params.properties.guest_email);
  // additionalProperties: false (strict).
  assert.equal(params.additionalProperties, false);
  // La description menciona explícitamente que parent_lead_id es opcional
  // y que el sistema usa el titular del chat si se omite. Esto es lo que
  // convence al LLM de llamar la tool sin conocer el UUID.
  const desc = tool.function.description;
  assert.ok(
    /parent_lead_id.*OPCIONAL/i.test(desc) || /OPCIONAL.*parent_lead_id/i.test(desc),
    "la description debe declarar parent_lead_id como OPCIONAL"
  );
  assert.ok(
    /OMITE|omite/i.test(desc),
    "la description debe instruir al LLM a omitir parent_lead_id si no lo conoce"
  );
});

/* ===================================================================
 * Sprint v0.11 multi-evento: tests del nuevo flujo con mock supabase.
 * Verifica que el executor:
 *   1. Hace SELECT por `lead_id OR id` con order by checked_in_at desc limit 1.
 *   2. Hace UPDATE por `row.id` (PK de la fila encontrada), NO por parent_lead_id.
 *   3. Funciona en el caso legacy v0.10 (id === leadId) por back-compat.
 * =================================================================== */

function createMockSupabase(overrides = {}) {
  // Mock minimalista del cliente supabase para ejercitar el executor
  // en modo real. Captura las queries para assertar el comportamiento.
  const calls = [];
  const from = (table) => {
    const builder = {
      select: (cols) => {
        calls.push({ op: "select", table, cols });
        const b = {
          ...builder,
          eq: (col, val) => {
            calls.push({ op: "select.eq", table, col, val });
            return b;
          },
          or: (filter) => {
            calls.push({ op: "select.or", table, filter });
            return b;
          },
          order: (col, opts) => {
            calls.push({ op: "select.order", table, col, opts });
            return b;
          },
          limit: (n) => {
            calls.push({ op: "select.limit", table, n });
            return b;
          },
          maybeSingle: async () => {
            calls.push({ op: "select.maybeSingle", table });
            if (overrides.selectResult !== undefined) {
              return overrides.selectResult;
            }
            return { data: null, error: null };
          }
        };
        return b;
      },
      update: (patch) => {
        calls.push({ op: "update", table, patch });
        const b = {
          ...builder,
          eq: async (col, val) => {
            calls.push({ op: "update.eq", table, col, val, patch });
            if (overrides.updateError) {
              return { error: overrides.updateError };
            }
            return { error: null };
          }
        };
        return b;
      }
    };
    return builder;
  };
  return { from, calls, __mock: true };
}

test("A13 (Sprint v0.11 multi-evento): SELECT usa .or('lead_id.eq.X,id.eq.X') y order checked_in_at desc limit 1", async () => {
  const { executeAddEventGuest } = await import(TOOL_URL);
  const sb = createMockSupabase({
    selectResult: {
      data: { id: "row-pk-1", lead_id: "parent-lead-id", guests: [] },
      error: null
    }
  });
  await executeAddEventGuest(
    { parent_lead_id: "parent-lead-id", guest_name: "Socio Carlos", guest_email: null },
    { supabase: sb }
  );
  // Buscar la cadena de operaciones del SELECT.
  const ops = sb.calls.filter((c) => c.op.startsWith("select"));
  // Debe haber exactamente un SELECT con cols="id, guests".
  const sel = ops.find((c) => c.op === "select" && c.cols === "id, guests");
  assert.ok(sel, "debe haber un SELECT con cols='id, guests'");
  // Debe usar .or() con filtro lead_id OR id.
  const orOp = ops.find((c) => c.op === "select.or");
  assert.ok(orOp, "el SELECT debe usar .or() para multi-evento");
  assert.match(
    orOp.filter,
    /lead_id\.eq\.[^,]+,id\.eq\.[^,]+/,
    `.or() debe tener la forma lead_id.eq.X,id.eq.X. Recibido: ${orOp.filter}`
  );
  // Debe ordenar por checked_in_at desc y limitar a 1.
  const orderOp = ops.find((c) => c.op === "select.order");
  assert.ok(orderOp, "el SELECT debe usar .order()");
  assert.equal(orderOp.col, "checked_in_at");
  assert.deepEqual(orderOp.opts, { ascending: false });
  const limitOp = ops.find((c) => c.op === "select.limit");
  assert.ok(limitOp, "el SELECT debe usar .limit(1)");
  assert.equal(limitOp.n, 1);
});

test("A14 (Sprint v0.11 multi-evento): UPDATE se hace por row.id, NO por parent_lead_id", async () => {
  const { executeAddEventGuest } = await import(TOOL_URL);
  const sb = createMockSupabase({
    selectResult: {
      data: { id: "DIFFERENT-row-pk", lead_id: "parent-lead-id", guests: [] },
      error: null
    }
  });
  await executeAddEventGuest(
    { parent_lead_id: "parent-lead-id", guest_name: "Socio Carlos", guest_email: null },
    { supabase: sb }
  );
  // Buscar la operación UPDATE.
  const updateOp = sb.calls.find((c) => c.op === "update");
  assert.ok(updateOp, "debe haber un UPDATE");
  // Buscar el .eq() del UPDATE.
  const updateEq = sb.calls.find((c) => c.op === "update.eq");
  assert.ok(updateEq, "el UPDATE debe usar .eq()");
  // CRÍTICO: el UPDATE.eq debe usar `row.id` (la PK de la fila
  // encontrada), NO `parent_lead_id`. Si pasara `parent_lead_id`,
  // en el modelo multi-evento estaríamos actualizando una fila
  // incorrecta.
  assert.equal(
    updateEq.col,
    "id",
    "el UPDATE debe filtrar por la columna 'id' (PK de la fila)"
  );
  assert.equal(
    updateEq.val,
    "DIFFERENT-row-pk",
    `el UPDATE.eq('id', val) debe usar row.id, NO parent_lead_id. Recibido: ${updateEq.val}`
  );
  assert.notEqual(
    updateEq.val,
    "parent-lead-id",
    "BUG: el UPDATE está filtrando por parent_lead_id (legacy v0.10) en vez de row.id (multi-evento v0.11)"
  );
});

test("A15 (Sprint v0.11 multi-evento): el executor maneja el caso legacy v0.10 (id === leadId) sin romperse", async () => {
  // Back-compat: si una fila tiene id === leadId (workaround v0.10),
  // el SELECT por `.or('lead_id.eq.X,id.eq.X')` la encuentra igual.
  const { executeAddEventGuest } = await import(TOOL_URL);
  const LEGACY_LEAD_ID = "legacy-row-pk-also-is-lead";
  const sb = createMockSupabase({
    selectResult: {
      // Caso legacy: id == parent_lead_id (workaround v0.10).
      data: { id: LEGACY_LEAD_ID, lead_id: null, guests: [] },
      error: null
    }
  });
  const r = await executeAddEventGuest(
    { parent_lead_id: LEGACY_LEAD_ID, guest_name: "Socio BackCompat", guest_email: null },
    { supabase: sb }
  );
  assert.equal(r.ok, true, "caso legacy v0.10 debe seguir funcionando");
  assert.equal(r.persisted, true);
  // El UPDATE debe seguir usando row.id, que en este caso coincide con
  // parent_lead_id (legacy).
  const updateEq = sb.calls.find((c) => c.op === "update.eq");
  assert.equal(updateEq.col, "id");
  assert.equal(updateEq.val, LEGACY_LEAD_ID);
});

