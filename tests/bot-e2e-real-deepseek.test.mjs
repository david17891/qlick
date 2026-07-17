/**
 * E2E real del bot-engine con Supabase real + DeepSeek real.
 * Mockeamos solo el envio de WhatsApp.
 *
 * Carga .env.local manualmente (sin depender de --env-file) y mockea
 * el provider via el loader de tests. Asi funciona bien con
 * --experimental-test-module-mocks.
 *
 * Uso:
 *   $env:DEEPSEEK_API_KEY = "sk-...";
 *   node --experimental-test-module-mocks \
 *        --import ./tests/loader-register.mjs \
 *        --experimental-strip-types \
 *        --test tests/bot-e2e-real-deepseek.test.mjs
 *
 * Output: tests/output/bot-e2e-<timestamp>.json
 */

import { test, mock, before } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");

// ────────────────────────────────────────────────────────────
// Cargar .env.local manualmente y popular process.env ANTES de
// cualquier import del codigo de la app.
// ────────────────────────────────────────────────────────────
function loadEnvLocal() {
  const envPath = join(ROOT, ".env.local");
  if (!existsSync(envPath)) {
    console.warn(`[WARN] .env.local no encontrado en ${envPath}`);
    return;
  }
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
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
loadEnvLocal();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SECRET_KEY;
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("Faltan env vars (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY).");
  process.exit(2);
}
if (!DEEPSEEK_KEY) {
  console.error("[SKIP] DEEPSEEK_API_KEY no configurada. Seteala en env var para correr E2E.");
  process.exit(0);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log(`[OK] SUPABASE_URL = ${SUPABASE_URL.slice(0, 35)}...`);
console.log(`[OK] DEEPSEEK_KEY = ${DEEPSEEK_KEY.slice(0, 10)}...`);

// ────────────────────────────────────────────────────────────
// Mock del provider de WhatsApp
// ────────────────────────────────────────────────────────────
const capturedSends = [];
before(() => {
  mock.module("../src/lib/whatsapp/index.ts", {
    namedExports: {
      getActiveWhatsAppProvider: () => ({
        name: "mock_meta",
        displayName: "Mock Meta (E2E test)",
        active: true,
        stub: true,
        send: async (args) => {
          const captured = {
            to: args.to,
            body: args.body?.slice(0, 300),
            type: args.type ?? "text",
            ts: Date.now(),
          };
          capturedSends.push(captured);
          return { ok: true, externalId: `mock_${captured.ts}`, demo: true };
        },
      }),
      // Re-export para no romper imports
      REGISTRY: {},
    },
  });
  mock.module("../src/lib/whatsapp/providers/meta-cloud-api-provider.ts", {
    namedExports: {
      metaCloudApiProvider: {
        name: "mock_meta",
        displayName: "Mock Meta (E2E test)",
        active: true,
        stub: true,
        send: async (args) => {
          capturedSends.push({
            to: args.to,
            body: args.body?.slice(0, 300),
            type: args.type ?? "text",
            ts: Date.now(),
          });
          return { ok: true, externalId: `mock_${Date.now()}`, demo: true };
        },
      },
    },
  });
});

test("E2E real: welcome + inscribirme + captura + pregunta LLM", async () => {
  const { processInboundMessage } = await import(
    "../src/lib/whatsapp/bot-engine.ts"
  );

  const TEST_PHONE = "+529999999001";
  const TEST_NAME = "E2E Test";
  const timestamp = Date.now();
  const results = [];

  // Helper para mandar mensaje
  async function send(text, stepNum) {
    const r = await processInboundMessage({
      messageId: `wamid_e2e_${timestamp}_${stepNum}`,
      from: TEST_PHONE,
      contactName: TEST_NAME,
      text,
      type: "text",
      timestamp: String(Math.floor(timestamp / 1000) + stepNum),
    });
    results.push({
      step: stepNum,
      user: text,
      intent: r.intent,
      preview: r.responsePreview?.slice(0, 300),
      leadId: r.leadId,
      outboundCount: capturedSends.length,
    });
    return r;
  }

  // 5 mensajes
  await send("Hola", 1);
  await send("Quiero inscribirme", 2);
  await send("David E2E Test", 3);
  await send("e2e-test@example.com", 4);
  const r5 = await send("¿Cuánto cuesta?", 5);

  // Verificar DB
  const { data: lead } = await supabase
    .from("leads")
    .select("id, name, email, phone_normalized, status, whatsapp_status")
    .eq("phone_normalized", TEST_PHONE)
    .maybeSingle();
  const { data: confirmations } = await supabase
    .from("event_confirmations")
    .select("id, name, email, payment_status, event_id")
    .eq("phone_normalized", TEST_PHONE);
  const { data: qrTokens } = await supabase
    .from("event_qr_tokens")
    .select("id, attendee_name, attendee_email, checked_in_at")
    .eq("attendee_phone_normalized", TEST_PHONE);
  const { data: conversations } = await supabase
    .from("lead_whatsapp_conversations")
    .select("id, direction, body, intent")
    .eq("phone_normalized", TEST_PHONE)
    .order("created_at", { ascending: true });

  // Output JSON
  const output = {
    timestamp: new Date().toISOString(),
    phone: TEST_PHONE,
    results,
    capturedSends: capturedSends.map((s) => ({
      to: s.to,
      body_preview: s.body?.slice(0, 200),
    })),
    db: {
      lead,
      confirmations: confirmations?.length ?? 0,
      confirmation_details: confirmations,
      qr_tokens: qrTokens?.length ?? 0,
      qr_token_details: qrTokens,
      conversations: conversations?.length ?? 0,
      conversation_bodies: conversations?.map((c) => ({
        direction: c.direction,
        intent: c.intent,
        body: c.body?.slice(0, 150),
      })),
    },
  };

  const outputDir = join(__dirname, "output");
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
  const outputPath = join(outputDir, `bot-e2e-${timestamp}.json`);
  writeFileSync(outputPath, JSON.stringify(output, null, 2), "utf-8");

  console.log(`\n[OK] Output escrito en ${outputPath}`);
  console.log("\n=== RESUMEN E2E ===");
  for (const r of results) {
    console.log(`\n[Step ${r.step}] User: ${r.user}`);
    console.log(`  Intent: ${r.intent}`);
    console.log(`  Bot:    ${(r.preview ?? "").slice(0, 200).replace(/\n/g, " ")}...`);
    console.log(`  Outbound acumulado: ${r.outboundCount}`);
  }
  console.log(`\n=== DB ===`);
  console.log(`Lead: ${lead?.name ?? "NO CREADO"} <${lead?.email}>`);
  console.log(`Status: ${lead?.status} / whatsapp: ${lead?.whatsapp_status}`);
  console.log(`Confirmations: ${confirmations?.length ?? 0}`);
  console.log(`QR tokens: ${qrTokens?.length ?? 0}`);
  console.log(`Conversations: ${conversations?.length ?? 0}`);

  // Assertions
  console.log(`\n=== ASSERTIONS ===`);
  const checks = {
    "lead creado": lead !== null,
    "lead.name = David E2E Test": lead?.name === "David E2E Test",
    "lead.email = e2e-test@example.com": lead?.email === "e2e-test@example.com",
    ">= 1 confirmation": (confirmations?.length ?? 0) >= 1,
    ">= 1 qr_token": (qrTokens?.length ?? 0) >= 1,
    ">= 5 conversations": (conversations?.length ?? 0) >= 5,
    ">= 3 outbounds capturados": capturedSends.length >= 3,
    "r5 menciona MXN/precio/costo": /MXN|precio|costo|\\$/.test(r5.responsePreview ?? ""),
  };
  for (const [name, pass] of Object.entries(checks)) {
    console.log(`  ${pass ? "✓" : "✗"} ${name}`);
  }
  const allPass = Object.values(checks).every(Boolean);
  if (!allPass) {
    console.log(`\n[WARN] Alguna assertion fallo. Ver ${outputPath}`);
  }
});
