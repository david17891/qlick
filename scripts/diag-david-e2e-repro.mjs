// scripts/diag-david-e2e-repro.mjs
// Reproduce el flow exacto de David en produccion:
// body: "David Martinez david17891@gmail.com"
// Espero:
//   - confirmation con name = "David Martinez" (no "WhatsApp Lead")
//   - event_qr_tokens.confirmation_id = el id de la confirmation (no null)
import { readFileSync } from "node:fs";
function loadEnv() {
  const txt = readFileSync(".env.local", "utf8");
  const env = {};
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) {
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      env[m[1]] = v;
    }
  }
  return env;
}
const env = loadEnv();
for (const k of Object.keys(env)) process.env[k] = env[k];

const { createClient } = await import("@supabase/supabase-js");
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const ts = Date.now();
const phone = `+5255999${String(900 + (ts % 100)).padStart(4, "0")}`;
const email = `david-repro-${ts}@example.com`;
const fullName = "David Martinez";

// 1. Crear el lead con nombre "WhatsApp Lead" (simula el estado pre-fix).
const { data: lead } = await supabase.from("leads").insert({
  phone, phone_normalized: phone,
  name: "WhatsApp Lead",
  email: `pending-${ts}@example.com`,
  source: "whatsapp", status: "new", consent_to_contact: true,
}).select().single();
console.log(`[STEP 1] lead creado con name="WhatsApp Lead": ${lead.id}`);

// 2. Buscar evento PAGO.
const { data: paidEvent } = await supabase
  .from("events")
  .select("id, slug, title, price_mxn")
  .eq("status", "published")
  .gt("price_mxn", 0)
  .order("starts_at", { ascending: true })
  .limit(1)
  .maybeSingle();
console.log(`[STEP 2] evento PAGO: ${paidEvent?.title} (${paidEvent?.id})`);

// 3. Setear bot mode (no es relevante para el repro, pero por seguridad).
await supabase.from("system_settings").upsert({
  key: "bot_global_mode", value: "super_executive_v2", updated_at: new Date().toISOString(),
}, { onConflict: "key" });

// 4. Llamar al bot-engine con body "David Martinez david@x.com".
const { processInboundMessage } = await import("../src/lib/whatsapp/bot-engine.ts");
const r = await processInboundMessage({
  messageId: `diag_david_repro_${ts}`,
  from: phone,
  contactName: "David Martinez",
  text: `David Martinez ${email}`,
  type: "text",
  timestamp: String(Math.floor(ts / 1000)),
});
console.log(`[STEP 3] bot result: ok=${r.ok} intent=${r.intent}`);

// 5. Esperar 8s (safety-net fire-and-forget).
await new Promise((r) => setTimeout(r, 8000));

// 6. Verificar confirmation.
const { data: confs } = await supabase
  .from("event_confirmations")
  .select("id, name, email, phone_normalized, source, payment_status")
  .eq("phone_normalized", phone)
  .eq("event_id", paidEvent?.id ?? "");
console.log(`[STEP 4] confirmations: ${confs?.length ?? 0}`);
for (const c of confs ?? []) {
  console.log("   ", c);
  if (c.name === "David Martinez") {
    console.log("   OK: name actualizado correctamente");
  } else if (c.name === "WhatsApp Lead") {
    console.log("   BUG: name sigue siendo WhatsApp Lead (no se actualizo)");
  } else {
    console.log(`   ?: name = "${c.name}"`);
  }
}

// 7. Verificar event_qr_tokens.
const { data: tokens } = await supabase
  .from("event_qr_tokens")
  .select("id, token, attendee_name, confirmation_id, attendee_email")
  .eq("attendee_phone_normalized", phone);
console.log(`[STEP 5] qr tokens: ${tokens?.length ?? 0}`);
for (const t of tokens ?? []) {
  console.log("   ", t);
  if (t.confirmation_id) {
    console.log("   OK: confirmation_id linkeado");
  } else {
    console.log("   BUG: confirmation_id es null (link vacio en panel)");
  }
}

// 8. Cleanup.
await supabase.from("event_qr_tokens").delete().eq("attendee_phone_normalized", phone);
await supabase.from("event_confirmations").delete().eq("phone_normalized", phone);
await supabase.from("event_email_log").delete().eq("recipient", email);
await supabase.from("leads").delete().eq("id", lead.id);
console.log("[CLEANUP] ok");
