// Test ambos whsec_ contra el endpoint de Qlick para ver cuál matchea.
// 1 = el que David me dio, 2 = el viejo del .env.local original.

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

const WHITELIST = [
  { name: "1. David (whsec_rON6akBG3...)", whsec: "whsec_rON6akBG3BCtkzNwMDydyd6phqeTAOdg" },
  { name: "2. VIEJO .env.local (whsec_52b86770...)", whsec: "whsec_52b86770d46cb15653e3c02aed552174874f8953dae01b80d597d6aa1f50591d" },
];

const URL = "https://www.qlick.digital/api/webhooks/stripe";

for (const { name, whsec } of WHITELIST) {
  const timestamp = Math.floor(Date.now() / 1000);
  const payload = JSON.stringify({
    id: `evt_test_${timestamp}_${Math.random().toString(36).slice(2, 6)}`,
    object: "event",
    type: "checkout.session.completed",
    api_version: "2026-06-24.dahlia",
    created: timestamp,
    data: {
      object: {
        id: "cs_test_" + timestamp,
        object: "checkout.session",
        payment_status: "paid",
        amount_total: 100000,
        currency: "mxn",
        customer_email: "david17891@gmail.com",
        metadata: { kind: "event", test: "true" },
      },
    },
  });
  const signedPayload = `${timestamp}.${payload}`;
  const sig = crypto
    .createHmac("sha256", whsec)
    .update(signedPayload, "utf8")
    .digest("hex");
  const stripeSignature = `t=${timestamp},v1=${sig}`;

  const r = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Stripe-Signature": stripeSignature },
    body: payload,
  });
  const text = await r.text();
  const status = r.status;
  const summary = status === 200 ? "✓ PASS" : "✗ FAIL";
  console.log(`\n${name}`);
  console.log(`  status: ${status} (${summary})`);
  console.log(`  body: ${text.slice(0, 200)}`);
}
