// Setup E2E test: crea lead sintetico + confirmation + checkout URL
// para un test de Stripe con tarjeta 4242.
//
// Uso: node --env-file=.env.local scripts/setup-stripe-test.mjs
//
// Genera:
//   - Lead con email temporal (mailinator para que David vea inbox)
//   - Phone sintetico
//   - Event confirmation (source='manual')
//   - Checkout URL para que David pague con 4242 4242 4242 4242
//
// Output: tests/output/stripe-test-setup-<ts>.json con todos los IDs
// y URLs necesarias para tracking + cleanup.

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");

const envText = readFileSync(join(ROOT, ".env.local"), "utf-8");
const env = { ...process.env };
for (const l of envText.split(/\r?\n/)) {
  const t = l.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq === -1) continue;
  let v = t.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  env[t.slice(0, eq).trim()] = v;
}

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

// IDs y datos del test
const TEST_TAG = `stripe4242-${Date.now().toString(36)}`;
const TEST_EMAIL = `qlick-${TEST_TAG}@mailinator.com`;
const TEST_PHONE = "+525555555550";
const TEST_NAME = "Test E2E 4242";
const TEST_LEAD_NOTES = `Lead sintetico para test E2E Stripe 4242 (sprint event-payments 2026-07-16). Tag: ${TEST_TAG}. NO es un lead real.`;
const EVENT_ID = "b1afa259-4c99-44a5-87ba-4b29a52d9259";

// 1. Buscar el evento activo para precio y datos.
console.log("[SETUP-4242] Buscando evento activo...");
const { data: evt, error: evtErr } = await sb
  .from("events")
  .select("id, slug, title, price_mxn, starts_at, status")
  .eq("id", EVENT_ID)
  .maybeSingle();
if (evtErr) throw evtErr;
if (!evt) {
  console.error("[SETUP-4242] Evento no encontrado:", EVENT_ID);
  process.exit(1);
}
console.log(`[SETUP-4242] Evento: ${evt.title} (slug=${evt.slug}, $${evt.price_mxn} MXN)`);
console.log(`[SETUP-4242] Status: ${evt.status}, starts_at: ${evt.starts_at}`);

// 2. Crear el lead.
console.log(`\n[SETUP-4242] Creando lead: ${TEST_EMAIL} (${TEST_PHONE})`);
const leadPayload = {
  name: TEST_NAME,
  email: TEST_EMAIL,
  phone: TEST_PHONE,
  phone_normalized: TEST_PHONE,
  source: "synthetic_lab",
  status: "new",
  tags: [TEST_TAG, "test_e2e_stripe_4242"],
  message: TEST_LEAD_NOTES,
};
const { data: lead, error: leadErr } = await sb
  .from("leads")
  .insert(leadPayload)
  .select("id, name, email, phone_normalized")
  .single();
if (leadErr) throw leadErr;
console.log(`[SETUP-4242] Lead creado: ${lead.id}`);

// 3. Crear event_confirmation.
console.log(`\n[SETUP-4242] Creando event_confirmation...`);
const confPayload = {
  event_id: EVENT_ID,
  name: TEST_NAME,
  email: TEST_EMAIL,
  phone_raw: TEST_PHONE,
  phone_normalized: TEST_PHONE,
  source: "manual",
  payment_status: "pending",
  confirmed_at: new Date().toISOString(),
};
const { data: conf, error: confErr } = await sb
  .from("event_confirmations")
  .insert(confPayload)
  .select("id, event_id, name, email, phone_normalized, source, payment_status")
  .single();
if (confErr) throw confErr;
console.log(`[SETUP-4242] Confirmation creada: ${conf.id}`);

// 4. Construir checkout URL.
const baseUrl = env.NEXT_PUBLIC_APP_URL || "https://www.qlick.digital";
const checkoutUrl = `${baseUrl}/pagar/evento/${evt.slug}?confirmation=${conf.id}`;
console.log(`\n[SETUP-4242] CHECKOUT URL:`);
console.log(`  ${checkoutUrl}`);

// 5. Output a JSON.
const outputDir = join(ROOT, "tests", "output");
if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
const outputPath = join(outputDir, `stripe-test-setup-${Date.now()}.json`);
const output = {
  test_tag: TEST_TAG,
  test_email: TEST_EMAIL,
  test_phone: TEST_PHONE,
  test_name: TEST_NAME,
  lead_id: lead.id,
  confirmation_id: conf.id,
  event_id: evt.id,
  event_title: evt.title,
  event_slug: evt.slug,
  event_price_mxn: evt.price_mxn,
  checkout_url: checkoutUrl,
  app_url: baseUrl,
  created_at: new Date().toISOString(),
  cleanup: {
    lead_id: lead.id,
    confirmation_id: conf.id,
    notes: "Borrar lead + confirmation + event_payments + event_access + event_qr_tokens + lead_whatsapp_conversations del tag",
  },
  instructions: {
    step1: "Abre la checkout URL en el browser",
    step2: "Llena los datos de tarjeta: 4242 4242 4242 4242, exp 12/30, CVC 123, nombre cualquiera",
    step3: "Confirma el cargo en Stripe",
    step4: "Revisa el email de QR en: https://www.mailinator.com/v4/public/inboxes.jsp?test=" + TEST_TAG,
    step5: "Avisame cuando termines para que verifique end-to-end y haga cleanup",
  },
};
writeFileSync(outputPath, JSON.stringify(output, null, 2));
console.log(`\n[SETUP-4242] Output: ${outputPath}`);
console.log(`\n[SETUP-4242] Mailinator inbox:`);
console.log(`  https://www.mailinator.com/v4/public/inboxes.jsp?test=${TEST_TAG.split("-")[1]}`);
console.log(`  (busca: ${TEST_EMAIL})`);
