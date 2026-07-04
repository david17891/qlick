/**
 * Tests para `src/lib/crm/handoffs-server.ts` (Fase 7a.3 → G-10).
 *
 * Cubre:
 *   - `listHandoffs`: filtros por status / from / to, count, mapping de rows
 *     crudos a `HandoffRow` (incl. fallback de `last_messages` no array).
 *   - `updateHandoffStatus`: caso happy path con audit log, validaciones
 *     (status inválido, handoffId vacío, no-op cuando status ya coincide),
 *     race window (otro proceso cambió el status).
 *   - `getRecentEventForHandoff`: match por phone_normalized, miss (sin row).
 *
 * Patrón de mock: cliente fake con chain `from().select().eq().gte().lte()
 * .order().range()` programáticamente configurable. Los tests NO tocan la DB.
 *
 * Corre con `node --test`:
 *   npm test (registra el loader de @/ aliases vía tests/loader-register.mjs).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// ─────────────────────────────────────────────────────────────────────
// Setup: Supabase "configurado" para que el código entre al flujo real.
// ─────────────────────────────────────────────────────────────────────

const ORIG_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ORIG_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const ORIG_SECRET = process.env.SUPABASE_SECRET_KEY;

process.env.NEXT_PUBLIC_SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://test.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.fake.fake";
process.env.SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.fake.fake";

// ─────────────────────────────────────────────────────────────────────
// Fake Supabase client — chain programáticamente configurable.
// Captura las llamadas a .eq/.gte/.lte/.order/.range para verificar filtros.
// ─────────────────────────────────────────────────────────────────────

/**
 * @typedef {{ data: any, count?: number|null, error?: { code?: string, message?: string }|null }} FakeResult
 */

/**
 * @typedef {Object} FakeQueryState
 * @property {string} from
 * @property {string[]} calls
 * @property {FakeResult} result
 */

/**
 * Crea un fake SupabaseClient con un estado por tabla (`from`). Cada
 * `from(table)` devuelve un objeto que captura las llamadas y termina
 * en `.maybeSingle()` o `.range()` devolviendo el `result`.
 *
 * @param {Record<string, FakeResult>} tables
 */
function fakeSupabase(tables) {
  /** @type {Record<string, FakeQueryState>} */
  const handlers = {};
  for (const [table, result] of Object.entries(tables)) {
    handlers[table] = { from: table, calls: [], result };
  }

  const makeChain = (table, isMutation) => {
    const state = handlers[table];
    if (!state) {
      throw new Error(`fakeSupabase: no stub for table "${table}"`);
    }
    const record = (verb, col, val) => {
      state.calls.push(`${verb}:${col}:${val === undefined ? "" : val}`);
      return chain;
    };
    /** @type {any} */
    const chain = {
      select: (cols, opts) => {
        state.calls.push(
          `select:${cols}:${opts && opts.count ? "count=exact" : ""}`,
        );
        return chain;
      },
      eq: (col, val) => record("eq", col, val),
      gte: (col, val) => record("gte", col, val),
      lte: (col, val) => record("lte", col, val),
      order: (col, opts) => {
        state.calls.push(
          `order:${col}:${opts && opts.ascending === false ? "desc" : "asc"}`,
        );
        return chain;
      },
      limit: (n) => {
        state.calls.push(`limit:${n}`);
        return chain;
      },
      maybeSingle: async () => {
        state.calls.push(`maybeSingle`);
        return state.result ?? { data: null, error: null, count: null };
      },
      single: async () => {
        state.calls.push(`single`);
        return state.result ?? { data: null, error: null, count: null };
      },
      range: async (from, to) => {
        state.calls.push(`range:${from}-${to}`);
        return state.result ?? { data: null, error: null, count: null };
      },
    };
    if (isMutation === 1) {
      chain.update = (patch) => {
        state.calls.push(`update:${JSON.stringify(patch)}`);
        return chain;
      };
    }
    if (isMutation === 2) {
      chain.insert = (payload) => {
        state.calls.push(`insert:${JSON.stringify(payload)}`);
        return chain;
      };
    }
    return chain;
  };

  return {
    from: (table) => makeChain(table, 0),
    updateTable: (table) => makeChain(table, 1),
    handlers,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Sample rows
// ─────────────────────────────────────────────────────────────────────

const ROW_PENDING = {
  id: "11111111-aaaa-bbbb-cccc-111111111111",
  lead_id: "22222222-aaaa-bbbb-cccc-222222222222",
  lead_name: "Ana Lopez",
  lead_phone: "+5215511112222",
  lead_email: "ana@example.com",
  last_messages: [
    { direction: "inbound", body: "Hola, necesito info", timestamp: "2026-07-01T10:00:00Z" },
    { direction: "outbound", body: "¡Hola! ¿En qué te ayudo?", timestamp: "2026-07-01T10:00:30Z" },
    { direction: "inbound", body: "Quiero hablar con un humano", timestamp: "2026-07-01T10:01:00Z" },
  ],
  status: "pending",
  assigned_to: null,
  notes: null,
  created_at: "2026-07-01T10:01:00Z",
  contacted_at: null,
  closed_at: null,
};

const ROW_CONTACTED = {
  ...ROW_PENDING,
  id: "33333333-aaaa-bbbb-cccc-333333333333",
  lead_name: "Beto Ruiz",
  lead_phone: "+5215511113333",
  status: "contacted",
  contacted_at: "2026-07-02T09:00:00Z",
};

// ─────────────────────────────────────────────────────────────────────
// listHandoffs
// ─────────────────────────────────────────────────────────────────────

test("listHandoffs: sin filtros devuelve todas las filas mapeadas", async () => {
  const fake = fakeSupabase({
    handoff_requests: {
      data: [ROW_PENDING, ROW_CONTACTED],
      count: 2,
    },
  });
  const { listHandoffs } = await import("../src/lib/crm/handoffs-server.ts");
  const result = await listHandoffs({ supabase: fake });

  assert.equal(result.ok, true);
  assert.equal(result.total, 2);
  assert.equal(result.rows.length, 2);

  const ana = result.rows[0];
  assert.equal(ana.id, ROW_PENDING.id);
  assert.equal(ana.lead_name, "Ana Lopez");
  assert.equal(ana.status, "pending");
  assert.equal(ana.last_messages.length, 3);
  assert.equal(ana.last_messages[0].direction, "inbound");
  assert.equal(ana.contacted_at, null);
});

test("listHandoffs: aplica filtro status=pending (.eq('status','pending'))", async () => {
  const fake = fakeSupabase({
    handoff_requests: { data: [ROW_PENDING], count: 1 },
  });
  const { listHandoffs } = await import("../src/lib/crm/handoffs-server.ts");
  const result = await listHandoffs({
    filters: { status: "pending" },
    supabase: fake,
  });
  assert.equal(result.ok, true);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].status, "pending");

  const calls = fake.handlers["handoff_requests"].calls;
  assert.ok(
    calls.some((c) => c === "eq:status:pending"),
    `esperaba 'eq:status:pending' en ${calls.join(", ")}`,
  );
});

test("listHandoffs: ignora status inválido (no rompe, no agrega eq)", async () => {
  // "garbage" no está en HandoffStatus — el filtro se ignora silenciosamente.
  const fake = fakeSupabase({
    handoff_requests: { data: [ROW_PENDING], count: 1 },
  });
  const { listHandoffs } = await import("../src/lib/crm/handoffs-server.ts");
  const result = await listHandoffs({
    filters: { status: "garbage" },
    supabase: fake,
  });
  assert.equal(result.ok, true);
  const calls = fake.handlers["handoff_requests"].calls;
  assert.ok(
    !calls.some((c) => c.startsWith("eq:status:")),
    `no debe haber eq:status en ${calls.join(", ")}`,
  );
});

test("listHandoffs: aplica filtros from/to (gte + lte)", async () => {
  const fake = fakeSupabase({
    handoff_requests: { data: [ROW_PENDING], count: 1 },
  });
  const { listHandoffs } = await import("../src/lib/crm/handoffs-server.ts");
  const result = await listHandoffs({
    filters: {
      from: "2026-07-01",
      to: "2026-07-31",
    },
    supabase: fake,
  });
  assert.equal(result.ok, true);
  const calls = fake.handlers["handoff_requests"].calls;
  assert.ok(calls.some((c) => c === "gte:created_at:2026-07-01"));
  assert.ok(calls.some((c) => c === "lte:created_at:2026-07-31"));
});

test("listHandoffs: orden y paginación (order desc by created_at, range)", async () => {
  const fake = fakeSupabase({
    handoff_requests: { data: [ROW_PENDING, ROW_CONTACTED], count: 25 },
  });
  const { listHandoffs } = await import("../src/lib/crm/handoffs-server.ts");
  const result = await listHandoffs({
    filters: { limit: 10, offset: 20 },
    supabase: fake,
  });
  assert.equal(result.ok, true);
  assert.equal(result.total, 25);
  const calls = fake.handlers["handoff_requests"].calls;
  assert.ok(calls.some((c) => c.startsWith("order:created_at:desc")));
  assert.ok(calls.some((c) => c === "range:20-29"));
});

test("listHandoffs: error de DB devuelve ok=false y error.message", async () => {
  const fake = fakeSupabase({
    handoff_requests: {
      data: null,
      error: { code: "PGRST500", message: "DB timeout" },
    },
  });
  const { listHandoffs } = await import("../src/lib/crm/handoffs-server.ts");
  const result = await listHandoffs({ supabase: fake });
  assert.equal(result.ok, false);
  assert.equal(result.rows.length, 0);
  assert.equal(result.error, "DB timeout");
});

test("listHandoffs: mapea last_messages=null a [] (defensiva)", async () => {
  const rowWithNullMessages = {
    ...ROW_PENDING,
    last_messages: null,
  };
  const fake = fakeSupabase({
    handoff_requests: { data: [rowWithNullMessages], count: 1 },
  });
  const { listHandoffs } = await import("../src/lib/crm/handoffs-server.ts");
  const result = await listHandoffs({ supabase: fake });
  assert.equal(result.ok, true);
  assert.deepEqual(result.rows[0].last_messages, []);
});

test("listHandoffs: mapea status inválido a pending (fallback defensivo)", async () => {
  const rowWithBadStatus = { ...ROW_PENDING, status: "weird" };
  const fake = fakeSupabase({
    handoff_requests: { data: [rowWithBadStatus], count: 1 },
  });
  const { listHandoffs } = await import("../src/lib/crm/handoffs-server.ts");
  const result = await listHandoffs({ supabase: fake });
  assert.equal(result.ok, true);
  assert.equal(result.rows[0].status, "pending");
});

// ─────────────────────────────────────────────────────────────────────
// updateHandoffStatus
// ─────────────────────────────────────────────────────────────────────

test("updateHandoffStatus: caso happy path (pending → contacted) + contacted_at seteada", async () => {
  // Necesitamos que updateHandoffStatus lea primero el row previo
  // (SELECT) y luego haga el UPDATE. Para eso el fake debe tener ambas
  // operaciones encadenadas sobre la misma tabla.
  const calls = [];
  let maybeSingleCalls = 0;
  let lastRow = null;
  const rowAfter = {
    ...ROW_PENDING,
    status: "contacted",
    contacted_at: "2026-07-04T12:00:00Z",
  };
  const fake = {
    from: (table) => {
      const chain = {
        select: (cols) => {
          calls.push(`select:${cols}`);
          return chain;
        },
        eq: (col, val) => {
          calls.push(`eq:${col}:${val}`);
          return chain;
        },
        update: (patch) => {
          calls.push(`update:${JSON.stringify(patch)}`);
          lastRow = patch;
          return chain;
        },
        maybeSingle: async () => {
          maybeSingleCalls += 1;
          calls.push(`maybeSingle`);
          if (maybeSingleCalls === 1) return { data: ROW_PENDING, error: null };
          return { data: rowAfter, error: null };
        },
      };
      if (table !== "handoff_requests") {
        throw new Error(`unexpected table: ${table}`);
      }
      return chain;
    },
  };

  const { updateHandoffStatus } = await import(
    "../src/lib/crm/handoffs-server.ts"
  );
  const result = await updateHandoffStatus(
    {
      handoffId: ROW_PENDING.id,
      newStatus: "contacted",
      actorEmail: "david@qlick.mx",
    },
    { supabase: fake },
  );

  assert.equal(result.ok, true);
  assert.equal(result.handoff.status, "contacted");
  assert.equal(result.handoff.contacted_at, "2026-07-04T12:00:00Z");
  assert.ok(
    JSON.stringify(lastRow).includes("contacted_at"),
    "UPDATE patch debe contener contacted_at",
  );
});

test("updateHandoffStatus: pending → closed cierra contacted_at y closed_at", async () => {
  let maybeSingleCalls = 0;
  let patchSeen = null;
  const rowAfter = {
    ...ROW_PENDING,
    status: "closed",
    closed_at: "2026-07-04T13:00:00Z",
  };
  const fake = {
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        update: (p) => {
          patchSeen = p;
          return chain;
        },
        maybeSingle: async () => {
          maybeSingleCalls += 1;
          if (maybeSingleCalls === 1) return { data: ROW_PENDING, error: null };
          return { data: rowAfter, error: null };
        },
      };
      return chain;
    },
  };
  const { updateHandoffStatus } = await import(
    "../src/lib/crm/handoffs-server.ts"
  );
  const result = await updateHandoffStatus(
    {
      handoffId: ROW_PENDING.id,
      newStatus: "closed",
      actorEmail: "david@qlick.mx",
    },
    { supabase: fake },
  );
  assert.equal(result.ok, true);
  assert.equal(result.handoff.status, "closed");
  assert.ok(patchSeen);
  // closed_at se setea a "ahora" por el server lib (no a un valor fijo del row).
  assert.match(
    patchSeen.closed_at,
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    "closed_at debe ser un ISO timestamp",
  );
  assert.ok(
    !("contacted_at" in patchSeen),
    "closed no debe setear contacted_at",
  );
});

test("updateHandoffStatus: no-op cuando el status ya coincide (sin UPDATE)", async () => {
  let selectCalls = 0;
  const fake = {
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        update: () => {
          throw new Error("no debe llamar update si ya estaba en contacted");
        },
        maybeSingle: async () => {
          selectCalls += 1;
          return {
            data: { ...ROW_PENDING, status: "contacted" },
            error: null,
          };
        },
      };
      return chain;
    },
  };
  const { updateHandoffStatus } = await import(
    "../src/lib/crm/handoffs-server.ts"
  );
  const result = await updateHandoffStatus(
    {
      handoffId: ROW_PENDING.id,
      newStatus: "contacted",
      actorEmail: "david@qlick.mx",
    },
    { supabase: fake },
  );
  assert.equal(result.ok, true);
  assert.match(result.note ?? "", /ya estaba/);
  assert.equal(selectCalls, 1, "solo debe hacer SELECT, no UPDATE");
});

test("updateHandoffStatus: race window — el WHERE no matchea (otro cambió status)", async () => {
  let maybeSingleCalls = 0;
  const fake = {
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        update: () => chain,
        maybeSingle: async () => {
          maybeSingleCalls += 1;
          if (maybeSingleCalls === 1) return { data: ROW_PENDING, error: null };
          return { data: null, error: null };
        },
      };
      return chain;
    },
  };
  const { updateHandoffStatus } = await import(
    "../src/lib/crm/handoffs-server.ts"
  );
  const result = await updateHandoffStatus(
    {
      handoffId: ROW_PENDING.id,
      newStatus: "contacted",
      actorEmail: "david@qlick.mx",
    },
    { supabase: fake },
  );
  assert.equal(result.ok, false);
  assert.match(result.note ?? "", /Conflicto/);
});

test("updateHandoffStatus: handoff no existe → ok=false con note claro", async () => {
  const fake = {
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        update: () => {
          throw new Error("no debe llamar update");
        },
        maybeSingle: async () => ({ data: null, error: null }),
      };
      return chain;
    },
  };
  const { updateHandoffStatus } = await import(
    "../src/lib/crm/handoffs-server.ts"
  );
  const result = await updateHandoffStatus(
    {
      handoffId: "no-existe",
      newStatus: "contacted",
      actorEmail: "david@qlick.mx",
    },
    { supabase: fake },
  );
  assert.equal(result.ok, false);
  assert.match(result.note ?? "", /no existe/i);
});

test("updateHandoffStatus: status inválido (no en enum) → ok=false sin tocar DB", async () => {
  let fromCalled = false;
  const fake = {
    from: () => {
      fromCalled = true;
      return {};
    },
  };
  const { updateHandoffStatus } = await import(
    "../src/lib/crm/handoffs-server.ts"
  );
  const result = await updateHandoffStatus(
    {
      handoffId: ROW_PENDING.id,
      newStatus: "weird",
      actorEmail: "david@qlick.mx",
    },
    { supabase: fake },
  );
  assert.equal(result.ok, false);
  assert.match(result.note ?? "", /inválido/i);
  assert.equal(fromCalled, false, "no debe consultar DB con status inválido");
});

test("updateHandoffStatus: handoffId vacío → ok=false sin tocar DB", async () => {
  let fromCalled = false;
  const fake = {
    from: () => {
      fromCalled = true;
      return {};
    },
  };
  const { updateHandoffStatus } = await import(
    "../src/lib/crm/handoffs-server.ts"
  );
  const result = await updateHandoffStatus(
    {
      handoffId: "",
      newStatus: "contacted",
      actorEmail: "david@qlick.mx",
    },
    { supabase: fake },
  );
  assert.equal(result.ok, false);
  assert.equal(fromCalled, false);
});

test("updateHandoffStatus: termina OK con audit log (best-effort si supabase admin no mockea)", async () => {
  // El audit log (admin_audit_log) lo escribe logAdminAction internamente,
  // que usa createSupabaseAdminClient (no inyectable). En este test solo
  // validamos que el flujo principal termina con ok=true; el INSERT del
  // audit log puede fallar silenciosamente (best-effort por diseño).
  let maybeSingleCalls = 0;
  const rowAfter = {
    ...ROW_PENDING,
    status: "contacted",
    contacted_at: "2026-07-04T12:00:00Z",
  };
  const fake = {
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        update: () => chain,
        maybeSingle: async () => {
          maybeSingleCalls += 1;
          if (maybeSingleCalls === 1) return { data: ROW_PENDING, error: null };
          return { data: rowAfter, error: null };
        },
      };
      return chain;
    },
  };
  const { updateHandoffStatus } = await import(
    "../src/lib/crm/handoffs-server.ts"
  );
  const result = await updateHandoffStatus(
    {
      handoffId: ROW_PENDING.id,
      newStatus: "contacted",
      actorEmail: "david@qlick.mx",
    },
    { supabase: fake },
  );
  assert.equal(result.ok, true);
  assert.ok(result.handoff);
  assert.equal(result.handoff.status, "contacted");
});

// ─────────────────────────────────────────────────────────────────────
// getRecentEventForHandoff
// ─────────────────────────────────────────────────────────────────────

test("getRecentEventForHandoff: match devuelve contexto del evento", async () => {
  const fake = fakeSupabase({
    event_confirmations: {
      data: {
        event_id: "evt-1",
        confirmed_at: "2026-07-01T09:00:00Z",
        events: {
          id: "evt-1",
          title: "Masterclass Embudos",
          starts_at: "2026-07-15T18:00:00Z",
        },
      },
    },
  });
  const { getRecentEventForHandoff } = await import(
    "../src/lib/crm/handoffs-server.ts"
  );
  const ctx = await getRecentEventForHandoff("+5215511112222", {
    supabase: fake,
  });
  assert.ok(ctx);
  assert.equal(ctx.eventTitle, "Masterclass Embudos");
  assert.equal(ctx.startsAt, "2026-07-15T18:00:00Z");
  assert.equal(ctx.confirmedAt, "2026-07-01T09:00:00Z");

  const calls = fake.handlers["event_confirmations"].calls;
  assert.ok(calls.some((c) => c === "eq:phone_normalized:+5215511112222"));
  assert.ok(calls.some((c) => c === "limit:1"));
});

test("getRecentEventForHandoff: sin match devuelve null (no lanza)", async () => {
  const fake = fakeSupabase({
    event_confirmations: { data: null, error: null },
  });
  const { getRecentEventForHandoff } = await import(
    "../src/lib/crm/handoffs-server.ts"
  );
  const ctx = await getRecentEventForHandoff("+5215511112222", {
    supabase: fake,
  });
  assert.equal(ctx, null);
});

test("getRecentEventForHandoff: phone vacío devuelve null sin tocar DB", async () => {
  let fromCalled = false;
  const fake = {
    from: () => {
      fromCalled = true;
      return {};
    },
  };
  const { getRecentEventForHandoff } = await import(
    "../src/lib/crm/handoffs-server.ts"
  );
  const ctx = await getRecentEventForHandoff("", { supabase: fake });
  assert.equal(ctx, null);
  assert.equal(fromCalled, false);
});

// ─────────────────────────────────────────────────────────────────────
// Cleanup: restaurar env vars (no contaminar otros tests)
// ─────────────────────────────────────────────────────────────────────

test.after(() => {
  if (ORIG_URL === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = ORIG_URL;
  if (ORIG_KEY === undefined)
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ORIG_KEY;
  if (ORIG_SECRET === undefined) delete process.env.SUPABASE_SECRET_KEY;
  else process.env.SUPABASE_SECRET_KEY = ORIG_SECRET;
});
