// scripts/diag-conf-source-enum.mjs
// Lista los valores del enum event_confirmation_source en la DB.
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

// Hacer un insert con cada valor posible para ver cuál acepta.
for (const v of ["imported_excel", "public_form", "manual", "whatsapp_bot", "whatsapp_safety_net", "otro"]) {
  const r = await fetch(`${url}/event_confirmations?event_id=eq.00000000-0000-0000-0000-000000000000&source=eq.${v}&limit=1`, { headers });
  console.log(v, ":", r.status);
}
// Hacer un POST con "whatsapp_bot" para ver si funciona.
const ev = (await (await fetch(`${url}/events?status=eq.published&select=id&limit=1`, { headers })).json())[0];
const r2 = await fetch(`${url}/event_confirmations`, {
  method: "POST",
  headers: { ...headers, "Content-Type": "application/json", Prefer: "return=representation" },
  body: JSON.stringify({
    event_id: ev.id,
    name: "Test Enum",
    email: `test-enum-${Date.now()}@example.com`,
    phone_raw: "+525599900088",
    phone_normalized: "+525599900088",
    source: "whatsapp_bot",
  }),
});
const b = await r2.text();
console.log("Insert con whatsapp_bot:", r2.status, b);
if (r2.ok) {
  const row = JSON.parse(b);
  await fetch(`${url}/event_confirmations?id=eq.${row[0].id}`, { method: "DELETE", headers });
  console.log("Cleanup OK");
}
