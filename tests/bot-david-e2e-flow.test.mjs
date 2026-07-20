// tests/bot-david-e2e-flow.test.mjs
// Test E2E que reproduce el flow de David (sprint bot feedback 2026-07-19):
// body "David Martinez david17891@gmail.com" en el mismo mensaje.
// Valida que:
//   - Confirmation tiene name = "David Martinez" (no "WhatsApp Lead")
//   - event_qr_tokens tiene confirmation_id != null (LINK en panel)
import { test, mock, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");

// Cargar .env.local (no requerimos DEEPSEEK_API_KEY para este test
// porque usamos Mock provider via mock.module).
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

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Mocks globales
const capturedSends = [];
const capturedEmails = [];

before(() => {
  mock.module("../src/lib/whatsapp/index.ts", {
    namedExports: {
      getActiveWhatsAppProvider: () => ({
        name: "mock_meta",
        displayName: "Mock Meta (David E2E)",
        active: true,
        stub: true,
        send: async (args) => {
          capturedSends.push({ to: args.to, body: (args.body ?? "").slice(0, 800), type: args.type ?? "text" });
          return { ok: true, externalId: `mock_${Date.now()}`, demo: true };
        },
      }),
      REGISTRY: {},
    },
  });
  mock.module("../src/lib/email/brevo-client.ts", {
    namedExports: {
      sendEmail: async (args) => {
        capturedEmails.push({ to: args.to, subject: args.subject });
        return { ok: true, messageId: `mock_email_${Date.now()}` };
      },
    },
  });
});

const cleanupLeads = [];

async function createPreRegisteredLead(phone) {
  const ts = Date.now();
  const placeholder = `pending-${ts}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const { data, error } = await supabase
    .from("leads")
    .insert({
      phone,
      phone_normalized: phone,
      // FIX 2026-07-19: el lead se pre-registra con name "WhatsApp
      // Lead" (placeholder), simulando el escenario de David antes
      // del fix.
      name: "WhatsApp Lead",
      email: placeholder,
      source: "whatsapp",
      status: "new",
      consent_to_contact: true,
    })
    .select("id, phone, phone_normalized, name, email")
    .single();
  if (error) throw new Error("createPreRegisteredLead: " + error.message);
  return data;
}

async function cleanupTestLead(leadId, phone) {
  if (phone) {
    await supabase.from("event_confirmations").delete().eq("phone_normalized", phone);
  }
  await supabase.from("leads").delete().eq("id", leadId);
}

after(async () => {
  for (const lead of cleanupLeads) {
    try {
      await cleanupTestLead(lead.id, lead.phone_normalized);
    } catch (e) {
      console.error(`  [WARN] cleanup lead ${lead.id} fallo:`, e.message);
    }
  }
});

test("David E2E: body 'David Martinez david@x.com' crea confirmation con name real + LINK", async () => {
  // Setup: bot mode = v2 (default).
  await supabase.from("system_settings").upsert({
    key: "bot_global_mode",
    value: "super_executive_v2",
    updated_at: new Date().toISOString(),
  }, { onConflict: "key" });
  // invalidar cache
  try {
    const mod = await import("../src/lib/admin/system-settings-server.ts");
    if (typeof mod.invalidateCache === "function") mod.invalidateCache();
  } catch {}

  // 1. Encontrar evento PAGO.
  const { data: paidEvent } = await supabase
    .from("events")
    .select("id, slug, title, price_mxn")
    .eq("status", "published")
    .gt("price_mxn", 0)
    .order("starts_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  assert.ok(paidEvent, "debe haber un evento PAGO publicado");
  console.log(`[SETUP] Evento PAGO: ${paidEvent.title}`);

  // 2. Crear lead pre-registrado con name = "WhatsApp Lead".
  const ts = Date.now();
  const phone = `+5255999${String(800 + (ts % 100)).padStart(4, "0")}`;
  const lead = await createPreRegisteredLead(phone);
  cleanupLeads.push(lead);
  console.log(`[SETUP] Lead pre-registrado: ${lead.id} (name="WhatsApp Lead")`);

  // 3. Llamar al bot con body "David Martinez david@x.com".
  const { processInboundMessage } = await import("../src/lib/whatsapp/bot-engine.ts");
  const r = await processInboundMessage({
    messageId: `david_e2e_${ts}`,
    from: phone,
    contactName: "David Martinez",
    text: `David Martinez david-repro-${ts}@example.com`,
    type: "text",
    timestamp: String(Math.floor(ts / 1000)),
  });
  assert.ok(r.ok, `bot result.ok debe ser true (fue ${r.ok}, note=${r.note})`);

  // 4. Esperar fire-and-forget del safety-net + implicit_capture.
  await new Promise((res) => setTimeout(res, 8000));

  // 5. Validar confirmation: name = "David Martinez".
  const { data: confs } = await supabase
    .from("event_confirmations")
    .select("id, name, email, phone_normalized, source")
    .eq("phone_normalized", phone)
    .eq("event_id", paidEvent.id);
  assert.ok(confs && confs.length > 0, `debe haber al menos 1 confirmation (hay ${confs?.length ?? 0})`);
  const conf = confs[0];
  console.log(`[CHECK] confirmation:`, conf);
  assert.strictEqual(
    conf.name,
    "David Martinez",
    `confirmation.name debe ser "David Martinez" (fue "${conf.name}"). El bug del sprint: el bot miente si name es "WhatsApp Lead".`
  );

  // 6. Validar event_qr_tokens: confirmation_id != null.
  const { data: tokens } = await supabase
    .from("event_qr_tokens")
    .select("token, confirmation_id, attendee_name")
    .eq("attendee_phone_normalized", phone);
  assert.ok(tokens && tokens.length > 0, `debe haber al menos 1 token (hay ${tokens?.length ?? 0})`);
  const token = tokens[0];
  console.log(`[CHECK] qr token:`, token);
  assert.ok(
    token.confirmation_id,
    `event_qr_tokens.confirmation_id debe estar linkeado (es ${token.confirmation_id}). El bug: LINK vacio en panel admin.`
  );
  assert.strictEqual(
    token.confirmation_id,
    conf.id,
    `event_qr_tokens.confirmation_id debe ser ${conf.id} (es ${token.confirmation_id})`
  );
});
