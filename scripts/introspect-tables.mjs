// Descubre columnas reales de las tablas typegen-stale via SELECT * LIMIT 0
// y via 'select * from information_schema.columns' en una sola query grande.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const text = readFileSync(path, "utf-8");
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const env = { ...parseEnvFile(join(ROOT, ".env.local")), ...process.env };
const sb = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SECRET_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// SELECT * LIMIT 0: PostgREST devuelve metadata de columnas
const tables = [
  "event_confirmations",
  "event_payments",
  "event_access",
  "event_attendees",
  "lead_whatsapp_conversations",
  "leads",
];

for (const table of tables) {
  const { data, error } = await sb.from(table).select("*").limit(1);
  if (error) {
    console.log(`\n${table}: ERROR ${error.message}`);
    continue;
  }
  // La data puede ser [] pero la metadata de columnas viene si inspeccionamos
  // usando rpc para INFORMATION_SCHEMA. Probemos otra vía:
  const { data: cols, error: colErr } = await sb
    .from("information_schema.columns")
    .select("column_name, data_type")
    .eq("table_schema", "public")
    .eq("table_name", table);
  if (colErr) {
    console.log(`\n${table}: info_schema error ${colErr.message}`);
  } else {
    console.log(`\n${table} columns:`);
    for (const c of cols ?? []) {
      console.log(`  - ${c.column_name} (${c.data_type})`);
    }
  }
}
