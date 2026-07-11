// Quick query to lead_whatsapp_conversations for last 4 hours.
// Run with: node --env-file=.env.local scripts/_probe-messages-4h.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE env");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

const FOUR_H_AGO = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
const NOW = new Date().toISOString();
console.log(`Window: ${FOUR_H_AGO} -> ${NOW}`);
console.log(`Local: ${new Date(FOUR_H_AGO).toLocaleString("en-US", { timeZone: "America/Phoenix" })} -> ${new Date(NOW).toLocaleString("en-US", { timeZone: "America/Phoenix" })}`);
console.log("---");

// Last 4h inbound (incoming from leads to bot)
const { data: inbound, error: e1 } = await supabase
  .from("lead_whatsapp_conversations")
  .select("id, phone_normalized, body, message_type, created_at, whatsapp_message_id, metadata")
  .eq("direction", "inbound")
  .gte("created_at", FOUR_H_AGO)
  .order("created_at", { ascending: false })
  .limit(50);
if (e1) console.error("inbound error", e1);
console.log(`\n=== INBOUND messages (last 4h) — ${inbound?.length ?? 0} rows ===`);
for (const r of inbound ?? []) {
  const localTime = new Date(r.created_at).toLocaleString("en-US", { timeZone: "America/Phoenix" });
  const body = (r.body ?? "").slice(0, 80);
  const phone = r.phone_normalized ?? "?";
  console.log(`[${localTime}] ${phone}  type=${r.message_type}  body="${body}"  wamid=${r.whatsapp_message_id}`);
}

// Last 4h outbound (bot to leads)
const { data: outbound, error: e2 } = await supabase
  .from("lead_whatsapp_conversations")
  .select("id, phone_normalized, body, message_type, created_at, whatsapp_message_id, metadata")
  .eq("direction", "outbound")
  .gte("created_at", FOUR_H_AGO)
  .order("created_at", { ascending: false })
  .limit(50);
if (e2) console.error("outbound error", e2);
console.log(`\n=== OUTBOUND messages (last 4h) — ${outbound?.length ?? 0} rows ===`);
for (const r of outbound ?? []) {
  const localTime = new Date(r.created_at).toLocaleString("en-US", { timeZone: "America/Phoenix" });
  const body = (r.body ?? "").slice(0, 80);
  const phone = r.phone_normalized ?? "?";
  const meta = r.metadata?.status ? ` status=${r.metadata.status}` : "";
  console.log(`[${localTime}] ${phone}  type=${r.message_type}${meta}  body="${body}"  wamid=${r.whatsapp_message_id}`);
}

// Hourly buckets for the last 4h (count of messages, all directions)
console.log(`\n=== HOURLY BUCKETS (last 4h, all directions) ===`);
const { data: hourly, error: e3 } = await supabase
  .from("lead_whatsapp_conversations")
  .select("created_at, direction")
  .gte("created_at", FOUR_H_AGO)
  .order("created_at", { ascending: false })
  .limit(1000);
if (e3) console.error("hourly error", e3);
const buckets = new Map();
for (const r of hourly ?? []) {
  const h = new Date(r.created_at);
  const key = h.toISOString().slice(0, 13) + ":00";
  if (!buckets.has(key)) buckets.set(key, { in: 0, out: 0, sys: 0 });
  const b = buckets.get(key);
  if (r.direction === "inbound") b.in++;
  else if (r.direction === "outbound") b.out++;
  else b.sys++;
}
for (const [h, c] of [...buckets.entries()].sort()) {
  const localHour = new Date(h).toLocaleString("en-US", { timeZone: "America/Phoenix" });
  console.log(`${localHour}  in=${c.in}  out=${c.out}  sys=${c.sys}`);
}
