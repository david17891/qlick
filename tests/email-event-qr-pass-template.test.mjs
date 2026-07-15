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
    qrImageUrl: "https://qlick.digital/api/qr/test.png",
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
    qrImageUrl: "https://qlick.digital/api/qr/test.png",
    checkInUrl: "https://qlick.mx/check-in/abc",
  });
  assert.doesNotMatch(result.html, /<script>alert/);
  assert.match(result.html, /&lt;script&gt;/);
  assert.doesNotMatch(result.html, /"><img src=x>/);
  assert.match(result.html, /A &amp; B/);
});

test("renderEventQrPassEmail: usa URL publica para el QR (no data URL inline)", async () => {
  // FIX 2026-07-02 (sesion David): antes el QR se embebia como data URL
  // inline, que NO se renderizaba en Gmail/Outlook. Ahora se referencia
  // por URL publica servida desde /api/qr/[token].png.
  const { renderEventQrPassEmail } = await import(
    "../src/lib/email/templates/event-qr-pass.ts"
  );
  const qrImageUrl = "https://qlick.digital/api/qr/abc123.png";
  const result = renderEventQrPassEmail({
    attendeeName: "Por",
    attendeeEmail: "por@example.com",
    eventTitle: "Evento X",
    eventStartsAt: "2026-07-06T18:00:00.000Z",
    eventLocation: "CDMX",
    qrImageUrl,
    checkInUrl: "https://qlick.mx/check-in/abc",
  });
  // La URL publica aparece en el src del <img>.
  assert.ok(result.html.includes(`src="${qrImageUrl}"`));
  // NO debe haber un data URL inline.
  assert.ok(!result.html.includes("data:image/png;base64,"));
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
    qrImageUrl: "https://qlick.digital/api/qr/test.png",
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
    qrImageUrl: "https://qlick.digital/api/qr/test.png",
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
    qrImageUrl: "https://qlick.digital/api/qr/test.png",
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
    qrImageUrl: "https://qlick.digital/api/qr/test.png",
    checkInUrl: "https://qlick.mx/check-in/x",
  });
  assert.doesNotMatch(result.html, /Invalid Date/);
});

// =====================================================================
// FIX auditoria 2026-07-15f: badge visual de estado de pago.
// El email debe mostrar claramente si el asistente ya pago o no,
// para reducir confusion en puerta y al reenviar el correo.
// =====================================================================

test("renderEventQrPassEmail: badge PAGADO cuando paymentStatus=paid y oculta CTA", async () => {
  const { renderEventQrPassEmail } = await import(
    "../src/lib/email/templates/event-qr-pass.ts"
  );
  const result = renderEventQrPassEmail({
    attendeeName: "David",
    attendeeEmail: "d@example.com",
    eventTitle: "Evento Pago",
    eventStartsAt: "2026-07-17T18:00:00.000Z",
    eventLocation: "CANACA",
    qrImageUrl: "https://qlick.digital/api/qr/test.png",
    checkInUrl: "https://qlick.mx/check-in/x",
    priceMXN: 1000,
    paymentUrl: "https://qlick.mx/pagar/evento/foo?confirmation=abc",
    paymentStatus: "paid",
  });
  // Badge verde "Pago confirmado" presente.
  assert.match(result.html, /Pago confirmado/);
  assert.match(result.html, /#15803d/); // verde
  // CTA "Pagar entrada" NO debe aparecer (ya pago).
  assert.doesNotMatch(result.html, /Pagar entrada/);
});

test("renderEventQrPassEmail: badge PAGADO MANUAL cuando paymentStatus=paid_manual", async () => {
  const { renderEventQrPassEmail } = await import(
    "../src/lib/email/templates/event-qr-pass.ts"
  );
  const result = renderEventQrPassEmail({
    attendeeName: "David",
    attendeeEmail: "d@example.com",
    eventTitle: "Evento Pago",
    eventStartsAt: "2026-07-17T18:00:00.000Z",
    eventLocation: "CANACA",
    qrImageUrl: "https://qlick.digital/api/qr/test.png",
    checkInUrl: "https://qlick.mx/check-in/x",
    priceMXN: 1000,
    paymentUrl: "https://qlick.mx/pagar/evento/foo?confirmation=abc",
    paymentStatus: "paid_manual",
  });
  // El copy debe mencionar que fue registrado en puerta.
  assert.match(result.html, /pago fue registrado en puerta/);
  assert.doesNotMatch(result.html, /Pagar entrada/);
});

test("renderEventQrPassEmail: badge PENDIENTE cuando paymentStatus=pending y mantiene CTA", async () => {
  const { renderEventQrPassEmail } = await import(
    "../src/lib/email/templates/event-qr-pass.ts"
  );
  const result = renderEventQrPassEmail({
    attendeeName: "David",
    attendeeEmail: "d@example.com",
    eventTitle: "Evento Pago",
    eventStartsAt: "2026-07-17T18:00:00.000Z",
    eventLocation: "CANACA",
    qrImageUrl: "https://qlick.digital/api/qr/test.png",
    checkInUrl: "https://qlick.mx/check-in/x",
    priceMXN: 1000,
    paymentUrl: "https://qlick.mx/pagar/evento/foo?confirmation=abc",
    paymentStatus: "pending",
  });
  // Badge amarillo "Pago pendiente" presente.
  assert.match(result.html, /Pago pendiente/);
  assert.match(result.html, /#b45309/); // amarillo
  // CTA "Pagar entrada" SI debe aparecer.
  assert.match(result.html, /Pagar entrada/);
});

test("renderEventQrPassEmail: badge EN VERIFICACIÓN cuando paymentStatus=pending_verification", async () => {
  const { renderEventQrPassEmail } = await import(
    "../src/lib/email/templates/event-qr-pass.ts"
  );
  const result = renderEventQrPassEmail({
    attendeeName: "David",
    attendeeEmail: "d@example.com",
    eventTitle: "Evento Pago",
    eventStartsAt: "2026-07-17T18:00:00.000Z",
    eventLocation: "CANACA",
    qrImageUrl: "https://qlick.digital/api/qr/test.png",
    checkInUrl: "https://qlick.mx/check-in/x",
    priceMXN: 1000,
    paymentUrl: "https://qlick.mx/pagar/evento/foo?confirmation=abc",
    paymentStatus: "pending_verification",
  });
  assert.match(result.html, /Pago en verificación/);
  // Sin CTA porque ya se hizo el intento de pago.
  assert.doesNotMatch(result.html, /Pagar entrada/);
});

test("renderEventQrPassEmail: badge REVOCADO cuando paymentStatus=revoked", async () => {
  const { renderEventQrPassEmail } = await import(
    "../src/lib/email/templates/event-qr-pass.ts"
  );
  const result = renderEventQrPassEmail({
    attendeeName: "David",
    attendeeEmail: "d@example.com",
    eventTitle: "Evento Pago",
    eventStartsAt: "2026-07-17T18:00:00.000Z",
    eventLocation: "CANACA",
    qrImageUrl: "https://qlick.digital/api/qr/test.png",
    checkInUrl: "https://qlick.mx/check-in/x",
    priceMXN: 1000,
    paymentUrl: "https://qlick.mx/pagar/evento/foo?confirmation=abc",
    paymentStatus: "revoked",
  });
  assert.match(result.html, /Pago revocado/);
  assert.match(result.html, /#b91c1c/); // rojo
  assert.doesNotMatch(result.html, /Pagar entrada/);
});

test("renderEventQrPassEmail: NO badge cuando paymentStatus=not_required", async () => {
  const { renderEventQrPassEmail } = await import(
    "../src/lib/email/templates/event-qr-pass.ts"
  );
  const result = renderEventQrPassEmail({
    attendeeName: "David",
    attendeeEmail: "d@example.com",
    eventTitle: "Evento Pago",
    eventStartsAt: "2026-07-17T18:00:00.000Z",
    eventLocation: "CANACA",
    qrImageUrl: "https://qlick.digital/api/qr/test.png",
    checkInUrl: "https://qlick.mx/check-in/x",
    priceMXN: 1000,
    paymentUrl: "https://qlick.mx/pagar/evento/foo?confirmation=abc",
    paymentStatus: "not_required",
  });
  // not_required: evento gratis, no debe haber CTA ni badge.
  assert.doesNotMatch(result.html, /Pago confirmado/);
  assert.doesNotMatch(result.html, /Pago pendiente/);
  assert.doesNotMatch(result.html, /Pagar entrada/);
});

test("renderEventQrPassEmail: NO badge cuando paymentStatus=undefined (legacy)", async () => {
  const { renderEventQrPassEmail } = await import(
    "../src/lib/email/templates/event-qr-pass.ts"
  );
  const result = renderEventQrPassEmail({
    attendeeName: "David",
    attendeeEmail: "d@example.com",
    eventTitle: "Evento Pago",
    eventStartsAt: "2026-07-17T18:00:00.000Z",
    eventLocation: "CANACA",
    qrImageUrl: "https://qlick.digital/api/qr/test.png",
    checkInUrl: "https://qlick.mx/check-in/x",
    priceMXN: 1000,
    paymentUrl: "https://qlick.mx/pagar/evento/foo?confirmation=abc",
  });
  // Sin paymentStatus: el bloque de pago se muestra (legacy compat)
  // pero no hay badge de estado.
  assert.match(result.html, /Pagar entrada/);
  assert.doesNotMatch(result.html, /Pago confirmado/);
  assert.doesNotMatch(result.html, /Pago pendiente/);
});

