// Test directo: genera un payload de webhook firmado con el whsec_ de Vercel
// y lo manda al endpoint. Si pasa (200), las env vars están sincronizadas.
//
// Updated: 2026-07-16 — trigger auto-deploy de Vercel.

import crypto from "node:crypto";
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
const whsec = env.STRIPE_WEBHOOK_SECRET;
if (!whsec) {
  console.error("STRIPE_WEBHOOK_SECRET no encontrada en .env.local");
  process.exit(1);
}
console.log(`[TEST-WEBHOOK] whsec_ = ${whsec.slice(0, 15)}...`);

// Genera un evento de prueba
const timestamp = Math.floor(Date.now() / 1000);
const payload = JSON.stringify({
  id: `evt_test_${Date.now()}`,
  object: "event",
  type: "checkout.session.completed",
  api_version: "2026-06-24.dahlia",
  created: timestamp,
  data: {
    object: {
      id: "cs_test_david_" + Date.now(),
      object: "checkout.session",
      payment_status: "paid",
      amount_total: 100000,
      currency: "mxn",
      customer_email: "david17891@gmail.com",
      metadata: { kind: "event", test: "true" },
    },
  },
});

// Firma con whsec_
const signedPayload = `${timestamp}.${payload}`;
const sig = crypto
  .createHmac("sha256", whsec)
  .update(signedPayload, "utf8")
  .digest("hex");
const stripeSignature = `t=${timestamp},v1=${sig}`;

console.log(`[TEST-WEBHOOK] POST a https://www.qlick.digital/api/webhooks/stripe`);
const r = await fetch("https://www.qlick.digital/api/webhooks/stripe", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Stripe-Signature": stripeSignature,
  },
  body: payload,
});
console.log(`[TEST-WEBHOOK] status: ${r.status}`);
const text = await r.text();
console.log(`[TEST-WEBHOOK] body: ${text.slice(0, 500)}`);
