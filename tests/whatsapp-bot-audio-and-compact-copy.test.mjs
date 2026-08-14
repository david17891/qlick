import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildCompactEventInfoCopy,
  processInboundMessage,
} from "../src/lib/whatsapp/bot-engine.ts";

function makeEvent(overrides = {}) {
  return {
    id: "00000000-0000-0000-0000-000000000042",
    slug: "desarrollo-estructura-curso-canaco",
    shortCode: "CN26",
    title: "Los 4 Pilares de un Negocio que Vende",
    description: "",
    startsAt: new Date("2026-08-20T23:00:00.000Z"),
    endsAt: new Date("2026-08-21T03:00:00.000Z"),
    humanStartsAt: "20 de agosto de 2026, 16:00 hrs",
    humanDuration: "4 horas",
    promptBlock: "",
    source: "db",
    requiresName: true,
    eventRules: {
      personality: "Bot amable, español mexicano neutro.",
      rules: [],
      reservation_enabled: true,
      reservation_amount_mxn: 500,
      balance_amount_mxn: 500,
      balance_due_note: "el día del evento",
    },
    format: "in_person",
    streamingUrl: null,
    streamingProvider: null,
    streamingAccessNote: null,
    location: "CANACO",
    priceMxn: 1000,
    ...overrides,
  };
}

test("el primer resumen del evento es compacto y accionable", () => {
  const copy = buildCompactEventInfoCopy(makeEvent());

  assert.ok(copy.length < 700, `el resumen debe ser corto: ${copy.length} caracteres`);
  assert.match(copy, /Los 4 Pilares de un Negocio que Vende/);
  assert.match(copy, /20 de agosto de 2026/);
  assert.match(copy, /CANACO/);
  assert.match(copy, /\$1,?000/);
  assert.match(copy, /\$500/);
  assert.match(copy, /¿Quieres apartar tu lugar\?/);
  assert.doesNotMatch(copy, /Durante el curso aprenderás/);
});

test("la sede concreta de la descripción prevalece sobre una regla histórica de dirección pendiente", () => {
  const copy = buildCompactEventInfoCopy(
    makeEvent({
      description:
        "📍 **Lugar:** CANACO, Av. Álvaro Obregón 14-15, San Luis Río Colorado, Sonora",
      eventRules: {
        ...makeEvent().eventRules,
        rules: ["Si preguntan por dirección exacta, indica que está por confirmar."],
      },
    }),
  );

  assert.match(copy, /CANACO, Av\. Álvaro Obregón 14-15, San Luis Río Colorado, Sonora/);
  assert.doesNotMatch(copy, /dirección exacta está por confirmar/i);
});

test("un audio sin transcripción no llama al LLM ni inventa una respuesta", async () => {
  const env = {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_SECRET_KEY,
    provider: process.env.NEXT_PUBLIC_WHATSAPP_PROVIDER,
    phoneId: process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID,
    token: process.env.WHATSAPP_CLOUD_ACCESS_TOKEN,
  };
  const originalFetch = globalThis.fetch;
  const calls = [];

  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  delete process.env.SUPABASE_SECRET_KEY;
  process.env.NEXT_PUBLIC_WHATSAPP_PROVIDER = "meta_cloud_api";
  process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID = "phone-test";
  process.env.WHATSAPP_CLOUD_ACCESS_TOKEN = "token-test";
  globalThis.fetch = async (input, init) => {
    calls.push({ input: String(input), init });
    return new Response(JSON.stringify({ messages: [{ id: "wamid_audio_reply" }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const result = await processInboundMessage({
      messageId: "wamid_audio_inbound",
      from: "525555555555",
      contactName: "Persona Prueba",
      type: "audio",
      audio: { id: "media-test", voice: true },
    });

    assert.equal(result.ok, true);
    assert.equal(result.intent, "question");
    assert.equal(result.responseKind, "text");
    assert.match(result.responsePreview ?? "", /no puedo transcribir audios/i);
    assert.equal(calls.length, 1, "el audio debe generar una sola respuesta determinista");
    assert.doesNotMatch(
      result.responsePreview ?? "",
      /no pude procesar tu mensaje|conectar con valor/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (env.supabaseUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = env.supabaseUrl;
    if (env.supabaseKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = env.supabaseKey;
    if (env.provider === undefined) delete process.env.NEXT_PUBLIC_WHATSAPP_PROVIDER;
    else process.env.NEXT_PUBLIC_WHATSAPP_PROVIDER = env.provider;
    if (env.phoneId === undefined) delete process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID;
    else process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID = env.phoneId;
    if (env.token === undefined) delete process.env.WHATSAPP_CLOUD_ACCESS_TOKEN;
    else process.env.WHATSAPP_CLOUD_ACCESS_TOKEN = env.token;
  }
});
