// Reset completo del lead de David para prueba de pago real (test mode).
// Usa el helper resetLeadContext (testeable, no requiere Next.js).
//
// Limpia:
//   1. leads.name/email/status/whatsapp_status
//   2. Wizard state del último outbound
//   3. lead_profile.summary
//   4. event_qr_tokens
//   5. event_confirmations
//   6. event_payments (FK antes de confirmations)
//   7. event_access
//
// NO borra: el row del lead, lead_whatsapp_conversations.
//
// Uso:
//   node --env-file=.env.local scripts/reset-david-lead.mjs [phone]
//   Default: +526532935492 (David Martinez, el admin)

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import { promisify } from "node:util";

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

const env = {
  ...parseEnvFile(join(ROOT, ".env.local")),
  ...process.env,
};

const PHONE = process.argv[2] || "+526532935492";
const ADMIN_EMAIL = env.ADMIN_EMAIL_ALLOWLIST?.split(",")[0] || "david17891@gmail.com";

console.log(`[RESET-DAVID] phone = ${PHONE}, admin = ${ADMIN_EMAIL}`);

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SECRET_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// 1. Buscar el lead por phone_normalized
const { data: leads, error: leadErr } = await supabase
  .from("leads")
  .select("id, name, email, phone_normalized")
  .eq("phone_normalized", PHONE);

if (leadErr) {
  console.error(`[RESET-DAVID] Error buscando lead:`, leadErr);
  process.exit(1);
}

if (!leads || leads.length === 0) {
  console.log(`[RESET-DAVID] No hay lead con phone_normalized = ${PHONE}. Nada que limpiar.`);
  process.exit(0);
}

const lead = leads[0];
console.log(`[RESET-DAVID] Lead encontrado: id=${lead.id}, name="${lead.name}", email="${lead.email}"`);

// 2. Limpiar en orden FK
// a) event_payments (FK → event_confirmations)
const { data: confirmations } = await supabase
  .from("event_confirmations")
  .select("id")
  .eq("phone_normalized", PHONE);

const confIds = (confirmations ?? []).map((c) => c.id);
console.log(`[RESET-DAVID] ${confIds.length} confirmations encontradas.`);

if (confIds.length > 0) {
  const { data: delPay, error: payErr } = await supabase
    .from("event_payments")
    .delete()
    .in("confirmation_id", confIds)
    .select("id");
  console.log(`[RESET-DAVID] event_payments borrados: ${delPay?.length ?? 0}${payErr ? ` (err: ${payErr.message})` : ""}`);
}

// b) event_access (por lead_id)
const { data: delAccess, error: accessErr } = await supabase
  .from("event_access")
  .delete()
  .eq("lead_id", lead.id)
  .select("id");
console.log(`[RESET-DAVID] event_access borrados: ${delAccess?.length ?? 0}${accessErr ? ` (err: ${accessErr.message})` : ""}`);

// c) event_confirmations
if (confIds.length > 0) {
  const { data: delConf, error: confErr } = await supabase
    .from("event_confirmations")
    .delete()
    .in("id", confIds)
    .select("id");
  console.log(`[RESET-DAVID] event_confirmations borradas: ${delConf?.length ?? 0}${confErr ? ` (err: ${confErr.message})` : ""}`);
}

// d) event_qr_tokens
const { data: delQr, error: qrErr } = await supabase
  .from("event_qr_tokens")
  .delete()
  .eq("attendee_phone_normalized", PHONE)
  .select("id");
console.log(`[RESET-DAVID] event_qr_tokens borrados: ${delQr?.length ?? 0}${qrErr ? ` (err: ${qrErr.message})` : ""}`);

// e) leads.name/email/status
const { error: leadUpdErr } = await supabase
  .from("leads")
  .update({
    name: null,
    email: null,
    status: "nuevo",
    whatsapp_status: "nuevo",
  })
  .eq("id", lead.id);
console.log(`[RESET-DAVID] leads reset a estado inicial: ${leadUpdErr ? `ERROR: ${leadUpdErr.message}` : "OK"}`);

// f) lead_profile
const { error: profileErr } = await supabase
  .from("lead_profile")
  .delete()
  .eq("lead_id", lead.id);
console.log(`[RESET-DAVID] lead_profile borrado: ${profileErr ? `ERROR: ${profileErr.message}` : "OK"}`);

// g) wizard state del último outbound (awaiting_*)
const { data: delOutbounds, error: outErr } = await supabase
  .from("lead_whatsapp_outbounds")
  .update({
    awaiting_survey_step: null,
    awaiting_field: null,
    awaiting_event_slug: null,
    awaiting_event_price: null,
    awaiting_confirmation_for_event_slug: null,
    pending_event_slug: null,
    pending_event_price: null,
  })
  .eq("lead_id", lead.id)
  .select("id");
console.log(`[RESET-DAVID] outbounds reseteados: ${delOutbounds?.length ?? 0}${outErr ? ` (err: ${outErr.message})` : ""}`);

console.log(`[RESET-DAVID] ✓ Reset completo. Lead listo para conversación limpia.`);
console.log(`[RESET-DAVID] Siguiente paso: node --experimental-test-module-mocks --import ./tests/loader-register.mjs --experimental-strip-types --test tests/bot-e2e-pago-real.test.mjs`);
process.exit(0);
