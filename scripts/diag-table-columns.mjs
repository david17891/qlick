// scripts/diag-table-columns.mjs
// Diagnostica columnas de tablas clave para el test E2E human_first.
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

for (const t of [
  "leads",
  "event_confirmations",
  "event_email_log",
  "lead_whatsapp_conversations",
  "lead_whatsapp_log",
  "system_settings",
]) {
  const r = await fetch(`${url}/${t}?select=*&limit=0`, { headers });
  if (!r.ok) {
    console.log(t, "ERROR:", r.status, await r.text());
    continue;
  }
  // Hacer una query con limit=1 para ver las columnas.
  const r2 = await fetch(`${url}/${t}?select=*&limit=1`, { headers });
  const rows = await r2.json();
  const cols = rows[0] ? Object.keys(rows[0]) : "(empty)";
  console.log(t, ":", cols);
}
