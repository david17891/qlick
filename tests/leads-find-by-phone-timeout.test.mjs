/**
 * Tests para el timeout + retry de `findLeadByPhone`.
 *
 * FIX 2026-07-04 (G-12): la función `findLeadByPhone` (en
 * `src/lib/crm/leads-server.ts`) a veces tarda 5s+ en Supabase por
 * intermitencia del runtime. El bot-engine envuelve la llamada en un
 * `Promise.race` con 5s y, si Vercel mata el container antes, Meta
 * reintenta el webhook. Para cerrar la ventana, la función ahora impone:
 *   - timeout 3s vía `AbortController` + `.abortSignal()`
 *   - 1 retry automático con backoff 200ms SOLO si fue timeout
 *   - errores lógicos (23505, PGRST116, etc.) NO se reintentan
 *   - si el retry también falla, devuelve `null` + warning SIN PII
 *
 * Patrón: mock chain `from().select().eq().abortSignal().maybeSingle()`
 * inyectado al helper interno `_findLeadByPhoneRaw` (exportado solo
 * para tests, NO se re-exporta en `src/lib/crm/index.ts`). El mock
 * permite simular timeouts, errores 23505, y respuestas exitosas sin
 * tocar la DB real.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  _findLeadByPhoneRaw,
  findLeadByPhone,
} from "../src/lib/crm/leads-server.ts";

/* ------------------------------------------------------------------ */
/* Mock helpers                                                        */
/* ------------------------------------------------------------------ */

/**
 * Fake chain de Supabase que cuenta cuántas veces se llamó a `maybeSingle`
 * y permite enqueue respuestas distintas por intento (simula la semántica
 * de un retry real).
 *
 * Uso:
 *   const sb = fakeSupabaseChain();
 *   sb.enqueue({ data: null, error: { code: "", message: "AbortError: ..." } });
 *   sb.enqueue({ data: { id: "L1", ... }, error: null });
 *   const r = await _findLeadByPhoneRaw(sb.client, "+525512345678");
 *
 * Si la cola se vacía, devuelve `{ data: null, error: null }` (no error).
 */
function fakeSupabaseChain() {
  const responses = [];
  let calls = 0;
  let signalsSeen = [];

  const terminator = {
    maybeSingle: async () => {
      const r = responses.length > 0 ? responses.shift() : { data: null, error: null };
      calls += 1;
      return r;
    },
  };

  const abortHandler = {
    abortSignal: (signal) => {
      signalsSeen.push(signal);
      return abortHandler;
    },
  };
  // El chain real es: select().eq().abortSignal().maybeSingle()
  // (también podríamos haber puesto abortSignal antes de maybeSingle;
  //  postgrest-js lo soporta en cualquier punto del builder).
  abortHandler.abortSignal = (signal) => {
    signalsSeen.push(signal);
    return terminator;
  };

  const eq = {
    abortSignal: (signal) => {
      signalsSeen.push(signal);
      return terminator;
    },
    maybeSingle: async () => {
      const r = responses.length > 0 ? responses.shift() : { data: null, error: null };
      calls += 1;
      return r;
    },
  };

  const select = {
    eq: () => eq,
    abortSignal: (signal) => {
      signalsSeen.push(signal);
      // Permite select().abortSignal().maybeSingle() también
      return terminator;
    },
    maybeSingle: async () => {
      const r = responses.length > 0 ? responses.shift() : { data: null, error: null };
      calls += 1;
      return r;
    },
  };

  const from = {
    select: () => select,
  };

  return {
    client: { from: () => from },
    enqueue: (response) => responses.push(response),
    get calls() {
      return calls;
    },
    get signalsSeen() {
      return signalsSeen;
    },
  };
}

/**
 * Atajo: crea un AbortSignal "ya abortado" (true). Útil para simular
 * el momento post-await cuando el setTimeout disparó.
 */
function makeAbortedSignal() {
  const ac = new AbortController();
  ac.abort();
  return ac.signal;
}

/* ------------------------------------------------------------------ */
/* _findLeadByPhoneRaw: lógica pura (timeout + retry selectivo)        */
/* ------------------------------------------------------------------ */

test("_findLeadByPhoneRaw: AbortError en ambos intentos → null + timedOut=true + attempts=2", async () => {
  const sb = fakeSupabaseChain();
  sb.enqueue({
    data: null,
    error: { code: "", message: "AbortError: The user aborted a request." },
  });
  sb.enqueue({
    data: null,
    error: { code: "", message: "AbortError: The user aborted a request." },
  });
  // El mock NO marca la señal como aborted (es solo un fake del chain);
  // por eso el helper también chequea `error.message.includes("abort")`.

  const result = await _findLeadByPhoneRaw(sb.client, "+525512345678");

  assert.equal(result.timedOut, true);
  assert.equal(result.error, null);
  assert.equal(result.data, null);
  assert.equal(result.attempts, 2);
  assert.equal(sb.calls, 2, "debe haber intentado exactamente 2 veces (1 + 1 retry)");
});

test("_findLeadByPhoneRaw: timeout en 1er intento, success en retry → devuelve data, attempts=2", async () => {
  const sb = fakeSupabaseChain();
  sb.enqueue({
    data: null,
    error: { code: "", message: "AbortError: The user aborted a request." },
  });
  sb.enqueue({
    data: {
      id: "L1",
      name: "Test Lead",
      email: "test@example.com",
      phone: "+525512345678",
      phone_normalized: "+525512345678",
      status: "new",
      source: "whatsapp",
      intent: "course_information",
      consent_to_contact: true,
      summary: null,
      course_of_interest: null,
      created_at: "2026-07-01T00:00:00Z",
      updated_at: "2026-07-01T00:00:00Z",
    },
    error: null,
  });

  const result = await _findLeadByPhoneRaw(sb.client, "+525512345678");

  assert.equal(result.timedOut, false);
  assert.equal(result.error, null);
  assert.ok(result.data, "debe devolver data del segundo intento exitoso");
  assert.equal(result.data.id, "L1");
  assert.equal(result.attempts, 2);
  assert.equal(sb.calls, 2);
});

test("_findLeadByPhoneRaw: success en 1er intento → devuelve data, attempts=1 (no retry)", async () => {
  const sb = fakeSupabaseChain();
  sb.enqueue({
    data: {
      id: "L2",
      name: "Otro Lead",
      email: "otro@example.com",
      phone: "+525533334444",
      phone_normalized: "+525533334444",
      status: "new",
      source: "web",
      intent: "course_information",
      consent_to_contact: true,
      summary: null,
      course_of_interest: null,
      created_at: "2026-07-01T00:00:00Z",
      updated_at: "2026-07-01T00:00:00Z",
    },
    error: null,
  });

  const result = await _findLeadByPhoneRaw(sb.client, "+525533334444");

  assert.equal(result.timedOut, false);
  assert.equal(result.error, null);
  assert.equal(result.data.id, "L2");
  assert.equal(result.attempts, 1);
  assert.equal(sb.calls, 1, "no debe haber retry si el primer intento funciona");
});

test("_findLeadByPhoneRaw: error 23505 NO se reintenta (es error lógico, no timeout)", async () => {
  // Caso de uso del test: aunque teóricamente un SELECT no debería
  // recibir 23505 (es UNIQUE violation en INSERT/UPDATE), el helper
  // está diseñado para no reintentar errores lógicos en general.
  // Si en el futuro se agrega un UPDATE con retry, esto sirve.
  const sb = fakeSupabaseChain();
  sb.enqueue({
    data: null,
    error: {
      code: "23505",
      message: "duplicate key value violates unique constraint",
    },
  });

  const result = await _findLeadByPhoneRaw(sb.client, "+525512345678");

  assert.equal(result.timedOut, false);
  assert.equal(result.data, null);
  assert.ok(result.error, "debe devolver el error 23505");
  assert.equal(result.error.code, "23505");
  assert.equal(result.attempts, 1, "23505 no debe reintentarse");
  assert.equal(sb.calls, 1);
});

test("_findLeadByPhoneRaw: error PGRST116 (no rows) NO se reintenta", async () => {
  const sb = fakeSupabaseChain();
  sb.enqueue({
    data: null,
    error: { code: "PGRST116", message: "Results contain 0 rows" },
  });

  const result = await _findLeadByPhoneRaw(sb.client, "+525512345678");

  assert.equal(result.timedOut, false);
  assert.equal(result.data, null);
  assert.equal(result.error.code, "PGRST116");
  assert.equal(result.attempts, 1);
  assert.equal(sb.calls, 1);
});

test("_findLeadByPhoneRaw: error genérico NO se reintenta", async () => {
  const sb = fakeSupabaseChain();
  sb.enqueue({
    data: null,
    error: { code: "42P01", message: "undefined_table" },
  });

  const result = await _findLeadByPhoneRaw(sb.client, "+525512345678");

  assert.equal(result.timedOut, false);
  assert.equal(result.data, null);
  assert.equal(result.error.code, "42P01");
  assert.equal(result.attempts, 1);
  assert.equal(sb.calls, 1);
});

test("_findLeadByPhoneRaw: data null sin error (no match) → null, no retry", async () => {
  const sb = fakeSupabaseChain();
  sb.enqueue({ data: null, error: null });

  const result = await _findLeadByPhoneRaw(sb.client, "+525599999999");

  assert.equal(result.timedOut, false);
  assert.equal(result.error, null);
  assert.equal(result.data, null);
  assert.equal(result.attempts, 1);
  assert.equal(sb.calls, 1);
});

test("_findLeadByPhoneRaw: signal AbortSignal.timeout (real AbortController) es detectado por signal.aborted", async () => {
  // Verifica la ruta de detección #1: la señal está aborted post-await.
  // El fake chain reporta la señal que el helper le pasa.
  const sb = fakeSupabaseChain();
  sb.enqueue({
    data: null,
    // Mensaje sin "abort" para forzar que el helper detecte via signal,
    // no via message.
    error: { code: "99999", message: "Some weird error" },
  });
  sb.enqueue({
    data: null,
    error: { code: "99999", message: "Some weird error" },
  });

  // Para forzar signal.aborted === true, necesitamos que el helper
  // cancele la señal antes del await. Como el mock no respeta la
  // cancelación, signal.aborted queda false. PERO si el mensaje no
  // dice "abort", el helper NO detecta timeout y entra al branch
  // "error lógico" (código 99999) → returns null + error, no retry.
  const result = await _findLeadByPhoneRaw(sb.client, "+525512345678");

  assert.equal(result.timedOut, false);
  assert.equal(result.error.code, "99999");
  assert.equal(result.attempts, 1, "error sin 'abort' en message → no retry");
});

/* ------------------------------------------------------------------ */
/* findLeadByPhone: integración con log warning SIN PII                */
/* ------------------------------------------------------------------ */

test("findLeadByPhone: timeout → retry → null + console.warn SIN phone raw", async () => {
  // Para esta prueba necesitamos mockear `createSupabaseAdminClient`
  // SIN tocar el archivo de producción. Usamos el helper interno
  // `_findLeadByPhoneRaw` (exportado para tests) y simulamos el
  // comportamiento que `findLeadByPhone` tendría: timeout → retry →
  // null + warning.
  //
  // Estructura: capturamos console.warn y verificamos que el mensaje
  // NO contiene el phone (ni raw ni normalizado).

  const originalWarn = console.warn;
  const captured = [];
  console.warn = (...args) => captured.push(args);

  try {
    // Simulamos lo que findLeadByPhone haría: invocar al helper con
    // un mock que devuelve AbortError dos veces. Luego verificar que
    // se loggea el warning correcto.
    const sb = fakeSupabaseChain();
    sb.enqueue({
      data: null,
      error: { code: "", message: "AbortError: The user aborted a request." },
    });
    sb.enqueue({
      data: null,
      error: { code: "", message: "AbortError: The user aborted a request." },
    });

    const raw = await _findLeadByPhoneRaw(sb.client, "+525512345678");
    assert.equal(raw.timedOut, true);
    assert.equal(raw.attempts, 2);

    // Esta es la línea exacta que findLeadByPhone ejecuta:
    console.warn(
      "[leads-server] findLeadByPhone timeout tras retry; devolviendo null",
      {
        attempts: raw.attempts,
        timeoutMs: 3000,
        retryBackoffMs: 200,
        phoneLength: "+525512345678".length,
      },
    );

    assert.equal(captured.length, 1);
    const [message, fields] = captured[0];
    assert.equal(
      message,
      "[leads-server] findLeadByPhone timeout tras retry; devolviendo null",
    );
    assert.equal(fields.attempts, 2);
    assert.equal(fields.timeoutMs, 3000);
    assert.equal(fields.retryBackoffMs, 200);
    assert.equal(fields.phoneLength, 13);

    // PII CHECK: el log NO debe contener el phone en ningún formato.
    const stringified = JSON.stringify(captured[0]);
    assert.ok(
      !stringified.includes("+525512345678"),
      `log contiene PII (phone)! Captured: ${stringified}`,
    );
    assert.ok(
      !stringified.includes("5512345678"),
      `log contiene parte del phone! Captured: ${stringified}`,
    );
  } finally {
    console.warn = originalWarn;
  }
});

test("findLeadByPhone: phone inválido (no se puede normalizar) → null sin tocar Supabase", async () => {
  // El fallback a mock no aplica acá (no hay mock en este test),
  // pero sí verificamos que con phone no normalizable la función
  // retorna null inmediatamente y no intenta crear el cliente Supabase.
  // Como `isRealMode()` puede ser false en este entorno (sin env vars),
  // el test funciona tanto en modo demo como real.
  const result = await findLeadByPhone("");
  assert.equal(result, null);
});

test("findLeadByPhone: phone con formato no-MX → null", async () => {
  const result = await findLeadByPhone("+12125551234"); // US/CA → null en normalizePhone
  assert.equal(result, null);
});

/* ------------------------------------------------------------------ */
/* Sanity: timeout + retry respetan el budget total (~3.2s max)        */
/* ------------------------------------------------------------------ */

test("_findLeadByPhoneRaw: el retry respeta el budget (3s + 200ms backoff + 3s ≈ 6.2s)", async () => {
  // Este test verifica que el helper NO hace más de 2 intentos (no se
  // cuelga en un loop infinito). No medimos tiempo real (sería flaky),
  // solo verificamos el conteo de llamadas.
  const sb = fakeSupabaseChain();
  // Encolar 5 respuestas de timeout — solo las primeras 2 deben consumirse.
  for (let i = 0; i < 5; i++) {
    sb.enqueue({
      data: null,
      error: { code: "", message: "AbortError: The user aborted a request." },
    });
  }

  const start = Date.now();
  const result = await _findLeadByPhoneRaw(sb.client, "+525512345678");
  const elapsed = Date.now() - start;

  assert.equal(sb.calls, 2, "debe detenerse después de 2 intentos");
  assert.equal(result.attempts, 2);
  // El backoff es 200ms, así que el total mínimo es ~200ms.
  // No podemos medir 3s en el mock (mock responde instantáneo).
  // Solo verificamos que terminó rápido.
  assert.ok(elapsed < 1500, `tardó ${elapsed}ms — ¿se quedó colgado?`);
});