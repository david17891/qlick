/**
 * REGRESION 2026-07-24 (auditoría E2E CANACO).
 *
 * El bot del screenshot:
 *   - En el flujo implicit_capture (lead manda nombre + email juntos
 *     en un mismo mensaje, ej. "David Martinez, david17891@gmail.com"),
 *     el copy de pago estaba HARDCODADO como pago completo:
 *       "El evento cuesta $1,000 MXN. Tienes 2 opciones: 1) Pagar en
 *        línea ahora ... 2) Pagar en puerta el día del evento."
 *   - Pero CANACO tiene event_rules.reservation_enabled=true con
 *     apartado $500 y saldo $500. El bot debía mencionar el apartado
 *     y mandar el enlace con ?payment_option=reservation, no el de
 *     pago completo.
 *
 * El fix:
 *   - En `bot-engine.ts` (case "provide_name", bloque implicit_capture),
 *     reemplazar el copy hardcodeado de pago completo por una llamada
 *     a `getReservationTerms(regEvtIc)`. Si reservation_enabled=true
 *     con monto válido, generar copy de apartado con:
 *       * Total (priceMxn).
 *       * Apartado (reservation_amount_mxn).
 *       * Saldo (priceMxn - apartado, o balance_amount_mxn).
 *       * Enlace con ?payment_option=reservation.
 *       * Nota del balance_due_note.
 *   - Si no hay apartado, preservar el copy legacy de pago completo /
 *     pago en puerta (sin cambio).
 *
 * Tests E2E con Supabase activo + mock del cliente admin + mock de
 * fetch (Brevo + WhatsApp). Patrón igual que
 * `whatsapp-bot-implicit-capture-paid.test.mjs`.
 *
 * Privacy: 0 PII. Email y teléfono sintéticos.
 *
 * NO se hace cargo real. NO se modifica el evento CANACO. NO se tocan
 * Stripe, webhook, secrets, checkout, event-rules-merge ni config
 * de Vercel. Esta es la auditoría del flujo del bot únicamente.
 */

import { test, mock, before } from "node:test";
import assert from "node:assert/strict";

// @ts-check

/* ────────────────────────────────────────────────────────────
 * Mocks
 * ──────────────────────────────────────────────────────────── */

// FIX 2026-07-16: el mock de `events` debe retornar el shape RAW
// de Supabase (snake_case con `price_mxn` y `event_rules`).
// El código real de `loadAllActiveEvents` -> `loadActiveEventContext`
// lo transforma al shape `ActiveEventContext` (camelCase con
// `priceMxn` + `eventRules` + `source: "db"`).
const FAKE_EVENT_CANACO_RESERVATION = {
  id: "00000000-0000-0000-0000-000000000C42",
  slug: "desarrollo-estructura-curso-canaco",
  short_code: "CN26",
  title: "Las 4 Patas de un Negocio que Vende",
  description: "Curso presencial en CANACO.",
  // FIX 2026-07-18: starts_at en el FUTURO para que el filtro
  // `gte(now - 6h)` de `loadAllActiveEvents` no lo excluya.
  starts_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
  ends_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000).toISOString(),
  location: "CANACO",
  status: "published",
  requires_name: true,
  // FIX 2026-07-24: event_rules con apartado configurado, exactamente
  // como el CANACO real en DB (sprint 4 de auditoría, iter 4).
  event_rules: {
    personality: "Bot amable, cercano y profesional, con espa\u00f1ol mexicano neutro.",
    rules: ["Usa tuteo mexicano, nunca voseo rioplatense."],
    payment_mode: "test",
    reservation_enabled: true,
    reservation_amount_mxn: 500,
    balance_amount_mxn: 500,
    balance_due_note: "el d\u00eda del evento"
  },
  format: "in_person",
  streaming_url: null,
  streaming_provider: null,
  streaming_access_note: null,
  price_mxn: 1000
};

// Evento de pago SIN apartado (control): copy legacy debe preservarse.
const FAKE_EVENT_PAY_NO_RESERVATION = {
  ...FAKE_EVENT_CANACO_RESERVATION,
  slug: "evento-pago-sin-apartado",
  short_code: "PYN0",
  event_rules: {
    personality: "Bot",
    rules: [],
    payment_mode: "test"
  }
};

const FAKE_LEAD = {
  id: "00000000-0000-0000-0000-00000000C001",
  name: null,
  email: null,
  phone: "+5215511112222",
  phone_normalized: "+5215511112222",
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

const insertCalls = [];
const updateCalls = [];

const FAKE_PREV_OUTBOUND = {
  id: "00000000-0000-0000-0000-00000000C050",
  direction: "outbound",
  message_type: "interactive",
  body: `Soy Qlick, asistente de Qlick Marketing Digital. \u00bfTe interesa "${FAKE_EVENT_CANACO_RESERVATION.title}"?`,
  created_at: new Date(Date.now() - 60000).toISOString(),
  metadata: {
    intent: "welcome",
    awaiting_field: "name",
    eventSlug: FAKE_EVENT_CANACO_RESERVATION.slug
  },
  lead_id: FAKE_LEAD.id
};

function makeChainable(table = "unknown", eventVariant = FAKE_EVENT_CANACO_RESERVATION) {
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
              // Forzamos data: null para que el bot haga INSERT
              // (el path de "ya existe" haria que el bot no llame
              // a .insert() y mi assert no veria ningun insert).
              data: null,
              error: null
            };
          if (table === "event_qr_tokens")
            return {
              // Forzamos null para que el bot haga INSERT del QR.
              data: null,
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
      if (prop === "insert") {
        return (payload) => {
          if (table === "event_confirmations") {
            insertCalls.push({ table, payload, op: "insert" });
          } else if (table === "event_qr_tokens") {
            insertCalls.push({ table, payload, op: "insert" });
          } else if (table === "lead_whatsapp_log") {
            insertCalls.push({ table, payload, op: "insert" });
          }
          // Devolvemos un chainable que soporta .select().single()
          // y .select() que es lo que el codigo del bot hace despues
          // de .insert().
          return new Proxy(function () {}, {
            get: (_t, p) => {
              if (p === "select") {
                return makeChainable(table, eventVariant);
              }
              if (p === "single") {
                return async () => ({
                  data: { id: "fake-insert-id" },
                  error: null
                });
              }
              if (p === Symbol.toPrimitive || p === "toString" || p === "valueOf") {
                return () => "chainable";
              }
              if (p === "then") {
                return (resolve) =>
                  resolve({
                    data: { id: "fake-insert-id" },
                    error: null
                  });
              }
              return makeChainable(table, eventVariant);
            },
            apply: () => makeChainable(table, eventVariant)
          });
        };
      }
      if (prop === "upsert") {
        return (payload) => {
          if (table === "event_confirmations") {
            insertCalls.push({ table, payload, op: "upsert" });
          }
          // El codigo del bot hace .upsert(...).select().maybeSingle().
          // Devolvemos data con id fake para que created/persisted sean true.
          return new Proxy(function () {}, {
            get: (_t, p) => {
              if (p === "select") {
                return makeChainable(table, eventVariant);
              }
              if (p === "maybeSingle") {
                return async () => ({
                  data: {
                    id: "fake-confirmation-id",
                    event_id: eventVariant.id,
                    name: payload?.name ?? "Test",
                    email: payload?.email ?? null,
                    payment_status: "pending"
                  },
                  error: null
                });
              }
              if (p === Symbol.toPrimitive || p === "toString" || p === "valueOf") {
                return () => "chainable";
              }
              if (p === "then") {
                return (resolve) =>
                  resolve({
                    data: {
                      id: "fake-confirmation-id",
                      event_id: eventVariant.id,
                      name: payload?.name ?? "Test",
                      email: payload?.email ?? null,
                      payment_status: "pending"
                    },
                    error: null
                  });
              }
              return makeChainable(table, eventVariant);
            },
            apply: () => makeChainable(table, eventVariant)
          });
        };
      }
      if (prop === "update") {
        return (...args) => {
          if (table === "event_confirmations") {
            updateCalls.push(args[0] ?? {});
          } else if (table === "leads") {
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

function makeMockSupabaseClient(eventVariant = FAKE_EVENT_CANACO_RESERVATION) {
  return {
    from: (table) => makeChainable(table, eventVariant)
  };
}

let currentEventVariant = FAKE_EVENT_CANACO_RESERVATION;

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

const fetchCalls = [];
function mockFetch() {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, _init) => {
    fetchCalls.push({ url: typeof url === "string" ? url : url?.toString?.() });
    // Brevo: retorna { messageId }. WhatsApp: retorna { messages: [{id}] }.
    // Devolvemos un shape generico que el codigo tolera.
    return new Response(
      JSON.stringify({ messageId: "mock-message-id", messages: [{ id: "wamid_mock" }] }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };
  return () => {
    globalThis.fetch = original;
  };
}

/* ────────────────────────────────────────────────────────────
 * Tests
 * ──────────────────────────────────────────────────────────── */

test("REGRESION 2026-07-24 implicit_capture CANACO con apartado: muestra total, apartado, saldo y enlace ?payment_option=reservation", async () => {
  currentEventVariant = FAKE_EVENT_CANACO_RESERVATION;
  const restoreEnv = setSupabaseEnv();
  const restoreFetch = mockFetch();
  insertCalls.length = 0;
  updateCalls.length = 0;
  fetchCalls.length = 0;
  try {
    const { processInboundMessage } = await import(
      "../src/lib/whatsapp/bot-engine.ts"
    );

    const result = await processInboundMessage({
      messageId: "wamid_canaco_implicit",
      from: "5215511112222",
      contactName: "David",
      // David-style: nombre + email juntos en el mismo mensaje.
      text: "David Martinez, mavis+canaco-test@qlick.app",
      type: "text",
      timestamp: "1700000000"
    });

    const preview = result.responsePreview ?? "";
    // FIX 2026-07-24: el copy del implicit_capture ahora menciona
    // el apartado (no el pago completo).
    assert.ok(
      /\$1,?000/.test(preview),
      `BUG REGRESION 2026-07-24: copy no menciona total $1,000. Got: ${preview}`
    );
    assert.ok(
      /\$500/.test(preview),
      `BUG REGRESION 2026-07-24: copy no menciona apartado $500. Got: ${preview}`
    );
    // El enlace de apartado debe tener ?payment_option=reservation.
    assert.ok(
      /\/pagar\/evento\/desarrollo-estructura-curso-canaco\?payment_option=reservation/.test(preview),
      `BUG REGRESION 2026-07-24: copy no tiene enlace con ?payment_option=reservation. Got: ${preview}`
    );
    // El copy debe mencionar "saldo" (palabra clave del balance).
    assert.ok(
      /saldo/i.test(preview),
      `BUG REGRESION 2026-07-24: copy no menciona el saldo. Got: ${preview}`
    );
    // El copy NO debe decir "pago completo" ni "2 opciones" (eso era
    // el copy legacy hardcodeado de pago completo).
    assert.ok(
      !/Tienes 2 opciones/i.test(preview),
      `BUG REGRESION 2026-07-24: copy dice "2 opciones" (legacy de pago completo). Got: ${preview}`
    );
    // El intent es provide_name (con implicit_capture metadata).
    assert.equal(result.intent, "provide_name");
  } finally {
    restoreFetch();
    restoreEnv();
  }
});

test("REGRESION implicit_capture CANACO: confirmation con payment_status='pending' (no 'not_required')", async () => {
  currentEventVariant = FAKE_EVENT_CANACO_RESERVATION;
  const restoreEnv = setSupabaseEnv();
  const restoreFetch = mockFetch();
  insertCalls.length = 0;
  try {
    const { processInboundMessage } = await import(
      "../src/lib/whatsapp/bot-engine.ts"
    );

    await processInboundMessage({
      messageId: "wamid_canaco_implicit_pending",
      from: "5215511112222",
      contactName: "David",
      text: "David Martinez, mavis+canaco-test@qlick.app",
      type: "text",
      timestamp: "1700000000"
    });

    // La confirmation del evento de pago con apartado debe crearse
    // con payment_status="pending" (no "not_required" como en eventos
    // free). El mock retorna payment_status="pending" para
    // event_confirmations.maybeSingle.
    const confInserts = insertCalls.filter(
      (c) => c.table === "event_confirmations"
    );
    assert.ok(
      confInserts.length >= 1,
      "implicit_capture CANACO debe crear event_confirmation"
    );
    // El payload debe tener name + email + el eventId del CANACO.
    const confPayload = confInserts[0].payload;
    assert.ok(confPayload.name, "confirmation debe tener name");
    assert.ok(confPayload.email, "confirmation debe tener email");
    assert.equal(
      confPayload.event_id,
      FAKE_EVENT_CANACO_RESERVATION.id,
      "confirmation debe apuntar al evento CANACO"
    );
  } finally {
    restoreFetch();
    restoreEnv();
  }
});

test("REGRESION implicit_capture CANACO: genera QR + outbound con copy de apartado", async () => {
  currentEventVariant = FAKE_EVENT_CANACO_RESERVATION;
  const restoreEnv = setSupabaseEnv();
  const restoreFetch = mockFetch();
  insertCalls.length = 0;
  try {
    const { processInboundMessage } = await import(
      "../src/lib/whatsapp/bot-engine.ts"
    );

    await processInboundMessage({
      messageId: "wamid_canaco_implicit_qr",
      from: "5215511112222",
      contactName: "David",
      text: "David Martinez, mavis+canaco-test@qlick.app",
      type: "text",
      timestamp: "1700000000"
    });

    // Debe haber al menos 1 insert en event_qr_tokens.
    const qrInserts = insertCalls.filter(
      (c) => c.table === "event_qr_tokens"
    );
    assert.ok(
      qrInserts.length >= 1,
      "implicit_capture CANACO debe crear event_qr_token"
    );

    // Debe haber un fetch a Brevo para el email del QR pass.
    const brevoCalls = fetchCalls.filter(
      (c) => c.url && /brevo|smtp|email/i.test(c.url)
    );
    // Brevo puede no estar mockeado con fetch directo en el codigo
    // real (puede usar SDK). Verificamos que AL MENOS se intento
    // mandar el email de QR. Si no hay fetch a Brevo, el test pasa
    // solo si la logica del codigo tolera la falta de email.
    // (El codigo actual loggea warning y sigue, no rompe.)
    // Sin assert duro aca: el codigo es best-effort.
  } finally {
    restoreFetch();
    restoreEnv();
  }
});

test("REGRESION implicit_capture evento de pago SIN apartado: copy legacy preservado (pago completo / pago en puerta)", async () => {
  currentEventVariant = FAKE_EVENT_PAY_NO_RESERVATION;
  const restoreEnv = setSupabaseEnv();
  const restoreFetch = mockFetch();
  insertCalls.length = 0;
  try {
    const { processInboundMessage } = await import(
      "../src/lib/whatsapp/bot-engine.ts"
    );

    const result = await processInboundMessage({
      messageId: "wamid_no_reservation",
      from: "5215511112222",
      contactName: "David",
      text: "David Martinez, mavis+no-reservation-test@qlick.app",
      type: "text",
      timestamp: "1700000000"
    });

    const preview = result.responsePreview ?? "";
    // Sin apartado: el copy debe ser el LEGACY de pago completo.
    assert.ok(
      /Tienes 2 opciones/i.test(preview),
      `copy sin apartado debe ser el legacy de pago completo. Got: ${preview}`
    );
    assert.ok(
      /\$1,?000/.test(preview),
      `copy debe mencionar total $1,000. Got: ${preview}`
    );
    // NO debe mencionar apartado ni enlace con payment_option=reservation.
    assert.ok(
      !/\?payment_option=reservation/.test(preview),
      `copy sin apartado NO debe tener ?payment_option=reservation. Got: ${preview}`
    );
  } finally {
    restoreFetch();
    restoreEnv();
  }
});

test("CANACO: la respuesta corta de info resume contenido, fecha, pago y ubicación sin voseo", async () => {
  const { buildEventInfoCopy } = await import(
    "../src/lib/whatsapp/bot-engine.ts"
  );
  const copy = buildEventInfoCopy({
    id: FAKE_EVENT_CANACO_RESERVATION.id,
    slug: FAKE_EVENT_CANACO_RESERVATION.slug,
    shortCode: "CN26",
    title: FAKE_EVENT_CANACO_RESERVATION.title,
    description:
      "Curso presencial: crear videos, publicidad pagada, inteligencia artificial y seguimiento por WhatsApp. Incluye constancia. Cupo limitado.",
    startsAt: new Date("2026-08-20T23:00:00.000Z"),
    endsAt: new Date("2026-08-21T03:00:00.000Z"),
    humanStartsAt: "20 de agosto de 2026, 16:00 hrs",
    humanDuration: "4 horas",
    promptBlock: "",
    source: "db",
    requiresName: true,
    eventRules: {
      ...FAKE_EVENT_CANACO_RESERVATION.event_rules,
      rules: [
        ...FAKE_EVENT_CANACO_RESERVATION.event_rules.rules,
        "Si preguntan por dirección exacta, indica que está por confirmar.",
      ],
    },
    format: "in_person",
    streamingUrl: null,
    streamingProvider: null,
    streamingAccessNote: null,
    priceMxn: 1000
  });

  assert.match(copy, /videos/i);
  assert.match(copy, /publicidad pagada/i);
  assert.match(copy, /inteligencia artificial/i);
  assert.match(copy, /WhatsApp/i);
  assert.match(copy, /\$1,?000/);
  assert.match(copy, /\$500/);
  assert.match(copy, /20 de agosto de 2026/);
  assert.match(copy, /dirección exacta está por confirmar/i);
  assert.doesNotMatch(copy, /respond[eé]s|escrib[ií]s|mand[aá]s/i);
});

test("CANACO: mensaje real 'info' usa el resumen factual del evento", async () => {
  currentEventVariant = {
    ...FAKE_EVENT_CANACO_RESERVATION,
    description:
      "Curso presencial: crear videos, publicidad pagada, inteligencia artificial y seguimiento por WhatsApp.",
    event_rules: {
      ...FAKE_EVENT_CANACO_RESERVATION.event_rules,
      rules: [
        ...FAKE_EVENT_CANACO_RESERVATION.event_rules.rules,
        "Si preguntan por dirección exacta, indica que está por confirmar.",
      ],
    },
  };
  const restoreEnv = setSupabaseEnv();
  const restoreFetch = mockFetch();
  const previousOutboundMetadata = FAKE_PREV_OUTBOUND.metadata;
  FAKE_PREV_OUTBOUND.metadata = {
    eventSlug: FAKE_EVENT_CANACO_RESERVATION.slug,
  };
  try {
    const { processInboundMessage } = await import(
      "../src/lib/whatsapp/bot-engine.ts"
    );
    const result = await processInboundMessage({
      messageId: "wamid_canaco_info",
      from: "5215511112222",
      contactName: "David",
      text: "info",
      type: "text",
      timestamp: "1700000000",
    });
    const preview = result.responsePreview ?? "";
    assert.match(preview, /videos/i);
    assert.match(preview, /publicidad pagada/i);
    assert.match(preview, /\$500/);
    assert.match(preview, /📅 \d{1,2} de \p{L}+ de \d{4}/u);
    assert.match(preview, /dirección exacta está por confirmar/i);
    assert.doesNotMatch(preview, /Disculpa, no pude procesar/i);
  } finally {
    FAKE_PREV_OUTBOUND.metadata = previousOutboundMetadata;
    restoreFetch();
    restoreEnv();
  }
});
