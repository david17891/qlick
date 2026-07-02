/**
 * Tests para el switch LLM DeepSeek V4-Flash ↔ V4-Pro (Fase 2 Qlick).
 *
 * Cubre:
 *   1. `suggest_reply` arranca directo en Pro (priority).
 *   2. Flash responde OK con confidence >= threshold → NO escala.
 *   3. Flash responde con confidence < threshold → escala a Pro.
 *   4. Flash falla (HTTP 5xx) → escala a Pro.
 *   5. Flash Y Pro fallan → fallback textual.
 *   6. Helper `_chooseTierForTest` refleja la logica de escalado.
 *
 * Patron: `node --test`, sin libs externas, mockea `globalThis.fetch`
 * (DeepSeek API) + env vars temporales.
 *
 * Corre con:
 *   npm test
 *
 * Privacy: 0 PII. Telefonos sinteticos (+52XXXXXXXXXX), emails @example.com.
 */

import { test, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";

// @ts-check

/* ─────────────────────────────────────────────────────────────
 * Helpers de mocking
 * ───────────────────────────────────────────────────────────── */

/**
 * Captura todas las llamadas a `globalThis.fetch` y permite enqueue de
 * respuestas por llamada. Devuelve `restore()` para devolver el fetch original.
 */
function mockFetch() {
  const calls = [];
  const responses = [];
  const throws = [];

  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    calls.push({
      url: typeof input === "string" ? input : input.toString(),
      init: init ?? {}
    });
    // Si hay un throw pendiente, lo lanzamos primero (error de red simulado).
    if (throws.length > 0) {
      const msg = throws.shift();
      throw new Error(msg);
    }
    const next = responses.shift() ?? {
      status: 200,
      body: {
        choices: [{ message: { role: "assistant", content: "OK default" } }]
      }
    };
    return new Response(JSON.stringify(next.body), {
      status: next.status,
      headers: { "Content-Type": "application/json" }
    });
  };

  return {
    calls,
    mockResponse(status, body) {
      responses.push({ status, body });
    },
    /** Enqueue un error de red: el proximo fetch rechaza con este mensaje. */
    mockThrow(message) {
      throws.push(message);
    },
    /**
     * Devuelve el modelo con el que el call fue hecho (lectura del body JSON).
     */
    lastCallModel() {
      const last = calls[calls.length - 1];
      if (!last) return null;
      const body = last.init?.body;
      if (typeof body !== "string") return null;
      try {
        return JSON.parse(body).model;
      } catch {
        return null;
      }
    },
    callCount() {
      return calls.length;
    },
    restore() {
      globalThis.fetch = original;
    }
  };
}

/**
 * Setea env vars solo durante el test y las restaura al final. Devuelve un
 * helper `set(k, v)` para modificar durante el test si hace falta.
 */
function withEnv(overrides) {
  const original = {};
  for (const [k, v] of Object.entries(overrides)) {
    original[k] = process.env[k];
    process.env[k] = v;
  }
  return {
    set(k, v) {
      if (!(k in original)) original[k] = process.env[k];
      process.env[k] = v;
    },
    restore() {
      for (const [k, v] of Object.entries(original)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  };
}

/** Perfil minimo valido para buildSystemPrompt (shape de AIAgentProfile). */
const MOCK_PROFILE = {
  name: "Qlick Assistant",
  businessName: "Qlick Marketing Integral",
  businessDescription: "Plataforma de cursos de marketing para PYMEs.",
  businessHours: "Lunes a Viernes, 9:00 a 18:00 CST",
  tone: "friendly",
  servicesOrCourses: [
    "Curso de Marketing Digital",
    "Curso de Embudos de Venta",
    "Mentoria 1:1"
  ],
  escalationRules: ["Pedidos > $50,000 MXN", "Solicitudes de reembolso"],
  allowedActions: [
    "Recomendar un curso",
    "Agendar una llamada exploratoria",
    "Enviar material educativo"
  ],
  forbiddenActions: [
    "Prometer descuentos sin autorizacion",
    "Confirmar pagos no verificados",
    "Compartir datos de otros leads"
  ],
  fallbackMessage:
    "No tengo esa informacion a la mano. Te conecto con el equipo."
};

/* ─────────────────────────────────────────────────────────────
 * Subject under test
 * ───────────────────────────────────────────────────────────── */

// Imports absolutos via URL file (mejor para node --test con loader-register).
import {
  deepseekAgentProvider,
  _chooseTierForTest
} from "../src/lib/ai/deepseek-provider.ts";

/* ─────────────────────────────────────────────────────────────
 * Setup / teardown comun
 * ───────────────────────────────────────────────────────────── */

let env;
let fetchMock;

beforeEach(() => {
  env = withEnv({
    DEEPSEEK_API_KEY: "sk-test-fake-key-for-tests",
    DEEPSEEK_MODEL_FLASH: "deepseek-chat",
    DEEPSEEK_MODEL_PRO: "deepseek-reasoner",
    DEEPSEEK_ESCALATE_THRESHOLD: "0.7"
  });
  fetchMock = mockFetch();
});

afterEach(() => {
  env.restore();
  fetchMock.restore();
});

/* ─────────────────────────────────────────────────────────────
 * 1. suggest_reply arranca directo en Pro
 * ───────────────────────────────────────────────────────────── */

test("switch LLM: suggest_reply prioriza Pro y NO llama a Flash primero", async () => {
  fetchMock.mockResponse(200, {
    choices: [
      { message: { role: "assistant", content: "Te cuento sobre el curso..." } }
    ]
  });

  const result = await deepseekAgentProvider.run(
    "suggest_reply",
    {
      profile: MOCK_PROFILE,
      lastIncomingMessage: "Como funciona el curso?"
    }
  );

  assert.equal(result.ok, true, "Pro responde OK");
  assert.equal(fetchMock.callCount(), 1, "Solo 1 llamada (a Pro, no Flash)");
  assert.equal(
    fetchMock.lastCallModel(),
    "deepseek-reasoner",
    "Modelo llamado: Pro"
  );
  assert.match(result.note, /tier=pro/, "note marca tier=pro");
});

/* ─────────────────────────────────────────────────────────────
 * 2. Flash responde OK con alta confidence → NO escala
 * ───────────────────────────────────────────────────────────── */

test("switch LLM: Flash OK con conf 0.85 → NO escala, devuelve Flash", async () => {
  // Mockeamos callDeepSeekTier para devolver un resultado custom (no podemos
  // inyectar `confidence` por HTTP response de DeepSeek; lo hacemos via
  // tampering del helper). Para validar la regla, en cambio mockeamos
  // directamente que la primera respuesta da conf alta (>= 0.7).
  //
  // Aqui validamos la regla mas realista: Flash devuelve OK → no escala.
  // (deepseek-provider devuelve siempre confidence 0.85 si ok=true, lo que ya
  // es > 0.7, asi que esta rama cubre "Flash responde OK = no escala").

  fetchMock.mockResponse(200, {
    choices: [
      { message: { role: "assistant", content: "Detectado: interes comercial" } }
    ]
  });

  const result = await deepseekAgentProvider.run("classify_intent", {
    profile: MOCK_PROFILE,
    lastIncomingMessage: "Quiero saber precios"
  });

  assert.equal(result.ok, true);
  assert.equal(
    fetchMock.callCount(),
    1,
    "Solo 1 llamada (Flash, sin escalar a Pro)"
  );
  assert.equal(
    fetchMock.lastCallModel(),
    "deepseek-chat",
    "Modelo llamado: Flash"
  );
});

/* ─────────────────────────────────────────────────────────────
 * 3. Flash falla (HTTP 5xx) → escala a Pro
 * ───────────────────────────────────────────────────────────── */

test("switch LLM: Flash 5xx en 2 intentos → escala a Pro", async () => {
  // Flash falla (5xx repetido), Pro responde OK.
  fetchMock.mockResponse(503, {
    error: { message: "Service temporarily unavailable", type: "server_error" }
  });
  fetchMock.mockResponse(503, {
    error: { message: "Service temporarily unavailable", type: "server_error" }
  });
  fetchMock.mockResponse(200, {
    choices: [
      { message: { role: "assistant", content: "Detectado tras escalado" } }
    ]
  });

  const result = await deepseekAgentProvider.run("classify_intent", {
    profile: MOCK_PROFILE,
    lastIncomingMessage: "Quiero saber precios"
  });

  assert.equal(result.ok, true, "Resultado final OK tras escalar a Pro");
  assert.equal(fetchMock.callCount(), 3, "3 llamadas: 2 Flash + 1 Pro");
  assert.match(result.note, /escalado flash→pro/, "note marca escalado");
});

/* ─────────────────────────────────────────────────────────────
 * 4. Flash error de red → escala a Pro
 * ───────────────────────────────────────────────────────────── */

test("switch LLM: Flash error de red → escala a Pro", async () => {
  // Flash 2 throws (reintento agotado), Pro responde OK.
  fetchMock.mockThrow("ECONNREFUSED");
  fetchMock.mockThrow("ECONNREFUSED");
  fetchMock.mockResponse(200, {
    choices: [
      { message: { role: "assistant", content: "OK tras escalar" } }
    ]
  });

  const result = await deepseekAgentProvider.run("summarize_conversation", {
    profile: MOCK_PROFILE,
    lastIncomingMessage: "Resumen rapido de la conversacion"
  });

  assert.equal(result.ok, true, "Resultado final OK tras escalar a Pro");
  assert.equal(fetchMock.callCount(), 3, "3 llamadas: 2 Flash (throws) + 1 Pro OK");
  assert.match(result.note, /escalado flash→pro/, "note marca escalado");
});

/* ─────────────────────────────────────────────────────────────
 * 5. Flash Y Pro fallan → fallback textual
 * ───────────────────────────────────────────────────────────── */

test("switch LLM: Flash + Pro fallan → fallback textual", async () => {
  // Todas las llamadas fallan.
  for (let i = 0; i < 10; i++) {
    fetchMock.mockResponse(500, {
      error: { message: "Internal error", type: "server_error" }
    });
  }

  const result = await deepseekAgentProvider.run("classify_intent", {
    profile: MOCK_PROFILE,
    lastIncomingMessage: "test"
  });

  assert.equal(result.ok, false);
  assert.equal(result.needsReview, true);
  assert.match(result.content, /problema tecnico/i);
  assert.match(result.note, /fallback/);
  assert.equal(fetchMock.callCount(), 4, "2 Flash + 2 Pro = 4 llamadas");
});

/* ─────────────────────────────────────────────────────────────
 * 6. _chooseTierForTest refleja la logica de decision
 * ───────────────────────────────────────────────────────────── */

test("_chooseTierForTest: suggest_reply siempre arranca en Pro", () => {
  const tier = _chooseTierForTest("suggest_reply");
  assert.equal(tier, "pro");
});

test("_chooseTierForTest: classify_intent sin flashOutcome arranca en Flash", () => {
  const tier = _chooseTierForTest("classify_intent");
  assert.equal(tier, "flash");
});

test("_chooseTierForTest: classify_intent con flashOutcome.ok=true conf 0.85 → Flash", () => {
  const tier = _chooseTierForTest("classify_intent", {
    ok: true,
    task: "classify_intent",
    provider: "deepseek",
    content: "X",
    confidence: 0.85,
    needsReview: false,
    note: "ok"
  });
  assert.equal(tier, "flash");
});

test("_chooseTierForTest: classify_intent con flashOutcome.ok=false → Pro", () => {
  const tier = _chooseTierForTest("classify_intent", {
    ok: false,
    task: "classify_intent",
    provider: "deepseek",
    content: "",
    needsReview: true,
    note: "fail"
  });
  assert.equal(tier, "pro");
});

test("_chooseTierForTest: classify_intent con conf=0.5 (baja) → Pro", () => {
  const tier = _chooseTierForTest("classify_intent", {
    ok: true,
    task: "classify_intent",
    provider: "deepseek",
    content: "X",
    confidence: 0.5,
    needsReview: false,
    note: "low conf"
  });
  assert.equal(tier, "pro");
});

test("_chooseTierForTest: detecta threshold custom", () => {
  // threshold custom = 0.9: conf=0.85 deberia ser BAJA → Pro
  env.set("DEEPSEEK_ESCALATE_THRESHOLD", "0.9");
  const tier = _chooseTierForTest("classify_intent", {
    ok: true,
    task: "classify_intent",
    provider: "deepseek",
    content: "X",
    confidence: 0.85,
    needsReview: false,
    note: "mid conf"
  });
  assert.equal(tier, "pro");
});
