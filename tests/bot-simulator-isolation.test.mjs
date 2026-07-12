/**
 * Tests de aislamiento del Simulador (Sprint v0.9.6).
 *
 * Regla dura verificada: `simulateConversationTurn` y el endpoint
 * `/api/admin/bot/simulate` NUNCA deben:
 *   - Llamar al provider de WhatsApp (cero tráfico a Meta).
 *   - Llamar a `persistConversation` (cero escrituras).
 *   - Llamar a `findOrCreateLead` (cero escrituras).
 *   - Llamar a `recordDeepseekUsage` (cero escrituras).
 *   - Llamar a `incrementRuleUsage` (cero escrituras).
 *
 * Estrategia:
 *   1. Tests ESTÁTICOS (T1-T3): leen el código fuente y verifican
 *      imports prohibidos.
 *   2. Tests RUNTIME (T4-T7): mockean el provider de IA y supabase
 *      admin UNA VEZ en `before()`, y cambian comportamiento entre
 *      tests vía un objeto de estado global (`__simTestState`).
 *      Esto evita el problema de "module already mocked" de Node 22.
 */

import { test, mock, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const SIMULATOR_PATH = path.join(ROOT, "src/lib/ai/simulator.ts");
const SIMULATOR_URL = pathToFileURL(SIMULATOR_PATH).href;
const ROUTE_PATH = path.join(ROOT, "src/app/api/admin/bot/simulate/route.ts");

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function readFileSafe(p) {
  return fs.readFileSync(p, "utf-8");
}

function extractStaticImports(src) {
  const imports = new Set();
  const re = /import\s+(?:type\s+)?(?:[\s\S]*?)\s+from\s+["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    imports.add(m[1]);
  }
  return imports;
}

/* ================================================================== */
/*  T1. Aislamiento estático del módulo simulator.ts                    */
/* ================================================================== */

test("T1.1: simulator.ts NO importa el provider de WhatsApp", () => {
  const src = readFileSafe(SIMULATOR_PATH);
  assert.ok(
    !src.includes("getActiveWhatsAppProvider"),
    "simulator.ts no debe importar getActiveWhatsAppProvider"
  );
});

test("T1.2: simulator.ts NO importa persistConversation", () => {
  const src = readFileSafe(SIMULATOR_PATH);
  assert.ok(!src.includes("persistConversation"));
});

test("T1.3: simulator.ts NO importa findOrCreateLead", () => {
  const src = readFileSafe(SIMULATOR_PATH);
  assert.ok(!src.includes("findOrCreateLead"));
});

test("T1.4: simulator.ts NO llama a recordDeepseekUsage", () => {
  const src = readFileSafe(SIMULATOR_PATH);
  assert.ok(!src.includes("recordDeepseekUsage"));
});

test("T1.5: simulator.ts NO llama a incrementRuleUsage", () => {
  const src = readFileSafe(SIMULATOR_PATH);
  assert.ok(!src.includes("incrementRuleUsage"));
});

test("T1.6: simulator.ts NO contiene 'provider.send'", () => {
  const src = readFileSafe(SIMULATOR_PATH);
  assert.ok(!src.includes("provider.send"));
});

/* ================================================================== */
/*  T2. Aislamiento de imports transitivos                              */
/* ================================================================== */

test("T2.1: ningún import estático de simulator.ts apunta a lib/whatsapp/*", () => {
  const src = readFileSafe(SIMULATOR_PATH);
  const imports = extractStaticImports(src);
  for (const imp of imports) {
    assert.ok(
      !imp.includes("lib/whatsapp/") && !imp.endsWith("/whatsapp"),
      `simulator.ts no debe importar de lib/whatsapp/*; import encontrado: "${imp}"`
    );
  }
});

test("T2.2: ningún import estático de simulator.ts apunta a lib/crm/lead-management", () => {
  const src = readFileSafe(SIMULATOR_PATH);
  const imports = extractStaticImports(src);
  for (const imp of imports) {
    assert.ok(
      !imp.includes("lib/crm/lead-management"),
      `import encontrado: "${imp}"`
    );
  }
});

/* ================================================================== */
/*  T3. Aislamiento del endpoint /api/admin/bot/simulate                */
/* ================================================================== */

test("T3.1: el route.ts solo delega al simulador", () => {
  const src = readFileSafe(ROUTE_PATH);
  assert.ok(src.includes("simulateConversationTurn("));
  assert.ok(src.includes("parseSimulateRequest("));
  assert.ok(!src.includes("deepseekAgentProvider"));
  assert.ok(!src.includes("getActiveWhatsAppProvider"));
});

/* ================================================================== */
/*  T4-T7. Tests runtime con mocks profundos                            */
/* ================================================================== */

// Estado mutable controlado por tests. Los mocks leen de aquí.
globalThis.__simTestState = {
  /** Si true, supabase admin devuelve bot_paused: true. */
  leadPaused: false,
  /** Si true, el provider EXPLOTA si se llama (aislamiento). */
  throwIfProviderCalled: false,
  /** Contexto capturado del último provider.run(). */
  lastContext: null,
  /** System prompt capturado del último provider.run(). */
  lastSystemPrompt: ""
};

function mockDeepseekProvider() {
  mock.module("../src/lib/ai/deepseek-provider.ts", {
    namedExports: {
      deepseekAgentProvider: {
        name: "deepseek",
        displayName: "DeepSeek (mock para tests)",
        active: true,
        stub: true,
        run: async (task, context) => {
          if (globalThis.__simTestState.throwIfProviderCalled) {
            throw new Error(
              "AISLAMIENTO ROTO: provider llamado cuando el test esperaba que NO se llamara"
            );
          }
          globalThis.__simTestState.lastContext = context;
          globalThis.__simTestState.lastSystemPrompt =
            context?.systemPromptOverride ?? "";
          return {
            ok: true,
            task,
            provider: "deepseek",
            content: "RESPUESTA MOCK DEL LLM",
            confidence: 0.9,
            needsReview: false,
            demo: true,
            note: "[mock] test fixture",
            usage: {
              promptTokens: 42,
              completionTokens: 13,
              totalTokens: 55,
              costCents: 1,
              model: "deepseek-chat"
            }
          };
        }
      },
      pickSystemPromptForMode: async () => "MOCK_SYSTEM_PROMPT",
      isSocraticNoToolsMode: async () => false,
      isDeepseekToolsEnabled: () => false,
      _chooseTierForTest: () => "flash",
      _readTierConfigForTest: () => ({}),
      _isDeepseekToolsEnabledForTest: () => false,
      _pickFallbackForTest: () => "fallback",
      _runWithToolLoopForTest: async () => ({}),
      _runWithTimeoutForTest: () => ({})
    }
  });
}

function mockSupabaseAdmin() {
  mock.module("../src/lib/supabase/admin.ts", {
    namedExports: {
      createSupabaseAdminClient: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: globalThis.__simTestState.leadPaused
                  ? { bot_paused: true }
                  : null,
                error: null
              })
            })
          })
        })
      })
    }
  });
}

before(() => {
  mockDeepseekProvider();
  mockSupabaseAdmin();
});

test("T4: simulateConversationTurn ejecuta el LLM y devuelve telemetría sin tocar Meta", async () => {
  globalThis.__simTestState.leadPaused = false;
  globalThis.__simTestState.throwIfProviderCalled = false;
  const { simulateConversationTurn } = await import(SIMULATOR_URL);
  const result = await simulateConversationTurn({
    message: "Hola, me interesa el taller",
    history: [],
    modeOverride: "socratic_autopilot_v2",
    includeEventContext: false,
    includeInjectedRules: false,
    leadContext: null
  });
  assert.equal(
    result.ok,
    true,
    `el simulador debe devolver ok=true; got: ${JSON.stringify(result.telemetry)}`
  );
  assert.equal(result.reply, "RESPUESTA MOCK DEL LLM");
  assert.equal(result.telemetry.modeUsed, "socratic_autopilot_v2");
  assert.ok(result.telemetry.usage.totalTokens > 0);
  assert.ok(result.telemetry.usage.estimatedCostCents >= 0);
});

test("T5: el simulador respeta modeOverride='super_executive'", async () => {
  globalThis.__simTestState.leadPaused = false;
  globalThis.__simTestState.throwIfProviderCalled = false;
  const { simulateConversationTurn } = await import(SIMULATOR_URL);
  const result = await simulateConversationTurn({
    message: "Quiero una demo del taller",
    history: [],
    modeOverride: "super_executive",
    includeEventContext: false,
    includeInjectedRules: false,
    leadContext: null
  });
  assert.equal(result.telemetry.modeUsed, "super_executive");
  assert.equal(result.ok, true);
});

test("T6: el simulador inyecta el system prompt precomputado (override de modo)", async () => {
  globalThis.__simTestState.leadPaused = false;
  globalThis.__simTestState.throwIfProviderCalled = false;
  const { simulateConversationTurn } = await import(SIMULATOR_URL);
  await simulateConversationTurn({
    message: "Hola",
    history: [],
    modeOverride: "super_executive",
    includeEventContext: false,
    includeInjectedRules: false,
    leadContext: null
  });
  const ctx = globalThis.__simTestState.lastContext;
  assert.ok(
    ctx?.systemPromptOverride,
    "el simulador debe pasar systemPromptOverride al provider"
  );
  const sp = ctx.systemPromptOverride;
  assert.ok(
    sp.includes("Súper Ejecutivo") || sp.includes("DIRECTIVA UX HOOK"),
    `el prompt del modo super_executive debe contener su firma característica; got: ${sp.slice(0, 200)}`
  );
});

test("T7: el simulador corta el flow cuando el lead tiene bot_paused=true", async () => {
  globalThis.__simTestState.leadPaused = true;
  globalThis.__simTestState.throwIfProviderCalled = true;
  const { simulateConversationTurn } = await import(SIMULATOR_URL);
  const result = await simulateConversationTurn({
    message: "Hola",
    history: [],
    modeOverride: "socratic_autopilot_v2",
    leadContext: { leadId: "36249ecd-0000-0000-0000-000000000000" },
    includeEventContext: false,
    includeInjectedRules: false,
    ignoreLeadPause: false
  });
  // Si llegamos aquí sin throw, el provider NO fue llamado.
  assert.equal(result.telemetry.usage.model, "skipped");
  assert.ok(result.reply.includes("pausado"));
  assert.ok(
    result.note?.includes("bot_paused_for_lead"),
    `note debe mencionar bot_paused_for_lead; got: ${result.note}`
  );
  // Reset.
  globalThis.__simTestState.leadPaused = false;
  globalThis.__simTestState.throwIfProviderCalled = false;
});

/* ================================================================== */
/*  T8-T10. Tests del switch de tier Flash/Pro (Sprint v0.9.7)        */
/* ================================================================== */

test("T8: tierOverride='flash' se propaga al AgentContext.tierOverride", async () => {
  globalThis.__simTestState.leadPaused = false;
  globalThis.__simTestState.throwIfProviderCalled = false;
  const { simulateConversationTurn } = await import(SIMULATOR_URL);
  await simulateConversationTurn({
    message: "Hola",
    history: [],
    modeOverride: "socratic_autopilot_v2",
    tierOverride: "flash",
    includeEventContext: false,
    includeInjectedRules: false,
    leadContext: null
  });
  assert.equal(
    globalThis.__simTestState.lastContext?.tierOverride,
    "flash",
    "tierOverride='flash' debe propagarse al AgentContext"
  );
});

test("T9: tierOverride='pro' se propaga al AgentContext.tierOverride", async () => {
  globalThis.__simTestState.leadPaused = false;
  globalThis.__simTestState.throwIfProviderCalled = false;
  const { simulateConversationTurn } = await import(SIMULATOR_URL);
  await simulateConversationTurn({
    message: "Hola",
    history: [],
    modeOverride: "super_executive",
    tierOverride: "pro",
    includeEventContext: false,
    includeInjectedRules: false,
    leadContext: null
  });
  assert.equal(
    globalThis.__simTestState.lastContext?.tierOverride,
    "pro",
    "tierOverride='pro' debe propagarse al AgentContext"
  );
});

test("T10: tierOverride ausente o null NO se propaga (provider decide por default)", async () => {
  globalThis.__simTestState.leadPaused = false;
  globalThis.__simTestState.throwIfProviderCalled = false;
  const { simulateConversationTurn } = await import(SIMULATOR_URL);
  await simulateConversationTurn({
    message: "Hola",
    history: [],
    modeOverride: "socratic_autopilot_v2",
    // tierOverride ausente: el provider decide Flash + escalación Pro.
    includeEventContext: false,
    includeInjectedRules: false,
    leadContext: null
  });
  assert.equal(
    globalThis.__simTestState.lastContext?.tierOverride,
    undefined,
    "tierOverride ausente debe dejar el campo undefined en el context"
  );
});
