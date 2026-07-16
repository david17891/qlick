/**
 * REGRESIÓN 2026-07-16 (sesión David "le paso mi correo y ya no pasa nada").
 *
 * El commit 85f9278 (early-gate LFPDPPP) introdujo un bloque en
 * `processInboundMessage` que interceptaba emails con `EMAIL_RE` y
 * retornaba `responseKind: "none"` ANTES del flow normal. Resultado: el
 * bot guardaba el email en DB pero NUNCA le respondía al lead, que
 * quedaba colgado sin QR ni email de bienvenida.
 *
 * El test existente `processInboundMessage: provee email → provide_email
 * + texto confirmacion` (whatsapp-bot.test.mjs:766) usa `disableSupabase()`
 * y por eso no detectó el bug — el early-gate solo se activa con Supabase
 * real (env vars seteadas + `lead.id` válido).
 *
 * Este test setea Supabase activo + mockea el cliente admin con un
 * builder que devuelve datos mínimos válidos, y verifica que el bot
 * NO retorne con la firma del early-gate (`responseKind: "none"` con
 * note mencionando "gate pre-kill-switch" o "early-gate").
 *
 * Patrón: `node --test`, sin libs externas, mocks via `node:test` mock
 * + `mock.module` para interceptar el cliente Supabase.
 *
 * Privacy: 0 PII. Email sintético, teléfono sintético.
 */

import { test, mock, before } from "node:test";
import assert from "node:assert/strict";

// @ts-check

/* ─────────────────────────────────────────────────────────────
 * Mock del cliente Supabase admin
 * ───────────────────────────────────────────────────────────── */

/**
 * Lead fake que retornamos cuando el bot hace .single()/.maybeSingle().
 * El bot-engine hace `data.id`, `data.name`, `data.email`, `data.created_at`,
 * `data.updated_at` — los populamos todos para no romper el flow.
 */
const FAKE_LEAD = {
  id: "00000000-0000-0000-0000-000000000001",
  name: "Test Lead",
  email: null,
  phone: "+521234567890",
  phone_normalized: "+521234567890",
  status: "new",
  source: "whatsapp",
  intent: "course_information",
  consent_to_contact: false,
  summary: null,
  course_of_interest: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  bot_paused: false,
  bot_paused_at: null,
  bot_paused_by_email: null
};

/**
 * Builder chainable. Cada llamada a un método (chainable o terminal)
 * retorna el mismo proxy. PERO los métodos terminales (single,
 * maybeSingle, then) también responden a `await` retornando una Promise
 * con datos válidos.
 *
 * Política: si el query es sobre `leads` y usa `maybeSingle`, retornamos
 * el lead fake. Para todo lo demás, retornamos null/empty.
 */
function makeChainable(table = "unknown") {
  // Función que actúa como terminal Y como chainable.
  // Cuando se llama (e.g., `await chainable()`), retorna una Promise
  // con datos por defecto. Cuando se accede a una propiedad (e.g.,
  // `chainable.eq`), retorna otro chainable.
  const chainable = function () {
    // Terminal: cuando se llama con `await`. Para Supabase real,
    // el resultado depende del método (insert/update/delete retornan
    // un array; select+terminales retornan un objeto con `data`).
    return Promise.resolve({ data: null, error: null, count: 0 });
  };
  const handler = {
    get(_target, prop) {
      if (prop === "maybeSingle") {
        return async () => ({ data: table === "leads" ? FAKE_LEAD : null, error: null });
      }
      if (prop === "single") {
        return async () => ({
          data: table === "leads" ? FAKE_LEAD : { id: "fake-id" },
          error: null
        });
      }
      if (prop === Symbol.toPrimitive || prop === "toString" || prop === "valueOf") {
        return () => "chainable";
      }
      if (prop === "then") {
        // El chainable es thenable; cuando se hace `await chainable`,
        // resolvemos con un objeto neutro.
        return (resolve) => resolve({ data: null, error: null, count: 0 });
      }
      // Cualquier otra propiedad — retornar otro chainable.
      return makeChainable(table);
    },
    apply(_target, _thisArg, args) {
      // Si se llama con un objeto (e.g., `insert({...})`), retornar
      // un chainable para que se pueda encadenar más (e.g., `.select()`).
      return makeChainable(table);
    }
  };
  return new Proxy(chainable, handler);
}

function makeMockSupabaseClient() {
  return {
    from: (table) => makeChainable(table)
  };
}

before(() => {
  // El bot-engine hace `await import("../supabase/admin")` y `await
  // import("../supabase/health")` dinámicamente. mock.module intercepta
  // esos imports. Sin extensión (es el specifier original; Node +
  // strip-types resuelven a .ts).
  mock.module("../src/lib/supabase/admin", {
    namedExports: {
      createSupabaseAdminClient: () => makeMockSupabaseClient()
    }
  });
  mock.module("../src/lib/supabase/health", {
    namedExports: {
      checkSupabaseConfig: () => ({ configured: true, mode: "configured" })
    }
  });
});

/* ─────────────────────────────────────────────────────────────
 * Test: Supabase activo + body=email → NO early-gate
 * ───────────────────────────────────────────────────────────── */

test("REGRESION 2026-07-16: con Supabase activo, body=email NO retorna con responseKind=none (early-gate removido)", async () => {
  // Setear env vars de Supabase ANTES de importar el bot-engine. El
  // `getSupabase()` interno usa `checkSupabaseConfig` que está mockeado
  // (devuelve configured:true), pero las env vars también las leen otras
  // funciones (leads-server, etc.) para no chocar.
  const origUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const origKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const origSecret = process.env.SUPABASE_SECRET_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??= "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.fake.fake";
  process.env.SUPABASE_SECRET_KEY ??= "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.fake.fake";

  // Mockear globalThis.fetch para que el provider de WhatsApp (si
  // intenta mandar) no haga requests reales.
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    return new Response(JSON.stringify({ messages: [{ id: "wamid_test" }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };

  try {
    const { processInboundMessage } = await import(
      "../src/lib/whatsapp/bot-engine.ts"
    );

    const result = await processInboundMessage({
      messageId: "wamid_regression_email",
      from: "521234567890",
      contactName: "Test",
      text: "david17891@gmail.com",
      type: "text",
      timestamp: "1700000000"
    });

    // El bug original: el early-gate retornaba esto:
    //   {
    //     ok: true,
    //     intent: "provide_email",
    //     responseKind: "none",
    //     note: "email capturado (gate pre-kill-switch). Sin outbound por kill-switch/bot_paused."
    //   }
    //
    // Después del fix, el flow normal debe correr y el bot debe responder.
    // Aceptamos cualquier resultado que NO sea la firma del early-gate.
    const isEarlyGateSignature =
      result.responseKind === "none" &&
      typeof result.note === "string" &&
      (result.note.includes("gate pre-kill-switch") ||
       result.note.includes("early-gate"));

    assert.equal(
      isEarlyGateSignature,
      false,
      `BUG REGRESIÓN: el bot retornó con la firma del early-gate. ` +
        `result=${JSON.stringify({
          ok: result.ok,
          intent: result.intent,
          responseKind: result.responseKind,
          note: result.note
        })}`
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (origUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (origKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (origSecret === undefined) delete process.env.SUPABASE_SECRET_KEY;
  }
});

test("REGRESION 2026-07-16: con Supabase activo, body=email el bot DEBE responder (responseKind=text o interactive)", async () => {
  // Test más estricto: verifica que el bot SÍ envía una respuesta.
  // El flow normal de provide_email retorna responseKind='text' con
  // el mensaje "Listo David, te registramos..." o similar.
  //
  // Si el flow normal falla por queries incompletas del mock, el
  // responseKind puede caer a "text" con un mensaje de error o
  // "none" por otra razón. Aceptamos "text" como mínimo.
  const origUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const origKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const origSecret = process.env.SUPABASE_SECRET_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??= "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.fake.fake";
  process.env.SUPABASE_SECRET_KEY ??= "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.fake.fake";

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    return new Response(JSON.stringify({ messages: [{ id: "wamid_test" }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };

  try {
    const { processInboundMessage } = await import(
      "../src/lib/whatsapp/bot-engine.ts"
    );

    const result = await processInboundMessage({
      messageId: "wamid_regression_email_2",
      from: "521234567891",
      contactName: "Test",
      text: "david17891@gmail.com",
      type: "text",
      timestamp: "1700000001"
    });

    // El intent DEBE ser provide_email (no question, no welcome, etc.)
    assert.equal(
      result.intent,
      "provide_email",
      `intent debe ser provide_email. got: ${result.intent}, note: ${result.note}`
    );

    // El responseKind NO debe ser "none" del early-gate. Aceptamos
    // "text" o "interactive" (en caso de que el flow completo
    // ejecute correctamente).
    assert.notEqual(
      result.responseKind,
      "none",
      `responseKind NO debe ser "none" (eso era el bug). ` +
        `result=${JSON.stringify({
          responseKind: result.responseKind,
          note: result.note
        })}`
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (origUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (origKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (origSecret === undefined) delete process.env.SUPABASE_SECRET_KEY;
  }
});
