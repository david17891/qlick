// Consulta la API de Stripe (test mode) para ver si hay un checkout session
// reciente de $1000 MXN. Si SÍ existe, el pago se procesó en Stripe pero el
// webhook no se disparó (o rebotó). Si NO existe, el pago no se completó.

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
const SK = env.STRIPE_SECRET_KEY;
if (!SK || !SK.startsWith("sk_test_")) {
  console.error("[ERROR] STRIPE_SECRET_KEY no encontrada o no es test mode.");
  process.exit(1);
}
console.log(`[OK] sk_test_ = ${SK.slice(0, 20)}...`);

const auth = Buffer.from(`${SK}:`).toString("base64");
const headers = {
  Authorization: `Basic ${auth}`,
  "Content-Type": "application/x-www-form-urlencoded",
};

async function stripe(method, path, body) {
  const url = `https://api.stripe.com/v1${path}`;
  const opts = { method, headers };
  if (body) {
    opts.body = new URLSearchParams(body).toString();
  }
  const r = await fetch(url, opts);
  const data = await r.json();
  if (!r.ok) {
    console.error(`[STRIPE ${method} ${path}] error ${r.status}:`, JSON.stringify(data, null, 2));
    return null;
  }
  return data;
}

// 1. Listar checkout sessions recientes
console.log("\n=== 1. Listar checkout sessions (últimas 10) ===");
const sessions = await stripe("GET", "/checkout/sessions?limit=10");
if (!sessions) process.exit(1);
console.log(`Total: ${sessions.data.length} sessions`);

for (const s of sessions.data) {
  const amountMXN = s.amount_total ? s.amount_total / 100 : 0;
  const isDavidEvent =
    s.metadata?.product_ref?.includes("b1afa259-4c99-44a5-87ba-4b29a52d9259") ||
    s.metadata?.kind === "event";
  const flag = isDavidEvent ? " ⭐ DAVID-EVENT" : "";
  console.log(`\n  ${s.id}${flag}`);
  console.log(`    amount: $${amountMXN} ${s.currency?.toUpperCase()}`);
  console.log(`    status: ${s.status}  payment_status: ${s.payment_status}`);
  console.log(`    customer_email: ${s.customer_details?.email ?? s.customer_email ?? "(none)"}`);
  console.log(`    created: ${new Date(s.created * 1000).toISOString()}`);
  console.log(`    metadata.kind: ${s.metadata?.kind}`);
  console.log(`    metadata.product_ref: ${s.metadata?.product_ref?.slice(0, 80)}...`);
  console.log(`    payment_method_types: ${s.payment_method_types?.join(", ")}`);
  console.log(`    success_url: ${s.success_url?.slice(0, 80)}...`);
  console.log(`    cancel_url: ${s.cancel_url?.slice(0, 80)}...`);
}

// 2. Buscar eventos de webhook recientes (uno por tipo)
console.log("\n=== 2. Listar eventos recientes (últimos 20) ===");
for (const evType of [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "charge.refunded",
]) {
  const events = await stripe("GET", `/events?limit=10&type=${evType}`);
  if (events) {
    if (events.data.length > 0) {
      console.log(`\n  [${evType}] ${events.data.length} eventos:`);
      for (const ev of events.data) {
        const obj = ev.data?.object;
        const isDavid = obj?.metadata?.product_ref?.includes("b1afa259") || obj?.metadata?.kind === "event";
        const flag = isDavid ? " ⭐ DAVID" : "";
        console.log(`    ${ev.id} (${new Date(ev.created * 1000).toISOString()})${flag}`);
        if (obj?.id) console.log(`      session: ${obj.id}  amount: ${obj.amount_total ? obj.amount_total / 100 : "?"}  status: ${obj.payment_status}`);
      }
    }
  }
}

// 3. Listar TODOS los payment_intents
console.log("\n=== 3. Listar TODOS los payment_intents ===");
const intents = await stripe("GET", "/payment_intents?limit=20");
if (intents) {
  console.log(`Total: ${intents.data.length}`);
  for (const pi of intents.data) {
    const amountMXN = pi.amount ? pi.amount / 100 : 0;
    const isDavid = pi.metadata?.product_ref?.includes("b1afa259") || pi.metadata?.kind === "event";
    const flag = isDavid ? " ⭐ DAVID-EVENT" : "";
    console.log(`  ${pi.id} $${amountMXN} ${pi.currency?.toUpperCase()} status=${pi.status}${flag}`);
  }
}

// 4. Listar TODOS los checkout sessions (sin filtro)
console.log("\n=== 4. Listar TODOS los checkout sessions ===");
const allSessions = await stripe("GET", "/checkout/sessions?limit=20");
if (allSessions) {
  console.log(`Total: ${allSessions.data.length}`);
  for (const s of allSessions.data) {
    const isDavid = s.metadata?.product_ref?.includes("b1afa259") || s.metadata?.kind === "event";
    const flag = isDavid ? " ⭐ DAVID" : "";
    console.log(`  ${s.id} $${s.amount_total / 100} ${s.currency?.toUpperCase()} status=${s.status} payment=${s.payment_status}${flag}`);
    console.log(`    metadata.kind=${s.metadata?.kind} metadata.product_ref=${s.metadata?.product_ref?.slice(0, 60)}...`);
    console.log(`    created: ${new Date(s.created * 1000).toISOString()}`);
  }
}
