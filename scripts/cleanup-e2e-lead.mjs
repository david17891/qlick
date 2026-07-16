// Cleanup del lead de E2E. Borra:
//   - leads
//   - event_confirmations (cascade a event_attendees, event_payments, event_access)
//   - event_qr_tokens
//   - lead_profile
//   - lead_consent_log
//   - lead_whatsapp_conversations
//
// Uso:
//   node --env-file=.env.local scripts/cleanup-e2e-lead.mjs [phone]
//
// Default: borra leads con phone_normalized = "+529999999001".

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
const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SECRET_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const PHONE = process.argv[2] || "+529999999001";
const NAME = process.argv[3] || "E2E Test";

console.log(`[CLEANUP] phone = ${PHONE}, name = ${NAME}`);

const { data: leads } = await supabase
  .from("leads")
  .select("id, name")
  .eq("phone_normalized", PHONE)
  .eq("name", NAME);

if (!leads || leads.length === 0) {
  console.log("[CLEANUP] No hay leads matching. Nada que borrar.");
  process.exit(0);
}

for (const lead of leads) {
  console.log(`[CLEANUP] Borrando lead ${lead.id} (${lead.name})...`);
  // Borrar en orden inverso a las FK
  await supabase.from("lead_whatsapp_conversations").delete().eq("lead_id", lead.id);
  await supabase.from("lead_consent_log").delete().eq("lead_id", lead.id);
  await supabase.from("lead_profile").delete().eq("lead_id", lead.id);
  await supabase.from("event_qr_tokens").delete().eq("attendee_phone_normalized", PHONE);
  await supabase.from("event_confirmations").delete().eq("phone_normalized", PHONE);
  await supabase.from("event_attendees").delete().eq("phone_normalized", PHONE);
  // event_payments se borra por FK cascade desde event_confirmations
  // event_access tiene confirmation_id nullable, no se borra por cascade
  await supabase.from("event_access").delete().or(`confirmation_id.in.(select id from event_confirmations where phone_normalized='${PHONE}')`);
  // Finalmente el lead
  const { error } = await supabase.from("leads").delete().eq("id", lead.id);
  if (error) {
    console.error(`[CLEANUP] Error borrando lead ${lead.id}: ${error.message}`);
  } else {
    console.log(`[CLEANUP] ✓ Lead ${lead.id} borrado.`);
  }
}
console.log("[CLEANUP] Done.");
