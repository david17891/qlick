// scripts/diag-events-list.mjs
// Lista los eventos publicados con su ID, slug, short_code, price_mxn, starts_at.
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
const url = env.SUPABASE_PROJECT_REF;
const key = env.SUPABASE_SECRET_KEY;
const restUrl = `https://${url}.supabase.co/rest/v1`;
const headers = { apikey: key, Authorization: `Bearer ${key}` };

const sel = await fetch(`${restUrl}/events?status=eq.published&order=starts_at.asc&select=id,slug,short_code,title,price_mxn,starts_at,format,location`, { headers });
const rows = await sel.json();
console.log(`Total: ${rows.length} eventos publicados`);
console.log("-".repeat(150));
console.log("id                                   | short | slug                                  | price_mxn | starts_at            | title");
console.log("-".repeat(150));
for (const e of rows) {
  console.log(`${e.id} | ${(e.short_code ?? "----").padEnd(4)} | ${(e.slug ?? "----").padEnd(36)} | ${String(e.price_mxn ?? 0).padStart(9)} | ${e.starts_at ?? "----"}  | ${e.title}`);
}
