/**
 * Tests del flujo dual test/live de Stripe (sprint 2026-07-18).
 *
 * Cubre:
 * - getStripeClient retorna cliente de test si mode no se pasa (default).
 * - getStripeClient("test") usa STRIPE_SECRET_KEY.
 * - getStripeClient("live") usa STRIPE_SECRET_KEY_LIVE.
 * - getStripeClient("live") lanza error explicito si live no esta configurado.
 * - verifyStripeWebhookSignature prueba con ambos secrets.
 * - CreateCheckoutInput.mode existe y es opcional.
 * - EventBotRules.payment_mode existe.
 * - EventFormInput.eventRules.payment_mode existe.
 *
 * NOTA: Los tests son estructurales (no levantan Supabase ni Next.js).
 * Validan la API exportada y los tipos. La integracion real se valida
 * con Stripe CLI `stripe trigger checkout.session.completed` + ngrok.
 *
 * Corre con:
 *   node --env-file=.env.local --experimental-strip-types --test tests/stripe-dual-mode.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = (file) => join(ROOT, file);
const STRIPE_PROVIDER = source("src/lib/payments/stripe-provider.ts");
const PAYMENT_PROVIDER = source("src/lib/payments/payment-provider.ts");
const TYPES_EVENTS = source("src/types/events.ts");
const OPS_CLIENT = source("src/lib/crm/ops-client.ts");
const CREATE_CHECKOUT = source("src/app/api/payments/create-checkout/route.ts");
const WEBHOOK_ROUTE = source("src/app/api/webhooks/stripe/route.ts");

const stripeProvider = readFileSync(STRIPE_PROVIDER, "utf-8");
const paymentProvider = readFileSync(PAYMENT_PROVIDER, "utf-8");
const typesEvents = readFileSync(TYPES_EVENTS, "utf-8");
const opsClient = readFileSync(OPS_CLIENT, "utf-8");
const createCheckout = readFileSync(CREATE_CHECKOUT, "utf-8");
const webhookRoute = readFileSync(WEBHOOK_ROUTE, "utf-8");

test("stripe-provider exporta getStripeClient con mode opcional", () => {
  // FIX 2026-07-18: el helper acepta mode: "test" | "live" (default "test").
  assert.match(stripeProvider, /export function getStripeClient\(mode: StripeMode/);
  assert.match(stripeProvider, /mode === "live" \? getStripeClientLive\(\) : getStripeClientTest\(\)/);
});

test("stripe-provider define StripeMode con 'test' y 'live'", () => {
  assert.match(stripeProvider, /export type StripeMode = "test" \| "live"/);
});

test("stripe-provider tiene getStripeClientTest y getStripeClientLive", () => {
  assert.match(stripeProvider, /function getStripeClientTest\(\)/);
  assert.match(stripeProvider, /function getStripeClientLive\(\)/);
});

test("getStripeClientLive lanza error si STRIPE_SECRET_KEY_LIVE no esta seteada", () => {
  // FIX 2026-07-18: el cliente live no puede caer a test (seria un bug grave
  // cobrar a un cliente real con una key de test). Tira error explicito.
  assert.match(
    stripeProvider,
    /Stripe live no está configurado\. Define STRIPE_SECRET_KEY_LIVE/
  );
});

test("stripe-provider exporta verifyStripeWebhookSignature con fallback de 2 secrets", () => {
  // FIX 2026-07-18: el helper prueba con STRIPE_WEBHOOK_SECRET (test) y
  // STRIPE_WEBHOOK_SECRET_LIVE, y retorna el modo que matchee.
  assert.match(stripeProvider, /export async function verifyStripeWebhookSignature/);
  assert.match(stripeProvider, /STRIPE_WEBHOOK_SECRET/);
  assert.match(stripeProvider, /STRIPE_WEBHOOK_SECRET_LIVE/);
  assert.match(stripeProvider, /return \{ event, mode \};/);
});

test("verifyStripeWebhookSignature prueba test primero, live despues", () => {
  // FIX 2026-07-18: el orden de los candidates es importante. test
  // primero porque es el modo por default.
  const verifyFn = stripeProvider.match(
    /export async function verifyStripeWebhookSignature\([\s\S]+?^\}/m
  );
  assert.ok(verifyFn, "verifyStripeWebhookSignature debe estar definida");
  const fn = verifyFn[0];
  // Verificar que el primer candidate es test y el segundo es live.
  const testIdx = fn.indexOf('mode: "test"');
  const liveIdx = fn.indexOf('mode: "live"');
  assert.ok(testIdx > 0, "debe probar test");
  assert.ok(liveIdx > 0, "debe probar live");
  assert.ok(testIdx < liveIdx, "test debe ir antes que live");
});

test("CreateCheckoutInput.mode existe (opcional, default 'test')", () => {
  assert.match(paymentProvider, /mode\?: "test" \| "live"/);
});

test("createCheckout route lee event.event_rules.payment_mode", () => {
  // FIX 2026-07-18: el route debe leer el modo del evento y pasarlo
  // al provider como input.mode.
  assert.match(createCheckout, /event_rules/);
  assert.match(createCheckout, /payment_mode === "live"/);
  assert.match(createCheckout, /mode: stripeMode/);
});

test("createCheckout route crea supabase client para query de event_rules", () => {
  assert.match(createCheckout, /createSupabaseAdminClient\(\)/);
  assert.match(createCheckout, /\.from\("events"\)/);
  assert.match(createCheckout, /\.select\("event_rules"\)/);
});

test("EventBotRules incluye payment_mode opcional", () => {
  assert.match(typesEvents, /payment_mode\?: "test" \| "live"/);
});

test("EventFormInput.eventRules incluye payment_mode", () => {
  assert.match(opsClient, /payment_mode\?: "test" \| "live"/);
});

test("EventDrawer persiste payment_mode en eventRules al crear/editar", () => {
  const eventDrawer = readFileSync(
    source("src/components/events/EventDrawer.tsx"),
    "utf-8"
  );
  // Hay 2 sitios (create + update) que pasan payment_mode.
  const matches = eventDrawer.match(/payment_mode: form\.paymentMode/g);
  assert.ok(matches && matches.length >= 2,
    "EventDrawer debe persistir payment_mode en create + update");
});

test("EventDrawer FormState incluye paymentMode", () => {
  const eventDrawer = readFileSync(
    source("src/components/events/EventDrawer.tsx"),
    "utf-8"
  );
  assert.match(eventDrawer, /paymentMode: "test" \| "live";/);
});

test("EventDrawer UI muestra selector radio test/live con warning en live", () => {
  const eventDrawer = readFileSync(
    source("src/components/events/EventDrawer.tsx"),
    "utf-8"
  );
  // El selector debe estar visible solo si el evento tiene precio > 0.
  assert.match(eventDrawer, /Modo de Pago \(Stripe\)/);
  assert.match(eventDrawer, /Cobra dinero real/);
  assert.match(eventDrawer, /name="paymentMode"/);
  assert.match(eventDrawer, /value="test"/);
  assert.match(eventDrawer, /value="live"/);
});

test("webhook route usa verifyStripeWebhookSignature (no requireStripeWebhookSecret)", () => {
  // FIX 2026-07-18: el webhook debe usar el nuevo helper que prueba
  // con 2 secrets, no el legacy que solo leia STRIPE_WEBHOOK_SECRET.
  assert.match(webhookRoute, /verifyStripeWebhookSignature/);
  assert.doesNotMatch(webhookRoute, /requireStripeWebhookSecret/);
});

test("webhook route captura el modo verificado (verifiedMode)", () => {
  // FIX 2026-07-18: el webhook debe saber qué modo (test/live) fue
  // el que verificó la firma, para que el resto del flujo (logs,
  // queries) sepa en qué modo está.
  assert.match(webhookRoute, /verifiedMode/);
});

test("createCheckout metadata incluye payment_mode (audit trail)", () => {
  // FIX 2026-07-18: stripe-provider serializa el modo en metadata del
  // Checkout Session para que el webhook lo pueda leer si lo necesita.
  assert.match(stripeProvider, /payment_mode: mode/);
});
