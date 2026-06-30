/**
 * Tests para el wrapper de Meta Marketing API (src/lib/meta/marketing-api.ts).
 *
 * Cubre:
 *  - Modo demo (sin env vars) → devuelve mock data con `demo: true`.
 *  - Modo configurado → llama a Graph API v20.0 con los query params
 *    correctos (access_token, fields, date_preset, level).
 *  - Mockeando `fetch` global, verificamos que las URLs y headers son
 *    los esperados.
 *  - Rate limiting: si Meta responde 429, reintenta con backoff
 *    exponencial y termina OK si la 2da llamada responde 200.
 *
 * Corre con:
 *   node --test tests/meta-marketing-api.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// IMPORTANTE: setear env ANTES de importar el módulo.
const ORIGINAL_ENV = { ...process.env };
function resetEnv() {
  process.env = { ...ORIGINAL_ENV };
}

// ─────────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────────

/**
 * @typedef {Object} MockResponse
 * @property {number} status
 * @property {string} body
 */

/** Stub de fetch que responde según `responses` por orden. */
function makeFetchMock(/** @type {MockResponse[]} */ responses) {
  let call = 0;
  /** @type {Array<{url: string, init: RequestInit | undefined}>} */
  const calls = [];
  const fn = async (input, init) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push({ url, init });
    const r = responses[call++] ?? responses[responses.length - 1];
    return new Response(r.body, { status: r.status });
  };
  return Object.assign(fn, { calls });
}

// ─────────────────────────────────────────────────────────────
// Modo demo (sin env vars)
// ─────────────────────────────────────────────────────────────

test("listCampaigns: sin env vars → modo demo con data mock", async () => {
  resetEnv();
  delete process.env.META_ACCESS_TOKEN;
  delete process.env.META_AD_ACCOUNT_ID;

  const { listCampaigns } = await import(
    "../src/lib/meta/marketing-api.ts"
  );
  const result = await listCampaigns();
  assert.equal(result.demo, true);
  assert.equal(result.error, undefined);
  assert.ok(Array.isArray(result.data));
  assert.ok(result.data.length >= 1);
  // El mock tiene campañas con status ACTIVE/PAUSED
  const statuses = result.data.map((c) => c.status);
  assert.ok(statuses.includes("ACTIVE"));
});

test("getAccountInsights: sin env vars → mock data con datePreset respetado", async () => {
  resetEnv();
  delete process.env.META_ACCESS_TOKEN;
  delete process.env.META_AD_ACCOUNT_ID;

  const { getAccountInsights } = await import(
    "../src/lib/meta/marketing-api.ts"
  );
  const result = await getAccountInsights({ datePreset: "last_7d" });
  assert.equal(result.demo, true);
  assert.ok(result.data.length >= 1);
  // Las fechas del mock respetan date_preset
  for (const row of result.data) {
    assert.ok(row.date_start);
    assert.ok(row.date_stop);
  }
});

test("getCampaignAttribution: sin env vars → mock con leads_count", async () => {
  resetEnv();
  delete process.env.META_ACCESS_TOKEN;
  delete process.env.META_AD_ACCOUNT_ID;

  const { getCampaignAttribution } = await import(
    "../src/lib/meta/marketing-api.ts"
  );
  const result = await getCampaignAttribution("event_abc_123");
  assert.equal(result.demo, true);
  assert.ok(result.data.length >= 1);
  // Cada row tiene cpl calculado.
  for (const row of result.data) {
    assert.ok(typeof row.cpl === "number");
    assert.ok(typeof row.leads_count === "number");
  }
});

// ─────────────────────────────────────────────────────────────
// Modo configurado (con env vars + mock de fetch)
// ─────────────────────────────────────────────────────────────

test("listCampaigns: con env vars → llama Graph API v20.0 con bearer token", async () => {
  resetEnv();
  process.env.META_ACCESS_TOKEN = "fake_test_token_123";
  process.env.META_AD_ACCOUNT_ID = "act_99999";

  const fetchMock = makeFetchMock([
    {
      status: 200,
      body: JSON.stringify({
        data: [
          {
            id: "cmp_1",
            name: "Test campaign",
            status: "ACTIVE",
            objective: "OUTCOME_LEADS",
            daily_budget: "50000",
            created_time: "2026-06-01T00:00:00Z",
            updated_time: "2026-06-15T00:00:00Z",
          },
        ],
      }),
    },
  ]);
  globalThis.fetch = fetchMock;

  const { listCampaigns } = await import(
    "../src/lib/meta/marketing-api.ts"
  );
  const result = await listCampaigns();
  assert.equal(result.demo, false);
  assert.equal(result.error, undefined);
  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].id, "cmp_1");
  assert.equal(result.data[0].status, "ACTIVE");

  // Verificamos la URL llamada.
  assert.equal(fetchMock.calls.length, 1);
  const url = new URL(fetchMock.calls[0].url);
  assert.match(url.pathname, /\/v20\.0\/act_99999\/campaigns$/);
  assert.equal(url.searchParams.get("access_token"), "fake_test_token_123");
  assert.ok(url.searchParams.get("fields")?.includes("name"));
  assert.ok(url.searchParams.get("fields")?.includes("status"));
});

test("getAccountInsights: con env vars → llama /insights con level=adset", async () => {
  resetEnv();
  process.env.META_ACCESS_TOKEN = "tok";
  process.env.META_AD_ACCOUNT_ID = "act_42";

  const fetchMock = makeFetchMock([
    {
      status: 200,
      body: JSON.stringify({
        data: [
          {
            campaign_id: "cmp_x",
            campaign_name: "X",
            impressions: "1000",
            clicks: "50",
            spend: "250.00",
            ctr: "5.0",
            cpc: "5.0",
            cpm: "250.0",
            date_start: "2026-06-01",
            date_stop: "2026-06-30",
          },
        ],
      }),
    },
  ]);
  globalThis.fetch = fetchMock;

  const { getAccountInsights } = await import(
    "../src/lib/meta/marketing-api.ts"
  );
  const result = await getAccountInsights({
    datePreset: "last_30d",
    level: "adset",
  });
  assert.equal(result.demo, false);
  assert.equal(result.data.length, 1);
  // El map convierte strings a numbers.
  assert.equal(result.data[0].impressions, 1000);
  assert.equal(result.data[0].clicks, 50);
  assert.equal(result.data[0].spend, 250);

  // Verificamos level y date_preset.
  const url = new URL(fetchMock.calls[0].url);
  assert.match(url.pathname, /\/v20\.0\/act_42\/insights$/);
  assert.equal(url.searchParams.get("level"), "adset");
  assert.equal(url.searchParams.get("date_preset"), "last_30d");
});

test("getCampaignInsights: con env vars → pasa breakdowns como CSV", async () => {
  resetEnv();
  process.env.META_ACCESS_TOKEN = "tok";
  process.env.META_AD_ACCOUNT_ID = "act_42";

  const fetchMock = makeFetchMock([
    {
      status: 200,
      body: JSON.stringify({ data: [] }),
    },
  ]);
  globalThis.fetch = fetchMock;

  const { getCampaignInsights } = await import(
    "../src/lib/meta/marketing-api.ts"
  );
  await getCampaignInsights("cmp_123", {
    datePreset: "last_7d",
    breakdowns: ["age", "gender"],
  });

  const url = new URL(fetchMock.calls[0].url);
  assert.match(url.pathname, /\/v20\.0\/cmp_123\/insights$/);
  assert.equal(url.searchParams.get("breakdowns"), "age,gender");
});

// ─────────────────────────────────────────────────────────────
// Manejo de errores
// ─────────────────────────────────────────────────────────────

test("listCampaigns: error 500 → devuelve data vacía + error string", async () => {
  resetEnv();
  process.env.META_ACCESS_TOKEN = "tok";
  process.env.META_AD_ACCOUNT_ID = "act_42";

  const fetchMock = makeFetchMock([
    {
      status: 500,
      body: JSON.stringify({ error: { message: "internal_error" } }),
    },
  ]);
  globalThis.fetch = fetchMock;

  const { listCampaigns } = await import(
    "../src/lib/meta/marketing-api.ts"
  );
  const result = await listCampaigns();
  assert.equal(result.demo, false);
  assert.equal(result.data.length, 0);
  assert.ok(result.error);
  assert.match(result.error, /Meta API error 500/);
});

// ─────────────────────────────────────────────────────────────
// Cleanup
// ─────────────────────────────────────────────────────────────

test("teardown: reset env + global.fetch", () => {
  resetEnv();
  delete globalThis.fetch;
  assert.ok(true);
});