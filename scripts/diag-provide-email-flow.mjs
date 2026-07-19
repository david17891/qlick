// scripts/diag-provide-email-flow.mjs
// Trace detallado del case "provide_email" para encontrar por que
// no crea confirmation con DeepSeek real.
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

// Verificar que DeepSeek real este seteado.
if (!process.env.DEEPSEEK_API_KEY) {
  console.log("ERROR: DEEPSEEK_API_KEY no seteada");
  process.exit(1);
}

const { createClient } = await import("@supabase/supabase-js");
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Find PAID event.
const { data: evs } = await supabase
  .from("events")
  .select("id, slug, title, price_mxn, format, status")
  .eq("status", "published")
  .order("starts_at", { ascending: true })
  .limit(50);
const paidEv = evs.find((e) => (e.price_mxn ?? 0) > 0);
console.log("Evento pago:", paidEv?.title, paidEv?.id);

// Set mode.
await supabase.from("system_settings").upsert(
  { key: "bot_global_mode", value: JSON.stringify("super_executive_v2"), updated_at: new Date().toISOString() },
  { onConflict: "key" }
);

// Crear lead CON nombre valido (asi no se sale por "necesito tu nombre").
const phone = `+52559988${String(Math.floor(Math.random() * 9000) + 1000).slice(0, 4)}`;
const ts = Date.now();
const placeholder = `diag-${ts}-${Math.random().toString(36).slice(2, 8)}@example.com`;
const { data: lead } = await supabase
  .from("leads")
  .insert({
    phone,
    phone_normalized: phone,
    name: "David Test", // nombre valido
    email: placeholder,
    source: "whatsapp",
    status: "new",
    consent_to_contact: true,
  })
  .select("id, phone, phone_normalized, name, email")
  .single();
console.log("Lead creado CON nombre 'David Test':", lead.id);

// Esperar 2s para que el findLeadByPhone no tenga stale data.
await new Promise((r) => setTimeout(r, 2000));

const { processInboundMessage } = await import("../src/lib/whatsapp/bot-engine.ts");

console.log("\nLlamando processInboundMessage con text='david@x.com'...");
const r = await processInboundMessage({
  messageId: `wamid_diag_named_${ts}`,
  from: phone,
  contactName: "Diag Named",
  text: "david@x.com",
  type: "text",
  timestamp: String(Math.floor(Date.now() / 1000)),
});
console.log("Result:", {
  ok: r.ok,
  intent: r.intent,
  responseKind: r.responseKind,
  responsePreview: r.responsePreview?.slice(0, 300),
});

// Esperar 4s para fire-and-forget.
await new Promise((r) => setTimeout(r, 4000));

const leadAfter = await supabase.from("leads").select("id, name, email").eq("id", lead.id).single();
console.log("Lead after:", leadAfter.data);

const conf = await supabase
  .from("event_confirmations")
  .select("id, name, email, payment_status, source")
  .eq("event_id", paidEv.id)
  .eq("phone_normalized", phone)
  .maybeSingle();
console.log("Confirmation:", conf.data);

const emailLog = await supabase
  .from("event_email_log")
  .select("id, email_type, recipient, ok, sent_at, event_id")
  .or(`recipient.eq.david@x.com,recipient.eq.${placeholder}`)
  .order("sent_at", { ascending: false });
console.log("Email logs (david@x.com + placeholder):");
for (const e of emailLog.data ?? []) {
  console.log(`  ${e.email_type} | ${e.recipient} | ok=${e.ok} | event=${e.event_id?.slice(0, 8)}`);
}

// Cleanup.
await supabase.from("event_confirmations").delete().eq("phone_normalized", phone);
await supabase.from("lead_whatsapp_log").delete().eq("lead_id", lead.id);
await supabase.from("lead_whatsapp_conversations").delete().eq("lead_id", lead.id);
const finalLead = await supabase.from("leads").select("email").eq("id", lead.id).single();
if (finalLead.data?.email) {
  await supabase.from("event_email_log").delete().eq("recipient", finalLead.data.email);
}
await supabase.from("leads").delete().eq("id", lead.id);
console.log("\n[OK] Cleanup");
