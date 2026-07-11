// scripts/_check-leads-totals.mjs
// One-off check: global leads, webhooks today, links per event.

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

const start = Date.now();

// 1) Total leads
const { count: totalLeads } = await sb.from("leads").select("id", { count: "exact", head: true });
console.log(`TOTAL LEADS: ${totalLeads}`);

// 2) Leads created in last 24h
const dayAgo = new Date(Date.now() - 24 * 3600_000).toISOString();
const { count: leads24h } = await sb.from("leads").select("id", { count: "exact", head: true }).gte("created_at", dayAgo);
console.log(`LEADS LAST 24H: ${leads24h}`);

// 3) Leads in last 30 min
const min30 = new Date(Date.now() - 30 * 60_000).toISOString();
const { count: leads30m } = await sb.from("leads").select("id", { count: "exact", head: true }).gte("created_at", min30);
console.log(`LEADS LAST 30 MIN: ${leads30m}`);

// 4) All link_event_links to marketing IA event
const MARKETING_IA_EVENT_ID = "eeb2070e-9b64-4715-a684-b3c308e9d0b2";
const { data: allLinks } = await sb.from("lead_event_links").select("id, link_type, lead_id, created_at").eq("event_id", MARKETING_IA_EVENT_ID);
console.log(`LEAD_EVENT_LINKS for Marketing-IA event: ${allLinks?.length ?? 0}`);

// 5) All events
const { data: events, count: eventsCount } = await sb.from("events").select("id, slug, title, status, starts_at", { count: "exact" });
console.log(`EVENTS TOTAL: ${eventsCount}`);
events?.slice(0, 20).forEach(e => console.log(`  ${e.slug} | ${e.status} | ${e.starts_at} | ${e.title}`));

// 6) All WhatsApp confirmations
const { data: confAll, count: confCount } = await sb.from("event_confirmations").select("id, name, email, phone_normalized, source, confirmed_at, event_id", { count: "exact" }).order("confirmed_at", { ascending: false }).limit(20);
console.log(`CONFIRMATIONS TOTAL: ${confCount}`);
confAll?.slice(0, 10).forEach(c => console.log(`  ${c.confirmed_at} | ${c.name} | ${c.source} | ${c.phone_normalized} | event_id=${c.event_id}`));

// 7) Total whatsapp conversations last 24h
const { count: conv24h } = await sb.from("lead_whatsapp_conversations").select("id", { count: "exact", head: true }).gte("created_at", dayAgo);
console.log(`WHATSAPP CONVERSATIONS LAST 24H: ${conv24h}`);

// 8) Total inbound messages last 24h
const { count: inb24h } = await sb.from("lead_whatsapp_messages").select("id", { count: "exact", head: true }).gte("created_at", dayAgo).eq("direction", "inbound");
console.log(`INBOUND MESSAGES LAST 24H: ${inb24h}`);

// 9) Number of distinct conversations in last 24h
const { data: distinctConvs } = await sb.from("lead_whatsapp_messages").select("conversation_id").gte("created_at", dayAgo).eq("direction", "inbound").limit(5000);
const uniqueConvs = new Set(distinctConvs?.map(r => r.conversation_id) ?? []).size;
console.log(`UNIQUE CONVERSATIONS (inbound 24h): ${uniqueConvs}`);

console.log(`\nDone in ${Date.now() - start}ms`);
