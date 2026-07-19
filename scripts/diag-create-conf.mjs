// scripts/diag-create-conf.mjs
// Intenta crear una confirmation manual con los mismos valores del
// safety-net para aislar el error 22P02.
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
const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

// Find an active event.
const r1 = await fetch(`${url}/events?status=eq.published&select=id&limit=1`, { headers });
const ev = (await r1.json())[0];
if (!ev) {
  console.log("No event");
  process.exit(1);
}
console.log("Event:", ev.id);

// Intentar insertar con source = "whatsapp_safety_net".
const r2 = await fetch(`${url}/event_confirmations`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    event_id: ev.id,
    name: "Test Diagnostico",
    email: "test-diag@example.com",
    phone_raw: "+525599900099",
    phone_normalized: "+525599900099",
    source: "whatsapp_safety_net",
    import_batch_id: null,
  }),
});
const body = await r2.text();
console.log("Status:", r2.status);
console.log("Body:", body);

// Limpiar el insert si funciono.
if (r2.ok) {
  const row = JSON.parse(body);
  if (row?.[0]?.id) {
    await fetch(`${url}/event_confirmations?id=eq.${row[0].id}`, { method: "DELETE", headers });
    console.log("Cleanup OK");
  }
}
