/**
 * Tests del template `event-certificate` (sprint v0.9.2 Cert Email).
 *
 * Verifica:
 * - Subject menciona el titulo del evento + "Felicidades" (sin PII del attendee).
 * - HTML escapa inyeccion (XSS via nombre del attendee).
 * - CTA apunta al certUrl correcto.
 * - Subject NO incluye el nombre del attendee (filtros anti-spam).
 * - Subject NO incluye el email del attendee.
 * - HTML contiene el folio y el link.
 * - Si attendeeName viene vacio, fallback a "Asistente".
 *
 * Corre con:
 *   node --experimental-strip-types --test tests/email-event-certificate-template.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";

const baseInput = {
  attendeeName: "Maria Gonzalez",
  attendeeEmail: "maria@example.com",
  eventTitle: "Marketing + IA para Emprendedores",
  eventStartsAt: "2026-07-11T18:00:00.000Z",
  folio: "QLK-2026-68558",
  certUrl: "https://qlick.digital/cert/QLK-2026-68558",
};

test("renderEventCertificateEmail: subject incluye titulo y 'Felicidades'", async () => {
  const { renderEventCertificateEmail } = await import(
    "../src/lib/email/templates/event-certificate.ts"
  );
  const result = renderEventCertificateEmail(baseInput);
  assert.match(result.subject, /Felicidades/);
  assert.match(result.subject, /Marketing \+ IA para Emprendedores/);
});

test("renderEventCertificateEmail: subject NO incluye nombre del attendee (PII)", async () => {
  const { renderEventCertificateEmail } = await import(
    "../src/lib/email/templates/event-certificate.ts"
  );
  const result = renderEventCertificateEmail(baseInput);
  assert.doesNotMatch(result.subject, /Maria/);
  assert.doesNotMatch(result.subject, /Gonzalez/);
});

test("renderEventCertificateEmail: subject NO incluye email (PII)", async () => {
  const { renderEventCertificateEmail } = await import(
    "../src/lib/email/templates/event-certificate.ts"
  );
  const result = renderEventCertificateEmail(baseInput);
  assert.doesNotMatch(result.subject, /maria@example\.com/);
});

test("renderEventCertificateEmail: HTML escapa inyeccion en attendeeName", async () => {
  const { renderEventCertificateEmail } = await import(
    "../src/lib/email/templates/event-certificate.ts"
  );
  const result = renderEventCertificateEmail({
    ...baseInput,
    attendeeName: '<script>alert("xss")</script>',
  });
  assert.doesNotMatch(result.html, /<script>alert/);
  assert.match(result.html, /&lt;script&gt;/);
});

test("renderEventCertificateEmail: HTML escapa inyeccion en eventTitle", async () => {
  const { renderEventCertificateEmail } = await import(
    "../src/lib/email/templates/event-certificate.ts"
  );
  const result = renderEventCertificateEmail({
    ...baseInput,
    eventTitle: '"><img src=x onerror=alert(1)>',
  });
  assert.doesNotMatch(result.html, /<img src=x/);
  assert.match(result.html, /&quot;/);
});

test("renderEventCertificateEmail: CTA apunta al certUrl correcto", async () => {
  const { renderEventCertificateEmail } = await import(
    "../src/lib/email/templates/event-certificate.ts"
  );
  const result = renderEventCertificateEmail(baseInput);
  assert.match(result.html, /href="https:\/\/qlick\.digital\/cert\/QLK-2026-68558"/);
});

test("renderEventCertificateEmail: HTML incluye el folio", async () => {
  const { renderEventCertificateEmail } = await import(
    "../src/lib/email/templates/event-certificate.ts"
  );
  const result = renderEventCertificateEmail(baseInput);
  assert.match(result.html, /QLK-2026-68558/);
});

test("renderEventCertificateEmail: HTML incluye saludo personalizado", async () => {
  const { renderEventCertificateEmail } = await import(
    "../src/lib/email/templates/event-certificate.ts"
  );
  const result = renderEventCertificateEmail(baseInput);
  assert.match(result.html, /Maria Gonzalez/);
});

test("renderEventCertificateEmail: si attendeeName vacio, fallback a 'Asistente'", async () => {
  const { renderEventCertificateEmail } = await import(
    "../src/lib/email/templates/event-certificate.ts"
  );
  const result = renderEventCertificateEmail({
    ...baseInput,
    attendeeName: "",
  });
  assert.match(result.html, /Asistente/);
  // Pero NO debe mostrar el string vacio literal ni "undefined" en
  // lugares visibles (saludo, h1, etc.).
  assert.doesNotMatch(result.html, />undefined</);
  // El saludo del h1 debe ser "¡Felicidades, Asistente!".
  assert.match(result.html, /Felicidades,?\s*Asistente/);
});

test("renderEventCertificateEmail: certUrl relativa cae al fallback seguro", async () => {
  const { renderEventCertificateEmail } = await import(
    "../src/lib/email/templates/event-certificate.ts"
  );
  const result = renderEventCertificateEmail({
    ...baseInput,
    certUrl: "/cert/QLK-2026-68558", // sin protocolo
  });
  // Debe caer al fallback absoluto.
  assert.match(result.html, /href="https:\/\/qlick\.digital\/cert\/QLK-2026-68558"/);
});

test("renderEventCertificateEmail: HTML incluye instrucciones de Ctrl+P", async () => {
  const { renderEventCertificateEmail } = await import(
    "../src/lib/email/templates/event-certificate.ts"
  );
  const result = renderEventCertificateEmail(baseInput);
  assert.match(result.html, /Ctrl/);
  assert.match(result.html, /Guardar como PDF|Imprimir/);
});

test("renderEventCertificateEmail: HTML incluye brand Qlick en footer", async () => {
  const { renderEventCertificateEmail } = await import(
    "../src/lib/email/templates/event-certificate.ts"
  );
  const result = renderEventCertificateEmail(baseInput);
  assert.match(result.html, /Qlick/);
});