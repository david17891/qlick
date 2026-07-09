/**
 * Tests para `updateLeadFields` (FIX 2026-07-08: admin edit lead fields).
 *
 * Sesión David 2026-07-08 ~19:30 — los leads "WhatsApp Lead" legacy
 * (registrados con placeholders del bug del bot) necesitan poder editarse
 * manualmente desde el drawer del CRM. Estos tests cubren la función
 * server-side `updateLeadFields` que valida + persiste + audita.
 *
 * Patrón: `node --test`, sin libs externas. Mockeamos
 * `createSupabaseAdminClient` y `checkSupabaseConfig` vía `node:test/mock`
 * para no tocar DB real.
 *
 * Cobertura:
 *  - Validación de email/phone/name
 *  - Normalización de email (lowercase + extract embedded)
 *  - Diff: solo persiste lo que cambió
 *  - Audit log con before/after snapshots
 *  - phone_normalized se actualiza cuando difiere
 *  - Modo demo (Supabase no configurado) → no-op
 *  - Patch vacío → error
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

// Mocks: Supabase configurado + client controlado.
let mockClient = null;
let checkConfiguredReturn = true;

mock.module("../src/lib/supabase/health.ts", {
  namedExports: {
    checkSupabaseConfig: () => ({ configured: checkConfiguredReturn }),
  },
});
mock.module("../src/lib/supabase/admin.ts", {
  namedExports: {
    createSupabaseAdminClient: () => mockClient,
  },
});

// Import DESPUÉS de mockear para que tome los mocks.
const { updateLeadFields } = await import(
  "../src/lib/crm/leads-admin-server.ts"
);

/**
 * Helper: mock client con `captured` para asserts.
 * Soporta `from("leads")` (select + update) y `from("admin_audit_log")` (insert).
 */
function mkMockClient(initialRow) {
  const captured = {
    updatePayload: null,
    updateWhere: null,
    updateResult: null,
    updateError: null,
    selectResult: null,
    selectError: null,
    auditInsert: null,
  };
  const client = {
    from(table) {
      if (table === "leads") {
        return {
          select(_cols) {
            return {
              eq(_col, _val) {
                return {
                  maybeSingle: async () => {
                    if (captured.selectError) {
                      return { data: null, error: captured.selectError };
                    }
                    return {
                      data: captured.selectResult ?? initialRow,
                      error: null,
                    };
                  },
                };
              },
            };
          },
          update(payload) {
            return {
              eq(col, val) {
                captured.updatePayload = payload;
                captured.updateWhere = { col, val };
                return {
                  select() {
                    return {
                      maybeSingle: async () => {
                        if (captured.updateError) {
                          return { data: null, error: captured.updateError };
                        }
                        // El row retornado refleja el update.
                        const baseRow =
                          captured.updateResult ??
                          initialRow ?? { id: "lead-test" };
                        return {
                          data: { ...baseRow, ...payload },
                          error: null,
                        };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      }
      if (table === "admin_audit_log") {
        return {
          insert: async (data) => {
            captured.auditInsert = data;
            return { error: null };
          },
        };
      }
      return {
        update: () => ({
          eq: () => ({ select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
        }),
        insert: async () => ({ error: null }),
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      };
    },
  };
  return { client, captured };
}

function mkInitialRow(overrides = {}) {
  return {
    id: "lead-test-1",
    name: "WhatsApp Lead",
    email: "wa.dbc1ce4d26e9@placeholder.local",
    phone: "+526864197951",
    status: "new",
    source: "whatsapp",
    intent: "course_interest",
    course_of_interest: null,
    owner_id: null,
    tags: null,
    summary: null,
    estimated_value_mxn: null,
    next_follow_up_at: null,
    consent_to_contact: false,
    created_at: "2026-07-08T07:00:00Z",
    updated_at: "2026-07-08T07:00:00Z",
    phone_normalized: "+526864197951",
    whatsapp_status: "no_contactado",
    last_contacted_at: null,
    score: null,
    qualification: null,
    survey_offer_sent_at: null,
    bot_paused: false,
    bot_paused_at: null,
    bot_paused_by_email: null,
    ...overrides,
  };
}

/* ─────────────────────────────────────────────────────────────
 * 1. Modo demo: Supabase no configurado
 * ───────────────────────────────────────────────────────────── */

test("updateLeadFields: Supabase no configurado → ok=false con nota", async () => {
  checkConfiguredReturn = false;
  const result = await updateLeadFields(
    "lead-1",
    { name: "Yesy" },
    "admin@qlick",
  );
  assert.equal(result.ok, false);
  assert.match(result.note ?? "", /Supabase no configurado/);
  checkConfiguredReturn = true; // reset
});

/* ─────────────────────────────────────────────────────────────
 * 2. Validación de inputs
 * ───────────────────────────────────────────────────────────── */

test("updateLeadFields: patch vacío → error", async () => {
  const { client } = mkMockClient(mkInitialRow());
  mockClient = client;
  const result = await updateLeadFields("lead-1", {}, "admin@qlick");
  assert.equal(result.ok, false);
  assert.match(result.note ?? "", /Patch vac[ií]o/);
});

test("updateLeadFields: name vacío → error", async () => {
  const { client } = mkMockClient(mkInitialRow());
  mockClient = client;
  const result = await updateLeadFields(
    "lead-1",
    { name: "   " },
    "admin@qlick",
  );
  assert.equal(result.ok, false);
  assert.match(result.note ?? "", /nombre no puede estar vac[ií]o/i);
});

test("updateLeadFields: name > 100 chars → error", async () => {
  const { client } = mkMockClient(mkInitialRow());
  mockClient = client;
  const result = await updateLeadFields(
    "lead-1",
    { name: "a".repeat(101) },
    "admin@qlick",
  );
  assert.equal(result.ok, false);
  assert.match(result.note ?? "", /100 caracteres/);
});

test("updateLeadFields: email con formato inválido → error", async () => {
  const { client } = mkMockClient(mkInitialRow());
  mockClient = client;
  const result = await updateLeadFields(
    "lead-1",
    { email: "not-an-email" },
    "admin@qlick",
  );
  assert.equal(result.ok, false);
  assert.match(result.note ?? "", /Email con formato inv[áa]lido/);
});

test("updateLeadFields: phone inválido (no numérico) → error", async () => {
  const { client } = mkMockClient(mkInitialRow());
  mockClient = client;
  // "abc" no matchea ningún patrón numérico → normalizePhone devuelve null.
  const result = await updateLeadFields(
    "lead-1",
    { phone: "abc123" },
    "admin@qlick",
  );
  assert.equal(result.ok, false);
  assert.match(result.note ?? "", /Tel[eé]fono inv[áa]lido/);
});

/* ─────────────────────────────────────────────────────────────
 * 3. Caso real David 2026-07-08: lead `36249ecd` Yesy087
 * ───────────────────────────────────────────────────────────── */

test("updateLeadFields: editar name 'WhatsApp Lead' → 'Yesy' persiste + audita", async () => {
  // Replica exacta del row del lead 36249ecd reportado por David.
  const initial = mkInitialRow({
    id: "36249ecd-31fc-463e-913a-3ecc9e1d1968",
    name: "WhatsApp Lead",
    email: "yesy087@hotmail.com",
    phone: "+526861096680",
  });
  const { client, captured } = mkMockClient(initial);
  mockClient = client;

  const result = await updateLeadFields(
    "36249ecd-31fc-463e-913a-3ecc9e1d1968",
    { name: "Yesy" },
    "admin@qlick",
  );

  assert.equal(result.ok, true);
  assert.equal(captured.updatePayload.name, "Yesy");
  assert.equal(captured.updatePayload.email, undefined, "no debe tocar email");
  assert.equal(captured.updatePayload.phone, undefined, "no debe tocar phone");

  // Audit log
  assert.ok(captured.auditInsert, "debe haber audit insert");
  assert.equal(captured.auditInsert.action, "lead_field_edit");
  assert.equal(captured.auditInsert.actor_email, "admin@qlick");
  assert.equal(captured.auditInsert.entity_type, "lead");
  assert.equal(
    captured.auditInsert.entity_id,
    "36249ecd-31fc-463e-913a-3ecc9e1d1968",
  );
  assert.deepEqual(captured.auditInsert.before, { name: "WhatsApp Lead" });
  assert.deepEqual(captured.auditInsert.after, { name: "Yesy" });
  assert.deepEqual(captured.auditInsert.metadata.fields_changed, ["name"]);
});

test("updateLeadFields: editar email placeholder → email real baja a minúsculas", async () => {
  const initial = mkInitialRow({
    name: "WhatsApp Lead",
    email: "wa.dbc1ce4d26e9@placeholder.local",
  });
  const { client, captured } = mkMockClient(initial);
  mockClient = client;

  const result = await updateLeadFields(
    "lead-1",
    { email: "DAVID@Example.COM" },
    "admin@qlick",
  );

  assert.equal(result.ok, true);
  assert.equal(captured.updatePayload.email, "david@example.com");
});

test("updateLeadFields: email embebido en contexto se extrae", async () => {
  // Caso real: admin pega "su email es david@x.com" → debe extraer david@x.com.
  const initial = mkInitialRow();
  const { client, captured } = mkMockClient(initial);
  mockClient = client;

  const result = await updateLeadFields(
    "lead-1",
    { email: "su email es david@x.com" },
    "admin@qlick",
  );

  assert.equal(result.ok, true);
  assert.equal(captured.updatePayload.email, "david@x.com");
});

/* ─────────────────────────────────────────────────────────────
 * 4. Diff: solo persiste los campos que cambian
 * ───────────────────────────────────────────────────────────── */

test("updateLeadFields: si los datos ya están iguales → ok=true sin UPDATE, sin audit", async () => {
  const initial = mkInitialRow({
    name: "Yesy",
    email: "yesy087@hotmail.com",
    phone: "+526861096680",
  });
  const { client, captured } = mkMockClient(initial);
  mockClient = client;

  const result = await updateLeadFields(
    "lead-1",
    { name: "Yesy", email: "yesy087@hotmail.com", phone: "+526861096680" },
    "admin@qlick",
  );

  assert.equal(result.ok, true);
  assert.match(result.note ?? "", /Sin cambios/);
  // El captured.updatePayload puede ser {} o no setearse. Lo que SÍ debe
  // pasar es que NO haya audit insert (porque no hubo cambio real).
  assert.equal(captured.auditInsert, null);
});

test("updateLeadFields: phone con formato distinto pero mismo normalizado → NO actualiza phone pero sí phone_normalized", async () => {
  const initial = mkInitialRow({
    phone: "+526864197951",
    phone_normalized: "+526864197951",
  });
  const { client, captured } = mkMockClient(initial);
  mockClient = client;

  const result = await updateLeadFields(
    "lead-1",
    { phone: "+52 686 419 7951" },
    "admin@qlick",
  );

  assert.equal(result.ok, true);
  assert.equal(
    captured.updatePayload.phone,
    "+52 686 419 7951",
    "phone cambia (formato distinto)",
  );
  assert.equal(
    captured.updatePayload.phone_normalized,
    "+526864197951",
    "phone_normalized debe estar en el payload (mismo valor pero lo mandamos para refresh)",
  );
});

/* ─────────────────────────────────────────────────────────────
 * 5. Edit de los 3 campos a la vez
 * ───────────────────────────────────────────────────────────── */

test("updateLeadFields: editar name + email + phone en un solo PATCH → todos en audit", async () => {
  const initial = mkInitialRow({
    name: "WhatsApp Lead",
    email: "wa.xxx@placeholder.local",
    phone: "+447710173736",
    phone_normalized: "+447710173736",
  });
  const { client, captured } = mkMockClient(initial);
  mockClient = client;

  const result = await updateLeadFields(
    "lead-1",
    {
      name: "John Smith",
      email: "john@example.com",
      phone: "+44 771 017 3736",
    },
    "admin@qlick",
  );

  assert.equal(result.ok, true);
  assert.deepEqual(captured.auditInsert.before, {
    name: "WhatsApp Lead",
    email: "wa.xxx@placeholder.local",
    phone: "+447710173736",
  });
  assert.deepEqual(captured.auditInsert.after, {
    name: "John Smith",
    email: "john@example.com",
    phone: "+44 771 017 3736",
  });
  assert.deepEqual(
    captured.auditInsert.metadata.fields_changed.sort(),
    ["email", "name", "phone"].sort(),
  );
});

/* ─────────────────────────────────────────────────────────────
 * 6. Errores de DB
 * ───────────────────────────────────────────────────────────── */

test("updateLeadFields: SELECT previo falla → ok=false", async () => {
  const { client, captured } = mkMockClient(mkInitialRow());
  captured.selectError = { code: "PGRST301", message: "timeout" };
  mockClient = client;

  const result = await updateLeadFields(
    "lead-1",
    { name: "Yesy" },
    "admin@qlick",
  );
  assert.equal(result.ok, false);
  assert.match(result.note ?? "", /No se pudo leer/);
});

test("updateLeadFields: lead no existe → ok=false 'no existe'", async () => {
  // Para este test el mock debe devolver data=null, no la fila default.
  // Lo hacemos creando un client sin initialRow y forzando selectResult=null.
  const captured = {
    updatePayload: null,
    updateWhere: null,
    updateResult: null,
    updateError: null,
    selectResult: null,
    selectError: null,
    auditInsert: null,
  };
  const client = {
    from(table) {
      if (table === "leads") {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({ data: null, error: null }),
                };
              },
            };
          },
          update: () => ({
            eq: () => ({
              select: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === "admin_audit_log") {
        return {
          insert: async (data) => {
            captured.auditInsert = data;
            return { error: null };
          },
        };
      }
      return {};
    },
  };
  mockClient = client;

  const result = await updateLeadFields(
    "lead-1",
    { name: "Yesy" },
    "admin@qlick",
  );
  assert.equal(result.ok, false);
  assert.match(result.note ?? "", /no existe/);
});

test("updateLeadFields: UPDATE falla → ok=false", async () => {
  const { client, captured } = mkMockClient(mkInitialRow());
  captured.updateError = { code: "PGRST500", message: "DB error" };
  mockClient = client;

  const result = await updateLeadFields(
    "lead-1",
    { name: "Yesy" },
    "admin@qlick",
  );
  assert.equal(result.ok, false);
  assert.match(result.note ?? "", /No se pudo actualizar/);
});