// scripts/_check-recent-leads.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";

const env = {};
if (existsSync(".env.local")) {
  for (const raw of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = raw.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[m[1]] = v;
  }
}

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

const dayAgo = new Date(Date.now() - 24 * 3600_000).toISOString();

console.log("=== ALL LEADS LAST 24H ===");
const { data: leads } = await sb.from("leads").select("id, name, phone, phone_normalized, source, status, created_at, last_contacted_at").gte("created_at", dayAgo).order("created_at", { ascending: false });
leads?.forEach(l => console.log(`${l.created_at} | ${l.name ?? "(no name)"} | ${l.phone_normalized ?? l.phone} | source=${l.source} | status=${l.status}`));

console.log("\n=== ALL CONVERSATIONS LAST 24H ===");
const { data: convs } = await sb.from("lead_whatsapp_conversations").select("id, lead_id, created_at, last_message_at, last_message_body, last_message_direction, status").gte("created_at", dayAgo).order("last_message_at", { ascending: false }).limit(30);
convs?.forEach(c => console.log(`${c.last_message_at} | lead=${c.lead_id?.slice(0,8)} | dir=${c.last_message_direction} | "${c.last_message_body?.slice(0,80)}"`));

console.log("\n=== INBOUND MESSAGES (table-schema probe) ===");
// Probe what schemas exist
const { data: sm } = await sb.from("lead_whatsapp_messages").select("id, conversation_id, direction, body, created_at").gte("created_at", dayAgo).limit(5);
console.log("Sample messages:", JSON.stringify(sm, null, 2));

console.log("\n=== LEAD_EVENT_LINKS ===");
const { data: links } = await sb.from("lead_event_links").select("id, event_id, lead_id, link_type, created_at").gte("created_at", dayAgo);
console.log(`Recent links: ${links?.length}`);
links?.forEach(l => console.log(`  ${l.created_at} | event=${l.event_id.slice(0,8)} | lead=${l.lead_id?.slice(0,8)} | type=${l.link_type}`));
