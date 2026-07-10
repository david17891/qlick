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

test("getActiveReminderWindows: devuelve 3 ventanas relativas (24h, 2h, 1h)", async () => {
  // FIX 2026-07-10 (Sprint 2 v2 David): agregamos 1h al getter.
  // Las ventanas Phoenix (8am/10am) se computan en getPhoenixDayWindows.
  const { getActiveReminderWindows } = await import(
    "../src/lib/cron/event-reminders.ts"
  );
  const windows = getActiveReminderWindows(new Date("2026-07-05T00:00:00Z"));
  assert.equal(windows.length, 3);
  const kinds = windows.map((w) => w.kind).sort();
  assert.deepEqual(kinds, ["1h", "24h", "2h"]);
});

test("getPhoenixDayWindows: devuelve 2 ventanas Phoenix (8am, 10am)", async () => {
  // FIX 2026-07-10: las ventanas 8am/10am Phoenix se computan aparte.
  const { getPhoenixDayWindows } = await import(
    "../src/lib/cron/event-reminders.ts"
  );
  const windows = getPhoenixDayWindows(new Date("2026-07-11T18:00:00Z"));
  assert.equal(windows.length, 2);
  const kinds = windows.map((w) => w.kind).sort();
  assert.deepEqual(kinds, ["10am", "8am"]);
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

test("eventMatchesWindow: ventana 24h — matchea starts_at dentro de la ventana, NO fuera", async () => {
  // FIX 2026-07-10 (Sprint 2 v2 David): eventMatchesWindow es la nueva
  // función de matching que también soporta ventanas Phoenix (8am/10am)
  // por día UTC. Este test valida el comportamiento clásico de offset.
  const { eventMatchesWindow, getActiveReminderWindows } = await import(
    "../src/lib/cron/event-reminders.ts"
  );
  const now = new Date("2026-07-05T00:00:00Z");
  const windows = getActiveReminderWindows(now);
  const win24h = windows.find((w) => w.kind === "24h");
  if (!win24h) throw new Error("test setup: no 24h window");
  const evtInside = {
    eventId: "e1",
    eventSlug: "s1",
    eventTitle: "T1",
    eventStartsAt: new Date(win24h.windowStartMs + 5 * 60 * 1000).toISOString(),
    eventLocation: null,
    startsAtMs: win24h.windowStartMs + 5 * 60 * 1000,
  };
  const evtOutside = {
    eventId: "e2",
    eventSlug: "s2",
    eventTitle: "T2",
    eventStartsAt: new Date(win24h.windowEndMs + 30 * 60 * 60 * 1000).toISOString(),
    eventLocation: null,
    startsAtMs: win24h.windowEndMs + 30 * 60 * 60 * 1000,
  };
  assert.equal(eventMatchesWindow(evtInside, win24h), true);
  assert.equal(eventMatchesWindow(evtOutside, win24h), false);
});

test("eventMatchesWindow: ventana 8am Phoenix — matchea por DÍA UTC, no por offset", async () => {
  // FIX 2026-07-10: ventanas 8am/10am Phoenix matchean por día UTC, NO por
  // offset en ms. Evento a las 18:00 UTC del 11 julio matchea con ventana
  // 8am Phoenix (15:00 UTC) del 11 julio. Evento del 12 julio NO matchea.
  const { eventMatchesWindow } = await import(
    "../src/lib/cron/event-reminders.ts"
  );
  const evtMismoDia = {
    eventId: "e1",
    eventSlug: "s1",
    eventTitle: "T1",
    eventStartsAt: "2026-07-11T18:00:00.000Z",
    eventLocation: null,
    startsAtMs: Date.parse("2026-07-11T18:00:00.000Z"),
  };
  const evtOtroDia = {
    eventId: "e2",
    eventSlug: "s2",
    eventTitle: "T2",
    eventStartsAt: "2026-07-12T18:00:00.000Z",
    eventLocation: null,
    startsAtMs: Date.parse("2026-07-12T18:00:00.000Z"),
  };
  const win8amDel11 = {
    kind: "8am",
    windowStartMs: Date.UTC(2026, 6, 11, 14, 30),
    windowEndMs: Date.UTC(2026, 6, 11, 15, 30),
  };
  assert.equal(eventMatchesWindow(evtMismoDia, win8amDel11), true);
  assert.equal(eventMatchesWindow(evtOtroDia, win8amDel11), false);
  const win8amDel12 = {
    kind: "8am",
    windowStartMs: Date.UTC(2026, 6, 12, 14, 30),
    windowEndMs: Date.UTC(2026, 6, 12, 15, 30),
  };
  assert.equal(eventMatchesWindow(evtOtroDia, win8amDel12), true);
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