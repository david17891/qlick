/**
 * Tests del template `event-reminder` (Fase 7a, Bloque 3).
 *
 * Verifica:
 * - Subject y headline diferentes para 24h vs 2h.
 * - HTML escapa inyección.
 * - Filas condicionales (location) se omiten si null.
 * - CTA apunta a checkInUrl.
 *
 * Corre con:
 *   node --experimental-strip-types --test tests/email-event-reminder-template.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";

const baseInput = {
  attendeeName: "Por",
  eventTitle: "IA y Marketing",
  eventStartsAt: "2026-07-06T18:00:00.000Z",
  eventLocation: "CDMX",
  checkInUrl: "https://qlick.mx/check-in/abc",
};

test("renderEventReminderEmail 24h: subject menciona 'Mañana'", async () => {
  const { renderEventReminderEmail } = await import(
    "../src/lib/email/templates/event-reminder.ts"
  );
  const result = renderEventReminderEmail({
    ...baseInput,
    reminderKind: "24h",
  });
  assert.match(result.subject, /Mañana/);
  assert.match(result.subject, /IA y Marketing/);
  assert.doesNotMatch(result.subject, /\+52/);
  assert.doesNotMatch(result.subject, /Por/);
});

test("renderEventReminderEmail 2h: subject menciona 'En 2 horas'", async () => {
  const { renderEventReminderEmail } = await import(
    "../src/lib/email/templates/event-reminder.ts"
  );
  const result = renderEventReminderEmail({
    ...baseInput,
    reminderKind: "2h",
  });
  assert.match(result.subject, /En 2 horas/);
});

test("renderEventReminderEmail 24h: headline dice 'te esperamos mañana'", async () => {
  const { renderEventReminderEmail } = await import(
    "../src/lib/email/templates/event-reminder.ts"
  );
  const result = renderEventReminderEmail({
    ...baseInput,
    reminderKind: "24h",
  });
  assert.match(result.html, /Te esperamos mañana/);
});

test("renderEventReminderEmail 2h: headline dice 'nos vemos en ~2 horas'", async () => {
  const { renderEventReminderEmail } = await import(
    "../src/lib/email/templates/event-reminder.ts"
  );
  const result = renderEventReminderEmail({
    ...baseInput,
    reminderKind: "2h",
  });
  assert.match(result.html, /Nos vemos en ~2 horas/);
});

test("renderEventReminderEmail: HTML escapa inyección en eventTitle", async () => {
  const { renderEventReminderEmail } = await import(
    "../src/lib/email/templates/event-reminder.ts"
  );
  const result = renderEventReminderEmail({
    ...baseInput,
    eventTitle: '<script>alert("xss")</script>',
    reminderKind: "24h",
  });
  assert.doesNotMatch(result.html, /<script>alert/);
  assert.match(result.html, /&lt;script&gt;/);
});

test("renderEventReminderEmail: omite fila de location si es null", async () => {
  const { renderEventReminderEmail } = await import(
    "../src/lib/email/templates/event-reminder.ts"
  );
  const result = renderEventReminderEmail({
    ...baseInput,
    eventLocation: null,
    reminderKind: "24h",
  });
  assert.doesNotMatch(result.html, /<p[^>]*>Dónde<\/p>/);
});

test("renderEventReminderEmail: CTA apunta a checkInUrl", async () => {
  const { renderEventReminderEmail } = await import(
    "../src/lib/email/templates/event-reminder.ts"
  );
  const url = "https://qlick.mx/check-in/secret-token-xyz";
  const result = renderEventReminderEmail({
    ...baseInput,
    checkInUrl: url,
    reminderKind: "2h",
  });
  const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.match(result.html, new RegExp(`href="${escaped}"`));
});

test("renderEventReminderEmail 24h CTA label = 'Ver mi pase'", async () => {
  const { renderEventReminderEmail } = await import(
    "../src/lib/email/templates/event-reminder.ts"
  );
  const result = renderEventReminderEmail({
    ...baseInput,
    reminderKind: "24h",
  });
  // El CTA tiene whitespace alrededor (newlines + spaces), así que
  // no anclamos a ">"/"<" literales.
  assert.match(result.html, /Ver mi pase/);
  // 24h NO debe tener el label de 2h.
  assert.doesNotMatch(result.html, /Abrir mi pase/);
});

test("renderEventReminderEmail 2h CTA label = 'Abrir mi pase'", async () => {
  const { renderEventReminderEmail } = await import(
    "../src/lib/email/templates/event-reminder.ts"
  );
  const result = renderEventReminderEmail({
    ...baseInput,
    reminderKind: "2h",
  });
  assert.match(result.html, /Abrir mi pase/);
  // 2h NO debe tener el label de 24h.
  assert.doesNotMatch(result.html, /Ver mi pase/);
});

test("renderEventReminderEmail: degradación segura con eventStartsAt inválido", async () => {
  const { renderEventReminderEmail } = await import(
    "../src/lib/email/templates/event-reminder.ts"
  );
  const result = renderEventReminderEmail({
    ...baseInput,
    eventStartsAt: "no-es-iso",
    reminderKind: "24h",
  });
  assert.doesNotMatch(result.html, /Invalid Date/);
});