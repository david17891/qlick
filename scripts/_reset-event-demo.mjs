// scripts/_reset-event-demo.mjs
//
// Limpia TODOS los datos de seed del evento "qa-fase4-demo" sin importar
// el batch_id. Util cuando el seed fallo por duplicados de runs anteriores
// y --cleanup no es suficiente.
//
// ADVERTENCIA: este script borra data del evento demo. NO usar en
// produccion. Solo para QA local.

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

// El evento "qa-fase4-demo" es el que usa el seed. Si lo renombras, cambia esto.
const EVENT_SLUG = "qa-fase4-demo";

const { data: event, error: evErr } = await sb
  .from("events")
  .select("id, slug, title")
  .eq("slug", EVENT_SLUG)
  .maybeSingle();
if (evErr || !event) {
  console.error("Evento '" + EVENT_SLUG + "' no existe. Crealo primero.");
  process.exit(1);
}
console.log(`Reseteando evento: "${event.title}" (${event.id})`);

// Borrar en orden inverso de FK (hijos antes que padres).
// Usamos !event_id.eq para borrar por event_id (no por batch_id).
const tables = [
  "lead_event_links",
  "event_attendees",
  "event_surveys",
  "event_survey_unmatched",
  "event_confirmations",
];
for (const t of tables) {
  const { error, count } = await sb.from(t).delete({ count: "exact" }).eq("event_id", event.id);
  if (error) {
    console.error(`  ${t}: ERROR ${error.message}`);
  } else {
    console.log(`  ${t}: ${count ?? 0} filas borradas`);
  }
}

// Leads quedan con link_event_links colgado si los borramos por separado.
// El seed los recrea con emails unicos por el evento, asi que los borramos
// por el patron del email. Los emails del seed son @qa-fase4-demo.test.
const { error: leadsErr, count: leadsCount } = await sb
  .from("leads")
  .delete({ count: "exact" })
  .like("email", "%@qa-fase4-demo.test");
if (leadsErr) {
  console.error(`  leads: ERROR ${leadsErr.message}`);
} else {
  console.log(`  leads: ${leadsCount ?? 0} filas borradas (patron @qa-fase4-demo.test)`);
}

console.log("\nListo. Ahora podes correr:");
console.log("  node scripts/_seed-event-demo.mjs");
