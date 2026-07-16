// Replica lo que el webhook de Stripe hubiera hecho si la firma fuera válida.
// INSERT en event_payments + event_access + UPDATE event_confirmations.payment_status.
//
// Solo para uso de dev/local. NO usar en prod con datos reales.
//
// Uso:
//   node --env-file=.env.local scripts/grant-david-access.mjs

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

const DAVID_EMAIL = "david17891@gmail.com";
const EVENT_ID = "b1afa259-4c99-44a5-87ba-4b29a52d9259";
const CONFIRMATION_ID = "ca24b1be-ebeb-4faf-9f89-896e3b3f8e6b";
const AMOUNT_MXN = 1000;
const PAYMENT_ID = `pi_3Ttx02RXKOh68uzN1g5Ci5Xq`; // session_id del segundo pago de David

console.log(`[GRANT-DAVID] email=${DAVID_EMAIL} event=${EVENT_ID} conf=${CONFIRMATION_ID}`);

// 1. Buscar el userId real de David en auth.users
console.log("\n=== 1. Buscar userId de David en auth.users ===");
const { data: listData, error: listErr } = await sb.auth.admin.listUsers({
  page: 1,
  perPage: 1000,
});
if (listErr) {
  console.error("error listando users:", listErr);
  process.exit(1);
}
const davidUser = listData?.users?.find(
  (u) => u.email?.toLowerCase() === DAVID_EMAIL.toLowerCase()
);
if (!davidUser) {
  console.error(`✗ No existe auth.user con email ${DAVID_EMAIL}`);
  process.exit(1);
}
const USER_ID = davidUser.id;
console.log(`  ✓ userId = ${USER_ID}`);

// 2. INSERT en event_payments
console.log("\n=== 2. INSERT event_payments ===");
const { data: existingPay } = await sb
  .from("event_payments")
  .select("id, status")
  .eq("confirmation_id", CONFIRMATION_ID)
  .maybeSingle();

let paymentId;
if (existingPay) {
  console.log(`  ya existe event_payment: id=${existingPay.id} status=${existingPay.status}`);
  // Actualizar a approved
  const { data: updated, error: updErr } = await sb
    .from("event_payments")
    .update({ status: "approved" })
    .eq("id", existingPay.id)
    .select("id")
    .single();
  if (updErr) {
    console.error(`  ✗ update error: ${updErr.message}`);
  } else {
    paymentId = updated.id;
    console.log(`  ✓ actualizado a status=approved`);
  }
} else {
  const { data: created, error: insErr } = await sb
    .from("event_payments")
    .insert({
      confirmation_id: CONFIRMATION_ID,
      method: "stripe",
      status: "approved",
      amount_mxn: AMOUNT_MXN,
      currency: "MXN",
      external_reference: PAYMENT_ID,
      idempotency_key: `manual:${CONFIRMATION_ID}:stripe`,
      metadata: {
        source: "manual-grant-script",
        stripe_session_id: PAYMENT_ID,
        note: "Bypass de webhook de Stripe por whsec_ desincronizado. Pago SÍ procesado en Stripe (test mode).",
      },
    })
    .select("id")
    .single();
  if (insErr) {
    console.error(`  ✗ insert error: ${insErr.message}`);
    process.exit(1);
  }
  paymentId = created.id;
  console.log(`  ✓ creado: id=${paymentId}`);
}

// 3. INSERT en event_access
console.log("\n=== 3. INSERT event_access ===");
const { data: existingAccess } = await sb
  .from("event_access")
  .select("id, access_status, access_source")
  .or(`user_id.eq.${USER_ID},confirmation_id.eq.${CONFIRMATION_ID}`)
  .maybeSingle();

if (existingAccess) {
  console.log(`  ya existe event_access: id=${existingAccess.id} status=${existingAccess.access_status}`);
  // Actualizar a active
  const { data: updAcc, error: accErr } = await sb
    .from("event_access")
    .update({
      access_status: "active",
      access_source: "event_purchase",
      payment_id: paymentId,
    })
    .eq("id", existingAccess.id)
    .select("id, access_status, access_source")
    .single();
  if (accErr) {
    console.error(`  ✗ update error: ${accErr.message}`);
  } else {
    console.log(`  ✓ actualizado:`, updAcc);
  }
} else {
  const { data: createdAcc, error: accErr } = await sb
    .from("event_access")
    .insert({
      user_id: USER_ID,
      confirmation_id: CONFIRMATION_ID,
      event_id: EVENT_ID,
      access_status: "active",
      access_source: "event_purchase",
      // FK event_access.payment_id → event_payments.id (migration 20260716120000).
      payment_id: paymentId,
      granted_reason: `stripe_paid_${new Date().toISOString().slice(0, 16)}`,
    })
    .select("id, access_status, access_source, payment_id")
    .single();
  if (accErr) {
    console.error(`  ✗ insert error: ${accErr.message}`);
    process.exit(1);
  }
  console.log(`  ✓ creado:`, createdAcc);
}

// 4. UPDATE event_confirmations.payment_status
console.log("\n=== 4. UPDATE event_confirmations.payment_status='paid' ===");
const { data: updConf, error: confErr } = await sb
  .from("event_confirmations")
  .update({ payment_status: "paid" })
  .eq("id", CONFIRMATION_ID)
  .select("id, payment_status")
  .single();
if (confErr) {
  console.error(`  ✗ update error: ${confErr.message}`);
} else {
  console.log(`  ✓ actualizado:`, updConf);
}

console.log(`\n[GRANT-DAVID] ✓ Listo. payment_id=${paymentId}`);
console.log(`[GRANT-DAVID] Email de QR: David debe escribirle al bot "mi QR" o "mi entrada" para que se lo re-envíe.`);
console.log(`[GRANT-DAVID] Verificación: node --env-file=.env.local scripts/verify-pago-david.mjs`);
