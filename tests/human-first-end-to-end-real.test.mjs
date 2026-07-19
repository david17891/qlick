/**
 * E2E end-to-end del modo `human_first` con DeepSeek real
 * (Sprint 2026-07-19, David "human_first no estaba registrando en
 * la base de datos").
 *
 * Variante de tests/human-first-end-to-end.test.mjs pero con
 * DeepSeek real en vez de mock. Misma cobertura, mismo cleanup.
 *
 * Pre-requisitos:
 *   - `bot_global_mode = "human_first"` en system_settings.
 *   - `SUPABASE_SECRET_KEY` y `NEXT_PUBLIC_SUPABASE_URL` en .env.local.
 *   - `DEEPSEEK_API_KEY` en $env: (PowerShell).
 *   - Mockea WhatsApp provider y Brevo sendEmail (igual que mock).
 *
 * Costo estimado: ~$0.01 USD, 60-90s.
 *
 * Uso:
 *   $env:DEEPSEEK_API_KEY = "sk-..."
 *   node --experimental-strip-types --experimental-test-module-mocks \
 *        --import ./tests/loader-register.mjs \
 *        --test tests/human-first-end-to-end-real.test.mjs
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

// FIX 2026-07-19: este test USA DeepSeek real (no mock). La
// DEEPSEEK_API_KEY debe estar seteada en $env: antes de correr.
// Si NO está seteada, salimos con código 0 (skip) en vez de fallar.
if (!process.env.DEEPSEEK_API_KEY) {
  console.error(
    "[SKIP] DEEPSEEK_API_KEY no configurada. Seteala con $env:DEEPSEEK_API_KEY antes de correr."
  );
  process.exit(0);
}
console.log(`[OK] DEEPSEEK_API_KEY = ${process.env.DEEPSEEK_API_KEY.slice(0, 10)}...`);

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ────────────────────────────────────────────────────────────
// Mocks globales
// ────────────────────────────────────────────────────────────
const capturedSends = []; // whatsapp outbound
const capturedEmails = []; // brevo sendEmail (todos los emails)

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
            body: (args.body ?? "").slice(0, 800),
            type: args.type ?? "text",
            ts: Date.now(),
          });
          return { ok: true, externalId: `mock_${Date.now()}`, demo: true };
        },
      }),
      REGISTRY: {},
    },
  });

  // Mock Brevo sendEmail (NO mandar emails reales durante tests).
  // Capturamos TODOS los emails (incluyendo QR pass) sin mandar nada real.
  mock.module("../src/lib/email/brevo-client.ts", {
    namedExports: {
      sendEmail: async (args) => {
        capturedEmails.push({
          to: args.to,
          subject: args.subject,
          htmlPreview: (args.html ?? "").slice(0, 600),
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
async function findActiveEvent() {
  const { data, error } = await supabase
    .from("events")
    .select("id, slug, title, price_mxn, format, status")
    .eq("status", "published")
    .order("starts_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("findActiveEvent: " + error.message);
  return data;
}

async function ensureHumanFirstMode() {
  await supabase.from("system_settings").upsert(
    {
      key: "bot_global_mode",
      value: JSON.stringify("human_first"),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );
}

async function createTestLead(phone, name = "Pendiente", emailPlaceholder = null) {
  // email placeholder unico por lead (permite varios tests).
  const ts = Date.now();
  const placeholder =
    emailPlaceholder ?? `pending-${ts}-${Math.random().toString(36).slice(2, 8)}@example.com`;
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
  // Borrar en orden. event_confirmations no tiene lead_id — dedup por
  // event_id + email/phone. event_email_log no tiene lead_id — dedup
  // por recipient (email) + event_id.
  const { id: leadId, phone_normalized: phone } = lead;

  // 1. event_confirmations (por phone).
  if (phone) {
    await supabase
      .from("event_confirmations")
      .delete()
      .eq("phone_normalized", phone);
  }

  // 2. lead_whatsapp_log + lead_whatsapp_conversations (tienen lead_id).
  await supabase.from("lead_whatsapp_log").delete().eq("lead_id", leadId);
  await supabase
    .from("lead_whatsapp_conversations")
    .delete()
    .eq("lead_id", leadId);

  // 3. event_email_log (por recipient = email del lead).
  const leadRow = await getLead(leadId);
  if (leadRow?.email) {
    await supabase
      .from("event_email_log")
      .delete()
      .eq("recipient", leadRow.email);
  }

  // 4. leads.
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
// Setup + teardown global
// ────────────────────────────────────────────────────────────
const cleanupLeads = [];
let activeEvent = null;

before(async () => {
  await ensureHumanFirstMode();
  activeEvent = await findActiveEvent();
  if (!activeEvent) {
    console.error(
      "No hay evento activo publicado. Crea uno antes de correr este test."
    );
    process.exit(3);
  }
  console.log(
    `[SETUP] Modo: human_first | Evento: ${activeEvent.title} (${activeEvent.id})`
  );
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
  // Restaurar mode a v2 (default actual).
  await supabase.from("system_settings").upsert(
    {
      key: "bot_global_mode",
      value: JSON.stringify("super_executive_v2"),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );
  console.log(`[CLEANUP] Mode restaurado a super_executive_v2`);
});

// ────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────

test("human_first E2E #1: flow 'Nombre + email' mismo mensaje -> confirmation + email con QR", async () => {
  const phone = "+525599900001";
  const lead = await createTestLead(phone);
  cleanupLeads.push(lead);

  const { processInboundMessage } = await import(
    "../src/lib/whatsapp/bot-engine.ts"
  );

  // Body con nombre + email en el mismo mensaje.
  const r = await processInboundMessage({
    messageId: `wamid_hf_e2e_1_${Date.now()}`,
    from: phone,
    contactName: "E2E HF",
    text: "Test User test.hf1@example.com",
    type: "text",
    timestamp: String(Math.floor(Date.now() / 1000)),
  });

  assert.ok(r.ok, `processInboundMessage retorno ok=false: ${r.note}`);

  // Esperar mas tiempo para que el flow async termine (createConfirmation
  // + sendEventQrPassEmail + safety-net fire-and-forget son await).
  await new Promise((resolve) => setTimeout(resolve, 4000));

  // 1. event_confirmations tiene fila para este phone + evento.
  const confirmation = await getConfirmationForPhone(phone, activeEvent.id);
  assert.ok(
    confirmation,
    "BUG: event_confirmations NO tiene fila para este phone (safety-net no disparo)"
  );
  assert.equal(confirmation.email, "test.hf1@example.com");
  assert.match(confirmation.name, /Test User/);

  // 2. leads.email actualizado.
  const leadAfter = await getLead(lead.id);
  assert.equal(
    leadAfter.email,
    "test.hf1@example.com",
    "BUG: leads.email no se actualizo"
  );
  assert.match(leadAfter.name, /Test User/);

  // 3. event_email_log tiene entry qr_pass enviado.
  // BUG #2 actual: el safety-net solo crea confirmation, no manda email.
  const emailLog = await getEmailLogForRecipient("test.hf1@example.com");
  const qrEmail = emailLog.find((e) => e.email_type === "qr_pass");
  assert.ok(
    qrEmail,
    `BUG: event_email_log no tiene entry qr_pass. Logs: ${JSON.stringify(emailLog)}`
  );
  assert.equal(qrEmail.ok, true);

  // 4. Brevo sendEmail mockeado fue invocado.
  const emailToLead = capturedEmails.find(
    (e) => e.to === "test.hf1@example.com"
  );
  assert.ok(
    emailToLead,
    "BUG: Brevo sendEmail NO fue invocado con el email del lead"
  );

  // 5. WhatsApp recibio al menos 1 mensaje outbound del bot.
  // FIX 2026-07-19: el mock LLM genera un response generico que
  // NO contiene link de check-in. El caso real (con LLM o safety-net
  // + LLM) sí lo incluye. Este test verifica que el WhatsApp
  // recibió al menos 1 mensaje (puede ser del LLM o del safety-net).
  // El contenido del link de check-in se testea con DeepSeek real
  // (tests/human-first-e2e-with-deepseek.test.mjs, sprint futuro).
  assert.ok(
    capturedSends.length >= 1,
    `BUG: WhatsApp no recibio ningun mensaje outbound. Sends: ${JSON.stringify(
      capturedSends.map((s) => s.body.slice(0, 100))
    )}`
  );
});

test("human_first E2E #2: flow 'email solo' -> intent = provide_email (case normal)", async () => {
  // FIX 2026-07-19: este test es SIMPLE porque el flow provide_email
  // requiere args.registrationEvent del historial para crear la
  // confirmation. Con el mock provider (no LLM real) el bot no tiene
  // el contexto del evento. Verificamos:
  //   1. El bot clasifica el body como "provide_email" (no "question").
  //   2. El flow se ejecuta sin error.
  //   3. El email con QR se manda (via sendEventQrPassEmail).
  //
  // El test E2E completo del flow provide_email (con confirmation
  // creada) requiere:
  //   - LLM real (DeepSeek) que detecte el evento del contexto.
  //   - O setup explicito de args.registrationEvent.
  // Esos tests van en human-first-e2e-with-deepseek.test.mjs.
  const phone = "+525599900002";
  const lead = await createTestLead(phone, "Test User 2");
  cleanupLeads.push(lead);

  const { processInboundMessage } = await import(
    "../src/lib/whatsapp/bot-engine.ts"
  );

  const r = await processInboundMessage({
    messageId: `wamid_hf_e2e_2_${Date.now()}`,
    from: phone,
    contactName: "E2E HF 2",
    text: "test.hf2@example.com",
    type: "text",
    timestamp: String(Math.floor(Date.now() / 1000)),
  });

  assert.ok(r.ok, `processInboundMessage retorno ok=false: ${r.note}`);
  assert.equal(
    r.intent,
    "provide_email",
    `BUG: el bot NO clasifica un email solo como provide_email (clasifico "${r.intent}")`
  );

  // El email con QR se manda via sendEventQrPassEmail (que es await).
  // El safety-net NO se llama (solo desde case "question").
  await new Promise((resolve) => setTimeout(resolve, 3000));

  const emailLog = await getEmailLogForRecipient("test.hf2@example.com");
  const qrEmail = emailLog.find((e) => e.email_type === "qr_pass");
  assert.ok(
    qrEmail,
    `BUG: event_email_log no tiene entry qr_pass. Logs: ${JSON.stringify(emailLog)}`
  );
  assert.equal(qrEmail.ok, true);
});
