// Crea checkout session via API directa de Stripe (bypassea /api/payments/create-checkout
// que falla por capabilities paused). Output: URL que David puede abrir y pagar con 4242.

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
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

const TEST_EMAIL = "qlick-stripe4242-mrotzh2c@mailinator.com";
const CONFIRMATION_ID = "c7c43f76-1bfa-4546-bd99-e0dac92cee92";
const EVENT_ID = "b1afa259-4c99-44a5-87ba-4b29a52d9259";
const EVENT_SLUG = "marketing-ia-para-emprendedores-pago";
const EVENT_TITLE = "Marketing + IA para Emprendedores (Copia - Pago)";
const EVENT_PRICE_MXN = 1000;

const productRefJson = JSON.stringify({
  kind: "event",
  id: EVENT_ID,
  slug: EVENT_SLUG,
  title: EVENT_TITLE,
  priceMXN: EVENT_PRICE_MXN,
});

const params = {
  mode: "payment",
  line_items: [
    {
      quantity: 1,
      price_data: {
        currency: "mxn",
        unit_amount: EVENT_PRICE_MXN * 100,
        product_data: {
          name: `Test E2E 4242 — ${EVENT_TITLE}`,
          description: "Acceso al evento (test automatizado)",
        },
      },
    },
  ],
  payment_method_types: ["card"],
  customer_email: TEST_EMAIL,
  metadata: {
    product_ref: productRefJson,
    kind: "event",
    user_id: "", // vacio: el handler resuelve por email
    user_email: TEST_EMAIL,
    confirmation_id: CONFIRMATION_ID,
    test_tag: "stripe4242-mrotzh2c",
  },
  success_url: `https://www.qlick.digital/pagar/evento/${EVENT_SLUG}/exito?session_id={CHECKOUT_SESSION_ID}`,
  cancel_url: `https://www.qlick.digital/pagar/evento/${EVENT_SLUG}?cancelled=1`,
};

console.log("[CHECKOUT-API] Creando session via Stripe API directa...");
console.log("[CHECKOUT-API] (bypassea /api/payments/create-checkout que falla por capabilities paused)");

const session = await stripe.checkout.sessions.create(params);
console.log("\n[CHECKOUT-API] ✓ Session creada");
console.log("  id:", session.id);
console.log("  status:", session.status);
console.log("  customer_email:", session.customer_email);
console.log("  amount_total:", session.amount_total);
console.log("  url:", session.url);

// Output
const outputDir = join(ROOT, "tests", "output");
if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
const outputPath = join(outputDir, `stripe-test-checkout-${Date.now()}.json`);
writeFileSync(
  outputPath,
  JSON.stringify(
    {
      session_id: session.id,
      session_url: session.url,
      customer_email: session.customer_email,
      confirmation_id: CONFIRMATION_ID,
      created_at: new Date().toISOString(),
    },
    null,
    2
  )
);
console.log(`\n[CHECKOUT-API] Output: ${outputPath}`);
