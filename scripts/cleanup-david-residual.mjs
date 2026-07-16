// Cleanup residual del reset de David:
// 1. Encuentra valores válidos del enum lead_status / whatsapp_status
// 2. Borra event_access dangling (typegen stale: lead_id no está)
// 3. Aplica status correctos al lead
// 4. Identifica la tabla del wizard state (outbound)
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
const LEAD_ID = "92739b21-05cf-4421-842b-6b50ea71f2d9"; // David

const sb = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SECRET_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

console.log("=== 1. Distinct status values (enum sample) ===");
const { data: statusSamples } = await sb.from("leads").select("status");
const distinctStatus = [...new Set((statusSamples ?? []).map((r) => r.status))];
console.log("lead_status values in use:", distinctStatus);

const { data: waSamples } = await sb.from("leads").select("whatsapp_status");
const distinctWa = [...new Set((waSamples ?? []).map((r) => r.whatsapp_status))];
console.log("whatsapp_status values in use:", distinctWa);

console.log("\n=== 2. event_access residual (via confirmation_id, typegen-stale) ===");
// event_access SÍ tiene confirmation_id en typegen. La confirmation se borró,
// así que la columna queda como UUID que ya no existe. Hay que usar la lista
// de confirmation_ids ANTES de borrar. Como ya las borramos, vamos a buscar
// event_access con user_id=null que estén activos y source='event_purchase'
// (que es lo que creó el webhook). Solo debería haber rows viejos de David.
// Si los hay, los borramos con confirmation_id IN (lista que sacamos antes).
//
// Para esta prueba, los event_access se crearon con confirmation_id apuntando
// a confirmations que YA borramos. El FK debe ser ON DELETE SET NULL o
// CASCADE? Veamos qué quedó:
const { data: accessRows, error: accessErr } = await sb
  .from("event_access")
  .select("id, confirmation_id, user_id, event_id, access_status, source")
  .eq("user_id", LEAD_ID);
if (accessErr) {
  console.log("user_id query error (esperado si lead_id typegen):", accessErr.message);
} else {
  console.log("event_access con user_id=David lead.id:", accessRows?.length, "rows");
  if (accessRows && accessRows.length > 0) {
    for (const row of accessRows) {
      console.log(`  - id=${row.id}, conf=${row.confirmation_id}, status=${row.access_status}`);
    }
  }
}

console.log("\n=== 3. event_access con confirmation_id NULL (dangling) ===");
// Si confirmation_id era NOT NULL con ON DELETE CASCADE, debería haberse
// borrado. Si era NULL con SET NULL, queda aquí. Veamos:
const { data: nullConf, error: nullErr } = await sb
  .from("event_access")
  .select("id, confirmation_id, user_id, event_id, access_status, source")
  .is("confirmation_id", null);
if (nullErr) {
  console.log("error:", nullErr.message);
} else {
  console.log("access con confirmation_id NULL:", nullConf?.length, "rows");
  for (const row of nullConf ?? []) {
    console.log(`  - id=${row.id}, user_id=${row.user_id}, event_id=${row.event_id}, source=${row.source}`);
  }
}

console.log("\n=== 4. Estado actual de David's lead ===");
const { data: davidLead } = await sb
  .from("leads")
  .select("id, name, email, status, whatsapp_status, phone_normalized")
  .eq("id", LEAD_ID)
  .single();
console.log(davidLead);

console.log("\n=== 5. Tablas candidatas para wizard state ===");
// Probar nombres comunes
for (const tbl of [
  "lead_whatsapp_outbounds",
  "lead_whatsapp_outbound",
  "whatsapp_outbounds",
  "whatsapp_outbound",
  "lead_outbound",
  "lead_outbounds",
  "bot_wizard_state",
]) {
  const { error } = await sb.from(tbl).select("id").limit(1);
  if (!error) {
    console.log(`  ✓ ${tbl} EXISTE`);
  } else if (error.code === "PGRST116") {
    console.log(`  ✓ ${tbl} EXISTE (vacía)`);
  } else {
    console.log(`  ✗ ${tbl}: ${error.message.slice(0, 60)}`);
  }
}
