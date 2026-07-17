// Re-Resend programático del cargo real de David.
// Construye un payload de checkout.session.completed firmado con el
// whsec_ de Vercel, idéntico al que mandaría Stripe, pero construido
// desde los datos reales del cargo ch_3TtxdURXKOh68uzN0C14sOgx.
//
// Bypassea:
// - Stripe Dashboard (David no necesita hacer Resend manual)
// - El problema de que el evento viejo en Stripe quedó registrado
//   como "fallido" y el Dashboard no permite re-enviarlo
// - Cualquier cache de Cloudflare (mandamos directo al dominio)
//
// Updated: 2026-07-16 — sprint event-payments.

import crypto from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

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
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

// CONSTANTES — IDs y datos del cargo real de David
const DAVID_EMAIL = "david17891@gmail.com";
const DAVID_LEAD_ID = "92739b21-05cf-4421-842b-6b50ea71f2d9"; // leads.id
const EVENT_ID = "b1afa259-4c99-44a5-87ba-4b29a52d9259";
const EVENT_PRICE_MXN = 1000;
const SESSION_ID = "cs_test_a1zM6NcBGXTPCP6JR2Rt0iH8xWFZvW0dtKHh93O4lMOjScyuSFx9Gl15NN";
const CHARGE_ID = "ch_3TtxdURXKOh68uzN0C14sOgx";
const PAYMENT_INTENT_ID = "pi_3TtxdURXKOh68uzN0cbNHGDp";
const STRIPE_EVENT_ID = "evt_1TtxdVRXKOh68uzNEJAWPDJM";
const AMOUNT_CENTAVOS = 100000; // $1000 MXN
const CURRENCY = "mxn";

// 1) Resolver el user_id (auth.users) de David por email.
console.log("[RESEND] Resolviendo auth.user.id de David...");
const { data: listData, error: listErr } = await sb.auth.admin.listUsers({
  page: 1,
  perPage: 1000,
});
if (listErr) throw listErr;
const davidAuthUser = listData?.users?.find(
  (u) => u.email?.toLowerCase() === DAVID_EMAIL.toLowerCase()
);
if (!davidAuthUser) {
  console.error("[RESEND] No se encontró auth.user para", DAVID_EMAIL);
  process.exit(1);
}
const userId = davidAuthUser.id; // auth.user.id (NO leads.id)
console.log("[RESEND] auth.user.id =", userId);
console.log("[RESEND] leads.id =", DAVID_LEAD_ID);

// 2) Construir el payload idéntico al que mandaría Stripe.
//    IMPORTANTE: la metadata debe tener `product_ref` como JSON
//    serializado (ver src/lib/payments/stripe-provider.ts:104).
const timestamp = Math.floor(Date.now() / 1000);
const idempotencyKey = `evt_${STRIPE_EVENT_ID}`;
const productRefJson = JSON.stringify({
  kind: "event",
  id: EVENT_ID,
  slug: "marketing-ia-para-emprendedores-pago",
  title: "Marketing + IA para Emprendedores (Copia - Pago)",
  priceMXN: EVENT_PRICE_MXN,
});
const payload = JSON.stringify({
  id: STRIPE_EVENT_ID,
  object: "event",
  type: "checkout.session.completed",
  api_version: "2026-06-24.dahlia",
  created: timestamp,
  livemode: false,
  data: {
    object: {
      id: SESSION_ID,
      object: "checkout.session",
      payment_status: "paid",
      status: "complete",
      amount_total: AMOUNT_CENTAVOS,
      currency: CURRENCY,
      customer_email: DAVID_EMAIL,
      customer_details: { email: DAVID_EMAIL, name: "David Martinez" },
      payment_intent: PAYMENT_INTENT_ID,
      metadata: {
        product_ref: productRefJson,
        kind: "event",
        // user_id en metadata es el auth.user.id (no leads.id).
        // El handler lo pasa directo a grantEventAccess que requiere
        // FK a auth.users.id. Si pones leads.id aquí, el INSERT a
        // event_access viola event_access_user_id_fkey.
        user_id: userId,
        user_email: DAVID_EMAIL,
      },
    },
  },
});

// 3) Firmar con whsec_ (mismo algoritmo que Stripe).
const signedPayload = `${timestamp}.${payload}`;
const sig = crypto
  .createHmac("sha256", whsec)
  .update(signedPayload, "utf8")
  .digest("hex");
const stripeSignature = `t=${timestamp},v1=${sig}`;

console.log("[RESEND] whsec_:", whsec.slice(0, 15) + "...");
console.log("[RESEND] timestamp:", timestamp);
console.log("[RESEND] sig (primeros 16):", sig.slice(0, 16) + "...");
console.log("[RESEND] event_id:", STRIPE_EVENT_ID);
console.log("[RESEND] session_id:", SESSION_ID);
console.log("[RESEND] user_id (auth):", userId);
console.log("[RESEND] event_id (ref):", EVENT_ID);
console.log("[RESEND] amount_total:", AMOUNT_CENTAVOS, "centavos");
console.log("[RESEND] payment_intent:", PAYMENT_INTENT_ID);

// 4) POST al endpoint de producción.
const url = "https://www.qlick.digital/api/webhooks/stripe";
console.log("\n[RESEND] POST →", url);
const r = await fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Stripe-Signature": stripeSignature,
    "User-Agent": "Stripe/1.0 (+https://stripe.com)",
  },
  body: payload,
});
console.log("[RESEND] status:", r.status);
const text = await r.text();
console.log("[RESEND] body:", text.slice(0, 1000));
console.log("[RESEND] content-type:", r.headers.get("content-type"));
