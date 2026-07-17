// Verifica el estado del pago de David tras el redirect de Stripe.
// Revisa: session id del cargo, event_payments, event_confirmations,
// event_access, event_qr_tokens.
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Cargo que David acaba de hacer. Buscar por email + amount + status.
const TARGET_EMAIL = "david17891@gmail.com";
const TARGET_AMOUNT = 100000; // 1000 MXN en centavos

console.log("=== Estado del pago más reciente de David ===\n");

// 1. Cargo en event_payments
const { data: payments } = await sb
  .from("event_payments")
  .select("id, event_id, method, status, amount_mxn, external_reference, created_at, metadata")
  .eq("amount_mxn", 1000)
  .order("created_at", { ascending: false })
  .limit(3);

console.log("event_payments más recientes ($1000 MXN):");
for (const p of payments || []) {
  console.log(`  - id=${p.id.slice(0, 8)} method=${p.method} status=${p.status} ext_ref=${(p.external_reference || "").slice(0, 30)} ts=${p.created_at}`);
}

// 2. Confirmation de David
const { data: confs } = await sb
  .from("event_confirmations")
  .select("id, event_id, name, email, payment_status, source, created_at, updated_at")
  .eq("email", TARGET_EMAIL)
  .order("updated_at", { ascending: false })
  .limit(3);

console.log("\nConfirmations de David:");
for (const c of confs || []) {
  console.log(`  - id=${c.id.slice(0, 8)} payment_status=${c.payment_status} source=${c.source} name=${c.name}`);
  console.log(`    created=${c.created_at} updated=${c.updated_at}`);
}

// 3. event_access
if (confs && confs[0]) {
  const { data: access } = await sb
    .from("event_access")
    .select("id, source, payment_id, granted_at, checked_in_at")
    .eq("confirmation_id", confs[0].id)
    .limit(5);
  console.log(`\nevent_access para confirmation ${confs[0].id.slice(0, 8)}:`);
  for (const a of access || []) {
    console.log(`  - id=${a.id.slice(0, 8)} source=${a.source} payment_id=${(a.payment_id || "").slice(0, 8)} granted_at=${a.granted_at} checked_in_at=${a.checked_in_at || "(no checked in)"}`);
  }
}

// 4. QR token
if (confs && confs[0]) {
  const { data: qr } = await sb
    .from("event_qr_tokens")
    .select("id, token, confirmation_id, created_at")
    .eq("confirmation_id", confs[0].id)
    .order("created_at", { ascending: false })
    .limit(3);
  console.log(`\nQR tokens para confirmation ${confs[0].id.slice(0, 8)}:`);
  for (const q of qr || []) {
    console.log(`  - id=${q.id.slice(0, 8)} token=${q.token.slice(0, 16)}... created=${q.created_at}`);
  }
}

// 5. Cargo en Stripe (búsqueda por external_reference de event_payments)
if (payments && payments[0]) {
  const extRef = payments[0].external_reference;
  console.log(`\n=== Verificación: webhook ya procesó? ===`);
  console.log(`event_payments.external_reference: ${extRef}`);
  console.log(`event_payments.status: ${payments[0].status}`);
  console.log(`confirmation.payment_status: ${confs?.[0]?.payment_status}`);
}

// 6. Resumen
const paymentApproved = payments?.[0]?.status === "approved";
const confPaid = confs?.[0]?.payment_status === "paid" || confs?.[0]?.payment_status === "paid_manual";
const hasAccess = await (async () => {
  if (!confs?.[0]) return false;
  const { data } = await sb.from("event_access").select("id").eq("confirmation_id", confs[0].id).limit(1);
  return (data?.length || 0) > 0;
})();

console.log("\n=== VEREDICTO ===");
console.log(`  payment.status:        ${payments?.[0]?.status || "(no payment)"}`);
console.log(`  confirmation.status:   ${confs?.[0]?.payment_status || "(no conf)"}`);
console.log(`  event_access creada:   ${hasAccess ? "SÍ ✅" : "NO ❌"}`);
console.log(`  Todo OK:               ${paymentApproved && confPaid && hasAccess ? "SÍ ✅" : "NO (esperar webhook)"}`);
