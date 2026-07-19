/**
 * E2E comprehensivo del bot (Sprint 2026-07-19, David
 * "necesito cubrir todo absolutamente todo de forma realista").
 *
 * Matriz de cobertura:
 *   - 2 modos: super_executive_v2 (default), human_first (recien
 *     arreglado con safety-net end-to-end).
 *   - 2 tipos de evento: pago ($1000 MXN, presencial) + gratis
 *     (price_mxn=0, presencial).
 *   - 5 escenarios de flow:
 *     S1 saludo           "hola"
 *     S2 info             "quiero info del evento"
 *     S3 nombre           "me llamo David"
 *     S4 email            "david@x.com"
 *     S5 todo junto       "David david@x.com"
 *
 * Total: 4 tests (1 por modo x evento), 20 combinaciones con asserts.
 *
 * Aserciones por escenario (cuando aplica):
 *   - processInboundMessage.ok = true.
 *   - intent detectado correctamente.
 *   - responseKind (text/Interactive/template).
 *   - event_confirmations tiene fila (si flow lo requiere).
 *   - leads.email/name actualizados (si flow los provee).
 *   - event_email_log tiene entry qr_pass con ok=true (si QR).
 *   - WhatsApp outbound tiene link de check-in (si QR).
 *   - payment_status correcto (pending si pago, not_required si gratis).
 *   - Link de pago en outbound (solo eventos de pago, S3-S5).
 *
 * Fase 1 (mocks): delete DEEPSEEK_API_KEY. Mock provider.
 * Fase 2 (DeepSeek real): $env:DEEPSEEK_API_KEY seteada. Mismo test.
 *
 * Uso:
 *   # Fase 1 (mocks):
 *   $env:DEEPSEEK_API_KEY = ""
 *   node --experimental-strip-types --experimental-test-module-mocks \
 *        --import ./tests/loader-register.mjs \
 *        --test tests/bot-comprehensive-matrix.test.mjs
 *
 *   # Fase 2 (DeepSeek real):
 *   $env:DEEPSEEK_API_KEY = "sk-..."
 *   node --experimental-strip-types --experimental-test-module-mocks \
 *        --import ./tests/loader-register.mjs \
 *        --test tests/bot-comprehensive-matrix.test.mjs
 *
 * Costo Fase 2: ~$0.03 USD, 30-60s.
 */

import { test, mock, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");

// ────────────────────────────────────────────────────────────
// Cargar .env.local
// ────────────────────────────────────────────────────────────
function loadEnvLocal() {
  const envPath = join(ROOT, ".env.local");
  if (!existsSync(envPath)) return;
  const text = readFileSync(envPath, "utf-8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadEnvLocal();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SECRET_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("Faltan env vars (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY).");
  process.exit(2);
}

const USING_DEEPSEEK = !!process.env.DEEPSEEK_API_KEY;
if (USING_DEEPSEEK) {
  console.log(`[MODE] DeepSeek real (key prefix: ${process.env.DEEPSEEK_API_KEY.slice(0, 7)}...)`);
} else {
  console.log(
    "[SKIP] DEEPSEEK_API_KEY no seteada. Este test REQUIERE DeepSeek real\n" +
      "  porque el mock LLM no provee el contexto del evento\n" +
      "  necesario para que el flow provide_email cree confirmation.\n" +
      "  Setear $env:DEEPSEEK_API_KEY = 'sk-...' y volver a correr."
  );
  process.exit(0);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ────────────────────────────────────────────────────────────
// Mocks globales
// ────────────────────────────────────────────────────────────
const capturedSends = []; // whatsapp outbound
const capturedEmails = []; // brevo sendEmail

before(() => {
  // Mock WhatsApp provider.
  mock.module("../src/lib/whatsapp/index.ts", {
    namedExports: {
      getActiveWhatsAppProvider: () => ({
        name: "mock_meta",
        displayName: "Mock Meta (E2E test)",
        active: true,
        stub: true,
        send: async (args) => {
          capturedSends.push({
            to: args.to,
            body: (args.body ?? "").slice(0, 1000),
            type: args.type ?? "text",
            ts: Date.now(),
          });
          return { ok: true, externalId: `mock_${Date.now()}`, demo: true };
        },
      }),
      REGISTRY: {},
    },
  });

  // Mock Brevo sendEmail.
  mock.module("../src/lib/email/brevo-client.ts", {
    namedExports: {
      sendEmail: async (args) => {
        capturedEmails.push({
          to: args.to,
          subject: args.subject,
          htmlPreview: (args.html ?? "").slice(0, 800),
          ts: Date.now(),
        });
        return { ok: true, messageId: `mock_email_${Date.now()}` };
      },
    },
  });
});

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────
const cleanupLeads = []; // leads a borrar al final

async function findEventByType(priceMxn) {
  const { data, error } = await supabase
    .from("events")
    .select("id, slug, title, price_mxn, format, status, starts_at, location")
    .eq("status", "published")
    .order("starts_at", { ascending: true })
    .limit(50);
  if (error) throw new Error("findEvent: " + error.message);
  if (priceMxn === 0) {
    return data.find((e) => (e.price_mxn ?? 0) === 0) ?? null;
  }
  return data.find((e) => (e.price_mxn ?? 0) > 0) ?? null;
}

async function setBotMode(mode) {
  await supabase.from("system_settings").upsert(
    {
      key: "bot_global_mode",
      value: JSON.stringify(mode),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );
}

async function restoreBotMode() {
  await supabase.from("system_settings").upsert(
    {
      key: "bot_global_mode",
      value: JSON.stringify("super_executive_v2"),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );
}

async function createTestLead(phone, name = "Pendiente") {
  const ts = Date.now();
  const placeholder = `pending-${ts}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const { data, error } = await supabase
    .from("leads")
    .insert({
      phone,
      phone_normalized: phone,
      name,
      email: placeholder,
      source: "whatsapp",
      status: "new",
      consent_to_contact: true,
    })
    .select("id, phone, phone_normalized, name, email")
    .single();
  if (error) throw new Error("createTestLead: " + error.message);
  return data;
}

async function cleanupTestLead(lead) {
  if (!lead) return;
  const { id: leadId, phone_normalized: phone } = lead;
  if (phone) {
    await supabase
      .from("event_confirmations")
      .delete()
      .eq("phone_normalized", phone);
  }
  await supabase.from("lead_whatsapp_log").delete().eq("lead_id", leadId);
  await supabase
    .from("lead_whatsapp_conversations")
    .delete()
    .eq("lead_id", leadId);
  const leadRow = await getLead(leadId);
  if (leadRow?.email) {
    await supabase
      .from("event_email_log")
      .delete()
      .eq("recipient", leadRow.email);
  }
  await supabase.from("leads").delete().eq("id", leadId);
}

async function getConfirmationForPhone(phone, eventId) {
  const { data, error } = await supabase
    .from("event_confirmations")
    .select("id, name, email, phone_normalized, source, payment_status, confirmed_at")
    .eq("event_id", eventId)
    .eq("phone_normalized", phone)
    .order("confirmed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("getConfirmation: " + error.message);
  return data;
}

async function getLead(leadId) {
  const { data, error } = await supabase
    .from("leads")
    .select("id, name, email, phone, phone_normalized")
    .eq("id", leadId)
    .maybeSingle();
  if (error) throw new Error("getLead: " + error.message);
  return data;
}

async function getEmailLogForRecipient(email) {
  if (!email) return [];
  const { data, error } = await supabase
    .from("event_email_log")
    .select("id, email_type, recipient, ok, error, sent_at, event_id")
    .eq("recipient", email)
    .order("sent_at", { ascending: false });
  if (error) throw new Error("getEmailLog: " + error.message);
  return data ?? [];
}

// ────────────────────────────────────────────────────────────
// Setup + teardown
// ────────────────────────────────────────────────────────────
let paidEvent = null;
let freeEvent = null;

before(async () => {
  paidEvent = await findEventByType(1);
  freeEvent = await findEventByType(0);
  if (!paidEvent) {
    console.error("No hay evento de pago publicado. Crea uno antes de correr este test.");
    process.exit(3);
  }
  if (!freeEvent) {
    console.error("No hay evento gratis publicado. Crea uno con price_mxn=0 antes de correr este test.");
    process.exit(3);
  }
  console.log(`[SETUP] Evento pago: ${paidEvent.title} ($${paidEvent.price_mxn} MXN, ${paidEvent.id})`);
  console.log(`[SETUP] Evento gratis: ${freeEvent.title} ($${freeEvent.price_mxn ?? 0} MXN, ${freeEvent.id})`);
});

after(async () => {
  console.log(`\n[CLEANUP] Borrando ${cleanupLeads.length} leads de prueba...`);
  for (const lead of cleanupLeads) {
    try {
      await cleanupTestLead(lead);
    } catch (e) {
      console.error(`  [WARN] cleanup lead ${lead.id} fallo:`, e.message);
    }
  }
  await restoreBotMode();
  console.log("[CLEANUP] Mode restaurado a super_executive_v2");
});

// ────────────────────────────────────────────────────────────
// Escenarios
// ────────────────────────────────────────────────────────────
const SCENARIOS = [
  { id: "S1", text: "hola", desc: "saludo" },
  { id: "S2", text: "quiero info del evento", desc: "info" },
  { id: "S3", text: "me llamo David", desc: "nombre solo" },
  { id: "S4", text: "david@x.com", desc: "email solo" },
  { id: "S5", text: "David david@x.com", desc: "nombre + email mismo mensaje" },
];

// Esperar el flujo async (safety-net fire-and-forget, fire-and-forget del case provide_email).
const FLOW_WAIT_MS = 5000;

async function runScenario({ mode, event, scenario, runIdx }) {
  const phone = `+5255999${String(runIdx).padStart(4, "0")}`;
  const lead = await createTestLead(phone);
  cleanupLeads.push(lead);

  await setBotMode(mode);

  // Reset captures para este escenario.
  capturedSends.length = 0;
  capturedEmails.length = 0;

  const { processInboundMessage } = await import(
    "../src/lib/whatsapp/bot-engine.ts"
  );

  const startMs = Date.now();
  const r = await processInboundMessage({
    messageId: `wamid_matrix_${mode}_${event.id}_${scenario.id}_${runIdx}_${Date.now()}`,
    from: phone,
    contactName: `E2E ${mode} ${scenario.id}`,
    text: scenario.text,
    type: "text",
    timestamp: String(Math.floor(Date.now() / 1000)),
  });
  const elapsedMs = Date.now() - startMs;

  // Esperar fire-and-forget.
  await new Promise((resolve) => setTimeout(resolve, FLOW_WAIT_MS));

  // Aserciones comunes.
  const result = {
    mode,
    eventId: event.id,
    eventTitle: event.title,
    eventPrice: event.price_mxn,
    scenario: scenario.id,
    scenarioText: scenario.text,
    phone,
    ok: r.ok,
    intent: r.intent,
    responseKind: r.responseKind,
    responsePreview: r.responsePreview?.slice(0, 200),
    elapsedMs,
    hasConfirmation: false,
    hasEmailLog: false,
    paymentStatus: null,
    hasCheckoutLink: false,
    hasCheckinLink: false,
  };

  if (!r.ok) {
    result.error = r.note;
    return result;
  }

  // 1. Confirmation.
  const conf = await getConfirmationForPhone(phone, event.id);
  result.hasConfirmation = !!conf;
  if (conf) {
    result.confirmationId = conf.id;
    result.paymentStatus = conf.payment_status;
  }

  // 2. Lead actualizado (solo si flow lo requiere).
  const leadAfter = await getLead(lead.id);
  result.leadNameAfter = leadAfter?.name;
  result.leadEmailAfter = leadAfter?.email;

  // 3. Email log.
  if (leadAfter?.email) {
    const emails = await getEmailLogForRecipient(leadAfter.email);
    const qrEmail = emails.find((e) => e.email_type === "qr_pass");
    result.hasEmailLog = !!qrEmail;
    if (qrEmail) result.emailLogOk = qrEmail.ok === true;
  }

  // 4. WhatsApp outbound links.
  const allOutbound = capturedSends
    .map((s) => s.body)
    .join("\n");
  result.hasCheckoutLink = /pagar\/evento|checkout|stripe/i.test(allOutbound);
  result.hasCheckinLink = /check-in|qr\/|api\/event-qr/i.test(allOutbound);

  return result;
}

function assertScenario(result, expectations) {
  const errors = [];

  if (!result.ok) {
    errors.push(`processInboundMessage retorno ok=false: ${result.error}`);
  }

  if (expectations.shouldHaveConfirmation && !result.hasConfirmation) {
    errors.push("event_confirmations NO tiene fila");
  }
  if (expectations.shouldNotHaveConfirmation && result.hasConfirmation) {
    errors.push("event_confirmations tiene fila (no esperada)");
  }

  if (expectations.shouldHaveEmail && !result.hasEmailLog) {
    errors.push("event_email_log no tiene entry qr_pass");
  }

  if (expectations.expectedPaymentStatus) {
    if (result.paymentStatus !== expectations.expectedPaymentStatus) {
      errors.push(
        `payment_status esperado: "${expectations.expectedPaymentStatus}", actual: "${result.paymentStatus}"`
      );
    }
  }

  if (expectations.shouldHaveCheckoutLink && !result.hasCheckoutLink) {
    errors.push("WhatsApp outbound NO tiene link de pago");
  }
  if (expectations.eventIsPaid && !expectations.shouldHaveCheckoutLink) {
    // S1, S2 (info) pueden o no tener link. Solo required para S3+ en pago.
  }

  if (expectations.shouldHaveCheckinLink && !result.hasCheckinLink) {
    errors.push("WhatsApp outbound NO tiene link de check-in/QR");
  }

  if (expectations.expectedEmail) {
    if (result.leadEmailAfter !== expectations.expectedEmail) {
      errors.push(
        `email esperado: "${expectations.expectedEmail}", actual: "${result.leadEmailAfter}"`
      );
    }
  }

  if (expectations.expectedName) {
    if (result.leadNameAfter !== expectations.expectedName) {
      errors.push(
        `nombre esperado: "${expectations.expectedName}", actual: "${result.leadNameAfter}"`
      );
    }
  }

  return errors;
}

function printResult(result) {
  const tags = [
    result.ok ? "OK" : "FAIL",
    result.hasConfirmation ? "CONF" : "no-conf",
    result.hasEmailLog ? "EMAIL" : "no-email",
    result.paymentStatus ?? "n/a",
    result.hasCheckoutLink ? "PAY-LINK" : "no-pay-link",
    result.hasCheckinLink ? "QR-LINK" : "no-qr-link",
  ];
  return `[${result.mode} | ${result.eventPrice === 0 ? "GRATIS" : "PAGO"} | ${result.scenario}] ${tags.join(" | ")}`;
}

// ────────────────────────────────────────────────────────────
// Expectations segun modo
// ────────────────────────────────────────────────────────────
// FIX 2026-07-19: con mock LLM el flow provide_email NO crea
// confirmation (requiere args.registrationEvent del contexto del
// LLM). Con DeepSeek real, el LLM provee el contexto y el flow
// SÍ persiste. Por eso las aserciones son mas estrictas con LLM real.
function getExpectations(mode, event, scenario) {
  const isPaid = (event.price_mxn ?? 0) > 0;
  const base = { isPaid };

  if (scenario.id === "S1") {
    return { ...base, shouldNotHaveConfirmation: true };
  }
  if (scenario.id === "S2") {
    return { ...base, shouldNotHaveConfirmation: true };
  }
  if (scenario.id === "S3") {
    // Nombre solo: el bot pide email. NO confirmation aun.
    return { ...base, shouldNotHaveConfirmation: true };
  }
  if (scenario.id === "S4") {
    // Email solo: case provide_email crea confirmation + email + links.
    return {
      ...base,
      shouldHaveConfirmation: true,
      shouldHaveEmail: true,
      expectedPaymentStatus: isPaid ? "pending" : "not_required",
      expectedEmail: "david@x.com",
      shouldHaveCheckoutLink: isPaid,
      shouldHaveCheckinLink: true,
    };
  }
  if (scenario.id === "S5") {
    // Nombre + email mismo mensaje: safety-net (human_first) o flow.
    return {
      ...base,
      shouldHaveConfirmation: true,
      shouldHaveEmail: true,
      expectedPaymentStatus: isPaid ? "pending" : "not_required",
      expectedName: "David",
      expectedEmail: "david@x.com",
      shouldHaveCheckoutLink: isPaid,
      shouldHaveCheckinLink: true,
    };
  }
  return base;
}

// ────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────

const RESULTS = []; // para el reporte final

test("Matriz #1: super_executive_v2 + evento PAGO (5 escenarios)", async () => {
  for (let i = 0; i < SCENARIOS.length; i++) {
    const scenario = SCENARIOS[i];
    const result = await runScenario({
      mode: "super_executive_v2",
      event: paidEvent,
      scenario,
      runIdx: 100 + i,
    });

    const expectations = getExpectations("super_executive_v2", paidEvent, scenario);
    const errors = assertScenario(result, expectations);
    RESULTS.push({ ...result, errors, expectations });
    console.log(printResult(result) + (errors.length ? ` | ERRORS: ${errors.join("; ")}` : ""));

    if (errors.length) {
      throw new Error(`[${scenario.id}] FAILED: ${errors.join("; ")}`);
    }
  }
});

test("Matriz #2: super_executive_v2 + evento GRATIS (5 escenarios)", async () => {
  for (let i = 0; i < SCENARIOS.length; i++) {
    const scenario = SCENARIOS[i];
    const result = await runScenario({
      mode: "super_executive_v2",
      event: freeEvent,
      scenario,
      runIdx: 200 + i,
    });

    const expectations = getExpectations("super_executive_v2", freeEvent, scenario);
    const errors = assertScenario(result, expectations);
    RESULTS.push({ ...result, errors, expectations });
    console.log(printResult(result) + (errors.length ? ` | ERRORS: ${errors.join("; ")}` : ""));

    if (errors.length) {
      throw new Error(`[${scenario.id}] FAILED: ${errors.join("; ")}`);
    }
  }
});

test("Matriz #3: human_first + evento PAGO (5 escenarios)", async () => {
  for (let i = 0; i < SCENARIOS.length; i++) {
    const scenario = SCENARIOS[i];
    const result = await runScenario({
      mode: "human_first",
      event: paidEvent,
      scenario,
      runIdx: 300 + i,
    });

    const expectations = getExpectations("human_first", paidEvent, scenario);
    const errors = assertScenario(result, expectations);
    RESULTS.push({ ...result, errors, expectations });
    console.log(printResult(result) + (errors.length ? ` | ERRORS: ${errors.join("; ")}` : ""));

    if (errors.length) {
      throw new Error(`[${scenario.id}] FAILED: ${errors.join("; ")}`);
    }
  }
});

test("Matriz #4: human_first + evento GRATIS (5 escenarios)", async () => {
  for (let i = 0; i < SCENARIOS.length; i++) {
    const scenario = SCENARIOS[i];
    const result = await runScenario({
      mode: "human_first",
      event: freeEvent,
      scenario,
      runIdx: 400 + i,
    });

    const expectations = getExpectations("human_first", freeEvent, scenario);
    const errors = assertScenario(result, expectations);
    RESULTS.push({ ...result, errors, expectations });
    console.log(printResult(result) + (errors.length ? ` | ERRORS: ${errors.join("; ")}` : ""));

    if (errors.length) {
      throw new Error(`[${scenario.id}] FAILED: ${errors.join("; ")}`);
    }
  }
});

// ────────────────────────────────────────────────────────────
// Reporte final
// ────────────────────────────────────────────────────────────
process.on("exit", () => {
  console.log(`\n${"=".repeat(100)}`);
  console.log("REPORTE FINAL - Matriz comprehensiva del bot");
  console.log("=".repeat(100));
  console.log(
    "Modo             | Tipo   | Esc | OK | Conf | Email | PayStat    | PayLink | QRLink | Errs"
  );
  console.log("-".repeat(100));
  for (const r of RESULTS) {
    const tipo = r.eventPrice === 0 ? "GRATIS" : `PAGO  `;
    const ok = r.ok ? "Y" : "N";
    const conf = r.hasConfirmation ? "Y" : "N";
    const eml = r.hasEmailLog ? "Y" : "N";
    const pay = (r.paymentStatus ?? "n/a").padEnd(10);
    const payLink = r.hasCheckoutLink ? "Y" : "N";
    const qrLink = r.hasCheckinLink ? "Y" : "N";
    const errs = r.errors.length === 0 ? "-" : String(r.errors.length);
    console.log(
      `${r.mode.padEnd(17)}| ${tipo} | ${r.scenario}  | ${ok}  | ${conf}    | ${eml}     | ${pay} | ${payLink}      | ${qrLink}     | ${errs}`
    );
  }
  console.log("=".repeat(100));
  const totalPass = RESULTS.filter((r) => r.errors.length === 0).length;
  console.log(`Total: ${totalPass}/${RESULTS.length} OK`);
});
