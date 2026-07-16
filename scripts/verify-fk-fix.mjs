// Verifica que el FK de event_access.payment_id apunta a event_payments.
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

// Como no hay exec_sql, probamos via intentar insertar un payment_id
// que apunte a un event_payment real y ver si pasa.
const { data: ep } = await sb
  .from("event_payments")
  .select("id, confirmation_id, status")
  .limit(1);

console.log("event_payments disponibles:", ep?.length ?? 0);
if (ep && ep.length > 0) {
  console.log("Probando INSERT en event_access con payment_id =", ep[0].id);
  // Primero limpio cualquier test previo
  await sb.from("event_access").delete().eq("payment_id", ep[0].id);

  // Buscar un user
  const { data: listData } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const u = listData?.users?.find((u) => u.email);
  if (!u) {
    console.log("no user encontrado");
    process.exit(1);
  }

  const { data: inserted, error: insErr } = await sb
    .from("event_access")
    .insert({
      user_id: u.id,
      event_id: "b1afa259-4c99-44a5-87ba-4b29a52d9259",
      access_status: "active",
      access_source: "manual_event_admin",
      payment_id: ep[0].id,
      granted_reason: "test_fk_fix",
    })
    .select("id, payment_id, access_source")
    .single();

  if (insErr) {
    console.log("✗ INSERT falló:", insErr.message);
  } else {
    console.log("✓ INSERT OK:", inserted);
    // Cleanup
    await sb.from("event_access").delete().eq("id", inserted.id);
    console.log("✓ Cleanup OK");
  }
}
