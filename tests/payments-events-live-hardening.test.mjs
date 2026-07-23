import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ROOT = "C:/Users/User/Documents/Click";
const read = (file) => readFileSync(`${ROOT}/${file}`, "utf8");

const migration = read("supabase/migrations/20260722120000_payments_events_live_hardening.sql");
const webhook = read("src/app/api/webhooks/stripe/route.ts");
const entitlements = read("src/lib/lms/event-entitlements.ts");
const checkout = read("src/app/api/payments/create-checkout/route.ts");
const success = read("src/app/pagar/evento/[slug]/exito/page.tsx");

test("schema conserva la cadena Session -> PaymentIntent -> Charge", () => {
  for (const column of [
    "stripe_session_id",
    "stripe_payment_intent_id",
    "stripe_charge_id",
    "stripe_mode",
  ]) {
    assert.match(migration, new RegExp(column));
  }
  assert.match(migration, /payments_stripe_session_unique/);
  assert.match(migration, /event_payments_stripe_session_unique/);
});

test("schema separa payment_status del estado CRM de servicios", () => {
  assert.match(migration, /service_orders[\s\S]+payment_status text/);
  assert.match(migration, /service_orders_payment_status_check/);
  assert.match(migration, /stripe_webhook_receipts/);
});

test("webhook no otorga acceso al crear voucher OXXO/SPEI", () => {
  assert.match(webhook, /session\.payment_status === "paid"/);
  assert.match(webhook, /handleCheckoutPending/);
  assert.match(webhook, /checkout_pending/);
  assert.match(webhook, /status: "pending"/);
});

test("eventos registran failed/expired sin degradar pagos aprobados", () => {
  assert.match(webhook, /recordEventCheckoutTerminalState/);
  assert.match(webhook, /status: "failed"/);
  assert.match(webhook, /status: "cancelled"/);
  assert.match(webhook, /existing\.status !== "pending"/);
});

test("webhook correlaciona refunds por PaymentIntent/Charge y revoca por payment", () => {
  assert.match(webhook, /stripe_payment_intent_id/);
  assert.match(webhook, /stripe_charge_id/);
  assert.match(webhook, /paymentId,\n        confirmationId/);
  assert.match(entitlements, /paymentId\?: string \| null/);
  assert.match(webhook, /payment_status: "revoked"/);
});

test("webhook tiene fulfillment explícito para service_order", () => {
  assert.match(webhook, /handleServiceCheckoutCompleted/);
  assert.match(webhook, /payment_status: "paid"/);
  assert.match(webhook, /type: "payment_received"/);
  assert.match(webhook, /payment_status: "failed"/);
});

test("confirmation_id se valida contra el evento antes de ir a Stripe", () => {
  assert.match(checkout, /La confirmation llega del bot\/cliente/);
  assert.match(checkout, /\.eq\("event_id", productRef\.id\)/);
  assert.match(webhook, /confirmation_id inválido o de otro evento/);
});

test("grant de evento enlaza user_id resuelto y éxito conserva rutas de evento", () => {
  assert.match(entitlements, /\.\.\.\(params\.userId \? \{ user_id: params\.userId \} : \{\}\)/);
  assert.match(success, /`\/pagar\/evento\/\${eventSlug}\/exito\?session_id=/);
  assert.match(success, /ctaHref = `\/pagar\/evento\/\${eventSlug}`/);
});
