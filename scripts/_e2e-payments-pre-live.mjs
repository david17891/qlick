/**
 * scripts/_e2e-payments-pre-live.mjs
 *
 * E2E limited: validate the HTTP contracts of Qlick → Stripe payments
 * without fighting Stripe Checkout's anti-bot UI.
 *
 * Checks:
 *   1. POST /api/payments/create-checkout with a real slug + guest email
 *      → expect 200 + { flow: 'redirect', redirectUrl: 'https://checkout.stripe.com/c/pay/cs_test_*' }
 *   2. POST /api/webhooks/stripe WITHOUT signature
 *      → expect 400 ("Falta stripe-signature header.")
 *   3. POST /api/webhooks/stripe WITH fake signature
 *      → expect 401 ("Firma inválida")
 *
 * All checks run against PRODUCTION: https://www.qlick.digital
 * Use card 4242 4242 4242 4242 in the redirected Stripe Checkout for
 * real-world visual smoke. This script does NOT click through Stripe's UI.
 *
 * Run: node scripts/_e2e-payments-pre-live.mjs
 */

const BASE = "https://www.qlick.digital";
const COURSE_SLUG = "publicidad-facebook-instagram-ads";
const TEST_EMAIL = "mavis+e2e@qlick.app";

const results = [];
function record(name, status, detail) {
  results.push({ name, status, detail });
  const icon = status === "PASS" ? "✅" : status === "FAIL" ? "❌" : "⏭️";
  console.log(`${icon} ${name.padEnd(50)} ${status.padEnd(5)} ${detail ? "— " + detail : ""}`);
}

async function step1_createCheckout() {
  const url = `${BASE}/api/payments/create-checkout`;
  const body = JSON.stringify({
    slug: COURSE_SLUG,
    email: TEST_EMAIL,
  });
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = null; }

    if (res.status === 200 && json?.flow === "redirect" && json?.redirectUrl?.startsWith("https://checkout.stripe.com/")) {
      const isTestMode = json.redirectUrl.includes("/cs_test_");
      record(
        "1. create-checkout (guest, precio > 0) → Stripe",
        "PASS",
        `redirect URL test=${isTestMode}, curso=${COURSE_SLUG}, $499 MXN`
      );
    } else if (json?.alreadyPaid) {
      record("1. create-checkout (guest, precio > 0) → Stripe", "FAIL",
        "Email ya compró este curso (alreadyPaid: true). Test conflict.");
    } else {
      record("1. create-checkout (guest, precio > 0) → Stripe", "FAIL",
        `HTTP ${res.status}, body: ${text.slice(0, 200)}`);
    }
  } catch (err) {
    record("1. create-checkout (guest, precio > 0) → Stripe", "FAIL", `error: ${err.message}`);
  }
}

async function step2_webhookNoSignature() {
  const url = `${BASE}/api/webhooks/stripe`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "checkout.session.completed" }),
    });
    const text = await res.text();
    const json = (() => { try { return JSON.parse(text); } catch { return null; } })();

    if (res.status === 400 && json?.error?.includes("stripe-signature")) {
      record("2. webhook sin stripe-signature header → 400",
        "PASS", "rechaza requests sin firma");
    } else {
      record("2. webhook sin stripe-signature header → 400",
        "FAIL", `HTTP ${res.status}, body: ${text.slice(0, 200)}`);
    }
  } catch (err) {
    record("2. webhook sin stripe-signature header → 400", "FAIL", `error: ${err.message}`);
  }
}

async function step3_webhookBadSignature() {
  const url = `${BASE}/api/webhooks/stripe`;
  const body = JSON.stringify({
    id: "evt_test_e2e_invalid",
    type: "checkout.session.completed",
    data: { object: {} },
  });
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "stripe-signature": "t=1700000000,v1=deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
      },
      body,
    });
    const text = await res.text();
    const json = (() => { try { return JSON.parse(text); } catch { return null; } })();

    if (res.status === 401 && json?.error?.toLowerCase().includes("firma")) {
      record("3. webhook con firma inválida → 401",
        "PASS", "verifica firma con STRIPE_WEBHOOK_SECRET");
    } else if (res.status === 200) {
      record("3. webhook con firma inválida → 401",
        "FAIL", "Devolvió 200 — gate de firma NO está activo (CRÍTICO)");
    } else {
      record("3. webhook con firma inválida → 401",
        "FAIL", `HTTP ${res.status}, body: ${text.slice(0, 200)}`);
    }
  } catch (err) {
    record("3. webhook con firma inválida → 401", "FAIL", `error: ${err.message}`);
  }
}

console.log("");
console.log("🔍 E2E payments — Qlick → Stripe (test mode, production deploy)");
console.log(`   Target: ${BASE}`);
console.log(`   Course: ${COURSE_SLUG}`);
console.log("");

await step1_createCheckout();
await step2_webhookNoSignature();
await step3_webhookBadSignature();

console.log("");
const passCount = results.filter((r) => r.status === "PASS").length;
const failCount = results.filter((r) => r.status === "FAIL").length;
console.log(`Resumen: ${passCount} PASS, ${failCount} FAIL`);

if (failCount > 0) {
  process.exit(1);
}
