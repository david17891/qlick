// Crea la event_confirmation de David (como si el bot lo hubiera hecho en
// interactive_event_inscribir) y construye el checkoutUrl con el formato
// exacto que el bot manda por WhatsApp.
//
// NO drena DeepSeek. Replica la lógica de bot-engine.ts:6308-6395 + 6398-6399.
//
// Output: imprime el link y lo guarda en tests/output/checkout-url-david.json

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const text = readFileSync(path, "utf-8");
  const out = {};
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
    out[key] = value;
  }
  return out;
}

const env = { ...parseEnvFile(join(ROOT, ".env.local")), ...process.env };
const sb = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SECRET_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const DAVID_PHONE = "+526532935492";
const DAVID_LEAD_ID = "92739b21-05cf-4421-842b-6b50ea71f2d9";
const DAVID_NAME = "David Martinez";
const DAVID_EMAIL = "david17891@gmail.com";
const EVENT_ID = "b1afa259-4c99-44a5-87ba-4b29a52d9259";
const EVENT_SLUG = "marketing-ia-para-emprendedores-pago";

// baseUrl: el bot usa appBaseUrl() que lee NEXT_PUBLIC_APP_URL.
// En prod es https://qlick.digital.
const BASE_URL = env.NEXT_PUBLIC_APP_URL || "https://qlick.digital";

console.log(`[BUILD-CHECKOUT] David=${DAVID_PHONE} lead=${DAVID_LEAD_ID}`);
console.log(`[BUILD-CHECKOUT] Event=${EVENT_ID} slug=${EVENT_SLUG}`);
console.log(`[BUILD-CHECKOUT] baseUrl=${BASE_URL}`);

// 1. Buscar confirmation existente (idempotencia)
const { data: existing, error: existErr } = await sb
  .from("event_confirmations")
  .select("id, event_id, payment_status")
  .eq("event_id", EVENT_ID)
  .eq("phone_normalized", DAVID_PHONE)
  .maybeSingle();

if (existErr) {
  console.error("error buscando confirmation:", existErr);
  process.exit(1);
}

let confirmationId;
if (existing) {
  console.log(`[BUILD-CHECKOUT] ✓ Confirmation existente: ${existing.id}`);
  console.log(`  payment_status=${existing.payment_status}`);
  confirmationId = existing.id;
  // Si no está pending, forzar pending
  if (existing.payment_status !== "pending") {
    const { error: updErr } = await sb
      .from("event_confirmations")
      .update({ payment_status: "pending" })
      .eq("id", existing.id);
    if (updErr) {
      console.log(`  ✗ update error: ${updErr.message}`);
    } else {
      console.log(`  ✓ payment_status → pending`);
    }
  }
} else {
  // Crear nueva confirmation (idempotente via UNIQUE event_id+phone_normalized)
  console.log(`[BUILD-CHECKOUT] Creando confirmation nueva...`);
  const { data: created, error: insErr } = await sb
    .from("event_confirmations")
    .insert({
      event_id: EVENT_ID,
      name: DAVID_NAME,
      email: DAVID_EMAIL,
      phone_normalized: DAVID_PHONE,
      payment_status: "pending",
      source: "manual",
    })
    .select("id")
    .single();
  if (insErr) {
    console.error(`  ✗ insert error: ${insErr.message}`);
    process.exit(1);
  }
  confirmationId = created.id;
  console.log(`  ✓ Creada: ${confirmationId}`);
}

// 2. Construir checkoutUrl con el formato del bot
//    bot-engine.ts:6399: `${baseUrl}/pagar/evento/${targetSlug}?confirmation=${confirmationId}`
const checkoutUrl = `${BASE_URL}/pagar/evento/${EVENT_SLUG}?confirmation=${confirmationId}`;
console.log(`\n[BUILD-CHECKOUT] ========================================`);
console.log(`[BUILD-CHECKOUT] CHECKOUT URL:`);
console.log(`[BUILD-CHECKOUT] ${checkoutUrl}`);
console.log(`[BUILD-CHECKOUT] ========================================`);

// 3. También crear el texto del body que mandaría el bot
//    bot-engine.ts:6402-6406
const clean = "David";
const eventTitle = "Marketing + IA para Emprendedores (Copia - Pago)";
const priceDisplay = "$1000 MXN";
const eventCodeLabel = ""; // No hay event code
const bodyText =
  `¡Listo ${clean}! Tu lugar para *${eventTitle}*${eventCodeLabel} (${priceDisplay}) está apartado.\n\n` +
  `Para confirmar tu lugar, completa el pago aquí:\n${checkoutUrl}\n\n` +
  `Aceptamos tarjeta, OXXO, SPEI y transferencia. Si pagas en ` +
  `efectivo en puerta, avísanos y lo registramos a mano.`;

console.log(`\n[BUILD-CHECKOUT] ========================================`);
console.log(`[BUILD-CHECKOUT] BODY DEL BOT (lo que vería David):`);
console.log(`[BUILD-CHECKOUT] ========================================`);
console.log(bodyText);

// 4. Output JSON
const outputDir = join(__dirname, "..", "tests", "output");
if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
const outputPath = join(outputDir, `checkout-url-david-${Date.now()}.json`);
writeFileSync(
  outputPath,
  JSON.stringify(
    {
      timestamp: new Date().toISOString(),
      confirmationId,
      eventId: EVENT_ID,
      eventSlug: EVENT_SLUG,
      eventTitle,
      priceMXN: 1000,
      baseUrl: BASE_URL,
      checkoutUrl,
      bodyText,
    },
    null,
    2
  ),
  "utf-8"
);
console.log(`\n[BUILD-CHECKOUT] Output JSON en: ${outputPath}`);
