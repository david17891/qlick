// tests/payment-notify-lead-whatsapp.test.mjs
// Test E2E del fix de sprint bot feedback (2026-07-19):
// el helper notifyLeadPaymentConfirmed DEBE:
//   1. Verificar result.ok del provider.send (no solo loggear "enviado").
//   2. Loggear en lead_whatsapp_log (admin puede ver el outbound).
//   3. Si result.ok=false, errorLog con el note exacto de Meta.
import { test, mock, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");

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
  console.error("Faltan env vars.");
  process.exit(2);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Mock que captura el result.ok=true (caso exitoso).
const capturedSends = [];
const MOCK_EXTERNAL_ID = `mock_waid_${Date.now()}`;
let mockShouldFail = false;
let mockFailNote = "Mock failure for test";

before(() => {
  mock.module("../src/lib/whatsapp/index.ts", {
    namedExports: {
      getActiveWhatsAppProvider: () => ({
        name: "mock_meta_notify",
        displayName: "Mock Meta (Notify E2E)",
        active: true,
        stub: true,
        send: async (args) => {
          capturedSends.push({ to: args.to, body: (args.body ?? "").slice(0, 400) });
          if (mockShouldFail) {
            return {
              ok: false,
              provider: "mock_meta_notify",
              note: mockFailNote,
            };
          }
          return {
            ok: true,
            provider: "mock_meta_notify",
            externalId: MOCK_EXTERNAL_ID,
            note: `Mensaje enviado (wamid=${MOCK_EXTERNAL_ID}).`,
          };
        },
      }),
      REGISTRY: {},
    },
  });
  // Mock email (no se manda real, solo loggea).
  mock.module("../src/lib/email/brevo-client.ts", {
    namedExports: {
      sendEmail: async () => ({ ok: true, messageId: "mock_email" }),
    },
  });
});

const cleanupLeads = [];
after(async () => {
  for (const lead of cleanupLeads) {
    try {
      if (lead.phone) {
        await supabase.from("event_confirmations").delete().eq("phone_normalized", lead.phone);
        await supabase.from("event_qr_tokens").delete().eq("attendee_phone_normalized", lead.phone);
        await supabase.from("event_email_log").delete().eq("recipient", lead.email);
        await supabase.from("leads").delete().eq("id", lead.id);
      }
    } catch (e) {
      console.error(`  [WARN] cleanup lead ${lead.id} fallo:`, e.message);
    }
  }
});

test("notifyLeadPaymentConfirmed: result.ok=true → logea en lead_whatsapp_log", async () => {
  mockShouldFail = false;
  const ts = Date.now();
  const phone = `+5255999${String(600 + (ts % 100)).padStart(4, "0")}`;
  const email = `notif-test-ok-${ts}@example.com`;

  // Setup: lead + confirmation.
  const { data: lead } = await supabase.from("leads").insert({
    phone, phone_normalized: phone,
    name: "Notif Test OK",
    email: `pending-${ts}@example.com`,
    source: "whatsapp", status: "new", consent_to_contact: true,
    whatsapp_status: "no_contactado",
  }).select().single();
  cleanupLeads.push({ id: lead.id, phone, email });

  const { data: conf } = await supabase.from("event_confirmations").insert({
    event_id: "5ca65576-19de-4ad0-b3a9-19175e21761e",
    name: "Notif Test OK", email, phone_raw: phone, phone_normalized: phone,
    source: "whatsapp_bot", payment_status: "pending",
  }).select().single();

  // Action: llamar al helper.
  const { notifyLeadPaymentConfirmed } = await import(
    "../src/lib/payments/notify-lead-payment-confirmed.ts"
  );
  await notifyLeadPaymentConfirmed({
    confirmationId: conf.id,
    eventId: "5ca65576-19de-4ad0-b3a9-19175e21761e",
    amountTotalMXN: 1000,
    logSource: "test-ok",
  });

  // Esperar el fire-and-forget del markWhatsAppStatus.
  await new Promise((r) => setTimeout(r, 2000));

  // Assert: 1 outbound en lead_whatsapp_log con new_status=contactado.
  const { data: waLog } = await supabase
    .from("lead_whatsapp_log")
    .select("id, new_status, message_preview, metadata")
    .eq("lead_id", lead.id)
    .eq("new_status", "contactado")
    .order("created_at", { ascending: false })
    .limit(1);
  assert.ok(
    waLog && waLog.length > 0,
    `debe haber 1 entry en lead_whatsapp_log con new_status=contactado (hay ${waLog?.length ?? 0})`
  );
  const log = waLog[0];
  assert.ok(
    log.message_preview && log.message_preview.includes("pago"),
    `message_preview debe incluir info de pago (es "${log.message_preview?.slice(0, 100)}")`
  );
  assert.strictEqual(
    log.metadata?.confirmationId,
    conf.id,
    `metadata.confirmationId debe ser ${conf.id}`
  );
  assert.strictEqual(
    log.metadata?.providerResult,
    "ok",
    `metadata.providerResult debe ser "ok" (es "${log.metadata?.providerResult}")`
  );
  assert.ok(
    log.metadata?.externalId,
    `metadata.externalId debe estar setado (es "${log.metadata?.externalId}")`
  );

  // Assert: provider.send fue llamado con el body correcto.
  assert.ok(
    capturedSends.length === 1,
    `provider.send debe haber sido llamado 1 vez (fue ${capturedSends.length})`
  );
  assert.strictEqual(capturedSends[0].to, phone, `provider.send.to debe ser ${phone}`);
});

test("notifyLeadPaymentConfirmed: result.ok=false → logea en lead_whatsapp_log con no_contactado", async () => {
  mockShouldFail = true;
  mockFailNote = "Cloud API error: Invalid parameter (test)";
  const ts = Date.now();
  const phone = `+5255999${String(650 + (ts % 100)).padStart(4, "0")}`;
  const email = `notif-test-fail-${ts}@example.com`;

  const { data: lead } = await supabase.from("leads").insert({
    phone, phone_normalized: phone,
    name: "Notif Test Fail",
    email: `pending-${ts}@example.com`,
    source: "whatsapp", status: "new", consent_to_contact: true,
    // Simulamos el caso real: lead YA contactado por inbound previo.
    // El helper debe loggear el outbound del pago AUNQUE el status
    // no cambie (sino el admin no ve el outbound del pago).
    whatsapp_status: "contactado",
  }).select().single();
  cleanupLeads.push({ id: lead.id, phone, email });

  const { data: conf } = await supabase.from("event_confirmations").insert({
    event_id: "5ca65576-19de-4ad0-b3a9-19175e21761e",
    name: "Notif Test Fail", email, phone_raw: phone, phone_normalized: phone,
    source: "whatsapp_bot", payment_status: "pending",
  }).select().single();

  const { notifyLeadPaymentConfirmed } = await import(
    "../src/lib/payments/notify-lead-payment-confirmed.ts"
  );
  await notifyLeadPaymentConfirmed({
    confirmationId: conf.id,
    eventId: "5ca65576-19de-4ad0-b3a9-19175e21761e",
    amountTotalMXN: 1000,
    logSource: "test-fail",
  });

  await new Promise((r) => setTimeout(r, 2000));

  // Assert: 1 entry en lead_whatsapp_log con new_status=no_contactado.
  const { data: waLog } = await supabase
    .from("lead_whatsapp_log")
    .select("id, new_status, metadata")
    .eq("lead_id", lead.id)
    .eq("new_status", "no_contactado")
    .order("created_at", { ascending: false })
    .limit(1);
  assert.ok(
    waLog && waLog.length > 0,
    `debe haber 1 entry con new_status=no_contactado cuando el provider falla (hay ${waLog?.length ?? 0})`
  );
  const log = waLog[0];
  assert.strictEqual(
    log.metadata?.providerResult,
    "fail",
    `metadata.providerResult debe ser "fail"`
  );
  assert.ok(
    log.metadata?.providerNote?.includes("Invalid parameter"),
    `metadata.providerNote debe incluir el error de Meta (es "${log.metadata?.providerNote}")`
  );
});

test("notifyLeadPaymentConfirmed: lead YA contactado + result.ok=true → loggea el outbound (caso real David)", async () => {
  // Este es el caso EXACTO de David: el lead ya estaba contactado por
  // el inbound "Hola" previo, y ahora el webhook de Stripe confirma el
  // pago. El helper debe loggear el outbound del pago aunque el status
  // no cambie (sino el admin nunca lo ve).
  //
  // BUG 24 en codigo viejo: como markWhatsAppStatus tenia early-return
  // para prev===new, el outbound quedaba invisible. FIX: INSERT directo
  // en lead_whatsapp_log (no depender de markWhatsAppStatus).
  mockShouldFail = false;
  const ts = Date.now();
  const phone = `+5255999${String(700 + (ts % 100)).padStart(4, "0")}`;
  const email = `notif-test-already-contacted-${ts}@example.com`;

  const { data: lead } = await supabase.from("leads").insert({
    phone, phone_normalized: phone,
    name: "Notif Test Already Contacted",
    email: `pending-${ts}@example.com`,
    source: "whatsapp", status: "new", consent_to_contact: true,
    whatsapp_status: "contactado", // caso real: lead YA contactado
  }).select().single();
  cleanupLeads.push({ id: lead.id, phone, email });

  const { data: conf } = await supabase.from("event_confirmations").insert({
    event_id: "5ca65576-19de-4ad0-b3a9-19175e21761e",
    name: "Notif Test Already Contacted", email, phone_raw: phone, phone_normalized: phone,
    source: "whatsapp_bot", payment_status: "pending",
  }).select().single();

  const { notifyLeadPaymentConfirmed } = await import(
    "../src/lib/payments/notify-lead-payment-confirmed.ts"
  );
  await notifyLeadPaymentConfirmed({
    confirmationId: conf.id,
    eventId: "5ca65576-19de-4ad0-b3a9-19175e21761e",
    amountTotalMXN: 1000,
    logSource: "test-already-contacted",
  });

  await new Promise((r) => setTimeout(r, 2000));

  // Assert: 1 entry en lead_whatsapp_log con new_status=contactado
  // Y source=payment-notify. Esto prueba que el outbound del pago
  // SI se loggea aunque el status no cambie.
  const { data: waLog } = await supabase
    .from("lead_whatsapp_log")
    .select("id, prev_status, new_status, metadata, actor_email")
    .eq("lead_id", lead.id)
    .eq("new_status", "contactado")
    .eq("actor_email", "test-already-contacted@qlick.digital")
    .order("created_at", { ascending: false })
    .limit(1);
  assert.ok(
    waLog && waLog.length > 0,
    `debe haber 1 entry con source=payment-notify aunque el status no cambie (hay ${waLog?.length ?? 0})`
  );
  const log = waLog[0];
  assert.strictEqual(
    log.prev_status,
    "contactado",
    `prev_status debe ser "contactado" (es "${log.prev_status}")`
  );
  assert.strictEqual(
    log.new_status,
    "contactado",
    `new_status debe ser "contactado" (es "${log.new_status}")`
  );
  assert.strictEqual(
    log.metadata?.providerResult,
    "ok",
    `metadata.providerResult debe ser "ok"`
  );
  assert.strictEqual(
    log.metadata?.confirmationId,
    conf.id,
    `metadata.confirmationId debe matchear`
  );
});
