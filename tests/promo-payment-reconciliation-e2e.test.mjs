/**
 * E2E sintética de la promoción CANACO:
 * DB -> orden de dos personas -> webhook Stripe firmado -> estado, QR y
 * correos. No crea cargos ni llama a Stripe/Brevo reales.
 */
import { test, mock, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { createHmac } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";

function loadEnv() {
  if (!existsSync(".env.local")) return;
  for (const raw of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadEnv();

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const sent = [];
const runId = `promo-e2e-${Date.now()}`;
const primaryEmail = `${runId}-a@example.com`;
const secondaryEmail = `${runId}-b@example.com`;
let eventId;
let orderId;

class MockNextResponse extends Response {
  static json(body, init = {}) {
    const headers = new Headers(init.headers);
    headers.set("content-type", "application/json");
    return new Response(JSON.stringify(body), { ...init, headers });
  }
}

before(() => {
  mock.module("next/server", { namedExports: { NextRequest: globalThis.Request, NextResponse: MockNextResponse } });
  mock.module("../src/lib/email/brevo-client.ts", {
    namedExports: {
      sendEmail: async (args) => {
        sent.push({ to: args.to, subject: args.subject, html: args.html ?? "" });
        return { ok: true, mode: "test", id: `email_${sent.length}` };
      },
    },
  });
});

async function cleanup() {
  if (!eventId) return;
  await supabase.from("stripe_webhook_receipts").delete().like("event_id", `evt_${runId}%`);
  if (orderId) {
    await supabase.from("event_qr_tokens").delete().eq("promo_order_id", orderId);
    await supabase.from("event_payments").delete().eq("promo_order_id", orderId);
    await supabase.from("event_promo_order_participants").delete().eq("promo_order_id", orderId);
    await supabase.from("event_promo_orders").delete().eq("id", orderId);
  }
  await supabase.from("event_email_log").delete().eq("event_id", eventId);
  await supabase.from("event_access").delete().eq("event_id", eventId);
  await supabase.from("event_confirmations").delete().eq("event_id", eventId);
  await supabase.from("events").delete().eq("id", eventId);
}

after(cleanup);

test("promo de dos personas: apartado verificado entrega QR y comprobante a ambas", async () => {
  const starts = new Date(Date.now() + 72 * 60 * 60 * 1000);
  const { data: event, error: eventError } = await supabase.from("events").insert({
    slug: runId,
    title: "QA promoción CANACO",
    description: "Evento sintético de pago diferido.",
    location: "CANACO, San Luis Río Colorado",
    format: "in_person",
    starts_at: starts.toISOString(),
    ends_at: new Date(starts.getTime() + 4 * 60 * 60 * 1000).toISOString(),
    price_mxn: 1000,
    currency: "MXN",
    status: "published",
    requires_name: true,
    event_rules: { payment_mode: "test" },
  }).select("id, slug, title, location, starts_at, format, price_mxn, event_rules").single();
  if (eventError) throw eventError;
  eventId = event.id;

  const { createOrReusePromoOrder } = await import("../src/lib/events/promo-orders-server.ts");
  const created = await createOrReusePromoOrder({
    eventId,
    primary: { name: "QA Persona Uno", email: primaryEmail, phone: "+525599100001" },
    secondary: { name: "QA Persona Dos", email: secondaryEmail, phone: "+525599100002" },
    paymentOption: "reservation",
  });
  assert.equal(created.ok, true, created.error);
  orderId = created.checkout.orderId;

  const productRef = JSON.stringify({
    kind: "event", id: eventId, slug: event.slug, title: "QA promoción CANACO · Promoción 2 personas",
    priceMXN: 1500, chargeAmountMXN: 200, paymentPurpose: "promo_pair_reservation", startsAt: event.starts_at,
  });
  const stripeEvent = {
    id: `evt_${runId}_paid`, object: "event", api_version: "2025-09-30.clover", created: Math.floor(Date.now() / 1000), livemode: false,
    type: "checkout.session.async_payment_succeeded",
    data: { object: {
      id: `cs_test_${runId}`, object: "checkout.session", mode: "payment", status: "complete", payment_status: "paid",
      amount_total: 20000, currency: "mxn", payment_intent: `pi_${runId}`,
      customer_email: primaryEmail, customer_details: { email: primaryEmail, name: "QA Persona Uno" },
      metadata: { product_ref: productRef, promo_order_id: orderId, confirmation_id: created.checkout.primaryConfirmationId, payment_mode: "test" },
    } },
  };
  const raw = JSON.stringify(stripeEvent);
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  assert.ok(secret, "STRIPE_WEBHOOK_SECRET requerido");
  const signature = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder").webhooks.generateTestHeaderString({ payload: raw, secret });
  const { POST } = await import("../src/app/api/webhooks/stripe/route.ts");
  const response = await POST(new Request("http://localhost/api/webhooks/stripe", { method: "POST", headers: { "stripe-signature": signature }, body: raw }));
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));

  const { data: order } = await supabase.from("event_promo_orders").select("status, amount_paid_mxn").eq("id", orderId).single();
  assert.equal(order?.status, "partial");
  assert.equal(Number(order?.amount_paid_mxn), 200);
  const { data: confirmations, error: confirmationsError } = await supabase.from("event_confirmations").select("payment_status, registration_status").eq("event_id", eventId);
  assert.equal(confirmationsError, null, confirmationsError?.message);
  assert.equal(confirmations?.length, 2);
  assert.ok(confirmations.every((row) => row.payment_status === "partial" && row.registration_status === "confirmed"));
  const { data: qr } = await supabase.from("event_qr_tokens").select("is_shared_qr, max_check_ins, check_in_count").eq("promo_order_id", orderId).single();
  assert.equal(qr?.is_shared_qr, true);
  assert.equal(qr?.max_check_ins, 2);
  assert.equal(sent.filter((mail) => !mail.subject.includes("Comprobante Qlick")).length, 2);
  assert.equal(sent.filter((mail) => mail.subject.includes("Comprobante Qlick")).length, 2);

  const duplicate = await POST(new Request("http://localhost/api/webhooks/stripe", { method: "POST", headers: { "stripe-signature": signature }, body: raw }));
  assert.equal(duplicate.status, 200);
  assert.equal(sent.length, 4, "webhook duplicado no debe reenviar pase ni comprobante");
});
