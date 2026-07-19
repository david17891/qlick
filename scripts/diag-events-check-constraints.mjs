// scripts/diag-events-check-constraints.mjs
// Lee las CHECK constraints de events para entender el formato short_code.
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

// Probar diferentes formatos de short_code hasta encontrar uno que acepte.
const candidates = ["ABC", "ABCD", "ABCDE", "ABCDEF", "TEST", "PROMO", "DEMO01", "DEMOONE"];
for (const code of candidates) {
  const body = {
    slug: `diag-${Date.now()}-${code}`,
    title: "diag",
    starts_at: new Date().toISOString(),
    ends_at: new Date(Date.now() + 3600_000).toISOString(),
    status: "draft",
    short_code: code,
  };
  const r = await fetch(`${url}/events`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
  console.log(code, ":", r.status, r.ok ? "OK" : (await r.text()).slice(0, 100));
  if (r.ok) {
    // Cleanup.
    const slug = body.slug;
    await fetch(`${url}/events?slug=eq.${slug}`, { method: "DELETE", headers });
  }
}
