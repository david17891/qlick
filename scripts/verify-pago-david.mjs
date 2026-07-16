// Verifica el flow end-to-end del pago de David.
// Columnas SELECT exactas de las migrations (typegen stale).

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

const DAVID_PHONE = "+526532935492";
const DAVID_LEAD_ID = "92739b21-05cf-4421-842b-6b50ea71f2d9";
const DAVID_USER_ID = "095a134c-252e-4375-9200-aff58aefa5b3"; // auth.users.id
const DAVID_EMAIL = "david17891@gmail.com";
const EVENT_ID = "b1afa259-4c99-44a5-87ba-4b29a52d9259";
const CONFIRMATION_ID = "ca24b1be-ebeb-4faf-9f89-896e3b3f8e6b";

console.log(`[VERIFY] David phone=${DAVID_PHONE} lead=${DAVID_LEAD_ID}\n`);

const results = { pass: 0, fail: 0 };
const checks = [];
function check(name, ok, detail = "") {
  if (ok) {
    results.pass++;
    console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    results.fail++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
  checks.push({ name, ok, detail });
}

// ────────────────────────────────────────────────────────────
// 1. event_confirmations
// ────────────────────────────────────────────────────────────
console.log("=== 1. event_confirmations ===");
const { data: confs, error: confErr } = await sb
  .from("event_confirmations")
  .select("id, event_id, name, email, phone_normalized, payment_status, source, confirmed_at")
  .eq("phone_normalized", DAVID_PHONE)
  .eq("event_id", EVENT_ID);
if (confErr) {
  check("SELECT event_confirmations", false, confErr.message);
} else {
  check("SELECT event_confirmations", true, `${confs.length} row(s)`);
  for (const c of confs) {
    console.log(`    - id=${c.id}`);
    console.log(`      name=${c.name} email=${c.email} source=${c.source}`);
    console.log(`      payment_status=${c.payment_status} confirmed_at=${c.confirmed_at}`);
  }
  const conf = confs[0];
  if (conf) {
    check(
      "payment_status actualizado a 'paid'",
      conf.payment_status === "paid",
      `actual: ${conf.payment_status}`
    );
  } else {
    check("existe confirmation", false, "ninguna row");
  }
}

const confIds = (confs ?? []).map((c) => c.id);

// ────────────────────────────────────────────────────────────
// 2. event_payments
// ────────────────────────────────────────────────────────────
console.log("\n=== 2. event_payments ===");
if (confIds.length === 0) {
  check("SELECT event_payments", false, "no hay confirmation_id");
} else {
  const { data: pays, error: payErr } = await sb
    .from("event_payments")
    .select("id, confirmation_id, amount_mxn, status, method, external_reference, idempotency_key, created_at")
    .in("confirmation_id", confIds);
  if (payErr) {
    check("SELECT event_payments", false, payErr.message);
  } else {
    check("SELECT event_payments", true, `${pays.length} row(s)`);
    for (const p of pays) {
      console.log(`    - id=${p.id}`);
      console.log(`      amount=${p.amount_mxn} status=${p.status} method=${p.method}`);
      console.log(`      external_ref=${p.external_reference}`);
      console.log(`      idempotency_key=${p.idempotency_key}`);
      console.log(`      created_at=${p.created_at}`);
    }
    const stripePay = pays.find((p) => p.method === "stripe");
    const approved = pays.find((p) => p.status === "approved");
    check("event_payments con method='stripe'", !!stripePay, stripePay ? `id=${stripePay.id}` : "ninguno");
    check("event_payments con status='approved'", !!approved, approved ? `id=${approved.id}` : "ninguno");
    check("event_payments con amount_mxn=1000", pays.some((p) => Number(p.amount_mxn) === 1000), "OK");
  }
}

// ────────────────────────────────────────────────────────────
// 3. event_access (columnas reales: access_status, access_source)
// ────────────────────────────────────────────────────────────
console.log("\n=== 3. event_access ===");
try {
  const { data: access, error: accessErr } = await sb
    .from("event_access")
    .select("id, user_id, confirmation_id, event_id, access_status, access_source, payment_id, granted_reason")
    .or(`user_id.eq.${DAVID_USER_ID},confirmation_id.eq.${CONFIRMATION_ID}`);
  if (accessErr) {
    check("SELECT event_access", false, accessErr.message);
  } else {
    check("SELECT event_access", true, `${access.length} row(s)`);
    for (const a of access) {
      console.log(`    - id=${a.id}`);
      console.log(`      user_id=${a.user_id} confirmation_id=${a.confirmation_id?.slice(0, 8) ?? "null"}`);
      console.log(`      event_id=${a.event_id} status=${a.access_status} source=${a.access_source}`);
      console.log(`      payment_id=${a.payment_id?.slice(0, 8) ?? "null"}`);
      console.log(`      granted_at=${a.granted_at} reason=${a.granted_reason}`);
    }
    const active = access.find((a) => a.access_status === "active");
    check("event_access con access_status='active'", !!active, active ? `source=${active.access_source}` : "ninguno");
    const purchased = access.find((a) => a.access_source === "event_purchase");
    check("event_access con access_source='event_purchase'", !!purchased, purchased ? `payment_id=${purchased.payment_id?.slice(0, 8)}` : "ninguno");
  }
} catch (e) {
  check("SELECT event_access", false, e.message);
}

// ────────────────────────────────────────────────────────────
// 4. event_attendees
// ────────────────────────────────────────────────────────────
console.log("\n=== 4. event_attendees ===");
let atts = [];
try {
  const { data, error: attErr } = await sb
    .from("event_attendees")
    .select("id, lead_id, confirmation_id, event_id, checked_in_at, name, email, phone_normalized, source")
    .or(`phone_normalized.eq.${DAVID_PHONE},confirmation_id.in.(${confIds.join(",")})`);
  if (attErr) {
    console.log(`    (no attendees query error: ${attErr.message})`);
  } else {
    atts = data ?? [];
    console.log(`    ${atts.length} row(s):`);
    for (const a of atts) {
      console.log(`    - id=${a.id?.slice(0, 8)}... name=${a.name} checked_in=${a.checked_in_at ?? "(no)"} source=${a.source}`);
    }
  }
} catch (e) {
  console.log(`    error: ${e.message}`);
}

// ────────────────────────────────────────────────────────────
// 5. lead_whatsapp_conversations (último outbound)
// ────────────────────────────────────────────────────────────
console.log("\n=== 5. lead_whatsapp_conversations (último outbound) ===");
const { data: outbounds, error: outErr } = await sb
  .from("lead_whatsapp_conversations")
  .select("id, direction, body, created_at, metadata")
  .eq("lead_id", DAVID_LEAD_ID)
  .order("created_at", { ascending: false })
  .limit(8);
if (outErr) {
  check("SELECT outbounds", false, outErr.message);
} else {
  console.log(`    últimos ${outbounds.length} mensajes:`);
  for (const o of outbounds) {
    const ts = new Date(o.created_at).toISOString();
    const preview = (o.body ?? "").slice(0, 100).replace(/\n/g, " | ");
    console.log(`    - [${ts}] ${o.direction}: ${preview}`);
  }
  // Buscar el outbound que notifica el pago confirmado.
  // Match estricto: solo cuenta si el body menciona "PAGO confirmado" o "tu entrada
  // está confirmada". No matchea "gracias por tu feedback" del survey.
  const payNotif = outbounds.find(
    (o) => o.direction === "outbound" && /(pago confirmado|pago.*acreditad|entrega.*qr|entrada.*confirmad)/i.test(o.body ?? "")
  );
  check(
    "outbound WhatsApp con notificación de pago confirmado",
    !!payNotif,
    payNotif ? `body: ${(payNotif.body ?? "").slice(0, 100)}` : "no encontrado"
  );
}

// ────────────────────────────────────────────────────────────
// 6. lead status
// ────────────────────────────────────────────────────────────
console.log("\n=== 6. lead status ===");
const { data: lead } = await sb
  .from("leads")
  .select("id, name, email, status, whatsapp_status, last_event_payment_at")
  .eq("id", DAVID_LEAD_ID)
  .single();
if (lead) {
  console.log(`    status=${lead.status} whatsapp_status=${lead.whatsapp_status}`);
  console.log(`    last_event_payment_at=${lead.last_event_payment_at ?? "(null)"}`);
}

// ────────────────────────────────────────────────────────────
// Resumen
// ────────────────────────────────────────────────────────────
console.log(`\n=== RESUMEN ===`);
console.log(`  Pass: ${results.pass}`);
console.log(`  Fail: ${results.fail}`);
console.log(`  Total: ${results.pass + results.fail}`);

const allPass = results.fail === 0;
console.log(`\n${allPass ? "✓ FLOW COMPLETO OK" : "✗ HAY FALLOS — REVISAR"}`);

// Output JSON
const { writeFileSync, mkdirSync } = await import("node:fs");
const outputDir = join(ROOT, "tests", "output");
if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
const outputPath = join(outputDir, `verify-pago-david-${Date.now()}.json`);
writeFileSync(
  outputPath,
  JSON.stringify(
    {
      timestamp: new Date().toISOString(),
      david: { phone: DAVID_PHONE, leadId: DAVID_LEAD_ID, email: DAVID_EMAIL },
      confirmations: confs,
      payments: null,
      access: null,
      lead,
      checks,
      summary: results,
    },
    null,
    2
  ),
  "utf-8"
);
console.log(`\nOutput JSON: ${outputPath}`);

process.exit(allPass ? 0 : 1);
