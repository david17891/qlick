/**
 * Tests para el rate limiter per-phone del bot de WhatsApp.
 *
 * Protege el saldo de DeepSeek contra spammers y contra leads que mandan
 * muchas preguntas en poco tiempo. Default: 5 calls / 60s / phone.
 *
 * Corre con `node --test`:
 *   node --test tests/per-phone-rate-limit.test.mjs
 */

// @ts-check

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  recordAndCheckRateLimit,
  cleanupRateLimitStore,
  _resetRateLimitStoreForTest
} from "../src/lib/ai/per-phone-rate-limit.ts";

// ─────────────────────────────────────────────────────────────
// Setup/teardown: resetear el store entre tests para aislar estado
// ─────────────────────────────────────────────────────────────

test("setup: reset store before each test", () => {
  _resetRateLimitStoreForTest();
  // smoke check: el primer call despues de reset SIEMPRE allowed
  const r1 = recordAndCheckRateLimit("test-key");
  assert.equal(r1.allowed, true);
  assert.equal(r1.callCount, 1);
});

// ─────────────────────────────────────────────────────────────
// Comportamiento basico: cuenta, allowed/disallowed
// ─────────────────────────────────────────────────────────────

test("first 5 calls within window are allowed (default max=5)", () => {
  _resetRateLimitStoreForTest();
  const key = "default-max";
  for (let i = 1; i <= 5; i++) {
    const r = recordAndCheckRateLimit(key);
    assert.equal(r.allowed, true, `call ${i} should be allowed`);
    assert.equal(r.callCount, i);
  }
});

test("6th call within window is rejected (default max=5)", () => {
  _resetRateLimitStoreForTest();
  const key = "rejected-6th";
  for (let i = 0; i < 5; i++) {
    recordAndCheckRateLimit(key);
  }
  const r6 = recordAndCheckRateLimit(key);
  assert.equal(r6.allowed, false);
  assert.equal(r6.callCount, 5, "no se agregan timestamps cuando allowed=false");
});

test("calls on different keys are independent", () => {
  _resetRateLimitStoreForTest();
  for (let i = 0; i < 5; i++) {
    recordAndCheckRateLimit("phone-a");
  }
  // phone-b NO esta limitado aunque phone-a este al tope
  const rB = recordAndCheckRateLimit("phone-b");
  assert.equal(rB.allowed, true);
  assert.equal(rB.callCount, 1);
});

test("calling a rate-limited key returns resetMs = time-to-oldest", () => {
  _resetRateLimitStoreForTest();
  const key = "reset-ms";
  for (let i = 0; i < 5; i++) {
    recordAndCheckRateLimit(key, { windowMs: 60_000 });
  }
  const r = recordAndCheckRateLimit(key, { windowMs: 60_000 });
  assert.equal(r.allowed, false);
  assert.ok(r.resetMs > 0, `resetMs should be > 0, got ${r.resetMs}`);
  assert.ok(r.resetMs <= 60_000, `resetMs should be <= window, got ${r.resetMs}`);
});

// ─────────────────────────────────────────────────────────────
// Ventana deslizante: los timestamps fuera del window se purgan
// ─────────────────────────────────────────────────────────────

test("after windowMs passes, the key is allowed again (sliding)", async () => {
  _resetRateLimitStoreForTest();
  const key = "sliding";
  for (let i = 0; i < 5; i++) {
    recordAndCheckRateLimit(key, { windowMs: 100, maxCalls: 5 });
  }
  // Confirmamos rejection
  const blocked = recordAndCheckRateLimit(key, { windowMs: 100, maxCalls: 5 });
  assert.equal(blocked.allowed, false);
  // Esperamos a que la ventana deslice
  await new Promise((resolve) => setTimeout(resolve, 150));
  const fresh = recordAndCheckRateLimit(key, { windowMs: 100, maxCalls: 5 });
  assert.equal(fresh.allowed, true, "after window, should be allowed");
  assert.equal(fresh.callCount, 1, "old timestamps purged");
});

test("older timestamps are dropped so new calls count from scratch", async () => {
  _resetRateLimitStoreForTest();
  const key = "partial-slide";
  // 3 calls ahora
  recordAndCheckRateLimit(key, { windowMs: 200, maxCalls: 5 });
  recordAndCheckRateLimit(key, { windowMs: 200, maxCalls: 5 });
  recordAndCheckRateLimit(key, { windowMs: 200, maxCalls: 5 });
  // Esperamos 250ms (las 3 calls se purgan)
  await new Promise((resolve) => setTimeout(resolve, 250));
  // 1 call fresca — callCount arranca de 1
  const r = recordAndCheckRateLimit(key, { windowMs: 200, maxCalls: 5 });
  assert.equal(r.allowed, true);
  assert.equal(r.callCount, 1);
});

// ─────────────────────────────────────────────────────────────
// Custom config: windowMs y maxCalls via options
// ─────────────────────────────────────────────────────────────

test("custom maxCalls=2", () => {
  _resetRateLimitStoreForTest();
  const key = "custom-2";
  assert.equal(recordAndCheckRateLimit(key, { maxCalls: 2 }).allowed, true);
  assert.equal(recordAndCheckRateLimit(key, { maxCalls: 2 }).allowed, true);
  // 3rd rejected
  assert.equal(recordAndCheckRateLimit(key, { maxCalls: 2 }).allowed, false);
});

test("custom windowMs aplica a la cuenta", async () => {
  _resetRateLimitStoreForTest();
  const key = "custom-window";
  // windowMs=50, maxCalls=2
  recordAndCheckRateLimit(key, { windowMs: 50, maxCalls: 2 });
  recordAndCheckRateLimit(key, { windowMs: 50, maxCalls: 2 });
  assert.equal(
    recordAndCheckRateLimit(key, { windowMs: 50, maxCalls: 2 }).allowed,
    false
  );
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(
    recordAndCheckRateLimit(key, { windowMs: 50, maxCalls: 2 }).allowed,
    true
  );
});

// ─────────────────────────────────────────────────────────────
// cleanupRateLimitStore
// ─────────────────────────────────────────────────────────────

test("cleanupRateLimitStore: purga keys con todas las entries expiradas", async () => {
  _resetRateLimitStoreForTest();
  const key = "cleanup";
  recordAndCheckRateLimit(key, { windowMs: 50 });
  // Confirmamos que esta registrado
  assert.ok(recordAndCheckRateLimit(key, { windowMs: 50 }).callCount >= 2);
  // Esperamos a que expire
  await new Promise((resolve) => setTimeout(resolve, 80));
  // Cleanup deberia purgarlo
  cleanupRateLimitStore({ windowMs: 50 });
  // Primer call despues de cleanup debe dar callCount=1 (store vacio para key)
  const r = recordAndCheckRateLimit(key, { windowMs: 50 });
  assert.equal(r.callCount, 1, "key se purgo, arranca de 1");
});

test("cleanupRateLimitStore: keys activas no se tocan", () => {
  _resetRateLimitStoreForTest();
  const fresh = "still-active";
  const stale = "will-be-stale";
  recordAndCheckRateLimit(fresh);
  recordAndCheckRateLimit(stale, { windowMs: 50 });
  // Cleanup con windowMs muy generoso (10 minutos) — ambos sobreviven
  cleanupRateLimitStore({ windowMs: 600_000 });
  // fresh sigue contando
  const r = recordAndCheckRateLimit(fresh, { windowMs: 600_000 });
  assert.equal(r.callCount, 2);
});
