// Limpia state de BD: borra event_payments + event_access del bypass anterior
// y resetea event_confirmations.payment_status de David a 'pending'.
// Necesario antes de re-Resend programático.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

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
  { auth: { persistSession: false } }
);

const DAVID_EMAIL = "david17891@gmail.com";

console.log("=== Limpiando state de BD para re-Resend ===\n");

// 1. Listar event_payments existentes
const { data: eps, error: e1 } = await sb
  .from("event_payments")
  .select("id, confirmation_id, external_reference, status, amount_mxn, created_at");
if (e1) throw e1;
console.log("event_payments antes:", eps?.length ?? 0, "rows");
for (const e of eps ?? []) {
  console.log("  -", e.id, "ref=" + e.external_reference, "amount=" + e.amount_mxn, "status=" + e.status);
}

// 2. Borrar todos los event_payments
const { error: eDel1 } = await sb
  .from("event_payments")
  .delete()
  .neq("id", "00000000-0000-0000-0000-000000000000");
console.log("event_payments delete:", eDel1?.message ?? "OK");

// 3. Listar event_access
const { data: eas, error: e2 } = await sb
  .from("event_access")
  .select("id, access_status, access_source, user_id, confirmation_id, payment_id");
if (e2) throw e2;
console.log("\nevent_access antes:", eas?.length ?? 0, "rows");
for (const e of eas ?? []) {
  console.log("  -", e.id, "user=" + (e.user_id?.slice(0,8) ?? "null"), "conf=" + (e.confirmation_id?.slice(0,8) ?? "null"), "status=" + e.access_status);
}

// 4. Borrar todos los event_access
const { error: eDel2 } = await sb
  .from("event_access")
  .delete()
  .neq("id", "00000000-0000-0000-0000-000000000000");
console.log("event_access delete:", eDel2?.message ?? "OK");

// 5. Reset event_confirmations.payment_status de David
const { data: ecs, error: e3 } = await sb
  .from("event_confirmations")
  .select("id, email, payment_status, source")
  .eq("email", DAVID_EMAIL);
if (e3) throw e3;
console.log("\nevent_confirmations de David:", ecs?.length ?? 0, "rows");
for (const c of ecs ?? []) {
  console.log("  -", c.id, "status=" + c.payment_status, "source=" + c.source);
  if (c.payment_status === "paid") {
    const { error: eUpd } = await sb
      .from("event_confirmations")
      .update({ payment_status: "pending" })
      .eq("id", c.id);
    console.log("    reset payment_status → pending:", eUpd?.message ?? "OK");
  }
}

// 6. Borrar event_qr_tokens de David (por si quedó alguno)
const { data: eqs, error: e4 } = await sb
  .from("event_qr_tokens")
  .select("id, user_id, event_id, expires_at");
if (e4 && !e4.message.includes("does not exist")) {
  console.log("event_qr_tokens query warn:", e4.message);
}
console.log("\nevent_qr_tokens antes:", eqs?.length ?? 0, "rows");
if (eqs && eqs.length > 0) {
  const { error: eDel3 } = await sb
    .from("event_qr_tokens")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  console.log("event_qr_tokens delete:", eDel3?.message ?? "OK");
}

console.log("\n=== STATE LIMPIO. Listo para re-Resend. ===");
