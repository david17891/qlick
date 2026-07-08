/**
 * Tests del provider registry + mock provider (pagos Fase 1).
 *
 * Cubre:
 *   - getPaymentProvider() resuelve según NEXT_PUBLIC_PAYMENT_PROVIDER.
 *   - mockProvider.createCheckout() construye ProductRef correctamente.
 *   - mockProvider aplica cupones (applyCoupon).
 *   - getActivePaymentProviderName() default = "mock".
 *
 * Patrón: `node --test`, sin libs externas.
 */

// @ts-check

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  getPaymentProvider,
  listPaymentProviders,
} from "../src/lib/payments/index.ts";
import {
  getActivePaymentProviderName,
  applyCoupon,
} from "../src/lib/payments/payment-provider.ts";

/* ─────────────────────────────────────────────────────────────
 * getActivePaymentProviderName
 * ───────────────────────────────────────────────────────────── */

test("getActivePaymentProviderName: default es 'mock' si no hay env", () => {
  const prev = process.env.NEXT_PUBLIC_PAYMENT_PROVIDER;
  delete process.env.NEXT_PUBLIC_PAYMENT_PROVIDER;
  try {
    assert.equal(getActivePaymentProviderName(), "mock");
  } finally {
    if (prev !== undefined) process.env.NEXT_PUBLIC_PAYMENT_PROVIDER = prev;
  }
});

test("getActivePaymentProviderName: 'stripe' cuando env=stripe", () => {
  const prev = process.env.NEXT_PUBLIC_PAYMENT_PROVIDER;
  process.env.NEXT_PUBLIC_PAYMENT_PROVIDER = "stripe";
  try {
    assert.equal(getActivePaymentProviderName(), "stripe");
  } finally {
    if (prev === undefined) {
      delete process.env.NEXT_PUBLIC_PAYMENT_PROVIDER;
    } else {
      process.env.NEXT_PUBLIC_PAYMENT_PROVIDER = prev;
    }
  }
});

test("getActivePaymentProviderName: garbage cae a 'mock'", () => {
  const prev = process.env.NEXT_PUBLIC_PAYMENT_PROVIDER;
  process.env.NEXT_PUBLIC_PAYMENT_PROVIDER = "no-existe-este-provider";
  try {
    assert.equal(getActivePaymentProviderName(), "mock");
  } finally {
    if (prev === undefined) {
      delete process.env.NEXT_PUBLIC_PAYMENT_PROVIDER;
    } else {
      process.env.NEXT_PUBLIC_PAYMENT_PROVIDER = prev;
    }
  }
});

/* ─────────────────────────────────────────────────────────────
 * getPaymentProvider / listPaymentProviders
 * ───────────────────────────────────────────────────────────── */

test("getPaymentProvider(): devuelve provider del registry", () => {
  const p = getPaymentProvider();
  assert.ok(p);
  assert.ok(["mock", "stripe", "mercadopago", "conekta"].includes(p.name));
});

test("listPaymentProviders(): incluye los 4 registrados", () => {
  const list = listPaymentProviders();
  assert.equal(list.length, 4);
  const names = list.map((p) => p.name).sort();
  assert.deepEqual(names, ["conekta", "mercadopago", "mock", "stripe"]);
});

/* ─────────────────────────────────────────────────────────────
 * applyCoupon (helper del provider)
 * ───────────────────────────────────────────────────────────── */

test("applyCoupon: sin cupón → sin descuento", () => {
  const r = applyCoupon(1000);
  assert.deepEqual(r, { finalAmountMXN: 1000, discountMXN: 0 });
});

test("applyCoupon: cupón 100% → final 0", () => {
  const r = applyCoupon(1000, {
    id: "c1",
    code: "FREE",
    description: "",
    active: true,
    percentOff: 100,
    redeemCount: 0,
  });
  assert.deepEqual(r, { finalAmountMXN: 0, discountMXN: 1000 });
});

test("applyCoupon: cupón 25% off", () => {
  const r = applyCoupon(2000, {
    id: "c2",
    code: "QRO25",
    description: "",
    active: true,
    percentOff: 25,
    redeemCount: 0,
  });
  assert.deepEqual(r, { finalAmountMXN: 1500, discountMXN: 500 });
});

test("applyCoupon: cupón amountOff mayor que precio → cap al precio", () => {
  const r = applyCoupon(500, {
    id: "c3",
    code: "MEGA",
    description: "",
    active: true,
    percentOff: 0,
    amountOffMXN: 9999,
    redeemCount: 0,
  });
  assert.deepEqual(r, { finalAmountMXN: 0, discountMXN: 500 });
});

test("applyCoupon: cupón inactivo → no aplica", () => {
  const r = applyCoupon(1000, {
    id: "c4",
    code: "OLD",
    description: "",
    active: false,
    percentOff: 50,
    redeemCount: 0,
  });
  assert.deepEqual(r, { finalAmountMXN: 1000, discountMXN: 0 });
});

/* ─────────────────────────────────────────────────────────────
 * mockProvider.createCheckout
 * ───────────────────────────────────────────────────────────── */

test("mockProvider.createCheckout(): method=card → approved inline", async () => {
  const p = getPaymentProvider();
  // Forzamos mock aunque env diga otra cosa (este test verifica mock).
  process.env.NEXT_PUBLIC_PAYMENT_PROVIDER = "mock";
  const mockP = getPaymentProvider();
  const r = await mockP.createCheckout({
    productRef: {
      kind: "course",
      id: "course_abc",
      slug: "curso-demo",
      title: "Curso Demo",
      priceMXN: 1499,
    },
    userId: "user_1",
    userEmail: "test@example.com",
    method: "card",
  });
  assert.equal(r.flow, "inline");
  assert.equal(r.status, "approved");
  assert.equal(r.finalAmountMXN, 1499);
  assert.equal(r.discountMXN, 0);
  assert.equal(r.method, "card");
  assert.ok(r.paymentId.startsWith("pay_"));
});

test("mockProvider.createCheckout(): method=oxxo → manual con instrucciones", async () => {
  process.env.NEXT_PUBLIC_PAYMENT_PROVIDER = "mock";
  const mockP = getPaymentProvider();
  const r = await mockP.createCheckout({
    productRef: {
      kind: "course",
      id: "course_oxxo",
      slug: "oxxo-test",
      title: "Curso OXXO",
      priceMXN: 999,
    },
    userId: "user_2",
    userEmail: "test2@example.com",
    method: "oxxo",
  });
  assert.equal(r.flow, "manual");
  assert.equal(r.status, "pending");
  assert.equal(r.method, "oxxo");
  assert.ok(r.instructions);
  assert.match(r.instructions, /OXXO/i);
  assert.match(r.instructions, /\$999/);
});

test("mockProvider.createCheckout(): price 0 o cupón 100% → approved free", async () => {
  process.env.NEXT_PUBLIC_PAYMENT_PROVIDER = "mock";
  const mockP = getPaymentProvider();
  const r = await mockP.createCheckout({
    productRef: {
      kind: "course",
      id: "course_free",
      slug: "curso-gratis",
      title: "Curso Gratis",
      priceMXN: 0,
    },
    userId: "user_3",
    userEmail: "test3@example.com",
    method: "card",
  });
  assert.equal(r.flow, "inline");
  assert.equal(r.status, "approved");
  assert.equal(r.finalAmountMXN, 0);
});

/* ─────────────────────────────────────────────────────────────
 * provider name visibility
 * ───────────────────────────────────────────────────────────── */

test("mockProvider name === 'mock'", () => {
  process.env.NEXT_PUBLIC_PAYMENT_PROVIDER = "mock";
  assert.equal(getPaymentProvider().name, "mock");
});