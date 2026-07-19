// scripts/diag-s5-flow.mjs
// Reproduce exactamente lo que hace el comprehensive matrix test S5 v2 PAGO
// y verifica si la confirmation se crea.
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
process.env.DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "sk-dummy";

const { createClient } = await import("@supabase/supabase-js");
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const ts = Date.now();
const phone = `+5255999${String(100 + 4).padStart(4, "0")}`; // runIdx 104 = S5
const email = `pending-${ts}-${Math.random().toString(36).slice(2, 8)}@example.com`;

// 1. Setear bot mode a v2.
await supabase.from("system_settings").upsert({ key: "bot_global_mode", value: "super_executive_v2", updated_at: new Date().toISOString() }, { onConflict: "key" });
try {
  const mod = await import("../src/lib/admin/system-settings-server.ts");
  if (typeof mod.invalidateCache === "function") mod.invalidateCache();
} catch {}

// 2. Crear el lead.
const { data: lead, error: leadErr } = await supabase.from("leads").insert({
  phone,
  phone_normalized: phone,
  name: "David E2E",
  email,
  source: "whatsapp",
  status: "new",
  consent_to_contact: true,
}).select().single();
if (leadErr) { console.error("lead err:", leadErr.message); process.exit(1); }
console.log(`[STEP 1] lead creado: ${lead.id} phone=${phone}`);

// 3. Llamar al bot-engine con S5 body.
const { processInboundMessage } = await import("../src/lib/whatsapp/bot-engine.ts");
const r = await processInboundMessage({
  messageId: `diag_s5_${ts}`,
  from: phone,
  contactName: "E2E S5",
  text: `David e2e-${ts}@x.com`,
  type: "text",
  timestamp: String(Math.floor(ts / 1000)),
});
console.log(`[STEP 2] bot result: ok=${r.ok} intent=${r.intent}`);

// 4. Esperar 8s (igual que FLOW_WAIT del test).
await new Promise(r => setTimeout(r, 8000));

// 5. Buscar la confirmation del test.
const { data: confs, error: confErr } = await supabase
  .from("event_confirmations")
  .select("id, event_id, phone_normalized, name, email, payment_status, source, confirmed_at")
  .eq("event_id", "5ca65576-19de-4ad0-b3a9-19175e21761e")
  .eq("phone_normalized", phone)
  .order("confirmed_at", { ascending: false });
console.log(`[STEP 3] confirmations encontradas: ${confs?.length ?? 0}`);
for (const c of confs ?? []) console.log(" ", c);

// 6. Cleanup.
await supabase.from("event_confirmations").delete().eq("phone_normalized", phone);
await supabase.from("event_email_log").delete().eq("recipient", email);
await supabase.from("leads").delete().eq("id", lead.id);
console.log("cleanup ok");
