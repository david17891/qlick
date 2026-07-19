// scripts/diag-list-test-leads.mjs
// Lista todos los leads con phone_normalized que empieza con +5255999.
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
const r = await fetch(`${url}/leads?phone_normalized=like.+5255999*&select=id,phone_normalized,name,email&order=phone_normalized.asc&limit=100`, { headers });
const rows = await r.json();
console.log(`${rows.length} leads encontrados:`);
for (const l of rows) {
  console.log(`  ${l.phone_normalized} | ${l.name} | ${l.email}`);
}
