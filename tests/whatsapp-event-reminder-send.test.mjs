/**
 * Tests del helper de reminder WhatsApp (feat/event-reminders-whatsapp).
 *
 * Cubre:
 *   - `buildReminderBody`: copy para 24h, 2h, 1h. PURE — no toca red ni DB.
 *   - `formatReminderDateTime`: formato America/Phoenix.
 *   - `sendEventReminderWhatsApp`: envoltura sobre el provider activo,
 *     con template opt-in y demo fallback.
 *
 * Corre con:
 *   node --experimental-strip-types --test tests/whatsapp-event-reminder-send.test.mjs
 */

// @ts-check

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildReminderBody,
  formatReminderDateTime,
  sendEventReminderWhatsApp,
} from "../src/lib/whatsapp/event-reminder-send.ts";

/* ─────────────────────────────────────────────────────────────
 * buildReminderBody (PURE)
 * ───────────────────────────────────────────────────────────── */

const baseInput = {
  attendeeName: "David",
  attendeePhone: "+526532935492",
  eventTitle: "Marketing + IA para Emprendedores",
  eventStartsAt: "2026-07-11T18:00:00.000Z",
  eventLocation: "Zoom (link 24h antes)",
  checkInUrl: "https://qlick.digital/check-in/abc123",
};

test("buildReminderBody 24h: copy 'Confirmamos tu lugar' (MX transaccional)", () => {
  const body = buildReminderBody({ ...baseInput, reminderKind: "24h" });
  assert.match(body, /David/);
  assert.match(body, /Marketing \+ IA para Emprendedores/);
  assert.match(body, /Confirmamos tu lugar/i);
  assert.match(body, /Cuándo:/);
  assert.match(body, /24 horas antes del inicio/i);
  assert.match(body, /Nos vemos pronto/i);
  // El cuerpo NUEVO no incluye el link del pase (eso vive en el botón del
  // template aprobado en Meta); sí incluye el link cuando reminderKind ≠ 24h.
  assert.ok(!body.includes(baseInput.checkInUrl));
});

test("buildReminderBody 24h con location: muestra línea Lugar:", () => {
  const body = buildReminderBody({ ...baseInput, reminderKind: "24h" });
  // eventLocation = "Zoom (link 24h antes)" → debe aparecer
  assert.match(body, /Zoom/i);
});

test("buildReminderBody 2h: copy 'en 2 horas'", () => {
  const body = buildReminderBody({ ...baseInput, reminderKind: "2h" });
  assert.match(body, /2 horas/);
  assert.ok(body.includes(baseInput.checkInUrl));
  assert.doesNotMatch(body, /mañana/i);
});

test("buildReminderBody 1h: copy 'en 1 hora'", () => {
  const body = buildReminderBody({ ...baseInput, reminderKind: "1h" });
  assert.match(body, /1 hora/);
  assert.ok(body.includes(baseInput.checkInUrl));
  assert.doesNotMatch(body, /mañana/i);
});

test("buildReminderBody sin location: omite línea Lugar", () => {
  const body = buildReminderBody({
    ...baseInput,
    reminderKind: "24h",
    eventLocation: null,
  });
  assert.doesNotMatch(body, /Lugar:/);
});

test("buildReminderBody sin nombre: usa 'Hola' neutro", () => {
  const body = buildReminderBody({
    ...baseInput,
    reminderKind: "1h",
    attendeeName: null,
  });
  // start of greeting line — tuteo MX informal
  assert.match(body, /Hola\s+👋|^Hola\s/);
});

test("buildReminderBody escapa <script> en eventTitle para evitar XSS", () => {
  const body = buildReminderBody({
    ...baseInput,
    reminderKind: "24h",
    eventTitle: '<script>alert("x")</script>',
  });
  assert.doesNotMatch(body, /<script>/);
  assert.match(body, /&lt;script&gt;/);
});

/* ─────────────────────────────────────────────────────────────
 * formatReminderDateTime (PURE, formato America/Phoenix)
 * ───────────────────────────────────────────────────────────── */

test("formatReminderDateTime: UTC 18:00 del 11/jul/2026 → 'sábado, 11 de julio · 11:00 a.m.' (Phoenix UTC-7)", () => {
  const out = formatReminderDateTime("2026-07-11T18:00:00.000Z");
  // es-MX produce 'sábado, 11 de julio' con coma después del día.
  // Hora: 18:00 UTC = 11:00 en Phoenix (UTC-7) → "11:00 a.m." en es-MX.
  assert.match(out, /sábado/i);
  assert.match(out, /11.*julio/i);
  assert.match(out, /11:00/);
  // es-MX usa "a. m." / "p. m." (con punto + espacio).
  assert.match(out, /a\.\s?m\./i);
});

test("formatReminderDateTime: input inválido devuelve el string crudo", () => {
  assert.equal(formatReminderDateTime("no-es-fecha"), "no-es-fecha");
});

/* ─────────────────────────────────────────────────────────────
 * sendEventReminderWhatsApp (envoltura sobre el provider activo)
 *
 * Estos tests NO pegan contra Meta. Stubean `getActiveWhatsAppProvider`
 * mutando el module cache de Node — ver patrón al final del archivo.
 *
 * Limitación: como el provider `manual_wa` SI está implementado y
 * devuelve `ok: false, demo: true, note: "..."` cuando no hay número
 * de sales configurado, los tests verifican ese contrato.
 * ───────────────────────────────────────────────────────────── */

test("sendEventReminderWhatsApp: nunca lanza, devuelve shape estable", async () => {
  // Sin env vars de provider configuradas, manual_wa devuelve demo: true.
  // No nos importa el resultado semántico aquí; nos importa el contrato
  // del helper (no throw, devuelve { ok, demo, note, externalId? }).
  const result = await sendEventReminderWhatsApp({
    attendeeName: "David",
    attendeePhone: "+526532935492",
    eventTitle: "Test",
    eventStartsAt: "2026-07-11T18:00:00.000Z",
    eventLocation: null,
    reminderKind: "1h",
    checkInUrl: "https://qlick.digital/check-in/x",
  });
  assert.equal(typeof result.ok, "boolean");
  assert.equal(typeof result.demo, "boolean");
  assert.equal(typeof result.note, "string");
  // Si fue ok, externalId es opcional; si no fue ok, externalId es undefined.
  assert.equal(result.externalId, undefined);
});

test("sendEventReminderWhatsApp: aún con input inválido no lanza", async () => {
  const result = await sendEventReminderWhatsApp({
    attendeeName: null,
    attendeePhone: "", // técnicamente inválido, pero el provider decidirá
    eventTitle: "x",
    eventStartsAt: "2026-07-11T18:00:00.000Z",
    eventLocation: null,
    reminderKind: "24h",
    checkInUrl: "https://qlick.digital/check-in/x",
    templateName: "recordatorio_evento_24h",
  });
  assert.equal(typeof result, "object");
  assert.equal(typeof result.note, "string");
});

/* ─────────────────────────────────────────────────────────────
 * FIX 2026-07-10: ventanas '8am' y '10am' (Phoenix día del evento)
 * ─────────────────────────────────────────────────────────────
 * El template Meta para estas ventanas aún no está aprobado. Mientras
 * tanto, el helper genera texto libre con copy explícito. Cuando los
 * templates 8am/10am se aprueben en Meta, el caller pasa `templateName`
 * y el provider de WhatsApp usa template en vez de texto libre.
 */

test("buildReminderBody 8am Phoenix: copy 'HOY es el taller'", () => {
  const body = buildReminderBody({ ...baseInput, reminderKind: "8am" });
  assert.match(body, /HOY/);
  assert.match(body, /Marketing \+ IA para Emprendedores/);
  // Incluye el link del pase (texto libre, no template).
  assert.ok(body.includes(baseInput.checkInUrl));
  assert.match(body, /David/);
});

test("buildReminderBody 8am: incluye el checkInUrl", () => {
  const body = buildReminderBody({ ...baseInput, reminderKind: "8am" });
  // Diferencia clave vs 24h: el 8am SIEMPRE lleva el link del pase
  // (el template Meta 8am/10am aún no existe, texto libre).
  assert.ok(body.includes(baseInput.checkInUrl));
});

test("buildReminderBody 10am Phoenix: copy 'En 1 hora empieza'", () => {
  const body = buildReminderBody({ ...baseInput, reminderKind: "10am" });
  assert.match(body, /En 1 hora/);
  assert.match(body, /Marketing \+ IA para Emprendedores/);
  assert.ok(body.includes(baseInput.checkInUrl));
  assert.match(body, /Te esperamos/i);
});

test("buildReminderBody 8am escapa XSS en eventTitle", () => {
  const body = buildReminderBody({
    ...baseInput,
    reminderKind: "8am",
    eventTitle: '<script>alert("x")</script>',
  });
  assert.doesNotMatch(body, /<script>/);
  assert.match(body, /&lt;script&gt;/);
});

test("buildReminderBody 10am sin location: omite línea Lugar", () => {
  const body = buildReminderBody({
    ...baseInput,
    reminderKind: "10am",
    eventLocation: null,
  });
  assert.doesNotMatch(body, /Lugar:/);
  // PERO el link del pase SÍ está (a diferencia del 24h).
  assert.ok(body.includes(baseInput.checkInUrl));
});
