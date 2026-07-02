/**
 * Tests del template `event-qr-pass` (Fase 7a, Bloque 1).
 *
 * Verifica:
 * - Subject sin PII (anti-spam).
 * - HTML escapa inyección básica.
 * - QR data URL embebido inline (no como attachment).
 * - Filas condicionales (location) se renderizan solo si existen.
 * - Botón CTA apunta a la URL del check-in.
 *
 * Corre con:
 *   node --experimental-strip-types --test tests/email-event-qr-pass-template.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";

const FAKE_QR_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

test("renderEventQrPassEmail: subject NO incluye PII", async () => {
  const { renderEventQrPassEmail } = await import(
    "../src/lib/email/templates/event-qr-pass.ts"
  );
  const result = renderEventQrPassEmail({
    attendeeName: "David Esparza",
    attendeeEmail: "david@qlick.mx",
    eventTitle: "IA y Marketing Básico",
    eventStartsAt: "2026-07-06T18:00:00.000Z",
    eventLocation: "Ciudad de México",
    qrDataUrl: FAKE_QR_DATA_URL,
    checkInUrl: "https://qlick.mx/check-in/abc123",
  });
  assert.doesNotMatch(result.subject, /David Esparza/);
  assert.doesNotMatch(result.subject, /david@qlick\.mx/);
  assert.match(result.subject, /IA y Marketing Básico/);
  assert.match(result.subject, /Tu pase/);
});

test("renderEventQrPassEmail: HTML escapa inyección en campos de texto", async () => {
  const { renderEventQrPassEmail } = await import(
    "../src/lib/email/templates/event-qr-pass.ts"
  );
  const result = renderEventQrPassEmail({
    attendeeName: '<script>alert("xss")</script>',
    attendeeEmail: "test@example.com",
    eventTitle: '"><img src=x>',
    eventStartsAt: "2026-07-06T18:00:00.000Z",
    eventLocation: "A & B <Hack>",
    qrDataUrl: FAKE_QR_DATA_URL,
    checkInUrl: "https://qlick.mx/check-in/abc",
  });
  assert.doesNotMatch(result.html, /<script>alert/);
  assert.match(result.html, /&lt;script&gt;/);
  assert.doesNotMatch(result.html, /"><img src=x>/);
  assert.match(result.html, /A &amp; B/);
});

test("renderEventQrPassEmail: embebe el QR inline (data:image/png base64)", async () => {
  const { renderEventQrPassEmail } = await import(
    "../src/lib/email/templates/event-qr-pass.ts"
  );
  const result = renderEventQrPassEmail({
    attendeeName: "Por",
    attendeeEmail: "por@example.com",
    eventTitle: "Evento X",
    eventStartsAt: "2026-07-06T18:00:00.000Z",
    eventLocation: "CDMX",
    qrDataUrl: FAKE_QR_DATA_URL,
    checkInUrl: "https://qlick.mx/check-in/abc",
  });
  assert.match(result.html, /src="data:image\/png;base64,/);
  // El data URL completo está embebido.
  assert.ok(result.html.includes(FAKE_QR_DATA_URL));
});

test("renderEventQrPassEmail: omite fila de location si es null", async () => {
  const { renderEventQrPassEmail } = await import(
    "../src/lib/email/templates/event-qr-pass.ts"
  );
  const result = renderEventQrPassEmail({
    attendeeName: "Por",
    attendeeEmail: "por@example.com",
    eventTitle: "Evento X",
    eventStartsAt: "2026-07-06T18:00:00.000Z",
    eventLocation: null,
    qrDataUrl: FAKE_QR_DATA_URL,
    checkInUrl: "https://qlick.mx/check-in/abc",
  });
  // El label "Dónde" no debe aparecer si no hay location.
  // Buscamos el header uppercase de la sección de location.
  assert.doesNotMatch(result.html, /<p[^>]*>Dónde<\/p>/);
});

test("renderEventQrPassEmail: incluye CTA apuntando al checkInUrl", async () => {
  const { renderEventQrPassEmail } = await import(
    "../src/lib/email/templates/event-qr-pass.ts"
  );
  const url = "https://qlick.mx/check-in/token-secreto-123";
  const result = renderEventQrPassEmail({
    attendeeName: "Por",
    attendeeEmail: "por@example.com",
    eventTitle: "Evento X",
    eventStartsAt: "2026-07-06T18:00:00.000Z",
    eventLocation: null,
    qrDataUrl: FAKE_QR_DATA_URL,
    checkInUrl: url,
  });
  assert.match(result.html, new RegExp(`href="${url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  assert.match(result.html, /Ver mi pase online/);
});

test("renderEventQrPassEmail: el attendeeEmail aparece en footer (aviso de destinatario)", async () => {
  const { renderEventQrPassEmail } = await import(
    "../src/lib/email/templates/event-qr-pass.ts"
  );
  const result = renderEventQrPassEmail({
    attendeeName: "Por",
    attendeeEmail: "lead@example.com",
    eventTitle: "Evento",
    eventStartsAt: "2026-07-06T18:00:00.000Z",
    eventLocation: null,
    qrDataUrl: FAKE_QR_DATA_URL,
    checkInUrl: "https://qlick.mx/check-in/x",
  });
  assert.match(result.html, /lead@example\.com/);
});

test("renderEventQrPassEmail: degradación segura con eventStartsAt inválido", async () => {
  const { renderEventQrPassEmail } = await import(
    "../src/lib/email/templates/event-qr-pass.ts"
  );
  // No debe crashear ni propagar "Invalid Date" feo al HTML.
  const result = renderEventQrPassEmail({
    attendeeName: "Por",
    attendeeEmail: "p@example.com",
    eventTitle: "Evento",
    eventStartsAt: "no-es-iso",
    eventLocation: null,
    qrDataUrl: FAKE_QR_DATA_URL,
    checkInUrl: "https://qlick.mx/check-in/x",
  });
  assert.doesNotMatch(result.html, /Invalid Date/);
});