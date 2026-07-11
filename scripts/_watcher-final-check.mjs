// scripts/_watcher-final-check.mjs
// Diagnostico final: schema + tablas + estado pre-evento

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

console.log("=== Schema: event_confirmations (sample row) ===");
const { data: cs } = await sb.from("event_confirmations").select("*").limit(1);
if (cs && cs[0]) {
  console.log("columns:", Object.keys(cs[0]).join(", "));
} else {
  console.log("(empty table — fetching any row)");
}

console.log("\n=== Schema: lead_event_links (sample row) ===");
const { data: ls } = await sb.from("lead_event_links").select("*").limit(1);
if (ls && ls[0]) {
  console.log("columns:", Object.keys(ls[0]).join(", "));
} else {
  console.log("(empty table)");
}

console.log("\n=== Schema: event_qr_tokens (sample row) ===");
const { data: qs } = await sb.from("event_qr_tokens").select("*").limit(1);
if (qs && qs[0]) {
  console.log("columns:", Object.keys(qs[0]).join(", "));
}

console.log("\n=== Schema: event_attendees (sample row) ===");
const { data: as } = await sb.from("event_attendees").select("*").limit(1);
if (as && as[0]) {
  console.log("columns:", Object.keys(as[0]).join(", "));
}

console.log("\n=== lead_whatsapp_messages (TOTAL globally) ===");
const { count: totalMsgs } = await sb.from("lead_whatsapp_messages").select("id", { count: "exact", head: true });
console.log("Total messages globally:", totalMsgs);

console.log("\n=== lead_whatsapp_messages (last 24h) ===");
const dayAgo = new Date(Date.now() - 24 * 3600_000).toISOString();
const { count: msgs24 } = await sb.from("lead_whatsapp_messages").select("id", { count: "exact", head: true }).gte("created_at", dayAgo);
console.log("Messages last 24h:", msgs24);

console.log("\n=== 5 most recent messages ===");
const { data: anyMsg } = await sb.from("lead_whatsapp_messages").select("id, direction, created_at, conversation_id").order("created_at", { ascending: false }).limit(5);
for (const m of anyMsg || []) console.log(" ", m.created_at, "|", m.direction, "|", m.id);

console.log("\n=== 5 most recent conversations ===");
const { data: convs } = await sb.from("lead_whatsapp_conversations").select("id, lead_id, channel, created_at").order("created_at", { ascending: false }).limit(5);
for (const c of convs || []) console.log(" ", c.created_at, "|", c.id?.substring(0,8), "| lead=", c.lead_id?.substring(0,8), "| ch=", c.channel);

console.log("\n=== Event 11 jul - check event_attendees ===");
const { count: att } = await sb.from("event_attendees").select("id", { count: "exact", head: true }).eq("event_id", EVENT_ID);
console.log("event_attendees count:", att);

console.log("\n=== Event 11 jul - QR tokens ===");
const { data: qrs, count: qrc } = await sb.from("event_qr_tokens").select("id, attendee_name, attendee_phone_normalized, created_at, expires_at, checked_in_at", { count: "exact" }).eq("event_id", EVENT_ID);
console.log("QR tokens count:", qrc);
for (const q of qrs || []) console.log(" ", q.created_at, "|", q.attendee_name, "| expires=", q.expires_at, "| checked_in=", q.checked_in_at);

console.log("\n=== Check: confirmations for all events (last 5) ===");
const { data: allc } = await sb.from("event_confirmations").select("id, name, confirmed_at, event_id, source").order("confirmed_at", { ascending: false }).limit(5);
for (const c of allc || []) console.log(" ", c.confirmed_at, "|", c.name, "| event=", c.event_id?.substring(0,8), "| src=", c.source);