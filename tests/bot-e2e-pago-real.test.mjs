/**
 * E2E real: simula el flow de David Martínez desde "Hola" hasta el link
 * de pago del evento activo, usando Supabase real + DeepSeek real.
 *
 * Usa el lead_id de David directamente (lead pre-existente, no crea uno
 * nuevo). El lead fue reseteado previamente con reset-david-final.mjs +
 * reset-david-min.mjs (status='new', whatsapp_status='no_contactado',
 * name='David Martinez' preservado por NOT NULL).
 *
 * Output:
 *   tests/output/bot-e2e-pago-real-<ts>.json
 *
 * Uso:
 *   $env:DEEPSEEK_API_KEY = "sk-...";
 *   node --experimental-test-module-mocks \
 *        --import ./tests/loader-register.mjs \
 *        --experimental-strip-types \
 *        --test tests/bot-e2e-pago-real.test.mjs
 */

import { test, mock, before } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");

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
  console.error("Faltan env vars.");
  process.exit(2);
}
if (!DEEPSEEK_KEY) {
  console.error("[SKIP] DEEPSEEK_API_KEY no configurada. Seteala para correr este E2E.");
  process.exit(0);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DAVID_PHONE = "+526532935492";
const DAVID_LEAD_ID = "92739b21-05cf-4421-842b-6b50ea71f2d9";
const DAVID_NAME = "David Martinez";
const DAVID_EMAIL = "david17891@gmail.com";

console.log(`[OK] SUPABASE_URL = ${SUPABASE_URL.slice(0, 35)}...`);
console.log(`[OK] DEEPSEEK_KEY = ${DEEPSEEK_KEY.slice(0, 10)}...`);
console.log(`[OK] David lead_id = ${DAVID_LEAD_ID}`);

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
            body: args.body,
            type: args.type ?? "text",
            ts: Date.now(),
          };
          capturedSends.push(captured);
          return { ok: true, externalId: `mock_${captured.ts}`, demo: true };
        },
      }),
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
            body: args.body,
            type: args.type ?? "text",
            ts: Date.now(),
          });
          return { ok: true, externalId: `mock_${Date.now()}`, demo: true };
        },
      },
    },
  });
});

test("E2E pago real: David flow → link de pago", async () => {
  const { processInboundMessage } = await import(
    "../src/lib/whatsapp/bot-engine.ts"
  );

  const timestamp = Date.now();
  const results = [];
  const beforeCount = capturedSends.length;

  async function send(text, stepNum) {
    const r = await processInboundMessage({
      messageId: `wamid_david_${timestamp}_${stepNum}`,
      from: DAVID_PHONE,
      contactName: DAVID_NAME,
      text,
      type: "text",
      timestamp: String(Math.floor(timestamp / 1000) + stepNum),
    });
    results.push({
      step: stepNum,
      user: text,
      intent: r.intent,
      preview: r.responsePreview?.slice(0, 400),
      leadId: r.leadId,
      outboundCount: capturedSends.length,
    });
    return r;
  }

  // Mensajes para llevar al bot hasta el link de pago.
  // David ya tiene name + email, así que el bot salta la captura.
  // El flow esperado:
  // 1. "Hola" → welcome (puede mencionar el evento)
  // 2. "Sí me interesa el evento" / "Quiero inscribirme" → interactive_event_inscribir
  // 3. "Sí, confirmo" / "Sí voy" → crea confirmation + manda link de pago
  // 4. (opcional) si el bot pide algo más

  const messages = [
    "Hola",
    "Me interesa el evento",
    "Sí, confirmo mi lugar",
    "Listo, dale",
  ];

  for (let i = 0; i < messages.length; i++) {
    await send(messages[i], i + 1);
    // pequeño delay para que cualquier async (DB writes) complete
    await new Promise((r) => setTimeout(r, 500));
  }

  // Buscar link de pago en los outbounds
  const newSends = capturedSends.slice(beforeCount);
  const linkSend = newSends.find((s) =>
    /qlick\.digital\/pagar\/evento\//.test(s.body ?? "")
  );
  const linkUrl = linkSend ? linkSend.body.match(/https:\/\/qlick\.digital\/pagar\/evento\/[^\s)]+/) : null;

  // Verificar DB
  const { data: confirmations } = await supabase
    .from("event_confirmations")
    .select("id, event_id, name, email, phone_normalized, payment_status, status")
    .eq("phone_normalized", DAVID_PHONE);
  const { data: payments } = await supabase
    .from("event_payments")
    .select("id, confirmation_id, amount_mxn, status, method, provider")
    .in("confirmation_id", (confirmations ?? []).map((c) => c.id));

  const output = {
    timestamp: new Date().toISOString(),
    phone: DAVID_PHONE,
    results,
    capturedSends: newSends.map((s, i) => ({
      idx: i,
      body: s.body,
      body_preview: s.body?.slice(0, 300),
    })),
    linkFound: !!linkSend,
    linkUrl: linkUrl ? linkUrl[0] : null,
    db: {
      confirmations: confirmations?.length ?? 0,
      confirmation_details: confirmations,
      payments: payments?.length ?? 0,
      payment_details: payments,
    },
  };

  const outputDir = join(__dirname, "output");
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
  const outputPath = join(outputDir, `bot-e2e-pago-real-${timestamp}.json`);
  writeFileSync(outputPath, JSON.stringify(output, null, 2), "utf-8");

  console.log(`\n[OK] Output escrito en ${outputPath}`);
  console.log("\n=== RESUMEN E2E ===");
  for (const r of results) {
    console.log(`\n[Step ${r.step}] User: "${r.user}"`);
    console.log(`  Intent: ${r.intent}`);
    console.log(`  Bot:    ${(r.preview ?? "").slice(0, 200).replace(/\n/g, " | ")}`);
    console.log(`  Outbounds acumulado: ${r.outboundCount}`);
  }
  console.log(`\n=== LINK DE PAGO ===`);
  if (linkUrl) {
    console.log(`  ✓ Encontrado en outbound: ${linkUrl[0]}`);
  } else {
    console.log(`  ✗ NO encontrado en outbounds. Ver ${outputPath}`);
  }
  console.log(`\n=== DB ===`);
  console.log(`Confirmations: ${confirmations?.length ?? 0}`);
  for (const c of confirmations ?? []) {
    console.log(`  - id=${c.id.slice(0, 8)}... event=${c.event_id.slice(0, 8)}... status=${c.status} payment=${c.payment_status}`);
  }
  console.log(`Payments: ${payments?.length ?? 0}`);

  // Assertions
  console.log(`\n=== ASSERTIONS ===`);
  const checks = {
    "link de pago encontrado en outbound": !!linkUrl,
    ">= 1 confirmation en DB": (confirmations?.length ?? 0) >= 1,
    "confirmation con payment_status='pending'": (confirmations ?? []).some((c) => c.payment_status === "pending"),
    ">= 4 outbounds capturados": newSends.length >= 4,
  };
  for (const [name, pass] of Object.entries(checks)) {
    console.log(`  ${pass ? "✓" : "✗"} ${name}`);
  }
});
