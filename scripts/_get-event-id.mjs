// scripts/_get-event-id.mjs
//
// Helper de QA — imprime solo el id (UUID) del evento demo
// 'taller-funnels-venta-cdmx'. Útil para construir URLs en
// scripts de verificación sin parsear el JSON completo del
// _create-demo-event.mjs.
//
// Uso:
//   node scripts/_get-event-id.mjs
//
// Lee .env.local (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).

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
  console.error("Faltan env vars.");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });
const { data, error } = await sb
  .from("events")
  .select("id, slug")
  .eq("slug", "taller-funnels-venta-cdmx")
  .maybeSingle();

if (error) {
  console.error("ERR:", error.message);
  process.exit(1);
}
if (!data) {
  console.error("Evento 'taller-funnels-venta-cdmx' no existe. Corré primero: node scripts/_create-demo-event.mjs");
  process.exit(1);
}

console.log(data.id);