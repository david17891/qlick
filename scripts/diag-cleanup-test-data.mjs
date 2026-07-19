// scripts/diag-cleanup-test-data.mjs
// Limpia datos de prueba (confirmations + email logs + lead_whatsapp_*)
// de phones de test del comprehensive matrix.
//
// FIX 2026-07-19: cleanup agresivo. Borra TODO lo relacionado con
// los phones de test, en el orden correcto para evitar conflictos
// de FK: primero event_confirmations, luego event_email_log, luego
// lead_whatsapp_*, finalmente leads. FIX previo: solo borraba 9/20
// leads porque no esperaba a que cada DELETE terminara.
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
const url = `https://${env.SUPABASE_PROJECT_REF}.supabase.co/rest/v1`;
const key = env.SUPABASE_SECRET_KEY;
const headers = { apikey: key, Authorization: `Bearer ${key}` };

// Phones de test: 100-104, 200-204, 300-304, 400-404.
const testPhones = [];
for (const prefix of [100, 200, 300, 400]) {
  for (let i = 0; i < 5; i++) {
    testPhones.push(`+5255999${String(prefix + i).padStart(4, "0")}`);
  }
}
console.log("Limpiando phones:", testPhones.join(", "));

// Helper: delete con verificación.
async function delCount(path) {
  const r = await fetch(`${url}${path}`, { method: "DELETE", headers });
  if (!r.ok) {
    console.error(`  [WARN] ${path} -> ${r.status} ${await r.text()}`);
    return 0;
  }
  const cr = r.headers.get("content-range");
  if (cr) {
    const m = cr.match(/\/(\d+)/);
    if (m) return parseInt(m[1]);
  }
  return 0;
}

// 1. event_confirmations por phone_normalized.
let totalConf = 0;
for (const phone of testPhones) {
  totalConf += await delCount(`/event_confirmations?phone_normalized=eq.${encodeURIComponent(phone)}`);
}
console.log(`event_confirmations borradas: ${totalConf}`);

// 2. event_email_log de david@x.com (acumulado de runs anteriores).
const totalEmailLogs = await delCount(`/event_email_log?recipient=eq.david@x.com`);
console.log(`event_email_log (david@x.com) borrados: ${totalEmailLogs}`);

// 3. leads: primero obtener IDs, luego borrar dependencias en cascada.
let totalLeads = 0;
for (const phone of testPhones) {
  const r1 = await fetch(
    `${url}/leads?phone_normalized=eq.${encodeURIComponent(phone)}&select=id`,
    { headers }
  );
  const leads = await r1.json();
  for (const lead of leads) {
    await delCount(`/lead_whatsapp_log?lead_id=eq.${lead.id}`);
    await delCount(`/lead_whatsapp_conversations?lead_id=eq.${lead.id}`);
    const deleted = await delCount(`/leads?id=eq.${lead.id}`);
    totalLeads += deleted;
  }
}
console.log(`leads borrados: ${totalLeads}`);

console.log("\n[OK] Cleanup completo");

