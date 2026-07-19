// scripts/diag-events-table.mjs
// Diagnostica columnas de la tabla events.
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

const r = await fetch(`${url}/events?select=*&limit=1`, { headers });
if (!r.ok) { console.log("ERROR", r.status, await r.text()); process.exit(1); }
const rows = await r.json();
console.log("events columns:", rows[0] ? Object.keys(rows[0]) : "(empty)");
