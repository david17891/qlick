// scripts/diag-create-free-event.mjs
// Crea un evento gratis de prueba para el test comprehensivo.
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

const slug = `e2e-free-${Date.now()}`;
const startsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // +7 dias.
const endsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000).toISOString(); // +3h.

const body = {
  slug,
  title: "Masterclass Gratis E2E",
  description: "Masterclass gratis de prueba para tests E2E comprehensivos del bot.",
  starts_at: startsAt,
  ends_at: endsAt,
  location: "CDMX (modalidad hibrida)",
  status: "published",
  requires_name: true,
  format: "in_person",
  price_mxn: 0,
  currency: "MXN",
  short_code: "TEST",
};

const r = await fetch(`${url}/events`, {
  method: "POST",
  headers,
  body: JSON.stringify(body),
});
const rows = await r.json();
if (!r.ok) { console.log("ERROR", r.status, rows); process.exit(1); }
console.log("Evento gratis creado:");
console.log("  id:", rows[0].id);
console.log("  slug:", rows[0].slug);
console.log("  title:", rows[0].title);
console.log("  price_mxn:", rows[0].price_mxn);
console.log("  format:", rows[0].format);
console.log("  status:", rows[0].status);
