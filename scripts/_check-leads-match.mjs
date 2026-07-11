// scripts/_check-leads-match.mjs
// Quick diagnostic: do the 11 confirmed phones have matching lead rows?
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = {};
for (const raw of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = raw.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  let v = m[2];
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  env[m[1]] = v;
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const phones = [
  "+526863176806","+526861187731","+526531047962","+6861891146","+526531073900",
  "+526861096680","+526863504208","+526863065382","+526863957155","+526861101200","+526676472114"
];

// 1) Match by phone_normalized
const { data: leads, error: e1 } = await sb.from("leads")
  .select("id, name, email, phone, phone_normalized, status, source, created_at")
  .in("phone_normalized", phones);
console.log("=== leads matched by phone_normalized ===");
console.log("count:", leads?.length, "err:", e1?.message);
console.log(JSON.stringify(leads, null, 2));

// 2) Same phones, check lead_event_links
const { data: links, error: e2 } = await sb.from("lead_event_links")
  .select("id, lead_id, event_id, link_type, link_id, created_at")
  .eq("event_id", "eeb2070e-9b64-4715-a684-b3c308e9d0b2");
console.log("\n=== lead_event_links for this event ===");
console.log("count:", links?.length, "err:", e2?.message);
console.log(JSON.stringify(links, null, 2));

// 3) Match by email
const emails = [
  "mireya.escamilla@uabc.edu.mx","paulvelasquez2017@gmail.com","terangabriela467@gmail.com",
  "sitlalic.guzman@uabc.edu.mx","avril_carter769@hotmail.com","yesy087@hotmail.com",
  "danielglezcald@gmail.com","jandamejia.88@gmail.com","refa.online@hotmai.com",
  "maritrianabaeza@outlook.com","jesusantoniocamachoarmenta@gmail.com"
];
const { data: leadsByEmail, error: e3 } = await sb.from("leads")
  .select("id, name, email, phone_normalized, status, source")
  .in("email", emails);
console.log("\n=== leads matched by email ===");
console.log("count:", leadsByEmail?.length, "err:", e3?.message);
console.log(JSON.stringify(leadsByEmail, null, 2));
