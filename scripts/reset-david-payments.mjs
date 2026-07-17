// Reset quirúrgico para re-prueba de pago:
// Borra event_payments, event_access, event_confirmations, event_qr_tokens
// de David. Deja el lead intacto (name+email preserved, NOT NULL).
//
// Uso: node --env-file=.env.local scripts/reset-david-payments.mjs

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

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
const DAVID_USER_ID = "095a134c-252e-4375-9200-aff58aefa5b3";
const DAVID_LEAD_ID = "92739b21-05cf-4421-842b-6b50ea71f2d9";

console.log(`[RESET-PAYMENTS] phone=${DAVID_PHONE} user=${DAVID_USER_ID}`);

// 1. Buscar confirmations de David
const { data: confs } = await sb
  .from("event_confirmations")
  .select("id, event_id")
  .eq("phone_normalized", DAVID_PHONE);
console.log(`  confirmations: ${confs?.length ?? 0}`);
const confIds = (confs ?? []).map((c) => c.id);

// 2. Borrar event_payments por confirmation_id
if (confIds.length > 0) {
  const { data: delPay } = await sb
    .from("event_payments")
    .delete()
    .in("confirmation_id", confIds)
    .select("id");
  console.log(`  ✓ event_payments borrados: ${delPay?.length ?? 0}`);
}

// 3. Borrar event_access por user_id O confirmation_id
const { data: delAcc } = await sb
  .from("event_access")
  .delete()
  .or(`user_id.eq.${DAVID_USER_ID},confirmation_id.in.(${confIds.join(",")})`)
  .select("id");
console.log(`  ✓ event_access borrados: ${delAcc?.length ?? 0}`);

// 4. Borrar event_confirmations
if (confIds.length > 0) {
  const { data: delConf } = await sb
    .from("event_confirmations")
    .delete()
    .in("id", confIds)
    .select("id");
  console.log(`  ✓ event_confirmations borradas: ${delConf?.length ?? 0}`);
}

// 5. Borrar event_qr_tokens por attendee_phone_normalized
const { data: delQr } = await sb
  .from("event_qr_tokens")
  .delete()
  .eq("attendee_phone_normalized", DAVID_PHONE)
  .select("id");
console.log(`  ✓ event_qr_tokens borrados: ${delQr?.length ?? 0}`);

// 6. Reset wizard state en últimos outbounds
const { data: delOut } = await sb
  .from("lead_whatsapp_conversations")
  .update({
    awaiting_survey_step: null,
    awaiting_field: null,
    awaiting_event_slug: null,
    awaiting_event_price: null,
    awaiting_confirmation_for_event_slug: null,
    pending_event_slug: null,
    pending_event_price: null,
  })
  .eq("lead_id", DAVID_LEAD_ID)
  .select("id");
console.log(`  ✓ wizard state reseteado en ${delOut?.length ?? 0} outbounds`);

console.log(`\n[RESET-PAYMENTS] ✓ Listo. Lead intacto.`);
console.log(`[RESET-PAYMENTS] Siguiente: node --env-file=.env.local scripts/build-checkout-url-david.mjs`);
