// scripts/_watcher-verify-confirmations.mjs
// Verificar de nuevo las confirmaciones con error handling explicito.

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";

const env = {};
if (existsSync(".env.local")) {
  for (const raw of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = raw.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[m[1]] = v;
  }
}

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const EVENT_ID = "eeb2070e-9b64-4715-a684-b3c308e9d0b2";

console.log("=== Confirmations for event 11 jul (exact like watcher) ===");
const { data: confirmRows, error: confirmErr, count } = await sb
  .from("event_confirmations")
  .select("id, name, email, phone_normalized, source, confirmed_at, import_batch_id, lead_id", { count: "exact" })
  .eq("event_id", EVENT_ID)
  .order("confirmed_at", { ascending: true });

console.log("ERROR:", confirmErr ? confirmErr.message : "none");
console.log("COUNT:", count);
console.log("ROWS:", confirmRows?.length);
if (confirmRows && confirmRows.length > 0) {
  console.log("DATA:", JSON.stringify(confirmRows, null, 2));
}

console.log("\n=== Lead_event_links sample (10) ===");
const { data: links, error: lerr } = await sb
  .from("lead_event_links")
  .select("id, lead_id, event_id, link_type, created_at")
  .limit(10);
console.log("ERROR:", lerr ? lerr.message : "none");
console.log("Sample rows:", links?.length);

console.log("\n=== lead_event_links count for this event ===");
const { count: lcnt, error: lcnterr } = await sb
  .from("lead_event_links")
  .select("id", { count: "exact", head: true })
  .eq("event_id", EVENT_ID);
console.log("ERROR:", lcnterr ? lcnterr.message : "none");
console.log("COUNT:", lcnt);

console.log("\n=== Check leads with phone matching Mireya/Paul ===");
const { data: leadsByPhone } = await sb
  .from("leads")
  .select("id, name, phone, phone_normalized, status, source, created_at")
  .in("phone_normalized", ["+526863176806", "+526861187731", "+526532935492"]);
console.log("LEADS:");
for (const l of leadsByPhone || []) console.log(" ", JSON.stringify(l));

console.log("\n=== Check if event_confirmations have a lead_id ===");
for (const c of confirmRows || []) {
  const { data: matchingLead } = await sb
    .from("leads")
    .select("id, name, phone_normalized")
    .eq("phone_normalized", c.phone_normalized)
    .maybeSingle();
  console.log(` Confirm ${c.name} (${c.phone_normalized}):`);
  console.log(`   lead_id field:`, c.lead_id);
  console.log(`   matched lead:`, matchingLead);
}