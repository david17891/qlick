// Verifica el cargo ch_3TtxdURXKOh68uzN0C14sOgx en Stripe.
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
const auth = Buffer.from(SK + ":").toString("base64");

const CHARGE_ID = "ch_3TtxdURXKOh68uzN0C14sOgx";
const r = await fetch(
  `https://api.stripe.com/v1/charges/${CHARGE_ID}?expand=payment_intent.checkout_session`,
  { headers: { Authorization: "Basic " + auth } }
);
const d = await r.json();
console.log("status:", r.status);
console.log("Charge id:", d.id);
console.log("Charge status:", d.status, "paid:", d.paid, "amount:", d.amount / 100);
console.log("PaymentIntent:", d.payment_intent?.id, "status:", d.payment_intent?.status);
const cs = d.payment_intent?.checkout_session;
if (cs) {
  console.log("CheckoutSession:", cs.id, "status:", cs.status, "payment_status:", cs.payment_status);
  console.log("CS metadata:", JSON.stringify(cs.metadata).slice(0, 200));
} else {
  console.log("CheckoutSession: not present (or not expanded)");
}
console.log("Charge metadata:", JSON.stringify(d.metadata).slice(0, 200));
console.log("created:", new Date(d.created * 1000).toISOString());
