// Replica la logica de getStatus() del stripe-provider.ts para diagnosticar.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import Stripe from "stripe";

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

const stripe = new Stripe(env.STRIPE_SECRET_KEY);
const sessionId = process.argv[2] || "cs_test_a1tN6WXvuuMj4FSHsKehtHWnvVk9lHDk1U58elCrj09CcwpdaYH0F1tMSo";

console.log("[getStatus] session_id:", sessionId);
try {
  const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["payment_intent"] });
  const pi = session.payment_intent;
  const piStatus = typeof pi === "string" ? undefined : pi?.status;
  let status = "pending";
  if (session.status === "complete" && piStatus === "succeeded") status = "approved";
  else if (session.status === "expired") status = "expired";
  else if (piStatus === "requires_payment_method" || piStatus === "canceled" || piStatus === "failed") status = "rejected";
  else if (piStatus === "processing" || piStatus === "requires_action" || piStatus === "requires_confirmation") status = "pending";
  console.log(JSON.stringify({
    session_status: session.status,
    pi_status: piStatus,
    mapped: status,
    customer_email: session.customer_email,
  }, null, 2));
} catch (err) {
  console.error("ERROR:", err.type, err.message);
  console.error("Stack:", err.stack?.split("\n").slice(0, 3).join("\n"));
}
