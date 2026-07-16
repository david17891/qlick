// Diagnóstico: enum lead_status + tablas con awaiting_survey_step + event_access actual.
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
const PHONE = process.argv[2] || "+526532935492";

const sb = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SECRET_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

console.log("=== Enum lead_status ===");
const { data: enumRows, error: enumErr } = await sb
  .rpc("exec_sql", {
    sql: "SELECT enumlabel FROM pg_enum WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'lead_status') ORDER BY enumsortorder",
  });
if (enumErr) {
  console.log("exec_sql falló (esperado si no existe la función):", enumErr.message);
} else {
  console.log(enumRows);
}

console.log("\n=== Tabla con awaiting_survey_step ===");
const { data: tabRows, error: tabErr } = await sb
  .rpc("exec_sql", {
    sql: "SELECT table_name FROM information_schema.columns WHERE column_name = 'awaiting_survey_step' AND table_schema = 'public'",
  });
if (tabErr) {
  console.log("exec_sql falló:", tabErr.message);
} else {
  console.log(tabRows);
}

console.log("\n=== event_access actual (sin lead_id en typegen) ===");
// Forzamos la query vía .rpc si es posible
const { data: accessRows, error: accessErr } = await sb
  .rpc("exec_sql", {
    sql: "SELECT id, user_id, confirmation_id, event_id, access_status FROM event_access LIMIT 5",
  });
if (accessErr) {
  console.log("exec_sql falló:", accessErr.message);
} else {
  console.log("access rows:", accessRows);
}

console.log("\n=== Lead status sample ===");
const { data: leadSamples, error: leadErr } = await sb
  .from("leads")
  .select("id, name, status, whatsapp_status")
  .eq("phone_normalized", PHONE);
if (leadErr) {
  console.log("leads error:", leadErr.message);
} else {
  console.log("David lead:", leadSamples);
}
