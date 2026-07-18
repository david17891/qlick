/**
 * REGRESION 2026-07-16 (sprint cobro-en-puerta, sesion David "no me
 * registro esta vez, no me dijo nada de pagos").
 *
 * El bot del screenshot:
 *   1. Decía "el link de Zoom 24 horas antes" cuando el evento es
 *      presencial. Bug: copy hardcodeado en el path implicit_capture
 *      del case "provide_name" (cuando el lead manda nombre + email
 *      juntos en el mismo mensaje, ej. "David Martinez, david17891@gmail.com").
 *   2. Decía "Si me confirmas con 'Si', queda cerrado". Bug: el
 *      implicit_capture ya persiste el email + QR automaticamente, NO
 *      necesita confirmacion.
 *   3. NO mencionaba el pago del evento. Bug: el path implicit_capture
 *      no leía el evento del registro (matchedEvent) ni su precio.
 *
 * El fix (sprint cobro-en-puerta):
 *   - matchedEvent se carga tambien para `provide_name` (no solo
 *     `provide_email`) para que el handler pueda usar el formato y
 *     el precio del evento en el copy.
 *   - El copy del implicit_capture ahora:
 *     - Distingue presencial ("el dia del evento") vs virtual
 *       ("el link de Zoom 24 horas antes" o el streamingAccessNote).
 *     - Menciona el pago si el evento es de pago (priceMxn > 0),
 *       con las 2 opciones: online (link) o puerta.
 *     - NO pide confirmacion.
 *
 * Tests E2E con Supabase activo + mock del cliente admin. Patron
 * igual que `whatsapp-bot-paid-event.test.mjs`.
 *
 * Privacy: 0 PII. Email y telefono sinteticos.
 */

import { test, mock, before } from "node:test";
import assert from "node:assert/strict";

// @ts-check

/* ────────────────────────────────────────────────────────────
 * Mocks
 * ──────────────────────────────────────────────────────────── */

// FIX 2026-07-16: el mock de `events` debe retornar el shape RAW
// de Supabase (snake_case con `price_mxn`). El codigo real de
// `loadAllActiveEvents` -> `loadActiveEventContext` lo transforma al
// shape `ActiveEventContext` (camelCase con `priceMxn` + `source: "db"`).
// Si mockeamos el shape ya transformado, la doble transformacion lo
// rompe (priceMxn queda en source.data.priceMxn que no existe).
const FAKE_EVENT_PRESENCIAL = {
  id: "00000000-0000-0000-0000-000000000010",
  slug: "marketing-ia-para-emprendedores-pago",
  short_code: "PYT5",
  title: "Marketing + IA para Emprendedores (Copia - Pago)",
  description: "Taller presencial en Mexicali.",
  // FIX 2026-07-18: starts_at en el FUTURO para que el filtro
  // `gte(now - 6h)` de `loadAllActiveEvents` no lo excluya. Antes
  // tenía "2026-07-17T18:00:00Z" que con el tiempo quedó en el
  // pasado y los tests REGRESION fallaban. Mismo fix que el de
  // production (`loadAllActiveEvents` tiene grace de 6h).
  starts_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
  ends_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000).toISOString(),
  location: "Mexicali, BC",
  status: "published",
  requires_name: true,
  event_rules: null,
  format: "in_person",
  streaming_url: null,
  streaming_provider: null,
  streaming_access_note: null,
  price_mxn: 1000
};

const FAKE_EVENT_VIRTUAL = {
  ...FAKE_EVENT_PRESENCIAL,
  format: "virtual",
  streaming_url: "https://zoom.us/j/test",
  streaming_access_note: null
};

const FAKE_EVENT_FREE = {
  ...FAKE_EVENT_PRESENCIAL,
  price_mxn: 0
};

const FAKE_LEAD = {
  id: "00000000-0000-0000-0000-000000000001",
  name: null,
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

const updateCalls = [];

const FAKE_PREV_OUTBOUND = {
  id: "00000000-0000-0000-0000-000000000050",
  direction: "outbound",
  message_type: "interactive",
  body: `Soy Qlick, asistente de Qlick Marketing Digital. ¿Te interesa "${FAKE_EVENT_PRESENCIAL.title}"?`,
  created_at: new Date(Date.now() - 60000).toISOString(),
  metadata: {
    intent: "welcome",
    awaiting_field: "name",
    eventSlug: FAKE_EVENT_PRESENCIAL.slug
  },
  lead_id: FAKE_LEAD.id
};

function makeChainable(table = "unknown", eventVariant = FAKE_EVENT_PRESENCIAL) {
  const chainable = function () {
    return Promise.resolve({ data: null, error: null, count: 0 });
  };
  const handler = {
    get(_target, prop) {
      if (prop === "maybeSingle") {
        return async () => {
          if (table === "leads") return { data: FAKE_LEAD, error: null };
          if (table === "events") return { data: eventVariant, error: null };
          if (table === "event_confirmations")
            return {
              data: {
                id: "00000000-0000-0000-0000-000000000099",
                event_id: eventVariant.id,
                payment_status: "not_required",
                name: "Test",
                email: "test@example.com",
                phone_normalized: FAKE_LEAD.phone_normalized
              },
              error: null
            };
          return { data: null, error: null };
        };
      }
      if (prop === "single") {
        return async () => {
          if (table === "leads") return { data: FAKE_LEAD, error: null };
          if (table === "events") return { data: eventVariant, error: null };
          return { data: { id: "fake-id" }, error: null };
        };
      }
      if (prop === "update") {
        return (...args) => {
          if (table === "event_confirmations") {
            updateCalls.push(args[0] ?? {});
          }
          return new Proxy(function () {}, {
            get: (_t, p) => {
              if (p === "eq")
                return new Proxy(function () {}, {
                  get: (_t, p2) => {
                    if (p2 === "then")
                      return (resolve) => resolve({ data: null, error: null });
                    return makeChainable(table, eventVariant);
                  },
                  apply: () => makeChainable(table, eventVariant)
                });
              return makeChainable(table, eventVariant);
            },
            apply: () => makeChainable(table, eventVariant)
          });
        };
      }
      if (prop === Symbol.toPrimitive || prop === "toString" || prop === "valueOf") {
        return () => "chainable";
      }
      if (prop === "then") {
        // `loadAllActiveEvents` y `loadConversationWindow` hacen
        //   .select(...).eq(...).order(...)  o  .select(...).order(...)
        // y esperan un array (no maybeSingle/single). Sin esto el
        // mock retorna null y el bot no encuentra el evento del
        // registro.
        let payload;
        if (table === "lead_whatsapp_conversations") {
          payload = { data: [FAKE_PREV_OUTBOUND], error: null };
        } else if (table === "events") {
          payload = { data: [eventVariant], error: null };
        } else {
          payload = { data: null, error: null, count: 0 };
        }
        return Promise.resolve(payload).then.bind(Promise.resolve(payload));
      }
      return makeChainable(table, eventVariant);
    },
    apply() {
      return makeChainable(table, eventVariant);
    }
  };
  return new Proxy(chainable, handler);
}

function makeMockSupabaseClient(eventVariant = FAKE_EVENT_PRESENCIAL) {
  return {
    from: (table) => makeChainable(table, eventVariant)
  };
}

let currentEventVariant = FAKE_EVENT_PRESENCIAL;

before(() => {
  mock.module("../src/lib/supabase/admin", {
    namedExports: {
      createSupabaseAdminClient: () => makeMockSupabaseClient(currentEventVariant)
    }
  });
  mock.module("../src/lib/supabase/health", {
    namedExports: {
      checkSupabaseConfig: () => ({ configured: true, mode: "configured" })
    }
  });
});

function setSupabaseEnv() {
  const origUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const origKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const origSecret = process.env.SUPABASE_SECRET_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??=
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.fake.fake";
  process.env.SUPABASE_SECRET_KEY ??=
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.fake.fake";
  return () => {
    if (origUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (origKey === undefined)
      delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (origSecret === undefined) delete process.env.SUPABASE_SECRET_KEY;
  };
}

function mockFetch() {
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    return new Response(JSON.stringify({ messages: [{ id: "wamid_test" }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };
  return () => {
    globalThis.fetch = original;
  };
}

/* ────────────────────────────────────────────────────────────
 * Tests
 * ──────────────────────────────────────────────────────────── */

test("REGRESION implicit_capture presencial+de_pago: NO dice 'link de Zoom', menciona pago, NO pide confirmacion", async () => {
  currentEventVariant = FAKE_EVENT_PRESENCIAL;
  const restoreEnv = setSupabaseEnv();
  const restoreFetch = mockFetch();
  updateCalls.length = 0;
  try {
    const { processInboundMessage } = await import(
      "../src/lib/whatsapp/bot-engine.ts"
    );

    const result = await processInboundMessage({
      messageId: "wamid_implicit_presencial",
      from: "521234567890",
      contactName: "Test",
      // David-style: nombre + email juntos en el mismo mensaje.
      text: "David Martinez, david17891@gmail.com",
      type: "text",
      timestamp: "1700000000"
    });

    const preview = result.responsePreview ?? "";
    // FIX 2026-07-16: el copy del implicit_capture NO debe decir
    // "link de Zoom" (eso era copy hardcodeado del path virtual).
    assert.ok(
      !/link de Zoom/i.test(preview),
      `BUG REGRESION: copy dice "link de Zoom" para evento presencial. Got: ${preview}`
    );
    // Debe mencionar el pago con el precio del evento.
    assert.ok(
      /\$1000/.test(preview),
      `copy debe mencionar el precio $1000 MXN. Got: ${preview}`
    );
    assert.ok(
      /Pagar en línea|pagar en puerta/i.test(preview),
      `copy debe mencionar las opciones de pago. Got: ${preview}`
    );
    // NO debe pedir confirmacion con "Si me confirmas".
    assert.ok(
      !/Si me confirmas/i.test(preview),
      `BUG REGRESION: copy pide confirmacion con "Si me confirmas". Got: ${preview}`
    );
    // Debe mencionar que es presencial ("el dia del evento") o
    // el streamingAccessNote (que es null en este caso).
    assert.ok(
      /día del evento|streaming/i.test(preview),
      `copy debe mencionar como accede el asistente. Got: ${preview}`
    );
    // El intent es provide_name (con implicit_capture metadata).
    assert.equal(result.intent, "provide_name");
  } finally {
    restoreFetch();
    restoreEnv();
  }
});

test("REGRESION implicit_capture virtual+de_pago: SI menciona link de Zoom, menciona pago", async () => {
  currentEventVariant = FAKE_EVENT_VIRTUAL;
  const restoreEnv = setSupabaseEnv();
  const restoreFetch = mockFetch();
  try {
    const { processInboundMessage } = await import(
      "../src/lib/whatsapp/bot-engine.ts"
    );

    const result = await processInboundMessage({
      messageId: "wamid_implicit_virtual",
      from: "521234567890",
      contactName: "Test",
      text: "David Martinez, david17891@gmail.com",
      type: "text",
      timestamp: "1700000000"
    });

    const preview = result.responsePreview ?? "";
    // Para virtual SI debe decir "Zoom" o "streaming".
    assert.ok(
      /Zoom|stream/i.test(preview),
      `copy debe mencionar el link de Zoom para evento virtual. Got: ${preview}`
    );
    // Tambien debe mencionar el pago.
    assert.ok(
      /\$1000/.test(preview),
      `copy debe mencionar el precio. Got: ${preview}`
    );
  } finally {
    restoreFetch();
    restoreEnv();
  }
});

test("REGRESION implicit_capture gratis: NO menciona pago, NO menciona Zoom", async () => {
  currentEventVariant = FAKE_EVENT_FREE;
  const restoreEnv = setSupabaseEnv();
  const restoreFetch = mockFetch();
  try {
    const { processInboundMessage } = await import(
      "../src/lib/whatsapp/bot-engine.ts"
    );

    const result = await processInboundMessage({
      messageId: "wamid_implicit_free",
      from: "521234567890",
      contactName: "Test",
      text: "David Martinez, david17891@gmail.com",
      type: "text",
      timestamp: "1700000000"
    });

    const preview = result.responsePreview ?? "";
    // Evento gratis: NO debe mencionar el precio ni "pagar".
    assert.ok(
      !/\$/.test(preview) && !/pagar en línea|pagar en puerta/i.test(preview),
      `BUG REGRESION: copy menciona pago en evento gratis. Got: ${preview}`
    );
    // Tampoco Zoom (es presencial y gratis).
    assert.ok(
      !/link de Zoom/i.test(preview),
      `copy no debe decir "link de Zoom" en evento presencial gratis. Got: ${preview}`
    );
  } finally {
    restoreFetch();
    restoreEnv();
  }
});
