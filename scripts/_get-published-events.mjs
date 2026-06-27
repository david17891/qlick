// scripts/_get-published-events.mjs
//
// Helper de QA — lista los últimos 10 eventos con status="published"
// desde Supabase usando service role (brpasa RLS). Útil para:
//   - Confirmar qué eventos están visibles al público antes de tomar
//     screenshots de QA de /eventos/[slug].
//   - Validar imports recientes sin abrir el dashboard de Supabase.
//
// Uso:
//   node scripts/_get-published-events.mjs
//
// Lee credenciales de .env.local (NEXT_PUBLIC_SUPABASE_URL +
// SUPABASE_SERVICE_ROLE_KEY). NO commitees datos reales — solo usa
// slugs/titles para navegar.

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";

const env = {};
if (existsSync(".env.local")) {
  for (const raw of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = raw.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[m[1]] = v;
  }
}

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("Faltan env vars (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });
const { data, error } = await sb
  .from("events")
  .select("slug, title, status, starts_at, ends_at, location, cover_image_url")
  .eq("status", "published")
  .order("starts_at", { ascending: false })
  .limit(10);

if (error) {
  console.error("ERR:", error.message);
  process.exit(1);
}
if (!data || data.length === 0) {
  console.log("NO PUBLISHED EVENTS");
  process.exit(0);
}
console.log(JSON.stringify(data, null, 2));
