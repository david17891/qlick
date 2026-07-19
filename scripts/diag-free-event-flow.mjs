// scripts/diag-free-event-flow.mjs
// Test minimo: corre S4 con evento gratis, NO cleanup, ver los logs.
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";

register("./tests/loader-register.mjs", pathToFileURL("./"));

// Cargar .env.local
const txt = readFileSync(".env.local", "utf8");
for (const line of txt.split(/\r?\n/)) {
  if (!line || line.startsWith("#")) continue;
  const eq = line.indexOf("=");
  if (eq === -1) continue;
  const key = line.slice(0, eq).trim();
  let value = line.slice(eq + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
  if (process.env[key] === undefined) process.env[key] = value;
}

// Forzar mock.
delete process.env.DEEPSEEK_API_KEY;
delete process.env.AI_AGENT_PROVIDER;

const { createClient } = await import("@supabase/supabase-js");
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Find free event.
const { data: evs } = await supabase
  .from("events")
  .select("id, slug, title, price_mxn, format, status")
  .eq("status", "published")
  .order("starts_at", { ascending: true })
  .limit(50);
const freeEv = evs.find((e) => (e.price_mxn ?? 0) === 0);
console.log("Evento gratis:", freeEv?.title, freeEv?.id);

// Create test lead.
const phone = `+52559988${String(Math.floor(Math.random() * 9000) + 1000).slice(0, 4)}`;
const ts = Date.now();
const placeholder = `diag-${ts}-${Math.random().toString(36).slice(2, 8)}@example.com`;
const { data: lead } = await supabase
  .from("leads")
  .insert({
    phone,
    phone_normalized: phone,
    name: "Pendiente",
    email: placeholder,
    source: "whatsapp",
    status: "new",
    consent_to_contact: true,
  })
  .select("id, phone, phone_normalized, name, email")
  .single();
console.log("Lead creado:", lead.id, lead.email);

// Set mode.
await supabase.from("system_settings").upsert(
  { key: "bot_global_mode", value: JSON.stringify("super_executive_v2"), updated_at: new Date().toISOString() },
  { onConflict: "key" }
);

const { processInboundMessage } = await import("../src/lib/whatsapp/bot-engine.ts");

console.log("Llamando processInboundMessage con text='david@x.com'...");
const r = await processInboundMessage({
  messageId: `wamid_diag_${ts}`,
  from: phone,
  contactName: "Diag Free",
  text: "david@x.com",
  type: "text",
  timestamp: String(Math.floor(Date.now() / 1000)),
});
console.log("Result:", { ok: r.ok, intent: r.intent, responseKind: r.responseKind, responsePreview: r.responsePreview?.slice(0, 200) });

// Esperar 4 segundos.
await new Promise((r) => setTimeout(r, 4000));

// Query state.
const leadAfter = await supabase.from("leads").select("id, name, email").eq("id", lead.id).single();
console.log("Lead after:", leadAfter.data);

const conf = await supabase
  .from("event_confirmations")
  .select("id, name, email, payment_status, source")
  .eq("event_id", freeEv.id)
  .eq("phone_normalized", phone)
  .maybeSingle();
console.log("Confirmation:", conf.data);

const emailLog = await supabase
  .from("event_email_log")
  .select("id, email_type, recipient, ok, event_id")
  .or(`recipient.eq.david@x.com,recipient.eq.${placeholder}`)
  .order("sent_at", { ascending: false });
console.log("Email logs (david@x.com + placeholder):");
for (const e of emailLog.data ?? []) {
  console.log(`  ${e.email_type} | ${e.recipient} | ok=${e.ok}`);
}

const allEmailLog = await supabase
  .from("event_email_log")
  .select("id, email_type, recipient, ok, event_id, sent_at")
  .order("sent_at", { ascending: false })
  .limit(5);
console.log("Ultimos 5 email logs (cualquier recipient):");
for (const e of allEmailLog.data ?? []) {
  console.log(`  ${e.sent_at} | ${e.email_type} | ${e.recipient} | ok=${e.ok} | event=${e.event_id?.slice(0, 8)}`);
}
