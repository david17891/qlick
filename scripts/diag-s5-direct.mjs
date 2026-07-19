// scripts/diag-s5-direct.mjs
// Crea un lead con phone +52559990104, llama al safety-net DIRECTAMENTE
// con un body que matchea Path A, y verifica el phone_normalized de la confirmation.
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

const phone = "+52559990104"; // runIdx 104 = S5
const email = `diag-s5-direct-${Date.now()}@example.com`;

// 1. Crear el lead.
const { data: lead } = await supabase.from("leads").insert({
  phone, phone_normalized: phone, name: "David E2E", email,
  source: "whatsapp", status: "new", consent_to_contact: true,
}).select().single();
console.log(`[STEP 1] lead creado: ${lead.id} phone_normalized=${lead.phone_normalized}`);

// 2. Llamar a createConfirmation directamente con phoneRaw=phone.
const { createConfirmation } = await import("../src/lib/events/confirmations-server.ts");
const r = await createConfirmation({
  eventId: "5ca65576-19de-4ad0-b3a9-19175e21761e",
  name: "David",
  email: "test-s5@x.com",
  phoneRaw: phone,
  source: "whatsapp_bot",
});
console.log(`[STEP 2] createConfirmation: ok=${r.ok} created=${r.created} confirmationId=${r.confirmation?.id}`);

// 3. Ver el phone_normalized guardado.
const { data: conf } = await supabase
  .from("event_confirmations")
  .select("id, phone_normalized, phone_raw, name, email")
  .eq("id", r.confirmation?.id ?? "")
  .single();
console.log(`[STEP 3] confirmation en DB:`, conf);

// 4. Cleanup.
await supabase.from("event_confirmations").delete().eq("id", r.confirmation?.id ?? "");
await supabase.from("leads").delete().eq("id", lead.id);
console.log("cleanup ok");
