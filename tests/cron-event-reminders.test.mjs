/**
 * Tests del job de recordatorios (Fase 7a, Bloque 3).
 *
 * Solo testeamos las funciones PURAS: `getActiveReminderWindows` y
 * `eventsInWindow`. La query a Supabase + envío de email se testea con
 * un mock mínimo (no queremos pegarle a la DB real en CI).
 *
 * Corre con:
 *   node --experimental-strip-types --test tests/cron-event-reminders.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";

test("getActiveReminderWindows: devuelve 2 ventanas (24h y 2h)", async () => {
  const { getActiveReminderWindows } = await import(
    "../src/lib/cron/event-reminders.ts"
  );
  const windows = getActiveReminderWindows(new Date("2026-07-05T00:00:00Z"));
  assert.equal(windows.length, 2);
  const kinds = windows.map((w) => w.kind).sort();
  assert.deepEqual(kinds, ["24h", "2h"]);
});

test("getActiveReminderWindows: ventana 24h está a 24h ± 30min de 'ahora'", async () => {
  const { getActiveReminderWindows } = await import(
    "../src/lib/cron/event-reminders.ts"
  );
  const now = new Date("2026-07-05T00:00:00Z");
  const windows = getActiveReminderWindows(now);
  const win24h = windows.find((w) => w.kind === "24h");
  if (!win24h) throw new Error("test setup: no 24h window");
  // El centro de la ventana debe ser exactamente 24h desde ahora.
  const center = (win24h.windowStartMs + win24h.windowEndMs) / 2;
  const expectedCenter = now.getTime() + 24 * 60 * 60 * 1000;
  assert.equal(center, expectedCenter);
});

test("getActiveReminderWindows: ventana 2h está a 2h ± 30min de 'ahora'", async () => {
  const { getActiveReminderWindows } = await import(
    "../src/lib/cron/event-reminders.ts"
  );
  const now = new Date("2026-07-05T00:00:00Z");
  const windows = getActiveReminderWindows(now);
  const win2h = windows.find((w) => w.kind === "2h");
  if (!win2h) throw new Error("test setup: no 2h window");
  const center = (win2h.windowStartMs + win2h.windowEndMs) / 2;
  const expectedCenter = now.getTime() + 2 * 60 * 60 * 1000;
  assert.equal(center, expectedCenter);
});

test("getActiveReminderWindows: ancho de ventana = 1h", async () => {
  const { getActiveReminderWindows } = await import(
    "../src/lib/cron/event-reminders.ts"
  );
  const windows = getActiveReminderWindows(new Date());
  for (const w of windows) {
    const width = w.windowEndMs - w.windowStartMs;
    assert.equal(width, 60 * 60 * 1000);
  }
});

test("eventsInWindow: filtra eventos cuyo startsAt está dentro de la ventana", async () => {
  const { eventsInWindow, getActiveReminderWindows } = await import(
    "../src/lib/cron/event-reminders.ts"
  );
  const now = new Date("2026-07-05T00:00:00Z");
  const windows = getActiveReminderWindows(now);
  const win24h = windows.find((w) => w.kind === "24h");
  if (!win24h) throw new Error("test setup: no 24h window");

  const target = win24h.windowStartMs + 10 * 60 * 1000; // 10 min dentro de la ventana
  const outside = win24h.windowEndMs + 60 * 60 * 1000; // 1h después del fin

  const events = [
    {
      eventId: "e1",
      eventSlug: "s1",
      eventTitle: "T1",
      eventStartsAt: new Date(target).toISOString(),
      eventLocation: null,
      startsAtMs: target,
    },
    {
      eventId: "e2",
      eventSlug: "s2",
      eventTitle: "T2",
      eventStartsAt: new Date(outside).toISOString(),
      eventLocation: null,
      startsAtMs: outside,
    },
  ];
  const filtered = eventsInWindow(events, win24h);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].eventId, "e1");
});

test("eventsInWindow: evento justo en el borde inferior se incluye", async () => {
  const { eventsInWindow, getActiveReminderWindows } = await import(
    "../src/lib/cron/event-reminders.ts"
  );
  const now = new Date("2026-07-05T00:00:00Z");
  const windows = getActiveReminderWindows(now);
  const win24h = windows.find((w) => w.kind === "24h");
  if (!win24h) throw new Error("test setup: no 24h window");
  const boundary = win24h.windowStartMs; // exacto en el inicio
  const events = [
    {
      eventId: "e1",
      eventSlug: "s1",
      eventTitle: "T1",
      eventStartsAt: new Date(boundary).toISOString(),
      eventLocation: null,
      startsAtMs: boundary,
    },
  ];
  const filtered = eventsInWindow(events, win24h);
  assert.equal(filtered.length, 1);
});

test("eventsInWindow: evento justo en el borde superior se incluye", async () => {
  const { eventsInWindow, getActiveReminderWindows } = await import(
    "../src/lib/cron/event-reminders.ts"
  );
  const now = new Date("2026-07-05T00:00:00Z");
  const windows = getActiveReminderWindows(now);
  const win24h = windows.find((w) => w.kind === "24h");
  if (!win24h) throw new Error("test setup: no 24h window");
  const boundary = win24h.windowEndMs;
  const events = [
    {
      eventId: "e1",
      eventSlug: "s1",
      eventTitle: "T1",
      eventStartsAt: new Date(boundary).toISOString(),
      eventLocation: null,
      startsAtMs: boundary,
    },
  ];
  const filtered = eventsInWindow(events, win24h);
  assert.equal(filtered.length, 1);
});

test("eventsInWindow: array vacío devuelve vacío", async () => {
  const { eventsInWindow, getActiveReminderWindows } = await import(
    "../src/lib/cron/event-reminders.ts"
  );
  const windows = getActiveReminderWindows(new Date());
  const win = windows[0];
  const filtered = eventsInWindow([], win);
  assert.equal(filtered.length, 0);
});

test("runEventRemindersJob: modo demo cuando Supabase no está configurado", async () => {
  // Forzamos que checkSupabaseConfig devuelva false.
  const origUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const origKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    const { runEventRemindersJob } = await import(
      "../src/lib/cron/event-reminders.ts"
    );
    const result = await runEventRemindersJob(new Date());
    assert.equal(result.ok, true);
    assert.equal(result.demo, true);
    assert.equal(result.sent, 0);
    assert.equal(result.failed, 0);
    assert.match(result.note, /demo/i);
  } finally {
    if (origUrl) process.env.NEXT_PUBLIC_SUPABASE_URL = origUrl;
    if (origKey) process.env.SUPABASE_SERVICE_ROLE_KEY = origKey;
  }
});