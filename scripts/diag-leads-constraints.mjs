// scripts/diag-leads-constraints.mjs
// Lista las unique constraints de la tabla leads.
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
const headers = { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` };

// Query the constraints via REST (PostgREST no permite consultar pg_constraint directo,
// pero podemos hacer un INSERT dummy para ver qué constraint falla).
console.log("Intentando INSERT dummy con phone_normalized=+52559990100 para ver la constraint...");
const r = await fetch(`${url}/leads`, {
  method: "POST",
  headers: { ...headers, Prefer: "return=representation", "Content-Type": "application/json" },
  body: JSON.stringify({
    phone: "+52559990100",
    phone_normalized: "+52559990100",
    name: "Test Diag",
    email: `diag-${Date.now()}@example.com`,
    source: "whatsapp",
    status: "new",
    consent_to_contact: true,
  }),
});
console.log("status:", r.status);
const txt = await r.text();
console.log("body:", txt);
