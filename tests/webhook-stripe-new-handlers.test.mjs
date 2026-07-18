/**
 * Tests estructurales de los handlers nuevos del webhook de Stripe
 * (charge.dispute.created + payment_intent.payment_failed).
 *
 * Los tests de comportamiento (con mocks de Supabase + Stripe)
 * requieren levantar el contexto Next.js, lo cual es fragile en
 * node --test. Estos tests validan que:
 *   1. El switch del route.ts los dispatcha al handler correcto.
 *   2. El handler existe y tiene la firma correcta.
 *   3. PaymentStatus union incluye los 2 nuevos valores (validado
 *      por type-check; el module load confirma que el archivo es
 *      parseable).
 *   4. AdminView statusTone + statusLabel tienen los 2 nuevos
 *      estados (validado por type-check).
 *
 * Si necesitas test E2E real: usar Stripe CLI `stripe trigger
 * charge.dispute.created` + ngrok al endpoint local.
 *
 * Corre con:
 *   node --env-file=.env.local --experimental-strip-types --test tests/webhook-stripe-new-handlers.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ROUTE_PATH = "C:/Users/User/Documents/Click/src/app/api/webhooks/stripe/route.ts";
const TYPES_PATH = "C:/Users/User/Documents/Click/src/types/index.ts";
const ADMIN_VIEW_PATH = "C:/Users/User/Documents/Click/src/components/admin/AdminView.tsx";

const routeText = readFileSync(ROUTE_PATH, "utf-8");
const typesText = readFileSync(TYPES_PATH, "utf-8");
const adminText = readFileSync(ADMIN_VIEW_PATH, "utf-8");

test("PaymentStatus union incluye 'disputed'", () => {
  // FIX 2026-07-18: union expandido para los 2 nuevos handlers.
  assert.match(typesText, /"disputed"/);
});

test("PaymentStatus union incluye 'failed'", () => {
  assert.match(typesText, /"failed"/);
});

test("route.ts switch cubre 'charge.dispute.created'", () => {
  assert.match(routeText, /case "charge\.dispute\.created":/);
});

test("route.ts switch cubre 'payment_intent.payment_failed'", () => {
  assert.match(routeText, /case "payment_intent\.payment_failed":/);
});

test("route.ts define handleChargeDispute", () => {
  assert.match(routeText, /async function handleChargeDispute/);
});

test("route.ts define handlePaymentIntentFailed", () => {
  assert.match(routeText, /async function handlePaymentIntentFailed/);
});

test("handleChargeDispute marca status disputed (no revoca access)", () => {
  // Buscamos el bloque de handleChargeDispute y verificamos que setea
  // status = "disputed" y NO llama revokeEventAccess ni revokeAccess.
  const fnMatch = routeText.match(/async function handleChargeDispute[\s\S]+?^}/m);
  assert.ok(fnMatch, "handleChargeDispute debe estar definida");
  const fn = fnMatch[0];
  assert.match(fn, /"disputed"/, "debe setear status disputed");
  // NO debe revocar access (la disputa puede ganarse).
  assert.doesNotMatch(fn, /revokeAccess|revokeEventAccess/);
});

test("handlePaymentIntentFailed marca status failed (no crea access)", () => {
  const fnMatch = routeText.match(/async function handlePaymentIntentFailed[\s\S]+?^}/m);
  assert.ok(fnMatch, "handlePaymentIntentFailed debe estar definida");
  const fn = fnMatch[0];
  assert.match(fn, /"failed"/, "debe setear status failed");
  // NO debe crear access (eso lo hace handleCheckoutCompleted).
  assert.doesNotMatch(fn, /grantAccess|grantEventAccess/);
});

test("handleChargeDispute busca primero en payments, fallback event_payments", () => {
  const fnMatch = routeText.match(/async function handleChargeDispute[\s\S]+?^}/m);
  assert.ok(fnMatch);
  const fn = fnMatch[0];
  // Debe buscar en ambas tablas con external_reference.
  assert.match(fn, /\.from\("payments"\)/);
  assert.match(fn, /\.from\("event_payments"\)/);
});

test("handlePaymentIntentFailed busca primero en payments, fallback event_payments", () => {
  const fnMatch = routeText.match(/async function handlePaymentIntentFailed[\s\S]+?^}/m);
  assert.ok(fnMatch);
  const fn = fnMatch[0];
  assert.match(fn, /\.from\("payments"\)/);
  assert.match(fn, /\.from\("event_payments"\)/);
});

test("handleChargeDispute usa logAdminAction para audit", () => {
  const fnMatch = routeText.match(/async function handleChargeDispute[\s\S]+?^}/m);
  assert.ok(fnMatch);
  assert.match(fnMatch[0], /logAdminAction/);
});

test("handlePaymentIntentFailed usa logAdminAction para audit", () => {
  const fnMatch = routeText.match(/async function handlePaymentIntentFailed[\s\S]+?^}/m);
  assert.ok(fnMatch);
  assert.match(fnMatch[0], /logAdminAction/);
});

test("AdminView statusTone incluye failed y disputed", () => {
  // FIX 2026-07-18: el Record<PaymentStatus, ...> en AdminView.tsx
  // se expandio. Si falta alguno, TS no compila (validado por type-check).
  assert.match(adminText, /failed:/);
  assert.match(adminText, /disputed:/);
});

test("AdminView statusLabel incluye failed y disputed", () => {
  assert.match(adminText, /failed: "Falló"/);
  assert.match(adminText, /disputed: "En disputa"/);
});
