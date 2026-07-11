// scripts/_watcher-diagnostic.mjs
// Diagnostico para el watcher del evento del 11 jul.
// Lee directions de mensajes + lead_event_links.

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
const dayAgo = new Date(Date.now() - 24 * 3600_000).toISOString();

console.log("=== WhatsApp messages last 24h ===");
const { count: totalMsgs } = await sb.from("lead_whatsapp_messages").select("id", { count: "exact", head: true }).gte("created_at", dayAgo);
console.log("Total messages last 24h:", totalMsgs);

const { data: dirs } = await sb.from("lead_whatsapp_messages").select("direction").gte("created_at", dayAgo).limit(1000);
const counts = {};
for (const r of dirs || []) counts[r.direction] = (counts[r.direction] || 0) + 1;
console.log("Direction counts (sample 1000):", JSON.stringify(counts));

const { data: msgs } = await sb.from("lead_whatsapp_messages").select("id, direction, body, created_at").order("created_at", { ascending: false }).limit(5);
console.log("Sample 5 most recent:");
for (const m of msgs || []) console.log(" ", m.created_at, "|", m.direction, "|", (m.body || "").substring(0, 80));

console.log("\n=== Conversations last 24h ===");
const { count: conv } = await sb.from("lead_whatsapp_conversations").select("id", { count: "exact", head: true }).gte("created_at", dayAgo);
console.log("Conversations last 24h:", conv);

console.log("\n=== Leads globally ===");
const { data: leads } = await sb.from("leads").select("id, name, phone, status, created_at").order("created_at", { ascending: false }).limit(10);
for (const l of leads || []) console.log(" ", l.created_at, "|", l.id.substring(0,8), "|", l.name, "|", l.phone, "|", l.status);

console.log("\n=== Lead_event_links globally ===");
const { count: linksTotal } = await sb.from("lead_event_links").select("id", { count: "exact", head: true });
console.log("TOTAL lead_event_links globally:", linksTotal);

const { data: linksSample } = await sb.from("lead_event_links").select("id, lead_id, event_id, link_type, created_at").limit(20);
console.log("Sample lead_event_links (up to 20):");
for (const l of linksSample || []) console.log(" ", l.created_at, "|", l.link_type, "| lead=", l.lead_id?.substring(0,8), "| event=", l.event_id?.substring(0,8));

console.log("\n=== Confirmations for event 11 jul ===");
const { data: confs } = await sb.from("event_confirmations").select("id, name, phone_normalized, lead_id, confirmed_at, source").eq("event_id", EVENT_ID);
for (const c of confs || []) console.log(" ", c.confirmed_at, "|", c.name, "| lead_id=", c.lead_id, "| phone=", c.phone_normalized, "| src=", c.source);

console.log("\n=== Event Q&A: attendees checkin ===");
const { count: att } = await sb.from("event_attendees").select("id", { count: "exact", head: true }).eq("event_id", EVENT_ID);
console.log("Total attendees for event 11 jul:", att);