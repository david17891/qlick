// scripts/diag-payment-status.mjs
// Lee el enum payment_status directamente de la DB.
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

// Query de SQL directo via RPC? No tengo. Voy a hacer un insert con
// cada valor posible y ver cuál acepta.
for (const status of ["not_required", "pending", "paid", "failed", "disputed", "refunded", "otro"]) {
  const r = await fetch(`${url}/event_confirmations?event_id=eq.00000000-0000-0000-0000-000000000000&payment_status=eq.${encodeURIComponent(status)}&limit=1`, { headers });
  console.log(status, r.status, r.ok ? "OK" : "FAIL");
}
