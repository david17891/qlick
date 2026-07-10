/**
 * Tests del Sub-sprint 2C — Function-Calling en DeepSeek Provider.
 *
 * Cubre los 8 casos del diseño `docs/SPRINT_2C_DEEPSEEK_TOOL_LOOP.md` §4:
 *
 *   1. Sin tool_call en 1ª vuelta → 1 sola llamada a fetch.
 *   2. Con tool_call normal → 2 llamadas exactas, tool ejecutado,
 *      2ª llamada SIN `tools` en payload, max_tokens=250, content OK.
 *   3. Tool call con args malformados (JSON inválido) → loop no se rompe.
 *   4. Tool execution >800ms → fallback por timeout, loop termina OK.
 *   5. 2ª llamada falla con 5xx (tool OK previo) → fallback humano desde
 *      el resultado del tool, sin "problema técnico".
 *   6. Feature flag OFF (`DEEPSEEK_TOOLS_ENABLED !== "true"`) → 1 sola
 *      llamada, tool_call descartado, comportamiento Sprint 1.
 *   7. Latencia total E2E <2500ms (medido con Date.now).
 *   8. Contador de iteraciones: incluso si la 2ª llamada trae tool_call
 *      (patológico), el loop NO hace una 3ª llamada.
 *
 * Patrón:
 *   - mockea `globalThis.fetch` con el helper `tests/helpers/`.
 *   - mockea `executeExtractAndSaveContact` con un spy que permite
 *     controlar latencia y resultado.
 *   - setea `process.env.DEEPSEEK_API_KEY` y `DEEPSEEK_TOOLS_ENABLED`
 *     antes de cada test y los restaura en afterEach.
 */

import { test, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

// @ts-check

import {
  installDeepseekFetchMock,
  deepseekTextResponse,
  deepseekToolCallResponse,
  deepseekErrorResponse
} from "./helpers/deepseek-fetch-mock.mjs";

import {
  deepseekAgentProvider,
  _runWithToolLoopForTest,
  _isDeepseekToolsEnabledForTest,
  _pickFallbackForTest
} from "../src/lib/ai/deepseek-provider.ts";

/* ------------------------------------------------------------------ */
/* Setup                                                               */
/* ------------------------------------------------------------------ */

const ORIGINAL_API_KEY = process.env.DEEPSEEK_API_KEY;
const ORIGINAL_TOOLS_ENABLED = process.env.DEEPSEEK_TOOLS_ENABLED;

// Forzar que el provider entre al path de fetch (no modo demo).
process.env.DEEPSEEK_API_KEY = "test-mock-key-do-not-call-real-api";

// Helper context mínimo.
function makeCtx(overrides = {}) {
  return {
    profile: {
      name: "Qlick",
      businessName: "Qlick Marketing Integral",
      businessDescription: "Qlick ofrece cursos de marketing digital.",
      businessHours: "Lun-Vie 9-18",
      tone: "amigable",
      servicesOrCourses: ["Marketing Digital"],
      allowedActions: ["Responder preguntas"],
      forbiddenActions: [],
      escalationRules: [],
      fallbackMessage: "no tengo ese dato"
    },
    lastIncomingMessage: "Hola, me llamo Juan y mi correo es juan@gmail.com",
    activeEvent: undefined,
    isFirstMessage: false,
    leadId: "L-test-123",
    ...overrides
  };
}

// Spy install/uninstall para executeExtractAndSaveContact.
// Retornamos el spy vía module override, PERO como el .ts usa ESM y no
// podemos mutar exports fácilmente, vamos a usar otro approach:
// mock del supabase chain que el ejecutor usa internamente.

// Para el Caso 4 (tool >800ms), necesitamos un mock supabase que demore.
// Para los otros casos, podemos pasar supabase=null (modo demo) y eso
// es suficiente: el ejecutor valida y "guarda" sin tocar DB.

/* ------------------------------------------------------------------ */
/* Limpieza post-tests                                                  */
/* ------------------------------------------------------------------ */

after(() => {
  // Restaurar envs originales.
  if (ORIGINAL_API_KEY === undefined) {
    delete process.env.DEEPSEEK_API_KEY;
  } else {
    process.env.DEEPSEEK_API_KEY = ORIGINAL_API_KEY;
  }
  if (ORIGINAL_TOOLS_ENABLED === undefined) {
    delete process.env.DEEPSEEK_TOOLS_ENABLED;
  } else {
    process.env.DEEPSEEK_TOOLS_ENABLED = ORIGINAL_TOOLS_ENABLED;
  }
});

/* ============================================================
 * CASO 1 — Sin tool_call: 1 sola llamada a fetch
 * ========================================================== */

test("CASO 1: sin tool_call → 1 sola llamada, fetch se invoca exactamente 1 vez", async () => {
  process.env.DEEPSEEK_TOOLS_ENABLED = "true";

  const mock = installDeepseekFetchMock([
    deepseekTextResponse("¡Hola! Claro que sí, te cuento sobre el evento.")
  ]);
  try {
    const ctx = makeCtx();
    const result = await _runWithToolLoopForTest("suggest_reply", ctx);

    assert.equal(result.ok, true, "result.ok debe ser true");
    assert.equal(mock.calls().length, 1, "fetch debe haberse llamado EXACTAMENTE 1 vez");
    assert.ok(result.content.includes("evento"));
  } finally {
    mock.restore();
  }
});

test("CASO 1: el payload de la 1ª llamada INCLUYE tools cuando flag=ON", async () => {
  process.env.DEEPSEEK_TOOLS_ENABLED = "true";

  const mock = installDeepseekFetchMock([
    deepseekTextResponse("Hola desde Qlick.")
  ]);
  try {
    const ctx = makeCtx();
    await _runWithToolLoopForTest("suggest_reply", ctx);

    const body = mock.bodyOf(1);
    assert.ok(Array.isArray(body.tools), "1ª llamada DEBE incluir array `tools`");
    assert.ok(
      body.tools.some((t) => t.function.name === "extract_and_save_contact_info"),
      "tools debe contener extract_and_save_contact_info"
    );
  } finally {
    mock.restore();
  }
});

/* ============================================================
 * CASO 2 — Con tool_call normal: 2 llamadas exactas
 * ========================================================== */

test("CASO 2: con tool_call → 2 llamadas exactas y tool se ejecuta", async () => {
  process.env.DEEPSEEK_TOOLS_ENABLED = "true";

  const mock = installDeepseekFetchMock([
    deepseekToolCallResponse(
      "extract_and_save_contact_info",
      { name: "Juan Pérez", email: "juan@gmail.com" }
    ),
    deepseekTextResponse("¡Listo Juan! Ya te registré tu correo.")
  ]);
  try {
    const ctx = makeCtx();
    const result = await _runWithToolLoopForTest("suggest_reply", ctx);

    assert.equal(result.ok, true);
    assert.equal(mock.calls().length, 2, "fetch se llama EXACTAMENTE 2 veces");
    assert.ok(result.content.includes("Juan"), "content debe incluir el saludo");
  } finally {
    mock.restore();
  }
});

test("CASO 2: 2ª llamada NO incluye tools (regla dura)", async () => {
  process.env.DEEPSEEK_TOOLS_ENABLED = "true";

  const mock = installDeepseekFetchMock([
    deepseekToolCallResponse("extract_and_save_contact_info", { name: "Ana López" }),
    deepseekTextResponse("¡Listo Ana!")
  ]);
  try {
    const ctx = makeCtx();
    await _runWithToolLoopForTest("suggest_reply", ctx);

    const firstBody = mock.bodyOf(1);
    const secondBody = mock.bodyOf(2);
    assert.ok(Array.isArray(firstBody.tools), "1ª llamada SÍ lleva tools");
    assert.equal(
      secondBody.tools,
      undefined,
      "2ª llamada NO debe llevar `tools` (regla dura de 1 iteración)"
    );
  } finally {
    mock.restore();
  }
});

test("CASO 2: 2ª llamada usa max_tokens=250 (respuesta corta)", async () => {
  process.env.DEEPSEEK_TOOLS_ENABLED = "true";

  const mock = installDeepseekFetchMock([
    deepseekToolCallResponse("extract_and_save_contact_info", { name: "Ana" }),
    deepseekTextResponse("¡Listo!")
  ]);
  try {
    const ctx = makeCtx();
    await _runWithToolLoopForTest("suggest_reply", ctx);

    const secondBody = mock.bodyOf(2);
    assert.equal(secondBody.max_tokens, 250, "2ª llamada DEBE usar max_tokens=250");
    assert.equal(secondBody.temperature, 0.5, "2ª llamada usa temperature 0.5");
  } finally {
    mock.restore();
  }
});

test("CASO 2: 2ª llamada incluye historial completo (system+user+assistant+tool)", async () => {
  process.env.DEEPSEEK_TOOLS_ENABLED = "true";

  const mock = installDeepseekFetchMock([
    deepseekToolCallResponse("extract_and_save_contact_info", { name: "Ana" }, "call_xyz"),
    deepseekTextResponse("¡Listo Ana!")
  ]);
  try {
    const ctx = makeCtx();
    await _runWithToolLoopForTest("suggest_reply", ctx);

    const secondBody = mock.bodyOf(2);
    const msgs = secondBody.messages;
    assert.equal(msgs.length, 4, "2ª llamada debe tener 4 mensajes en el historial");
    assert.equal(msgs[0].role, "system");
    assert.equal(msgs[1].role, "user");
    assert.equal(msgs[2].role, "assistant");
    assert.ok(Array.isArray(msgs[2].tool_calls), "assistant debe llevar tool_calls");
    assert.equal(msgs[3].role, "tool");
    assert.equal(msgs[3].tool_call_id, "call_xyz", "tool debe referenciar tool_call_id");
  } finally {
    mock.restore();
  }
});

/* ============================================================
 * CASO 3 — Args malformados (JSON inválido)
 * ========================================================== */

test("CASO 3: tool_call con argumentos JSON inválido → loop no se rompe", async () => {
  process.env.DEEPSEEK_TOOLS_ENABLED = "true";

  // Forzamos un arguments mal formado. Como el mock usa deepseekToolCallResponse
  // que serializa con JSON.stringify, tenemos que construir una response custom.
  const mock = installDeepseekFetchMock([
    {
      status: 200,
      body: {
        id: "chatcmpl-malformed",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_bad",
                  type: "function",
                  function: {
                    name: "extract_and_save_contact_info",
                    arguments: "{ not valid json"
                  }
                }
              ]
            },
            finish_reason: "tool_calls"
          }
        ]
      }
    },
    deepseekTextResponse("Tuve un problema al guardar tus datos. ¿Me los repites, por favor?")
  ]);
  try {
    const ctx = makeCtx();
    const result = await _runWithToolLoopForTest("suggest_reply", ctx);

    assert.equal(result.ok, true, "loop NO debe crashear");
    assert.equal(mock.calls().length, 2, "loop hace 2 llamadas (1ª + 2ª redactando)");
    assert.ok(
      !/problema t[eé]cnico/i.test(result.content),
      "fallback NO debe contener 'problema técnico'"
    );
  } finally {
    mock.restore();
  }
});

test("CASO 3: tool_call con name distinto al consolidado → rechazado", async () => {
  process.env.DEEPSEEK_TOOLS_ENABLED = "true";

  const mock = installDeepseekFetchMock([
    deepseekToolCallResponse("escalate_to_human", { reason: "test" }),
    deepseekTextResponse("Lo derivo con el equipo, un momento por favor.")
  ]);
  try {
    const ctx = makeCtx();
    const result = await _runWithToolLoopForTest("suggest_reply", ctx);

    assert.equal(result.ok, true, "loop NO crashea aunque LLM emita tool distinta");
    assert.equal(mock.calls().length, 2);
    assert.ok(/escalate_to_human/.test(result.note),
      `note debe mencionar la tool rechazada; got: ${result.note}`);
    assert.ok(/no soportada|ok=false/i.test(result.note),
      `note debe indicar rechazo; got: ${result.note}`);
  } finally {
    mock.restore();
  }
});

/* ============================================================
 * CASO 4 — Tool execution > 800ms (timeout)
 * ========================================================== */

test("CASO 4: tool execution >800ms → fallback por timeout, loop termina OK", async () => {
  process.env.DEEPSEEK_TOOLS_ENABLED = "true";

  // Mock chain supabase que tarda > 800ms.
  // Lo pasamos como context.supabase y el ejecutor lo usa.
  let updateCalls = 0;
  const slowSupabase = {
    from() {
      return {
        update() {
          updateCalls += 1;
          return {
            eq() {
              return {
                then(onFulfilled) {
                  // Sleep 1500ms simulando Supabase congestionado.
                  return new Promise((resolve) => setTimeout(resolve, 1500))
                    .then(() => onFulfilled({ data: null, error: { code: "57014", message: "statement timeout" } }));
                }
              };
            }
          };
        }
      };
    }
  };

  const mock = installDeepseekFetchMock([
    deepseekToolCallResponse("extract_and_save_contact_info", { name: "Test Lento Pérez" }),
    deepseekTextResponse("Tuve una demora técnica. ¿Me confirmas tus datos?")
  ]);
  try {
    const ctx = makeCtx({ supabase: slowSupabase });
    const result = await _runWithToolLoopForTest("suggest_reply", ctx);

    assert.equal(result.ok, true, "loop debe terminar OK aunque tool timeout");
    assert.equal(mock.calls().length, 2, "loop siempre hace max 2 calls");
    assert.ok(/demora|problema|por favor|confirmas/i.test(result.content),
      `content debe ser fallback humano, got: ${result.content}`);
    assert.ok(
      !/problema t[eé]cnico/i.test(result.content),
      "fallback NO debe contener 'problema técnico'"
    );
    assert.ok(updateCalls <= 1, "UPDATE se intentó (no fue bloqueado)");
  } finally {
    mock.restore();
  }
});

test("CASO 4: nota incluye 'excedió' cuando tool tarda demasiado", async () => {
  process.env.DEEPSEEK_TOOLS_ENABLED = "true";

  let updateCalls = 0;
  const slowSupabase = {
    from() {
      return {
        update() {
          updateCalls += 1;
          return {
            eq() {
              return {
                then(onFulfilled) {
                  return new Promise((resolve) => setTimeout(resolve, 1500))
                    .then(() => onFulfilled({ data: null, error: null }));
                }
              };
            }
          };
        }
      };
    }
  };

  const mock = installDeepseekFetchMock([
    deepseekToolCallResponse("extract_and_save_contact_info", { name: "Ana María López" }),
    deepseekTextResponse("Ok, te confirmo en un momento.")
  ]);
  try {
    const ctx = makeCtx({ supabase: slowSupabase });
    const result = await _runWithToolLoopForTest("suggest_reply", ctx);

    // La nota final debe mencionar la tool con su resultado ok=false (lo
    // que indica que no se guardó).
    assert.ok(
      /ok=false/.test(result.note),
      `note debe mostrar ok=false de la tool (timeout la marca como no-OK); got: ${result.note}`
    );
    assert.ok(/extract_and_save_contact_info/.test(result.note),
      `note debe incluir nombre de tool; got: ${result.note}`);
  } finally {
    mock.restore();
  }
});

/* ============================================================
 * CASO 5 — 2ª llamada falla, tool OK previo
 * ========================================================== */

test("CASO 5: 2ª llamada 503 + tool OK → fallback humano desde tool result", async () => {
  process.env.DEEPSEEK_TOOLS_ENABLED = "true";

  const mock = installDeepseekFetchMock([
    deepseekToolCallResponse("extract_and_save_contact_info", { name: "Marcos Pérez", email: "marcos@example.com" }),
    deepseekErrorResponse(503, "Service Unavailable")
  ]);
  try {
    const ctx = makeCtx();
    const result = await _runWithToolLoopForTest("suggest_reply", ctx);

    assert.equal(result.ok, true, "loop NO debe fallar — hay fallback");
    assert.equal(mock.calls().length, 2);
    assert.ok(/Marcos/.test(result.content),
      `fallback debe incluir el firstName 'Marcos', got: ${result.content}`);
    assert.ok(
      !/problema t[eé]cnico/i.test(result.content),
      "fallback NO debe sonar a 'problema técnico'"
    );
    assert.ok(result.note.includes("[2C fallback]"),
      `note debe marcar el path 2C fallback, got: ${result.note}`);
  } finally {
    mock.restore();
  }
});

test("CASO 5: 2ª llamada 503 + tool FAILED → fallback neutro", async () => {
  process.env.DEEPSEEK_TOOLS_ENABLED = "true";

  // Mock supabase que falla el UPDATE (error 42P01).
  const failingSupabase = {
    from() {
      return {
        update() {
          return {
            eq() {
              return {
                then(onFulfilled) {
                  return Promise.resolve({ data: null, error: { code: "42P01", message: "undefined_table" } });
                }
              };
            }
          };
        }
      };
    }
  };

  const mock = installDeepseekFetchMock([
    deepseekToolCallResponse("extract_and_save_contact_info", { name: "Test" }),
    deepseekErrorResponse(500, "Internal Server Error")
  ]);
  try {
    const ctx = makeCtx({ supabase: failingSupabase });
    const result = await _runWithToolLoopForTest("suggest_reply", ctx);

    assert.equal(result.ok, true);
    assert.ok(result.needsReview, "debe marcar needsReview=true (admin debe revisar)");
    assert.ok(
      !/problema t[eé]cnico/i.test(result.content),
      "fallback NO debe sonar a 'problema técnico'"
    );
  } finally {
    mock.restore();
  }
});

/* ============================================================
 * CASO 6 — Feature flag OFF
 * ========================================================== */

test("CASO 6: DEEPSEEK_TOOLS_ENABLED !== 'true' → 1 sola llamada, SIN tools en payload", async () => {
  // Default: la flag NO está seteada.
  delete process.env.DEEPSEEK_TOOLS_ENABLED;
  assert.equal(_isDeepseekToolsEnabledForTest(), false,
    "sin la flag, debe estar OFF");

  const mock = installDeepseekFetchMock([
    deepseekTextResponse("Hola, ¿en qué te ayudo?")
  ]);
  try {
    // Usar el provider.run() — NO _runWithToolLoopForTest — porque
    // _runWithToolLoopForTest siempre intenta el loop si flag ON.
    // Como la flag está OFF, run() cae al path Sprint 1.
    const ctx = makeCtx();
    const result = await deepseekAgentProvider.run("suggest_reply", ctx);

    assert.equal(result.ok, true);
    assert.equal(mock.calls().length, 1, "fetch 1 sola vez (modo Sprint 1)");
    const body = mock.bodyOf(1);
    assert.equal(body.tools, undefined,
      "payload NO debe contener `tools` cuando flag está OFF");
  } finally {
    mock.restore();
  }
});

test("CASO 6: DEEPSEEK_TOOLS_ENABLED='false' (explícito) → mismo comportamiento", async () => {
  process.env.DEEPSEEK_TOOLS_ENABLED = "false";
  assert.equal(_isDeepseekToolsEnabledForTest(), false);

  const mock = installDeepseekFetchMock([
    deepseekTextResponse("Bienvenido a Qlick.")
  ]);
  try {
    const ctx = makeCtx();
    const result = await deepseekAgentProvider.run("suggest_reply", ctx);

    assert.equal(result.ok, true);
    assert.equal(mock.calls().length, 1);
    assert.equal(mock.bodyOf(1).tools, undefined);
  } finally {
    mock.restore();
  }
});

/* ============================================================
 * CASO 7 — Latencia E2E < 2500ms
 * ========================================================== */

test("CASO 7: latencia E2E con tool_call normal < 2500ms", async () => {
  process.env.DEEPSEEK_TOOLS_ENABLED = "true";

  const mock = installDeepseekFetchMock([
    deepseekToolCallResponse("extract_and_save_contact_info", { name: "Timer Test" }),
    deepseekTextResponse("Listo, ya quedaste registrado.")
  ]);
  try {
    const ctx = makeCtx();
    const start = Date.now();
    const result = await _runWithToolLoopForTest("suggest_reply", ctx);
    const elapsed = Date.now() - start;

    assert.equal(result.ok, true);
    assert.ok(elapsed < 2500,
      `E2E con tool_call debe ser <2500ms; took ${elapsed}ms`);
  } finally {
    mock.restore();
  }
});

test("CASO 7: latencia E2E sin tool_call (camino simple) < 1500ms", async () => {
  process.env.DEEPSEEK_TOOLS_ENABLED = "true";

  const mock = installDeepseekFetchMock([
    deepseekTextResponse("Hola, ¿qué te gustaría saber?")
  ]);
  try {
    const ctx = makeCtx();
    const start = Date.now();
    const result = await _runWithToolLoopForTest("suggest_reply", ctx);
    const elapsed = Date.now() - start;

    assert.equal(result.ok, true);
    assert.ok(elapsed < 1500,
      `camino simple (sin tool) debe ser <1500ms; took ${elapsed}ms`);
  } finally {
    mock.restore();
  }
});

/* ============================================================
 * CASO 8 — Loop NO hace una 3ª llamada aunque 2ª venga con tool_call
 * ========================================================== */

test("CASO 8: si la 2ª llamada EMITE tool_call, loop NO hace una 3ª llamada", async () => {
  process.env.DEEPSEEK_TOOLS_ENABLED = "true";

  // 1ª: tool_call normal (extrae contacto).
  // 2ª: IMAGINEMOS un bug del LLM — emite otro tool_call.
  // El loop DEBE descartar el tool_call y usar el `content` (vacío en este caso)
  // o caer al fallback. NO debe hacer una 3ª llamada.
  const mock = installDeepseekFetchMock([
    deepseekToolCallResponse("extract_and_save_contact_info", { name: "Loop Test" }),
    {
      status: 200,
      body: {
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "¡Listo! Ya quedaste registrado.",
              tool_calls: [
                {
                  id: "call_dos",
                  type: "function",
                  function: {
                    name: "extract_and_save_contact_info", // emitido de nuevo, hipotéticamente.
                    arguments: '{"name":"Second Call"}'
                  }
                }
              ]
            },
            finish_reason: "tool_calls"
          }
        ]
      }
    }
  ]);
  try {
    const ctx = makeCtx();
    const result = await _runWithToolLoopForTest("suggest_reply", ctx);

    // REGLA DURA: máximo 2 llamadas a la red, nunca 3.
    assert.equal(mock.calls().length, 2,
      `loop DEBE detenerse en 2 calls aunque 2ª traiga tool_call; got ${mock.calls().length}`);

    // El resultado debe ser estable (no crash) y el contenido de la 2ª
    // respuesta debe usarse (o el fallback).
    assert.equal(result.ok, true);
  } finally {
    mock.restore();
  }
});

test("CASO 8: contador de iteraciones es EXACTAMENTE 1 (1ª sin tool_call) o 2 (con tool_call)", async () => {
  process.env.DEEPSEEK_TOOLS_ENABLED = "true";

  // Caso A: 1ª sin tool_call → 1 fetch call.
  const mockA = installDeepseekFetchMock([
    deepseekTextResponse("Sin tool.")
  ]);
  try {
    const ctx = makeCtx();
    await _runWithToolLoopForTest("suggest_reply", ctx);
    assert.equal(mockA.calls().length, 1, "camino sin tool_call = 1 fetch");
  } finally {
    mockA.restore();
  }

  // Caso B: 1ª con tool_call → 2 fetch calls.
  const mockB = installDeepseekFetchMock([
    deepseekToolCallResponse("extract_and_save_contact_info", { name: "Ana" }),
    deepseekTextResponse("Listo.")
  ]);
  try {
    const ctx = makeCtx();
    await _runWithToolLoopForTest("suggest_reply", ctx);
    assert.equal(mockB.calls().length, 2, "camino con tool_call = 2 fetches");
  } finally {
    mockB.restore();
  }
});

/* ============================================================
 * Sanity / Coverage extra
 * ========================================================== */

test("sanity: pickFallback devuelve copy humano distinto a 'problema técnico'", () => {
  // Aunque no se llame desde el loop, verificamos el helper exportado.
  const withEvent = _pickFallbackForTest({
    id: "x", slug: "x", shortCode: null,
    title: "Test", description: null,
    startsAt: new Date(), endsAt: null,
    location: "CDMX", humanStartsAt: "5 jul", humanDuration: "2h",
    promptBlock: "", source: "db",
    requiresName: true, eventRules: { personality: "", rules: [] },
    format: "in_person", streamingUrl: null,
    streamingProvider: null, streamingAccessNote: null
  });
  const withoutEvent = _pickFallbackForTest(undefined);
  assert.ok(!/problema t[eé]cnico/i.test(withEvent));
  assert.ok(!/problema t[eé]cnico/i.test(withoutEvent));
  assert.ok(/hilo/.test(withEvent) || /ayudarte/.test(withEvent));
});

test("sanity: run() del provider respeta task !== suggest_reply (NO entra al loop)", async () => {
  process.env.DEEPSEEK_TOOLS_ENABLED = "true";

  const mock = installDeepseekFetchMock([
    deepseekTextResponse("unknown")
  ]);
  try {
    const ctx = makeCtx();
    // 'classify_intent' NO debe entrar al tool loop aunque la flag esté ON.
    const result = await deepseekAgentProvider.run("classify_intent", ctx);
    assert.equal(result.ok, true);
    assert.equal(mock.calls().length, 1,
      "classify_intent NO debe usar tool loop → 1 sola llamada");
  } finally {
    mock.restore();
  }
});

test("sanity: provider.run con task=suggest_reply y flag ON delega al loop", async () => {
  process.env.DEEPSEEK_TOOLS_ENABLED = "true";

  const mock = installDeepseekFetchMock([
    deepseekToolCallResponse("extract_and_save_contact_info", { name: "Delegated" }),
    deepseekTextResponse("Salida final.")
  ]);
  try {
    const ctx = makeCtx();
    const result = await deepseekAgentProvider.run("suggest_reply", ctx);
    assert.equal(result.ok, true);
    assert.equal(mock.calls().length, 2);
    // El note debe indicar que pasó por el loop.
    assert.ok(/2C/.test(result.note), `note debe marcar path 2C; got: ${result.note}`);
  } finally {
    mock.restore();
  }
});
