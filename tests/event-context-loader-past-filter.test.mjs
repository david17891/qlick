/**
 * Tests de loadActiveEventContext (Sprint v17 hotfix #1, post-v0.9.6).
 *
 * Cubre el fix crítico: filtrar eventos pasados en la carga por defecto
 * (sin slug). Antes, `order starts_at ASC limit 1` podía tomar un evento
 * ya vencido con status=published e inyectarlo al bot como
 * "=== EVENTO ACTIVO ===", provocando que ofreciera cursos pasados.
 *
 * Caso explícito de bug: el 2026-07-11 10:30 David detectó que un evento
 * del 6 de julio (con status=published) estaba siendo inyectado al
 * simulador como evento activo 5 días después.
 *
 * Solución: agregar `.gte("starts_at", graceStartIso)` con margen de
 * gracia de 6 horas (por si el webinar está en curso o tuvo un delay).
 * Si no hay eventos futuros, devolver `fallbackNoEvents()` con
 * `source: "no_events"`.
 *
 * Patrón: mockear `createSupabaseAdminClient` con un cliente fake que
 * captura la query construida y devuelve eventos controlados.
 */

import { test, mock, before } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const LOADER_URL = pathToFileURL(
  path.join(ROOT, "src/lib/ai/event-context-loader.ts")
).href;

/* ------------------------------------------------------------------ */
/* Estado mutable: el cliente fake captura las queries y devuelve rows. */
/* ------------------------------------------------------------------ */

let lastQuery = null;
let rowsToReturn = [];

function buildMockClient() {
  const query = {
    eq: null,
    gte: null,
    not: [],
    order: null,
    limit: null
  };
  const builder = {
    select() {
      return builder;
    },
    eq(...args) {
      query.eq = args;
      return builder;
    },
    gte(...args) {
      query.gte = args;
      return builder;
    },
    not(...args) {
      query.not.push(args);
      return builder;
    },
    order(...args) {
      query.order = args;
      return builder;
    },
    limit(n) {
      query.limit = n;
      return builder;
    },
    maybeSingle() {
      lastQuery = { ...query };
      return Promise.resolve({
        data: rowsToReturn[0] ?? null,
        error: null
      });
    }
  };
  return {
    from() {
      return builder;
    }
  };
}

before(() => {
  // El consumer (`event-context-loader.ts`) hace `await import("../supabase/admin")`.
  // mock.module recibe el path tal cual lo ve el consumer. Sin extensión
  // (es el specifier original; Node + strip-types resuelven a .ts).
  mock.module("../src/lib/supabase/admin", {
    namedExports: {
      createSupabaseAdminClient: () => buildMockClient()
    }
  });
  mock.module("../src/lib/supabase/health", {
    namedExports: {
      checkSupabaseConfig: () => ({ configured: true })
    }
  });
});

/* ------------------------------------------------------------------ */
/* Tests                                                              */
/* ----------------------------------------------------------------= */

test("E1: sin slug, eventos pasados son filtrados (no se inyectan al bot)", async () => {
  rowsToReturn = [];
  lastQuery = null;

  const { loadActiveEventContext } = await import(LOADER_URL);
  const ctx = await loadActiveEventContext();

  assert.ok(lastQuery, "la query debe haberse construido");
  assert.ok(
    lastQuery.gte,
    "la query por defecto (sin slug) debe incluir .gte('starts_at', graceStartIso)"
  );
  assert.equal(lastQuery.gte[0], "starts_at");
  const cutoff = new Date(lastQuery.gte[1]).getTime();
  const now = Date.now();
  const sixHoursMs = 6 * 60 * 60 * 1000;
  assert.ok(
    Math.abs(cutoff - (now - sixHoursMs)) < 5_000,
    `cutoff debe ser ~6h antes de now; got diff=${Math.abs(cutoff - (now - sixHoursMs))}ms`
  );

  assert.equal(ctx.source, "no_events", "sin eventos futuros debe caer al fallback");
  assert.equal(ctx.title, "—");
  assert.equal(ctx.slug, "_no_events");
});

test("E1.5: FIX 2026-07-15, sin slug, excluye slugs del simulador (audit-funnel-/sim-funnel-)", async () => {
  rowsToReturn = [];
  lastQuery = null;

  const { loadActiveEventContext } = await import(LOADER_URL);
  await loadActiveEventContext();

  assert.ok(lastQuery, "la query debe haberse construido");
  assert.ok(Array.isArray(lastQuery.not), "lastQuery.not debe ser array");
  // Debe excluir ambos prefijos del simulador (smoke de GitHub Actions
  // crea eventos `audit-funnel-${ts}` y `sim-funnel-${ts}` y los deja
  // en prod sin limpiar).
  const notClauses = lastQuery.not.map(([col, op, pattern]) => `${col} ${op} ${pattern}`);
  assert.ok(
    notClauses.some((c) => c.includes("slug") && c.includes("audit-funnel")),
    `debe excluir audit-funnel-*: got [${notClauses.join(", ")}]`
  );
  assert.ok(
    notClauses.some((c) => c.includes("slug") && c.includes("sim-funnel")),
    `debe excluir sim-funnel-*: got [${notClauses.join(", ")}]`
  );
});

test("E2: con slug, NO se aplica el filtro de fecha (override explícito del admin)", async () => {
  rowsToReturn = [];
  lastQuery = null;

  const { loadActiveEventContext } = await import(LOADER_URL);
  await loadActiveEventContext("mi-evento-pasado");

  assert.ok(lastQuery);
  assert.equal(
    lastQuery.gte,
    null,
    "la query con slug NO debe filtrar por fecha (override del admin)"
  );
  assert.ok(lastQuery.eq, "la query con slug debe tener .eq('slug', ...)");
  assert.equal(lastQuery.eq[0], "slug");
  assert.equal(lastQuery.eq[1], "mi-evento-pasado");
  // FIX 2026-07-15: con slug específico, NO excluimos los prefijos del
  // simulador (puede ser un admin/debug que quiere ver un evento
  // específico por su slug).
  assert.equal(
    lastQuery.not.length,
    0,
    "con slug NO debe aplicar exclusion de slugs del simulador"
  );
});

test("E3: el query por defecto (sin slug) ordena por starts_at ASC y limita a 1", async () => {
  rowsToReturn = [];
  lastQuery = null;

  const { loadActiveEventContext } = await import(LOADER_URL);
  await loadActiveEventContext();

  assert.ok(lastQuery.order, "debe tener .order(...)");
  assert.equal(lastQuery.order[0], "starts_at");
  assert.equal(lastQuery.order[1].ascending, true);
  assert.equal(lastQuery.limit, 1);
});

test("E4: con slug, el query también limita a 1, pero sin .gte", async () => {
  rowsToReturn = [];
  lastQuery = null;

  const { loadActiveEventContext } = await import(LOADER_URL);
  await loadActiveEventContext("slug-x");

  assert.equal(lastQuery.limit, 1);
  assert.equal(lastQuery.gte, null, "con slug NO debe filtrar por fecha");
  assert.ok(lastQuery.eq);
  assert.equal(lastQuery.eq[1], "slug-x");
});

test("E5: si rowsToReturn tiene un evento futuro, el simulador lo carga con source='db'", async () => {
  const futureIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  rowsToReturn = [
    {
      id: "evt-future-001",
      slug: "masterclass-future",
      short_code: "FUTR",
      title: "Masterclass del Futuro",
      description: "Un evento próximo.",
      starts_at: futureIso,
      ends_at: new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString(),
      location: "CDMX",
      status: "published",
      requires_name: true,
      event_rules: null,
      format: "in_person",
      streaming_url: null,
      streaming_provider: null,
      streaming_access_note: null
    }
  ];
  lastQuery = null;

  const { loadActiveEventContext } = await import(LOADER_URL);
  const ctx = await loadActiveEventContext();

  assert.equal(ctx.source, "db");
  assert.equal(ctx.title, "Masterclass del Futuro");
  assert.equal(ctx.slug, "masterclass-future");
});
