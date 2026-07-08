// scripts/_inspect-event-for-bot.mjs
// Lee el evento del 11 de julio de 2026 desde DB para diagnosticar
// qué info tiene disponible hoy el bot. Imprime title, short_code,
// description, location, format, dates, event_rules, requires_name.
//
// Uso: node scripts/_inspect-event-for-bot.mjs

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function parseEnvFile(p) {
  const out = {};
  if (!existsSync(p)) return out;
  for (const raw of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = raw.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

const env = { ...parseEnvFile(join(ROOT, ".env.local")), ...process.env };
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("Faltan env vars.");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

// El evento del 11 de julio segun las conversaciones:
//   title contiene "Marketing + IA para Emprendedores" o "Marketing + IA para Empr"
//   short_code posible: AA4E
//   starts_at >= 2026-07-11
const { data, error } = await sb
  .from("events")
  .select(
    "id, slug, short_code, title, description, starts_at, ends_at, location, format, streaming_url, streaming_provider, streaming_access_note, event_rules, requires_name, status"
  )
  .eq("status", "published")
  .gte("starts_at", "2026-07-08")
  .lte("starts_at", "2026-07-15")
  .order("starts_at", { ascending: true });

if (error) {
  console.error("ERR:", error.message);
  process.exit(1);
}

if (!data || data.length === 0) {
  console.log("[OK] No hay eventos publicados en esa ventana.");
  process.exit(0);
}

for (const evt of data) {
  console.log("============================================================");
  console.log("EVENTO");
  console.log("============================================================");
  console.log("id          :", evt.id);
  console.log("slug        :", evt.slug);
  console.log("short_code  :", evt.short_code);
  console.log("title       :", evt.title);
  console.log("starts_at   :", evt.starts_at);
  console.log("ends_at     :", evt.ends_at);
  console.log("location    :", evt.location);
  console.log("format      :", evt.format);
  console.log("streaming   :", evt.streaming_url);
  console.log("provider    :", evt.streaming_provider);
  console.log("access note :", evt.streaming_access_note);
  console.log("requires_name:", evt.requires_name);
  console.log("");
  console.log("--- description ---");
  console.log(evt.description ?? "(NULL)");
  console.log("");
  console.log("--- event_rules ---");
  console.log(JSON.stringify(evt.event_rules, null, 2));
}
