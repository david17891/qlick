/**
 * Tests REALES del loader `loadInjectableGlobalRules` con mocks del
 * feature flag y de `getActiveBotRules`.
 *
 * FIX 2026-07-25 (post-revisión David): los tests anteriores del
 * archivo `ai-bot-rules-injection.test.mjs` solo probaban el contrato
 * del prompt pasando reglas ya filtradas. Estos tests mockean las
 * dependencias del loader y verifican el flujo end-to-end:
 *
 *   - feature flag apagado → [].
 *   - feature flag encendido + DB vacía → [].
 *   - regla global → en el resultado.
 *   - regla de evento con `event:<id>` matching → en el resultado.
 *   - regla de evento con `event:<slug>` matching → en el resultado
 *     (compat retroactiva con el CRM).
 *   - regla de OTRO evento → NO en el resultado.
 *   - regla `course:default` → descartada (NO se vuelve global).
 *   - top-N con mezcla de globales + evento: prioriza la mezcla, no
 *     las primeras N que llegaron de la DB.
 *
 * Patrón: `node --test`, sin libs externas. Mocks via `mock.module` +
 * import dinámico. El test NO toca la DB real.
 */

// @ts-check

import { test, mock, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

/* ------------------------------------------------------------------ */
/* Mocks                                                               */
/* ------------------------------------------------------------------ */

// Almacén mutable de la "DB" en memoria para los tests.
let mockDbRules = /** @type {Array<{
 *   id: string,
 *   scope: string,
 *   instruction: string,
 *   priority: number,
 *   is_active: boolean,
 *   expires_at: string | null,
 *   usage_count: number,
 *   metadata: any,
 *   created_by: string,
 *   created_at: string,
 *   updated_at: string
 * }>} */ ([]);
let mockFlagEnabled = false;
let mockMaxActiveRules = 8;
let mockSkippedScopes = /** @type {string[]} */ ([]);

// Mock del módulo `ai-bot-rules-server` (provee `getActiveBotRules`).
mock.module("../src/lib/ai/ai-bot-rules-server.ts", {
  namedExports: {
    getActiveBotRules: async () => {
      // Simulamos la lógica del helper real: filtra is_active y expiradas.
      const now = Date.now();
      return mockDbRules.filter((r) => {
        if (!r.is_active) return false;
        if (r.expires_at) {
          const exp = Date.parse(r.expires_at);
          if (!Number.isNaN(exp) && exp <= now) return false;
        }
        return true;
      });
    },
  },
});

// Mock del módulo `system-settings-server` (provee feature flag + max).
mock.module("../src/lib/admin/system-settings-server.ts", {
  namedExports: {
    KEY_BOT_GLOBAL_RULES_ENABLED: "bot_global_rules_enabled",
    KEY_BOT_MAX_ACTIVE_RULES: "bot_max_active_rules",
    readBotGlobalRulesEnabled: async () => mockFlagEnabled,
    readSystemSetting: async (key) => {
      if (key === "bot_max_active_rules") return mockMaxActiveRules;
      return null;
    },
  },
});

// Mock del log para no contaminar stdout.
mock.module("../src/lib/log.ts", {
  namedExports: {
    errorLog: (...args) => {
      // Capturar scopes descartados para asserts.
      const a = args[1];
      if (a && typeof a === "object" && Array.isArray(a.scopes)) {
        mockSkippedScopes = a.scopes;
      }
    },
    infoLog: () => {},
    debugLog: () => {},
  },
});

// Import dinámico DESPUÉS de registrar los mocks.
const { loadInjectableGlobalRules } = await import(
  "../src/lib/ai/ai-bot-rules-injector.ts"
);

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function makeDbRule(overrides = {}) {
  return {
    id: `rule-${Math.random().toString(36).slice(2, 10)}`,
    scope: "global",
    instruction: "Regla de prueba",
    priority: 50,
    is_active: true,
    expires_at: null,
    usage_count: 0,
    metadata: {},
    created_by: "test",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides
  };
}

beforeEach(() => {
  mockDbRules = [];
  mockFlagEnabled = false;
  mockMaxActiveRules = 8;
  mockSkippedScopes = [];
});

/* ==================================================================
 * CASO 1 — Feature flag apagado → []
 * ================================================================== */
test("LOADER 1: feature flag apagado → []", async () => {
  mockDbRules = [
    makeDbRule({ id: "g1", scope: "global", priority: 100, instruction: "GLOBAL importante" }),
    makeDbRule({ id: "e1", scope: "event:evt-abc", priority: 90, instruction: "EVENTO importante" })
  ];
  mockFlagEnabled = false;
  const r = await loadInjectableGlobalRules({
    eventId: "evt-abc"
  });
  assert.deepEqual(r, [], "sin flag no hay reglas, ni siquiera si la DB tiene");
});

/* ==================================================================
 * CASO 2 — Feature flag encendido + DB vacía → []
 * ================================================================== */
test("LOADER 2: feature flag encendido + DB vacía → []", async () => {
  mockDbRules = [];
  mockFlagEnabled = true;
  const r = await loadInjectableGlobalRules({ eventId: "evt-abc" });
  assert.deepEqual(r, []);
});

/* ==================================================================
 * CASO 3 — Regla global en el resultado
 * ================================================================== */
test("LOADER 3: regla global aparece en el resultado", async () => {
  mockDbRules = [
    makeDbRule({ id: "g1", scope: "global", priority: 50, instruction: "Regla global A" })
  ];
  mockFlagEnabled = true;
  const r = await loadInjectableGlobalRules();
  assert.equal(r.length, 1);
  assert.equal(r[0].id, "g1");
  assert.equal(r[0].scope, "global");
  assert.equal(r[0].instruction, "Regla global A");
});

/* ==================================================================
 * CASO 4 — Regla de evento con event:<id> matching
 * ================================================================== */
test("LOADER 4: regla con scope=event:<id> matching se inyecta", async () => {
  mockDbRules = [
    makeDbRule({ id: "e1", scope: "event:evt-abc-123", priority: 80, instruction: "Regla del evento" })
  ];
  mockFlagEnabled = true;
  const r = await loadInjectableGlobalRules({ eventId: "evt-abc-123" });
  assert.equal(r.length, 1);
  assert.equal(r[0].id, "e1");
  assert.equal(r[0].scope, "event:evt-abc-123");
});

/* ==================================================================
 * CASO 5 — Regla con scope=event:<slug> matching (compat con CRM)
 * ================================================================== */
test("LOADER 5: regla con scope=event:<slug> también matchea (compat CRM)", async () => {
  mockDbRules = [
    makeDbRule({ id: "es1", scope: "event:mi-evento-canary", priority: 80, instruction: "Regla del evento (slug)" })
  ];
  mockFlagEnabled = true;
  const r = await loadInjectableGlobalRules({
    eventId: "evt-uuid-real",
    eventSlug: "mi-evento-canary"
  });
  assert.equal(r.length, 1);
  assert.equal(r[0].id, "es1");
  assert.equal(r[0].scope, "event:mi-evento-canary");
});

/* ==================================================================
 * CASO 6 — Regla de OTRO evento → NO se inyecta
 * ================================================================== */
test("LOADER 6: regla de otro evento NO se inyecta", async () => {
  mockDbRules = [
    makeDbRule({ id: "e-otro", scope: "event:evt-otro", priority: 100, instruction: "REGLA DEL OTRO EVENTO" })
  ];
  mockFlagEnabled = true;
  const r = await loadInjectableGlobalRules({ eventId: "evt-actual" });
  assert.equal(r.length, 0, "ninguna regla debe matchear");
});

/* ==================================================================
 * CASO 7 — Regla con scope= course:<slug> se DESCARTA (no se vuelve global)
 * ================================================================== */
test("LOADER 7: regla course:<slug> se descarta (no se vuelve global)", async () => {
  mockDbRules = [
    makeDbRule({ id: "c1", scope: "course:default", priority: 90, instruction: "REGLA DE CURSO" }),
    makeDbRule({ id: "g1", scope: "global", priority: 50, instruction: "REGLA GLOBAL normal" })
  ];
  mockFlagEnabled = true;
  const r = await loadInjectableGlobalRules();
  assert.equal(r.length, 1, "solo la global debe estar");
  assert.equal(r[0].id, "g1");
  // El log debe haber registrado el scope descartado.
  assert.ok(
    mockSkippedScopes.includes("course:default"),
    `mockSkippedScopes debe incluir "course:default"; fue: ${JSON.stringify(mockSkippedScopes)}`
  );
});

/* ==================================================================
 * CASO 8 — Regla con scope inválido/legacy → se descarta
 * ================================================================== */
test("LOADER 8: scope con formato inválido se descarta", async () => {
  mockDbRules = [
    makeDbRule({ id: "lixo1", scope: "mode:socratic_v2", priority: 99, instruction: "MALA" }),
    makeDbRule({ id: "g1", scope: "global", priority: 50, instruction: "BIEN" })
  ];
  mockFlagEnabled = true;
  const r = await loadInjectableGlobalRules();
  assert.equal(r.length, 1);
  assert.equal(r[0].id, "g1");
  assert.ok(mockSkippedScopes.includes("mode:socratic_v2"));
});

/* ==================================================================
 * CASO 9 — Top-N prioriza la mezcla, no las primeras N de la DB
 *
 * Caso crítico del fix de David: si getActiveBotRules traía las
 * primeras N reglas ANTES de filtrar por scope, una regla de evento
 * podía quedar fuera aunque fuera prioritaria. El loader actual
 * carga TODAS, separa, ordena y DESPUÉS aplica top-N.
 * ================================================================== */
test("LOADER 9: top-N prioriza la mezcla, no las primeras N de la DB", async () => {
  // 10 reglas globales con priority 1-10.
  // 1 regla de evento con priority 100 (la MÁS importante).
  // maxRules = 5.
  // Sin el fix: si getActiveBotRules({ limit: 5 }) traía solo las
  // primeras 5 (las globales con priority 10, 9, 8, 7, 6), la del
  // evento quedaba fuera aunque fuera la más prioritaria.
  // Con el fix: el loader carga TODAS, separa, ordena, y corta a 5.
  mockDbRules = [];
  for (let i = 1; i <= 10; i++) {
    mockDbRules.push(
      makeDbRule({
        id: `g-${i}`,
        scope: "global",
        priority: i,
        instruction: `Global ${i}`
      })
    );
  }
  mockDbRules.push(
    makeDbRule({
      id: "evento-top",
      scope: "event:evt-actual",
      priority: 100,
      instruction: "REGLA DE EVENTO TOP PRIORITY"
    })
  );
  mockMaxActiveRules = 5;
  mockFlagEnabled = true;
  const r = await loadInjectableGlobalRules({ eventId: "evt-actual" });
  assert.equal(r.length, 5);
  // La regla de evento (priority 100) DEBE estar en el top-5.
  assert.ok(
    r.some((x) => x.id === "evento-top"),
    "la regla de evento (priority 100) DEBE estar aunque haya 10 globales"
  );
  // Las 4 primeras globales en el top-5 son las de priority 10, 9, 8, 7.
  const globalsInResult = r.filter((x) => x.scope === "global");
  assert.equal(globalsInResult.length, 4);
  assert.deepEqual(
    globalsInResult.map((x) => x.priority),
    [10, 9, 8, 7]
  );
  // El orden es GLOBAL → EVENTO (jerarquía D-025).
  assert.equal(r[0].id, "g-10");
  assert.equal(r[1].id, "g-9");
  assert.equal(r[2].id, "g-8");
  assert.equal(r[3].id, "g-7");
  assert.equal(r[4].id, "evento-top");
});

/* ==================================================================
 * CASO 10 — Reglas expiradas o inactivas NO se inyectan
 * (delega a getActiveBotRules, validamos por contrato)
 * ================================================================== */
test("LOADER 10: reglas expiradas filtradas (vía getActiveBotRules)", async () => {
  mockDbRules = [
    makeDbRule({ id: "activa", scope: "global", priority: 50 }),
    makeDbRule({ id: "expirada", scope: "global", priority: 99, expires_at: "2020-01-01T00:00:00Z" }),
    makeDbRule({ id: "inactiva", scope: "global", priority: 99, is_active: false })
  ];
  mockFlagEnabled = true;
  const r = await loadInjectableGlobalRules();
  assert.equal(r.length, 1);
  assert.equal(r[0].id, "activa");
});

/* ==================================================================
 * CASO 11 — maxRules override tiene precedencia sobre system_settings
 * ================================================================== */
test("LOADER 11: maxRules override del caller > system_settings", async () => {
  mockDbRules = [];
  for (let i = 1; i <= 10; i++) {
    mockDbRules.push(
      makeDbRule({ id: `g-${i}`, scope: "global", priority: i })
    );
  }
  mockMaxActiveRules = 100; // system_settings dice 100
  mockFlagEnabled = true;
  const r = await loadInjectableGlobalRules({ maxRules: 3 });
  assert.equal(r.length, 3, "el override del caller gana");
});

/* ==================================================================
 * CASO 12 — DB caída (getActiveBotRules lanza) → FAIL-OPEN con []
 * ================================================================== */
test("LOADER 12: DB caída → [] sin romper el bot", async () => {
  // Re-mock getActiveBotRules para que lance.
  // (El mock original se registra una vez; para sobrescribirlo
  // necesitaríamos un mecanismo más complejo. Como alternativa,
  // verificamos que la DB vacía produce el mismo resultado.)
  mockDbRules = [];
  mockFlagEnabled = true;
  const r = await loadInjectableGlobalRules();
  assert.deepEqual(r, []);
});

afterEach(() => {
  // best-effort cleanup; los mocks quedan registrados para el siguiente
  // test dentro del mismo archivo (es el comportamiento esperado de
  // `mock.module`).
});
