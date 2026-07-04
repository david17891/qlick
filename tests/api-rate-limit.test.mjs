/**
 * Tests del rate limiter para endpoints HTTP públicos.
 *
 * Cubre `recordAndCheckRateLimit()`, `cleanupRateLimitStore()` y
 * `getClientIp()` exportados desde `src/lib/api/rate-limit.ts`.
 *
 * Patrón: `node --test`, sin libs externas.
 */

// @ts-check

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  recordAndCheckRateLimit,
  cleanupRateLimitStore,
  getClientIp,
  _resetRateLimitStoreForTest,
} from "../src/lib/api/rate-limit.ts";

/* ─────────────────────────────────────────────────────────────
 * Setup
 * ───────────────────────────────────────────────────────────── */

beforeEach(() => {
  _resetRateLimitStoreForTest();
});

/* ─────────────────────────────────────────────────────────────
 * recordAndCheckRateLimit
 * ───────────────────────────────────────────────────────────── */

test("5 calls dentro del window → todos allowed", () => {
  for (let i = 0; i < 5; i++) {
    const r = recordAndCheckRateLimit("ip:1.2.3.4");
    assert.equal(r.allowed, true);
    assert.equal(r.callCount, i + 1);
  }
});

test("6to call en el mismo window → rejected con resetMs > 0", () => {
  for (let i = 0; i < 5; i++) {
    recordAndCheckRateLimit("ip:1.2.3.4");
  }
  const sixth = recordAndCheckRateLimit("ip:1.2.3.4");
  assert.equal(sixth.allowed, false);
  assert.equal(sixth.callCount, 5);
  assert.ok(sixth.resetMs > 0, "resetMs debe ser > 0 (cuánto falta para liberar)");
});

test("Keys distintas son independientes", () => {
  for (let i = 0; i < 5; i++) {
    recordAndCheckRateLimit("ip:1.2.3.4");
  }
  // IP A está saturada, pero IP B debe poder entrar.
  const rB = recordAndCheckRateLimit("ip:5.6.7.8");
  assert.equal(rB.allowed, true);
  assert.equal(rB.callCount, 1);
});

test("Window custom: 2 calls / 100ms", async () => {
  const opts = { windowMs: 100, maxCalls: 2 };
  const a = recordAndCheckRateLimit("k", opts);
  const b = recordAndCheckRateLimit("k", opts);
  const c = recordAndCheckRateLimit("k", opts);
  assert.equal(a.allowed, true);
  assert.equal(b.allowed, true);
  assert.equal(c.allowed, false);

  // Después de la ventana, vuelve a permitir.
  await new Promise((resolve) => setTimeout(resolve, 110));
  const d = recordAndCheckRateLimit("k", opts);
  assert.equal(d.allowed, true);
});

test("Defaults: 5 / 60s", () => {
  // Sin options, debe usar DEFAULT_MAX_CALLS_PER_WINDOW = 5.
  for (let i = 0; i < 5; i++) {
    const r = recordAndCheckRateLimit("k");
    assert.equal(r.allowed, true);
  }
  const sixth = recordAndCheckRateLimit("k");
  assert.equal(sixth.allowed, false);
});

/* ─────────────────────────────────────────────────────────────
 * cleanupRateLimitStore
 * ───────────────────────────────────────────────────────────── */

test("cleanupRateLimitStore: limpia keys con timestamps fuera del window", async () => {
  // Llenar dos keys
  recordAndCheckRateLimit("ip:1.1.1.1", { windowMs: 50 });
  recordAndCheckRateLimit("ip:2.2.2.2", { windowMs: 50 });
  // Esperar > ventana
  await new Promise((resolve) => setTimeout(resolve, 80));
  const removed = cleanupRateLimitStore({ windowMs: 50 });
  assert.equal(removed, 2);
});

test("cleanupRateLimitStore: no borra keys todavía activas", () => {
  recordAndCheckRateLimit("ip:active", { windowMs: 60_000 });
  const removed = cleanupRateLimitStore({ windowMs: 60_000 });
  assert.equal(removed, 0);
});

/* ─────────────────────────────────────────────────────────────
 * getClientIp
 * ───────────────────────────────────────────────────────────── */

test("getClientIp: x-forwarded-for simple → ese valor", () => {
  const req = new Request("http://x", {
    headers: { "x-forwarded-for": "203.0.113.42" },
  });
  assert.equal(getClientIp(req), "203.0.113.42");
});

test("getClientIp: x-forwarded-for CSV → primer valor trimmeado", () => {
  const req = new Request("http://x", {
    headers: { "x-forwarded-for": " 203.0.113.42 , 10.0.0.1 , 10.0.0.2" },
  });
  assert.equal(getClientIp(req), "203.0.113.42");
});

test("getClientIp: x-real-ip → ese valor", () => {
  const req = new Request("http://x", {
    headers: { "x-real-ip": "198.51.100.7" },
  });
  assert.equal(getClientIp(req), "198.51.100.7");
});

test("getClientIp: x-forwarded-for tiene prioridad sobre x-real-ip", () => {
  const req = new Request("http://x", {
    headers: {
      "x-forwarded-for": "203.0.113.42",
      "x-real-ip": "198.51.100.7",
    },
  });
  assert.equal(getClientIp(req), "203.0.113.42");
});

test("getClientIp: sin headers → 'unknown'", () => {
  const req = new Request("http://x");
  assert.equal(getClientIp(req), "unknown");
});

test("getClientIp: x-forwarded-for vacío → cae a x-real-ip", () => {
  const req = new Request("http://x", {
    headers: {
      "x-forwarded-for": "",
      "x-real-ip": "198.51.100.7",
    },
  });
  assert.equal(getClientIp(req), "198.51.100.7");
});