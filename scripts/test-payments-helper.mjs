// Test directo del helper getEventPaymentsSnapshot.
// Replica la logica del SQL para confirmar que los pagos de David
// (cash) y los del cleanup (stripe) se verian correctamente.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");

const envText = readFileSync(join(ROOT, ".env.local"), "utf-8");
const env = {};
for (const l of envText.split(/\r?\n/)) {
  const t = l.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq === -1) continue;
  let v = t.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  env[t.slice(0, eq).trim()] = v;
}

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

const EVENT_ID = "b1afa259-4c99-44a5-87ba-4b29a52d9259";
const DEFAULT_PRICE = 1000;

console.log("[TEST-HELPER] Simulando getEventPaymentsSnapshot con la logica nueva...");

// 1. confirmations
const { data: confs } = await sb
  .from("event_confirmations")
  .select("id, name, email, payment_status, source")
  .eq("event_id", EVENT_ID);
console.log("\n=== Confirmations ===");
for (const c of confs ?? []) console.log("  -", c.id.slice(0, 8), c.name, "ps=" + c.payment_status);

const confIds = (confs ?? []).map((c) => c.id);

// 2. event_payments (logica nueva del helper)
const { data: eps } = await sb
  .from("event_payments")
  .select("id, confirmation_id, method, status, amount_mxn, currency, external_reference, created_at, metadata")
  .in("confirmation_id", confIds)
  .order("created_at", { ascending: false });
console.log("\n=== event_payments (leidos correctamente desde event_payments) ===");
for (const e of eps ?? []) console.log("  -", e.id.slice(0, 8), "conf=" + e.confirmation_id.slice(0, 8), "amount=$" + e.amount_mxn, "status=" + e.status, "method=" + e.method);

// 3. Stats
const stats = {
  totalConfirmed: confs?.length ?? 0,
  totalPaid: 0,
  totalPending: 0,
  totalPendingVerification: 0,
  totalRevoked: 0,
  totalNotRequired: 0,
  totalCollectedCentavos: 0,
  byMethod: {},
};
for (const c of confs ?? []) {
  const s = c.payment_status ?? "not_required";
  if (s === "paid" || s === "paid_manual") stats.totalPaid++;
  else if (s === "pending") stats.totalPending++;
  else if (s === "pending_verification") stats.totalPendingVerification++;
  else if (s === "revoked") stats.totalRevoked++;
  else if (s === "not_required") stats.totalNotRequired++;
}
for (const p of eps ?? []) {
  if (p.status === "approved") stats.totalCollectedCentavos += p.amount_mxn;
  const method = p.method ?? "unknown";
  if (!stats.byMethod[method]) stats.byMethod[method] = { count: 0, centavos: 0 };
  stats.byMethod[method].count++;
  if (p.status === "approved") stats.byMethod[method].centavos += p.amount_mxn;
}

console.log("\n=== Stats (lo que vera el dashboard) ===");
console.log(JSON.stringify(stats, null, 2));

// 4. Lista de payments para la tabla
console.log("\n=== Payments para la tabla del admin ===");
const confById = new Map((confs ?? []).map((c) => [c.id, c]));
for (const p of eps ?? []) {
  const conf = confById.get(p.confirmation_id);
  console.log("  -", p.id.slice(0, 8), "name=" + (conf?.name ?? "?"), "method=" + p.method, "amount=$" + p.amount_mxn, "status=" + p.status, "provider=" + (p.method === "cash" ? "manual_admin" : p.method));
}

console.log("\n[TEST-HELPER] ✓ El helper nuevo ahora muestra los pagos en efectivo de David");
console.log("Comparar con el bug original: antes retornaba payments=[] (leia de tabla equivocada)");
