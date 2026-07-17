// Verifica end-to-end del test Stripe 4242.
// - Estado de BD (event_payments, event_access, event_confirmations.payment_status)
// - Outbounds de WhatsApp recientes
// - QR token (para check-in)
//
// Uso: node --env-file=.env.local scripts/verify-stripe-test.mjs

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");

const envText = readFileSync(join(ROOT, ".env.local"), "utf-8");
const env = { ...process.env };
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

const TEST_EMAIL = "qlick-stripe4242-mrotzh2c@mailinator.com";
const TEST_PHONE = "+525555555550";
const CONFIRMATION_ID = "c7c43f76-1bfa-4546-bd99-e0dac92cee92";
const LEAD_ID = "1f348e05-7f5d-4d50-aa88-bc8d8f13913e";
const EVENT_ID = "b1afa259-4c99-44a5-87ba-4b29a52d9259";

let pass = 0;
let fail = 0;
const checks = [];

function check(name, ok, detail) {
  const status = ok ? "✓" : "✗";
  console.log(`  ${status} ${name} — ${detail}`);
  checks.push({ name, ok, detail });
  if (ok) pass++;
  else fail++;
}

console.log(`[VERIFY-TEST] confirmation_id=${CONFIRMATION_ID}`);
console.log(`[VERIFY-TEST] lead_id=${LEAD_ID}`);
console.log(`[VERIFY-TEST] test_email=${TEST_EMAIL}\n`);

// 1. event_confirmations
console.log("=== 1. event_confirmations ===");
const { data: conf, error: e1 } = await sb
  .from("event_confirmations")
  .select("id, name, email, payment_status, source, confirmed_at")
  .eq("id", CONFIRMATION_ID)
  .maybeSingle();
if (e1) check("SELECT confirmation", false, e1.message);
else if (!conf) check("SELECT confirmation", false, "no encontrada");
else {
  console.log("  -", conf.id, "name=" + conf.name, "email=" + conf.email, "payment_status=" + conf.payment_status);
  check("confirmation existe", true, conf.id);
  check("payment_status='paid'", conf.payment_status === "paid", "actual: " + conf.payment_status);
}

// 2. event_payments
console.log("\n=== 2. event_payments ===");
const { data: eps, error: e2 } = await sb
  .from("event_payments")
  .select("id, confirmation_id, amount_mxn, status, method, external_reference, idempotency_key, created_at")
  .eq("confirmation_id", CONFIRMATION_ID);
if (e2) check("SELECT event_payments", false, e2.message);
else if (!eps || eps.length === 0) check("event_payments existe", false, "0 rows");
else {
  for (const e of eps) {
    console.log("  -", e.id, "amount=" + e.amount_mxn, "status=" + e.status, "method=" + e.method, "ext=" + e.external_reference);
  }
  const approved = eps.find((e) => e.status === "approved" && e.amount_mxn === 1000 && e.method === "stripe");
  check("event_payments con status=approved + amount=1000 + method=stripe", !!approved, approved ? approved.id : "ninguno");
}

// 3. event_access
console.log("\n=== 3. event_access ===");
const { data: eas, error: e3 } = await sb
  .from("event_access")
  .select("id, user_id, confirmation_id, event_id, access_status, access_source, payment_id, granted_reason")
  .eq("confirmation_id", CONFIRMATION_ID);
if (e3) check("SELECT event_access", false, e3.message);
else if (!eas || eas.length === 0) check("event_access existe", false, "0 rows");
else {
  for (const a of eas) {
    console.log("  -", a.id, "user=" + (a.user_id?.slice(0, 8) ?? "null"), "status=" + a.access_status, "source=" + a.access_source, "payment_id=" + (a.payment_id?.slice(0, 8) ?? "null"));
  }
  const active = eas.find((a) => a.access_status === "active" && a.access_source === "event_purchase");
  check("event_access con status=active + source=event_purchase", !!active, active ? active.id : "ninguno");
  if (active) {
    check("event_access.payment_id linkeado a event_payments", eps?.some((e) => e.id === active.payment_id), "payment_id=" + active.payment_id);
  }
}

// 4. QR token
console.log("\n=== 4. event_qr_tokens ===");
const { data: eqs, error: e4 } = await sb
  .from("event_qr_tokens")
  .select("id, user_id, event_id, confirmation_id, expires_at, created_at")
  .eq("event_id", EVENT_ID)
  .or(`confirmation_id.eq.${CONFIRMATION_ID},user_id.in.(${eas?.map((a) => a.user_id).filter(Boolean).join(",") ?? "null"})`);
if (e4 && !/does not exist/i.test(e4.message)) {
  check("SELECT event_qr_tokens", false, e4.message);
} else if (eqs && eqs.length > 0) {
  for (const q of eqs) {
    console.log("  -", q.id, "conf=" + (q.confirmation_id?.slice(0, 8) ?? "null"), "expires=" + q.expires_at);
  }
  check("QR token existe", true, eqs[0].id);
} else {
  check("QR token existe", false, "0 rows (puede ser OK si email no se ha procesado)");
}

// 5. WhatsApp outbound
console.log("\n=== 5. lead_whatsapp_conversations ===");
const { data: wa, error: e5 } = await sb
  .from("lead_whatsapp_conversations")
  .select("id, direction, body, created_at, phone_normalized, lead_id")
  .or(`lead_id.eq.${LEAD_ID},phone_normalized.eq.${TEST_PHONE}`)
  .order("created_at", { ascending: false })
  .limit(5);
if (e5) check("SELECT WhatsApp", false, e5.message);
else {
  for (const m of wa ?? []) {
    const isOutbound = m.direction === "outbound" ? "↗ outbound" : "↙ inbound";
    console.log(`  [${m.created_at}] ${isOutbound}: ${m.body?.slice(0, 100)}...`);
  }
  const pagoConfirm = (wa ?? []).find(
    (m) =>
      m.direction === "outbound" &&
      /pago.*confirm|qr.*valid|entrada.*confirm/i.test(m.body ?? "")
  );
  check(
    "outbound WhatsApp con notificacion de pago",
    !!pagoConfirm,
    pagoConfirm ? pagoConfirm.id : "no encontrado (provider manual_wa solo genera link wa.me, no escribe a BD)"
  );
}

// 6. auth.users (deberia haberse creado via resolveOrCreateUserId)
console.log("\n=== 6. auth.users (esperado creado por handler) ===");
const { data: authList } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
const testUser = authList?.users?.find((u) => u.email?.toLowerCase() === TEST_EMAIL.toLowerCase());
if (testUser) {
  console.log("  -", testUser.id, "email=" + testUser.email, "created=" + testUser.created_at);
  check("auth.user creado via resolveOrCreateUserId", true, testUser.id);
} else {
  check("auth.user creado via resolveOrCreateUserId", false, "no encontrado (puede que la metadata user_id no haya triggereado el resolve)");
}

// Resumen
console.log(`\n=== RESUMEN ===`);
console.log(`Pass: ${pass}`);
console.log(`Fail: ${fail}`);
console.log(`Total: ${pass + fail}`);

const outputDir = join(ROOT, "tests", "output");
if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
const outputPath = join(outputDir, `verify-stripe-test-${Date.now()}.json`);
writeFileSync(
  outputPath,
  JSON.stringify(
    {
      test_email: TEST_EMAIL,
      confirmation_id: CONFIRMATION_ID,
      lead_id: LEAD_ID,
      event_id: EVENT_ID,
      pass,
      fail,
      total: pass + fail,
      checks,
      verified_at: new Date().toISOString(),
    },
    null,
    2
  )
);
console.log(`\nOutput: ${outputPath}`);

if (fail > 0) process.exit(1);
