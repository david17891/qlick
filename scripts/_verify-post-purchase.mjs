import { createClient } from "@supabase/supabase-js";

const ref = process.env.SUPABASE_PROJECT_REF ?? "";
const key = process.env.SUPABASE_SECRET_KEY ?? "";

if (!ref || !key) {
  console.error("Missing SUPABASE_PROJECT_REF or SUPABASE_SECRET_KEY");
  process.exit(1);
}

const sb = createClient(`https://${ref}.supabase.co`, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const EMAIL = process.env.TEST_EMAIL ?? "mavis+e2e@qlick.app";
const COURSE_SLUG = "publicidad-facebook-instagram-ads";

console.log(`\n🔍 Post-purchase validation`);
console.log(`   Email: ${EMAIL}`);
console.log(`   Course slug: ${COURSE_SLUG}`);
console.log("");

// Give Stripe webhook a moment to arrive (typically 1-3s after success)
console.log("⏳ Esperando 5s para que el webhook llegue...");
await new Promise((r) => setTimeout(r, 5000));

// 1. Find the user created (or existing)
const { data: userRow } = await sb.auth.admin.listUsers();
const user = userRow?.users?.find((u) => u.email === EMAIL);

if (!user) {
  console.error(`❌ User '${EMAIL}' no encontrado en auth.users.`);
  console.error("   Posible causa: la compra no se completó o hay error en el flujo guest.");
  process.exit(2);
}
console.log(`✅ User encontrado: ${user.id}`);

// 2. Find latest payment for this user
const { data: payments, error: payErr } = await sb
  .from("payments")
  .select("id, provider, status, amount_mxn, currency, course_id, external_reference, idempotency_key, created_at")
  .eq("user_id", user.id)
  .order("created_at", { ascending: false })
  .limit(5);

if (payErr) {
  console.error("❌ Query error en payments:", payErr.message);
  process.exit(3);
}

if (!payments || payments.length === 0) {
  console.error(`❌ NO hay pagos para ${EMAIL}.`);
  console.error("   Posible causa: el webhook de Stripe no llegó o falló el handler.");
  process.exit(4);
}

const lastPayment = payments[0];
console.log(`\n💳 Último payment:`);
console.log(`   id=${lastPayment.id}`);
console.log(`   provider=${lastPayment.provider}`);
console.log(`   status=${lastPayment.status}`);
console.log(`   amount_mxn=${lastPayment.amount_mxn}`);
console.log(`   course_id=${lastPayment.course_id ?? "(null — probablemente es evento, no curso)"}`);
console.log(`   external_reference=${lastPayment.external_reference ?? "(null)"}`);
console.log(`   created_at=${lastPayment.created_at}`);

// 3. Verify status === 'approved'
if (lastPayment.status !== "approved") {
  console.error(`\n❌ Status NO es 'approved' (es '${lastPayment.status}').`);
  console.error("   Posible causa: amount mismatch con V1 suspicious check, o flow diferente.");
  process.exit(5);
}

// 4. Find course_access for this user
const { data: accessRows } = await sb
  .from("course_access")
  .select("id, course_id, access_source, granted_reason, status, created_at")
  .eq("user_id", user.id);

if (!accessRows || accessRows.length === 0) {
  console.error(`\n❌ NO hay course_access para este user.`);
  console.error("   El grant no se ejecutó. Posibles causas:");
  console.error("   - V1 amount validation falló");
  console.error("   - Idempotencia: el webhook ya fue procesado pero access no se grantó");
  process.exit(6);
}

console.log(`\n🔑 course_access rows (${accessRows.length}):`);
for (const acc of accessRows) {
  console.log(`   - course_id=${acc.course_id}`);
  console.log(`     source=${acc.access_source}`);
  console.log(`     reason=${acc.granted_reason ?? "(null)"}`);
  console.log(`     status=${acc.status ?? "(null)"}`);
  console.log(`     created_at=${acc.created_at}`);
}

// 5. Find the course and verify it matches
const { data: course } = await sb
  .from("courses")
  .select("id, slug, title, price_mxn")
  .eq("slug", COURSE_SLUG)
  .single();

if (!course) {
  console.error(`\n⚠️ No pude encontrar course con slug=${COURSE_SLUG}. No es bloqueante.`);
} else {
  console.log(`\n📚 Curso:`);
  console.log(`   id=${course.id}`);
  console.log(`   slug=${course.slug}`);
  console.log(`   title=${course.title}`);
  console.log(`   price_mxn=${course.price_mxn}`);

  const matchingAccess = accessRows.find((a) => a.course_id === course.id);
  if (matchingAccess) {
    console.log(`\n✅✅✅ E2E EXITOSO. Access otorgado para el curso correcto.`);
    console.log(`   user_id=${user.id}`);
    console.log(`   course_id=${course.id}`);
    console.log(`   access_source=${matchingAccess.access_source}`);
  } else {
    console.error(`\n⚠️ Course_access existe pero NO para este curso. Algo raro.`);
    console.error(`   Esperaba course_id=${course.id}, hay: ${accessRows.map((a) => a.course_id).join(", ")}`);
    process.exit(7);
  }
}
