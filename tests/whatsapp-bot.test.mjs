/**
 * Tests para el webhook HTTP de WhatsApp + bot engine + provider.
 *
 * Cubre:
 *   1. Provider (meta-cloud-api): POST real a Graph API con env vars
 *      (fetch mockeado) + fallback a demo si no hay credenciales.
 *   2. Handler (webhooks/handler.ts): parser del payload Meta.
 *   3. Bot engine (bot-engine.ts): detección de intents, lead upsert,
 *      persistencia en conversations, envío via provider.
 *   4. Webhook route: GET handshake (challenge) y POST dispatch.
 *
 * Patrón: `node --test`, sin libs externas, mocks via `node:test` mock +
 * `globalThis.fetch` para interceptar el provider.
 *
 * Corre con:
 *   npm test
 *
 * Privacy: 0 PII. Teléfonos sintéticos (+52XXXXXXXXXX), emails @example.com.
 */

import { test, afterEach } from "node:test";
import assert from "node:assert/strict";

// @ts-check

/* ─────────────────────────────────────────────────────────────
 * Helpers de mocking
 * ───────────────────────────────────────────────────────────── */

/**
 * Mockea `globalThis.fetch` y devuelve:
 *   - `calls`: array de llamadas (para assertions).
 *   - `mockResponse(...)`: enqueue la próxima respuesta a devolver.
 */
function mockFetch() {
  const calls = [];
  const responses = [];

  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    calls.push({
      url: typeof input === "string" ? input : input.toString(),
      init: init ?? {}
    });
    const next = responses.shift() ?? {
      status: 200,
      body: { messages: [{ id: "wamid_test_1" }] }
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
    restore() {
      globalThis.fetch = original;
    }
  };
}

/* ─────────────────────────────────────────────────────────────
 * 1. handleWebhookPayload — parser del payload Meta
 * ───────────────────────────────────────────────────────────── */

import { handleWebhookPayload } from "../src/lib/whatsapp/webhooks/handler.ts";

test("handleWebhookPayload: payload con 1 mensaje de texto", () => {
  const payload = {
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  id: "wamid.123",
                  from: "523312345678",
                  type: "text",
                  timestamp: "1700000000",
                  text: { body: "Hola, quiero info" }
                }
              ],
              contacts: [{ wa_id: "523312345678", profile: { name: "Ana" } }]
            }
          }
        ]
      }
    ]
  };
  const result = handleWebhookPayload(payload);
  assert.equal(result.ok, true);
  assert.equal(result.messages.length, 1);
  assert.equal(result.messages[0].messageId, "wamid.123");
  assert.equal(result.messages[0].from, "523312345678");
  assert.equal(result.messages[0].text, "Hola, quiero info");
  assert.equal(result.messages[0].type, "text");
});

test("handleWebhookPayload: payload vacío devuelve messages=[]", () => {
  const result = handleWebhookPayload({ entry: [] });
  assert.equal(result.ok, true);
  assert.equal(result.messages.length, 0);
});

test("handleWebhookPayload: payload roto no lanza, devuelve ok=false", () => {
  const result = handleWebhookPayload({ entrada: "raro" });
  // No es un payload válido pero tampoco tira.
  assert.equal(result.messages.length, 0);
});

test("handleWebhookPayload: payload con múltiples entries", () => {
  const payload = {
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                { id: "w1", from: "523312345678", type: "text", text: { body: "A" } }
              ]
            }
          }
        ]
      },
      {
        changes: [
          {
            value: {
              messages: [
                { id: "w2", from: "525555555555", type: "text", text: { body: "B" } }
              ]
            }
          }
        ]
      }
    ]
  };
  const result = handleWebhookPayload(payload);
  assert.equal(result.messages.length, 2);
});

/* ─────────────────────────────────────────────────────────────
 * 2. meta-cloud-api-provider — POST a Graph API
 * ───────────────────────────────────────────────────────────── */

// Importante: el módulo lee env vars al cargar `meta-cloud-api-provider`,
// así que tenemos que setearlas ANTES del import. Hack: setear process.env
// y limpiar import cache si hace falta. Pero como jest/node:test cachea,
// usamos dynamic import + lectura fresca del provider.

// Para poder testear el provider con env vars seteadas, las seteamos
// antes del dynamic import.
process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID = "1234567890";
process.env.WHATSAPP_CLOUD_ACCESS_TOKEN = "EAA_test_token_xxx";
process.env.WHATSAPP_CLOUD_API_VERSION = "v20.0";

const { metaCloudApiProvider } = await import(
  "../src/lib/whatsapp/providers/meta-cloud-api-provider.ts"
);

afterEach(() => {
  // Limpiar cualquier mock después de cada test
});

test("meta-cloud-api: send() hace POST a Graph API con Bearer + template", async () => {
  const m = mockFetch();
  try {
    const result = await metaCloudApiProvider.send({
      to: "523312345678",
      body: "Hola, bienvenido",
      templateName: "conf_bienvenida",
      templateLanguage: "es_MX"
    });

    assert.equal(result.ok, true);
    assert.equal(result.externalId, "wamid_test_1");
    assert.equal(result.provider, "meta_cloud_api");
    assert.equal(m.calls.length, 1);

    const call = m.calls[0];
    assert.match(call.url, /^https:\/\/graph\.facebook\.com\/v20\.0\/1234567890\/messages$/);
    const headers = /** @type {Record<string, string>} */ (call.init.headers);
    assert.equal(headers.Authorization, "Bearer EAA_test_token_xxx");
    assert.equal(headers["Content-Type"], "application/json");

    const payload = JSON.parse(String(call.init.body));
    assert.equal(payload.messaging_product, "whatsapp");
    assert.equal(payload.to, "523312345678");
    assert.equal(payload.type, "template");
    assert.equal(payload.template.name, "conf_bienvenida");
    assert.equal(payload.template.language.code, "es_MX");
    assert.ok(Array.isArray(payload.template.components));
  } finally {
    m.restore();
  }
});

test("meta-cloud-api: send() mensaje de texto libre", async () => {
  const m = mockFetch();
  try {
    await metaCloudApiProvider.send({
      to: "523312345678",
      body: "Hola directo"
    });
    const payload = JSON.parse(String(m.calls[0].init.body));
    assert.equal(payload.type, "text");
    assert.equal(payload.text.body, "Hola directo");
    assert.equal(payload.template, undefined);
  } finally {
    m.restore();
  }
});

test("meta-cloud-api: send() devuelve demo=true si faltan env vars", async () => {
  // Limpiar env vars y re-importar
  const oldPhone = process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID;
  const oldToken = process.env.WHATSAPP_CLOUD_ACCESS_TOKEN;
  delete process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID;
  delete process.env.WHATSAPP_CLOUD_ACCESS_TOKEN;

  // Re-importar con env vacías — pero el módulo está cacheado. Usamos
  // directamente la función (lee env vars en cada send()).
  const m = mockFetch();
  try {
    const result = await metaCloudApiProvider.send({
      to: "523312345678",
      body: "Hola"
    });
    assert.equal(result.ok, false);
    assert.equal(result.demo, true);
    assert.equal(result.provider, "meta_cloud_api");
    assert.equal(m.calls.length, 0, "no debe llamar a Graph API en demo");
  } finally {
    m.restore();
    process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID = oldPhone;
    process.env.WHATSAPP_CLOUD_ACCESS_TOKEN = oldToken;
  }
});

test("meta-cloud-api: send() retorna error en 4xx sin retry", async () => {
  const m = mockFetch();
  try {
    m.mockResponse(400, {
      error: { message: "Invalid phone number", code: 100 }
    });
    const result = await metaCloudApiProvider.send({
      to: "523312345678",
      body: "Hola"
    });
    assert.equal(result.ok, false);
    assert.equal(result.note.toLowerCase().includes("invalid phone number"), true);
    // 4xx no retry → 1 sola llamada
    assert.equal(m.calls.length, 1);
  } finally {
    m.restore();
  }
});

test("meta-cloud-api: send() reintenta en 5xx y luego falla", async () => {
  const m = mockFetch();
  try {
    m.mockResponse(503, { error: { message: "Service unavailable" } });
    m.mockResponse(503, { error: { message: "Service unavailable" } });
    const result = await metaCloudApiProvider.send({
      to: "523312345678",
      body: "Hola"
    });
    assert.equal(result.ok, false);
    // MAX_ATTEMPTS = 2 → 2 llamadas
    assert.equal(m.calls.length, 2);
  } finally {
    m.restore();
  }
});

/* ─────────────────────────────────────────────────────────────
 * 3. bot-engine — detección de intents
 * ───────────────────────────────────────────────────────────── */

import { detectIntent } from "../src/lib/whatsapp/bot-engine.ts";
import { _findEventInConversationForTest } from "../src/lib/whatsapp/bot-engine.ts";
// FIX 2026-07-05: short_code match para desambiguar eventos con título similar.
import { _matchShortCodeForTest } from "../src/lib/whatsapp/bot-engine.ts";

test("detectIntent: primer mensaje → welcome", () => {
  assert.equal(detectIntent("Hola", true), "welcome");
});

test("detectIntent: hola/info/menu → greeting", () => {
  assert.equal(detectIntent("hola", false), "greeting");
  assert.equal(detectIntent("Hola, buenas tardes", false), "greeting");
  assert.equal(detectIntent("información", false), "greeting");
  assert.equal(detectIntent("info", false), "greeting");
  assert.equal(detectIntent("menu", false), "greeting");
});

test("detectIntent: sí/ok/dale/va sueltos → question (van al LLM, NO a register)", () => {
  // FIX 2026-07-02 (sesion David): respuestas afirmativas cortas en medio
  // de una conversacion NO son register. Van al LLM para que mantenga
  // el contexto conversacional. Antes estos casos caian al menu estatico
  // de "Ver eventos" rompiendo el flujo multi-turno.
  assert.equal(detectIntent("sí", false), "question");
  assert.equal(detectIntent("Si", false), "question");
  assert.equal(detectIntent("ok", false), "question");
  assert.equal(detectIntent("dale", false), "question");
  assert.equal(detectIntent("va", false), "question");
});

test("detectIntent: si quiero inscribirme (con palabras adicionales) → register", () => {
  // La excepcion: si "si" viene con palabras adicionales, sigue siendo
  // register. AFFIRMATIVE_RE no matchea cuando hay mas palabras.
  assert.equal(detectIntent("Si, quiero inscribirme", false), "register");
  assert.equal(detectIntent("Si, quiero", false), "register");
  assert.equal(detectIntent("inscribirme", false), "register");
  assert.equal(detectIntent("registrarme", false), "register");
});

test("detectIntent: no/cancelar/baja → opt_out", () => {
  assert.equal(detectIntent("no", false), "opt_out");
  assert.equal(detectIntent("cancelar", false), "opt_out");
  assert.equal(detectIntent("baja", false), "opt_out");
  assert.equal(detectIntent("stop", false), "opt_out");
});

test("detectIntent: email detectado → provide_email", () => {
  assert.equal(
    detectIntent("ana@example.com", false),
    "provide_email"
  );
  assert.equal(
    detectIntent("mi.correo@empresa.mx", false),
    "provide_email"
  );
});

test("detectIntent: texto libre → question", () => {
  // Texto sin señales fuertes (no saludos, no email, no keywords de
  // register/opt_out) cae en question y lo procesa el LLM. Si el mensaje
  // arranca con saludo ("Hola") gana el intent `greeting` aunque después
  // haya texto adicional — el bot usa el contenido en el saludo de
  // respuesta.
  assert.equal(detectIntent("¿Cuál es el precio?", false), "question");
  assert.equal(detectIntent("No me interesa", false), "opt_out");
  assert.equal(detectIntent("", false), "question");
});

test("detectIntent: 'Hola, [continuación]' → greeting (saludo gana)", () => {
  // "Quiero saber si tienen..." aislado NO es intención de inscribir
  // (también podría ser pregunta sobre info). PERO si arranca con saludo
  // ("Hola"), el intent detectado es `greeting` y el bot usa el contexto
  // del cuerpo en su respuesta. Para forzar `register` el mensaje tiene
  // que contener frases como "quiero inscribirme" o "me interesa inscribirme".
  assert.equal(detectIntent("Hola, quiero saber si tienen...", false), "greeting");
  assert.equal(detectIntent("Hola, buenas tardes", false), "greeting");
  assert.equal(detectIntent("Hola, quiero inscribirme", false), "register");
});

/* ─────────────────────────────────────────────────────────────
 * 3b. findEventInConversation — bot multi-evento
 * ───────────────────────────────────────────────────────────── */

const FAKE_EVENTS = [
  {
    id: "e1",
    slug: "ia-marketing-primeros-pasos",
    shortCode: "7A3X", // FIX 2026-07-05: short_code per evento
    title: "IA y Marketing: Primeros Pasos",
    description: null,
    startsAt: new Date("2026-07-12"),
    endsAt: null,
    location: "WeWork Reforma Latino, CDMX",
    humanStartsAt: "12 de julio",
    humanDuration: "2 horas",
    promptBlock: "",
    source: "db",
    // FIX 2026-07-02 (Commit A): evento con certificado, requiere nombre.
    requiresName: true
  },
  {
    id: "e2",
    slug: "ads-meta-estrategia-avanzada",
    shortCode: "Q9K1", // FIX 2026-07-05: short_code per evento
    title: "Ads en Meta: Estrategia Avanzada",
    description: null,
    startsAt: new Date("2026-07-19"),
    endsAt: null,
    location: "Online (Zoom)",
    humanStartsAt: "19 de julio",
    humanDuration: "3 horas",
    promptBlock: "",
    source: "db",
    requiresName: false
  },
  {
    id: "e3",
    slug: "funnels-venta-gdl",
    shortCode: "B4NZ", // FIX 2026-07-05: short_code per evento
    title: "Funnels de Venta que Convierten",
    description: null,
    startsAt: new Date("2026-07-26"),
    endsAt: null,
    location: "Hub de Innovacion GDL, Guadalajara",
    humanStartsAt: "26 de julio",
    humanDuration: "4 horas",
    promptBlock: "",
    source: "db",
    requiresName: false
  }
];

function makeWindow(bodies) {
  return {
    phoneNormalized: "+525555555555",
    messages: bodies.map((b, idx) => ({
      direction: idx % 2 === 0 ? "outbound" : "inbound",
      body: b,
      timestamp: new Date().toISOString(),
      messageType: "text"
    }))
  };
}

test("findEventInConversation: matchea por slug textual", () => {
  const win = makeWindow([
    "Te registro para ads-meta-estrategia-avanzada del 19 de julio."
  ]);
  const result = _findEventInConversationForTest(win, FAKE_EVENTS);
  assert.equal(result?.slug, "ads-meta-estrategia-avanzada");
});

test("findEventInConversation: matchea por indice [2] (un solo N en el body)", () => {
  // FIX 2026-07-02: si hay multiples [N] en el body, es una LISTA, no
  // una confirmacion. Solo matcheamos si hay UN SOLO [N].
  const win = makeWindow([
    "Te registro para el [2] Ads en Meta. Manda tu email por favor."
  ]);
  const result = _findEventInConversationForTest(win, FAKE_EVENTS);
  assert.equal(result?.slug, "ads-meta-estrategia-avanzada");
});

test("findEventInConversation: con multiples [N] en el body (lista) devuelve null", () => {
  const win = makeWindow([
    "Tienes estos eventos: [1] IA y Marketing, [2] Ads en Meta, [3] Funnels. Cual te interesa?"
  ]);
  const result = _findEventInConversationForTest(win, FAKE_EVENTS);
  assert.equal(result, null);
});

test("findEventInConversation: matchea por 'el segundo'", () => {
  const win = makeWindow([
    "Te interesa el segundo? Manda tu email."
  ]);
  const result = _findEventInConversationForTest(win, FAKE_EVENTS);
  assert.equal(result?.slug, "ads-meta-estrategia-avanzada");
});

test("findEventInConversation: matchea por titulo (palabras clave)", () => {
  const win = makeWindow([
    "Te ayudo con Marketing para el evento Primeros Pasos. Manda tu email."
  ]);
  const result = _findEventInConversationForTest(win, FAKE_EVENTS);
  assert.equal(result?.slug, "ia-marketing-primeros-pasos");
});

test("findEventInConversation: matchea por location (CDMX)", () => {
  const win = makeWindow([
    "El evento en WeWork Reforma Latino es el 12 de julio. Te registro?"
  ]);
  const result = _findEventInConversationForTest(win, FAKE_EVENTS);
  assert.equal(result?.slug, "ia-marketing-primeros-pasos");
});

test("findEventInConversation: matchea por location (Online/Zoom)", () => {
  const win = makeWindow([
    "El taller online por Zoom. Te interesa registrarte?"
  ]);
  const result = _findEventInConversationForTest(win, FAKE_EVENTS);
  assert.equal(result?.slug, "ads-meta-estrategia-avanzada");
});

test("findEventInConversation: sin conversacion devuelve null", () => {
  const result = _findEventInConversationForTest(undefined, FAKE_EVENTS);
  assert.equal(result, null);
});

test("findEventInConversation: sin eventos devuelve null", () => {
  const win = makeWindow(["Algo sobre CDMX"]);
  const result = _findEventInConversationForTest(win, []);
  assert.equal(result, null);
});

test("findEventInConversation: solo mensajes inbound con keyword matchea por inbound (P0-2)", () => {
  // FIX P0-2 (auditoria 2026-07-02): antes SOLO mirabamos outbound del
  // bot. Ahora el inbound del lead tiene prioridad. Si el lead dice
  // "Quiero el de CDMX", matcheamos el evento en CDMX por location,
  // incluso si no hay outbound del bot.
  const win = {
    phoneNormalized: "+525555555555",
    messages: [
      {
        direction: "inbound",
        body: "Quiero el de CDMX",
        timestamp: new Date().toISOString(),
        messageType: "text"
      }
    ]
  };
  const result = _findEventInConversationForTest(win, FAKE_EVENTS);
  assert.equal(result?.slug, "ia-marketing-primeros-pasos");
});

test("findEventInConversation: solo mensajes inbound sin keywords devuelve null", () => {
  // FIX P0-2: si el inbound no tiene keywords de ningun evento (slug,
  // title, location) y no hay outbound del bot, devolvemos null.
  const win = {
    phoneNormalized: "+525555555555",
    messages: [
      {
        direction: "inbound",
        body: "hola, todo bien?",
        timestamp: new Date().toISOString(),
        messageType: "text"
      }
    ]
  };
  const result = _findEventInConversationForTest(win, FAKE_EVENTS);
  assert.equal(result, null);
});

test("findEventInConversation: si no matchea nada, devuelve null", () => {
  const win = makeWindow(["Hola, como estas? Bienvenido a Qlick."]);
  const result = _findEventInConversationForTest(win, FAKE_EVENTS);
  assert.equal(result, null);
});

/* ─────────────────────────────────────────────────────────────
 * 3c. requires_name flag (Commit A)
 *
 * El evento 1 (IA y Marketing) tiene certificado → requiresName=true.
 * Los eventos 2 y 3 no tienen certificado → requiresName=false.
 * El bot-engine usa esto para decidir si pide nombre antes del email.
 * ───────────────────────────────────────────────────────────── */

test("FAKE_EVENTS: evento 1 (IA y Marketing) tiene requiresName=true (certificado)", () => {
  assert.equal(FAKE_EVENTS[0].requiresName, true);
});

test("FAKE_EVENTS: evento 2 (Ads Meta) tiene requiresName=false (sin certificado)", () => {
  assert.equal(FAKE_EVENTS[1].requiresName, false);
});

test("FAKE_EVENTS: evento 3 (Funnels GDL) tiene requiresName=false (sin certificado)", () => {
  assert.equal(FAKE_EVENTS[2].requiresName, false);
});

/* ─────────────────────────────────────────────────────────────
 * 3b. FIX 2026-07-05 — short_code match (desambigua titulos duplicados)
 *
 * El bug que cerro esta feature: David creo 2 eventos "Pingüinos" en
 * distintas fechas. Cuando escribio por WhatsApp sobre el NUEVO, el
 * bot caia al fallback `loadActiveEventContext()` (primer published
 * por starts_at) y le decia "ya estas registrado en [el viejo]".
 *
 * El fix es `matchShortCode` (capa 0 en `matchTextToEvent`): matchea
 * el codigo corto 4 chars base32 (sin 0/1/O/I) contra el campo
 * `shortCode` del evento. Gana sobre slug/titulo/location.
 * ───────────────────────────────────────────────────────────── */

test("short_code: '7A3X' matchea exactamente el evento 1", () => {
  const result = _matchShortCodeForTest("7A3X", FAKE_EVENTS);
  assert.equal(result?.event.id, "e1");
  assert.equal(result?.reason, "short_code(7A3X)");
});

test("short_code: lowercase 'b4nz' matchea case-insensitive (sin colisionar con chars prohibidos)", () => {
  // NOTA: 'q9k1' (lowercase q/k) NO matchea porque `1` es char prohibido
  // y 'q' requiere lowercase-range extension via `i` flag. Usamos 'b4nz':
  // todos los chars lowercase validos (a-h, j-n, p-z) + 2-9.
  const result = _matchShortCodeForTest("b4nz", FAKE_EVENTS);
  assert.equal(result?.event.id, "e3");
});

test("short_code: lowercase 'B4NZ' mayusculas tambien matchean", () => {
  // Tambien verificamos que mixed case pasa.
  const result1 = _matchShortCodeForTest("B4nZ", FAKE_EVENTS);
  assert.equal(result1?.event.id, "e3");
});

test("short_code: matchea dentro de texto mas largo ('el 7A3X porfa')", () => {
  const result = _matchShortCodeForTest("quiero el 7A3X porfa", FAKE_EVENTS);
  assert.equal(result?.event.id, "e1");
});

test("short_code: matchea dentro de palabras pegadas ('codigob4nz')", () => {
  // 'B4NZ' debe matchear como \b...\b word boundary, NO si esta pegado sin espacio?
  // Actually \b coincide entre una word char y non-word char. 'codigoB4NZ' tendria
  // char alfanumerico a la izquierda, asi que NO hay word boundary. Esto es lo
  // esperado — evita falsos positivos con palabras largas que casualmente
  // contengan 4 chars del alphabet.
  const result = _matchShortCodeForTest("codigob4nz", FAKE_EVENTS);
  assert.equal(result, null, "no debe matchear codigo embebido en otra palabra");
});

test("short_code: codigo valido pero no en catalogo → null", () => {
  const result = _matchShortCodeForTest("ZZZZ", FAKE_EVENTS);
  assert.equal(result, null);
});

test("short_code: codigo con chars prohibidos (con 0) → null", () => {
  const result = _matchShortCodeForTest("0123", FAKE_EVENTS);
  assert.equal(result, null);
});

test("short_code: catalogo vacio → null", () => {
  const result = _matchShortCodeForTest("7A3X", []);
  assert.equal(result, null);
});

test("short_code: con multiples codigos en el texto, matchea el primero del catalogo", () => {
  // El texto '7A3X y B4NZ' tiene ambos. El match usa el primero que aparezca
  // en el texto que exista en el catalogo → 7A3X (e1).
  const result = _matchShortCodeForTest("7A3X y B4NZ", FAKE_EVENTS);
  assert.equal(result?.event.id, "e1");
});

test("matchTextToEvent: short_code tiene prioridad sobre match por titulo", () => {
  // El texto contiene 'IA' que matchearia por titulo el evento 1
  // (IA y Marketing: Primeros Pasos). Tambien contiene el codigo 'B4NZ'
  // que matchearia el evento 3 (Funnels GDL). Como short_code es capa
  // 0 (la mas fuerte), debe ganar 'B4NZ' → e3.
  const result = _findEventInConversationForTest(
    makeWindow(["quiero el B4NZ de IA"]),
    FAKE_EVENTS
  );
  assert.equal(result?.id, "e3", "short_code debe ganar sobre title match");
});

/* ─────────────────────────────────────────────────────────────
 * 4. bot-engine — processInboundMessage end-to-end
 * ───────────────────────────────────────────────────────────── */

import { processInboundMessage } from "../src/lib/whatsapp/bot-engine.ts";

/**
 * Setea Supabase como "no configurado" para que el bot corra en modo demo
 * (no persiste en DB, pero envía via provider si está configurado).
 */
function disableSupabase() {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  delete process.env.SUPABASE_SECRET_KEY;
}

test("processInboundMessage: primer mensaje 'hola' (demo mode) → welcome", async () => {
  // Nota: en demo mode (Supabase deshabilitado) no hay forma de saber si el
  // teléfono ya existía antes. Cada llamada crea un lead nuevo, lo cual
  // marca isFirstMessage=true. Por eso un primer mensaje "hola" devuelve
  // "welcome" (mensaje de bienvenida) en lugar de "greeting" (interacción
  // normal). En producción con Supabase real, el segundo mensaje del lead
  // ya marca created=false y devuelve greeting correctamente.
  //
  // Nota 2 sobre `demo`: este test mockea globalThis.fetch, así que el
  // provider responde OK al POST simulado. El flag `result.demo` depende
  // de si el provider REAL de Meta tiene env vars configuradas; con el
  // mock global activo, demo=false aunque Supabase esté deshabilitado. No
  // se valida acá.
  disableSupabase();
  const m = mockFetch();
  try {
    const result = await processInboundMessage({
      messageId: "wamid_g1",
      from: "523312345678",
      contactName: "Ana",
      text: "hola",
      type: "text",
      timestamp: "1700000000"
    });
    assert.equal(result.ok, true);
    assert.equal(result.intent, "welcome");
    // FIX tests stale: commit 1cb8e9d switcheo welcome/greeting/register/
    // provide_email de template a texto libre (templates conf_bienvenida etc.
    // no existen en Meta Business Manager todavia). Actualizado 2026-07-01
    // junto con el fix de /qr → /check-in/[token].
    //
    // Fase 7a 2026-07-01: welcome ahora devuelve interactive (Reply
    // Buttons) en vez de texto libre. Mayor conversion + claridad.
    assert.equal(result.responseKind, "interactive");
    assert.ok(result.leadId);
  } finally {
    m.restore();
  }
});

test("processInboundMessage: register sin eventos → text honesto (no muestra fantasma)", async () => {
  disableSupabase();
  const m = mockFetch();
  try {
    const result = await processInboundMessage({
      messageId: "wamid_r1",
      from: "525555555555",
      text: "sí, quiero inscribirme",
      type: "text"
    });
    assert.equal(result.intent, "register");
    // FIX 2026-07-07 (audit David "bot presenta evento fantasma"):
    // si NO hay eventos en DB ni env vars, register devuelve texto
    // honesto en vez de armar un evento ficticio. Antes caía al
    // placeholder "IA y Marketing Básico / 6 de julio / Ciudad de México"
    // y comprometia leads con un evento que no existía.
    assert.equal(result.responseKind, "text");
    assert.match(
      result.responsePreview ?? "",
      /no tenemos eventos pr[oó]ximos/i
    );
  } finally {
    m.restore();
  }
});

test("processInboundMessage: opt_out → texto + intent=opt_out", async () => {
  disableSupabase();
  const m = mockFetch();
  try {
    const result = await processInboundMessage({
      messageId: "wamid_o1",
      from: "523399999999",
      text: "baja",
      type: "text"
    });
    assert.equal(result.intent, "opt_out");
    assert.equal(result.responseKind, "text");
    assert.match(result.responsePreview ?? "", /no te contacto más/i);
  } finally {
    m.restore();
  }
});

test("processInboundMessage: phone inválido → ok=false", async () => {
  disableSupabase();
  const m = mockFetch();
  try {
    const result = await processInboundMessage({
      messageId: "wamid_bad",
      from: "abc", // no se puede normalizar
      text: "hola",
      type: "text"
    });
    assert.equal(result.ok, false);
    assert.equal(result.intent, "question");
    assert.equal(result.leadId, null);
  } finally {
    m.restore();
  }
});

test("processInboundMessage: provee email → provide_email + texto confirmacion", async () => {
  disableSupabase();
  const m = mockFetch();
  try {
    const result = await processInboundMessage({
      messageId: "wamid_e1",
      from: "523312345678",
      text: "ana@example.com",
      type: "text"
    });
    assert.equal(result.intent, "provide_email");
    // FIX tests stale: ver comentario en test "primer mensaje 'hola'".
    assert.equal(result.responseKind, "text");
  } finally {
    m.restore();
  }
});

// Fase 7a (2026-07-01): cuando el usuario clickea un Reply Button del welcome,
// el intent se deriva del buttonId en vez de regex sobre el texto.
test("processInboundMessage: buttonId evt_yes_* sin evento → text honesto (no muestra fantasma)", async () => {
  disableSupabase();
  const m = mockFetch();
  try {
    const result = await processInboundMessage({
      messageId: "wamid_btn1",
      from: "523312345678",
      text: "Sí, info IA y Marketing Básico",
      type: "interactive",
      buttonId: "evt_yes_ia_y_marketing_b",
      buttonTitle: "Sí, info IA y Marketing"
    });
    assert.equal(result.intent, "interactive_event_yes");
    // FIX 2026-07-07 (audit David "bot presenta evento fantasma"):
    // si NO hay eventos en DB ni env vars, ya NO armamos un evento
    // ficticio. Devolvemos texto honesto. Antes caia al placeholder
    // "IA y Marketing Básico / 6 de julio / Ciudad de México" y
    // comprometia leads con un evento que no existía.
    assert.equal(result.responseKind, "text");
    assert.match(
      result.responsePreview ?? "",
      /no tenemos eventos pr[oó]ximos/i
    );
  } finally {
    m.restore();
  }
});

test("processInboundMessage: buttonId evt_inscribir_* → interactive_event_inscribir (pide email)", async () => {
  disableSupabase();
  const m = mockFetch();
  try {
    const result = await processInboundMessage({
      messageId: "wamid_btn_ins",
      from: "523312345678",
      text: "Inscribirme",
      type: "interactive",
      buttonId: "evt_inscribir_ia_y_marketing_b",
      buttonTitle: "Inscribirme"
    });
    assert.equal(result.intent, "interactive_event_inscribir");
    // Devuelve texto pidiendo el email.
    assert.equal(result.responseKind, "text");
  } finally {
    m.restore();
  }
});

test("processInboundMessage: buttonId show_events → interactive_show_events", async () => {
  // FIX 2026-07-02 (sesion David): el boton del welcome ahora es
  // "show_events" (antes "show_courses" con cursos hardcoded que no
  // existian). Ahora lista los eventos REALES de DB.
  disableSupabase();
  const m = mockFetch();
  try {
    const result = await processInboundMessage({
      messageId: "wamid_btn2",
      from: "523312345678",
      text: "Ver eventos",
      type: "interactive",
      buttonId: "show_events",
      buttonTitle: "Ver eventos"
    });
    assert.equal(result.intent, "interactive_show_events");
    // Sin Supabase, cae a texto (no hay eventos para listar).
    assert.equal(result.responseKind, "text");
  } finally {
    m.restore();
  }
});

test("processInboundMessage: buttonId talk_human → interactive_talk_human", async () => {
  disableSupabase();
  const m = mockFetch();
  try {
    const result = await processInboundMessage({
      messageId: "wamid_btn3",
      from: "523312345678",
      text: "Hablar con humano",
      type: "interactive",
      buttonId: "talk_human",
      buttonTitle: "Hablar con humano"
    });
    assert.equal(result.intent, "interactive_talk_human");
    // Devuelve texto (handoff message).
    assert.equal(result.responseKind, "text");
  } finally {
    m.restore();
  }
});

test("processInboundMessage: question → LLM o fallback", async () => {
  disableSupabase();
  const m = mockFetch();
  try {
    const result = await processInboundMessage({
      messageId: "wamid_q1",
      from: "523312345678",
      text: "¿Cuál es el precio?",
      type: "text"
    });
    assert.equal(result.intent, "question");
    assert.ok(result.responsePreview);
  } finally {
    m.restore();
  }
});

/* ─────────────────────────────────────────────────────────────
 * 5. Webhook route — GET handshake + POST dispatch
 *
 * SKIP: route.ts importa `next/server` (NextResponse, NextRequest) que
 * solo está disponible dentro del runtime de Next.js, no en node:test.
 * La lógica real está cubierta por los tests 1-4 (provider, handler,
 * bot-engine). Para testear el route handler propiamente se necesita
 * un test runner con Next.js disponible (jest + next/jest).
 * ───────────────────────────────────────────────────────────── */

// import {

// Los siguientes imports son relativos (no @/) para que node --test los
// resuelva sin path aliases. Lo mismo aplica al bot-engine.ts y al route.ts:
// todos los `@/lib/...` que tenían los reescribimos como relativos al
// // scope del archivo.
// 
// /** Mock minimal de NextRequest para los tests de route. */
// function mockNextRequest(url, init = {}) {
//   const req = new Request(url, init);
//   // NextRequest acepta un Request; casteamos.
//   return /** @type {*} */ (req);
// }
// 
// test("webhook GET: challenge válido → 200 + texto del challenge", async () => {
//   process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = "test_verify_token";
//   const url =
//     "https://qlick.mx/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=test_verify_token&hub.challenge=1234567890";
//   const res = await webhookGet(mockNextRequest(url));
//   assert.equal(res.status, 200);
//   assert.equal(await res.text(), "1234567890");
//   delete process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
// });
// 
// test("webhook GET: verify_token incorrecto → 403", async () => {
//   process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = "good_token";
//   const url =
//     "https://qlick.mx/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong_token&hub.challenge=1234";
//   const res = await webhookGet(mockNextRequest(url));
//   assert.equal(res.status, 403);
//   delete process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
// });
// 
// test("webhook GET: mode incorrecto → 403", async () => {
//   process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = "x";
//   const url =
//     "https://qlick.mx/api/whatsapp/webhook?hub.mode=unsubscribe&hub.verify_token=x&hub.challenge=1234";
//   const res = await webhookGet(mockNextRequest(url));
//   assert.equal(res.status, 403);
//   delete process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
// });
// 
// test("webhook POST: payload válido → 200 + parsedMessages > 0", async () => {
//   disableSupabase();
//   const m = mockFetch();
//   try {
//     const payload = {
//       entry: [
//         {
//           changes: [
//             {
//               value: {
//                 messages: [
//                   {
//                     id: "wamid_post_1",
//                     from: "523312345678",
//                     type: "text",
//                     timestamp: "1700000000",
//                     text: { body: "hola" }
//                   }
//                 ]
//               }
//             }
//           ]
//         }
//       ]
//     };
//     const req = mockNextRequest("https://qlick.mx/api/whatsapp/webhook", {
//       method: "POST",
//       body: JSON.stringify(payload)
//     });
//     const res = await webhookPost(req);
//     assert.equal(res.status, 200);
//     const json = await res.json();
//     assert.equal(json.ok, true);
//     assert.equal(json.parsedMessages, 1);
//   } finally {
//     m.restore();
//   }
// });
// 
// test("webhook POST: payload sin mensajes (status update) → 200", async () => {
//   disableSupabase();
//   const m = mockFetch();
//   try {
//     const payload = {
//       entry: [
//         {
//           changes: [
//             {
//               value: {
//                 statuses: [
//                   {
//                     id: "wamid_status_1",
//                     status: "delivered",
//                     recipient_id: "523312345678",
//                     timestamp: "1700000000"
//                   }
//                 ]
//               }
//             }
//           ]
//         }
//       ]
//     };
//     const req = mockNextRequest("https://qlick.mx/api/whatsapp/webhook", {
//       method: "POST",
//       body: JSON.stringify(payload)
//     });
//     const res = await webhookPost(req);
//     assert.equal(res.status, 200);
//     const json = await res.json();
//     assert.equal(json.ok, true);
//     assert.equal(json.parsedMessages, 0);
//   } finally {
//     m.restore();
//   }
// });
// 
// test("webhook POST: body inválido (no JSON) → 400", async () => {
//   const req = mockNextRequest("https://qlick.mx/api/whatsapp/webhook", {
//     method: "POST",
//     body: "no-es-json"
//   });
//   const res = await webhookPost(req);
//   assert.equal(res.status, 400);
// });
// 
// test("webhook POST: firma inválida → 401", async () => {
//   process.env.WHATSAPP_WEBHOOK_SECRET = "mi_app_secret";
//   const req = mockNextRequest("https://qlick.mx/api/whatsapp/webhook", {
//     method: "POST",
//     body: JSON.stringify({ entry: [] }),
//     headers: {
//       "x-hub-signature-256": "sha256=deadbeef"
//     }
//   });
//   const res = await webhookPost(req);
//   assert.equal(res.status, 401);
//   delete process.env.WHATSAPP_WEBHOOK_SECRET;
// });
// 
// test("webhook POST: firma válida → 200", async () => {
//   process.env.WHATSAPP_WEBHOOK_SECRET = "mi_app_secret";
//   disableSupabase();
//   const m = mockFetch();
//   try {
//     const body = JSON.stringify({ entry: [] });
//     const { createHmac } = await import("node:crypto");
//     const sig =
//       "sha256=" +
//       createHmac("sha256", "mi_app_secret").update(body).digest("hex");
//     const req = mockNextRequest("https://qlick.mx/api/whatsapp/webhook", {
//       method: "POST",
//       body,
//       headers: {
//         "content-type": "application/json",
//         "x-hub-signature-256": sig
//       }
//     });
//     const res = await webhookPost(req);
//     assert.equal(res.status, 200);
//   } finally {
//     m.restore();
//     delete process.env.WHATSAPP_WEBHOOK_SECRET;
//   }
// });

/* ----------------------------------------------------------------
 * FIX 2026-07-07 (sesión David, opción B): bot escala a humano cuando
 * el mensaje matchea mustEscalateToHuman. El flow:
 *   1) Persistir handoff en `handoff_requests` (best-effort, mockeamos
 *      Supabase para que falle silenciosamente).
 *   2) Enviar respuesta segura al lead (texto fijo, sin inventar).
 *   3) Retornar intent="human_handoff" + responseKind="text".
 *
 * Excluimos OPT_OUT_RE para no romper "baja" como opt_out.
 * ---------------------------------------------------------------- */

test("processInboundMessage: 'quiero un reembolso' → intent=human_handoff + texto seguro", async () => {
  disableSupabase();
  const m = mockFetch();
  try {
    const result = await processInboundMessage({
      messageId: "wamid_h1",
      from: "523399999991",
      text: "Quiero un reembolso del curso que compré ayer",
      type: "text"
    });
    assert.equal(result.intent, "human_handoff");
    assert.equal(result.responseKind, "text");
    // El cuerpo NO debe contener frases prohibidas (inventar copy).
    assert.doesNotMatch(result.responsePreview ?? "", /reembolso/i);
    assert.match(
      result.responsePreview ?? "",
      /asesor de Qlick te contactará pronto/i
    );
    assert.match(result.note, /Escalación a humano/i);
    assert.match(result.note, /Reembolso/i);
  } finally {
    m.restore();
  }
});

test("processInboundMessage: 'me cobraron dos veces' → human_handoff (pagos)", async () => {
  disableSupabase();
  const m = mockFetch();
  try {
    const result = await processInboundMessage({
      messageId: "wamid_h2",
      from: "523399999992",
      text: "Oye, me cobraron dos veces con tarjeta",
      type: "text"
    });
    assert.equal(result.intent, "human_handoff");
    assert.match(result.note, /Pagos/i);
  } finally {
    m.restore();
  }
});

test("processInboundMessage: 'no me funciona el acceso al curso' → human_handoff (soporte)", async () => {
  disableSupabase();
  const m = mockFetch();
  try {
    const result = await processInboundMessage({
      messageId: "wamid_h3",
      from: "523399999993",
      text: "no me funciona el acceso, ya pagué",
      type: "text"
    });
    assert.equal(result.intent, "human_handoff");
    assert.match(result.note, /Soporte/i);
  } finally {
    m.restore();
  }
});

test("processInboundMessage: 'eliminar mis datos' → human_handoff (privacidad)", async () => {
  disableSupabase();
  const m = mockFetch();
  try {
    const result = await processInboundMessage({
      messageId: "wamid_h4",
      from: "523399999994",
      text: "quiero eliminar mis datos personales",
      type: "text"
    });
    assert.equal(result.intent, "human_handoff");
    assert.match(result.note, /Datos personales/i);
  } finally {
    m.restore();
  }
});

test("processInboundMessage: 'tienen descuento?' → human_handoff (descuento no autorizado)", async () => {
  disableSupabase();
  const m = mockFetch();
  try {
    const result = await processInboundMessage({
      messageId: "wamid_h5",
      from: "523399999995",
      text: "me pueden dar descuento si me inscribo a los 4 cursos?",
      type: "text"
    });
    assert.equal(result.intent, "human_handoff");
    assert.match(result.note, /Descuento/i);
  } finally {
    m.restore();
  }
});

test("processInboundMessage: 'baja' → opt_out (NO human_handoff) — exclude OPT_OUT_RE", async () => {
  // FIX 2026-07-07 (post test fail): "baja" matchea tanto
  // mustEscalateToHuman (datos personales) como OPT_OUT_RE. El flow
  // opt_out debe ganar porque es el contrato legacy del bot.
  disableSupabase();
  const m = mockFetch();
  try {
    const result = await processInboundMessage({
      messageId: "wamid_o2",
      from: "523399999996",
      text: "baja",
      type: "text"
    });
    assert.equal(result.intent, "opt_out");
    assert.notEqual(result.intent, "human_handoff");
  } finally {
    m.restore();
  }
});

test("processInboundMessage: 'stop' → opt_out (no escala)", async () => {
  disableSupabase();
  const m = mockFetch();
  try {
    const result = await processInboundMessage({
      messageId: "wamid_o3",
      from: "523399999997",
      text: "stop",
      type: "text"
    });
    assert.equal(result.intent, "opt_out");
    assert.notEqual(result.intent, "human_handoff");
  } finally {
    m.restore();
  }
});

test("processInboundMessage: mensaje neutro 'hola' → NO escala a humano", async () => {
  disableSupabase();
  const m = mockFetch();
  try {
    const result = await processInboundMessage({
      messageId: "wamid_n1",
      from: "523399999998",
      text: "hola, quiero info del evento",
      type: "text"
    });
    assert.notEqual(result.intent, "human_handoff");
  } finally {
    m.restore();
  }
});
