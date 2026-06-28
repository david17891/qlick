/**
 * Tests del template `survey-with-consent` (Fase 5).
 *
 * Verifica:
 * - Subject NO incluye PII (nombre, email) — anti-spam.
 * - Body escapa HTML para evitar inyección.
 * - Link al drawer del lead está bien formado.
 * - Filas condicionales (phone, interest) se renderizan solo si están presentes.
 * - Footer con disclaimer de consentimiento.
 *
 * Corre con:
 *   node --experimental-strip-types --test tests/email-survey-template.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";

test("renderSurveyWithConsentEmail: subject NO incluye PII", async () => {
  const { renderSurveyWithConsentEmail } = await import(
    "../src/lib/email/templates/survey-with-consent.ts"
  );
  const result = renderSurveyWithConsentEmail({
    leadName: "David Esparza",
    leadEmail: "david@qlick.mx",
    leadPhone: "+52 55 1234 5678",
    eventTitle: "Taller Funnels Venta",
    commercialInterest: "info de curso",
    leadId: "abc-123",
  });
  assert.doesNotMatch(result.subject, /David Esparza/);
  assert.doesNotMatch(result.subject, /david@qlick\.mx/);
  assert.doesNotMatch(result.subject, /\+52/);
  assert.match(result.subject, /Nuevo lead/);
  assert.match(result.subject, /Taller Funnels Venta/);
});

test("renderSurveyWithConsentEmail: HTML escapa inyección básica", async () => {
  const { renderSurveyWithConsentEmail } = await import(
    "../src/lib/email/templates/survey-with-consent.ts"
  );
  const result = renderSurveyWithConsentEmail({
    leadName: '<script>alert("xss")</script>',
    leadEmail: "test@example.com",
    leadPhone: null,
    eventTitle: "Test",
    commercialInterest: null,
    leadId: "id-1",
  });
  // El nombre malicioso NO debe quedar como <script> literal en el HTML.
  assert.doesNotMatch(result.html, /<script>alert/);
  // Pero SÍ debe aparecer escapado.
  assert.match(result.html, /&lt;script&gt;/);
});

test("renderSurveyWithConsentEmail: link al drawer usa leadId + appUrl", async () => {
  const { renderSurveyWithConsentEmail } = await import(
    "../src/lib/email/templates/survey-with-consent.ts"
  );
  const result = renderSurveyWithConsentEmail({
    leadName: "X",
    leadEmail: "x@x.com",
    leadPhone: null,
    eventTitle: "E",
    commercialInterest: null,
    leadId: "abc-123-uuid",
    appUrl: "https://app.qlick.mx",
  });
  assert.match(
    result.html,
    /https:\/\/app\.qlick\.mx\/admin\?tab=crm&amp;leadId=abc-123-uuid/,
  );
});

test("renderSurveyWithConsentEmail: filas condicionales (phone/interest)", async () => {
  const { renderSurveyWithConsentEmail } = await import(
    "../src/lib/email/templates/survey-with-consent.ts"
  );
  // Sin phone ni interest → no aparece "Teléfono" ni "Interés comercial".
  const min = renderSurveyWithConsentEmail({
    leadName: "X",
    leadEmail: "x@x.com",
    leadPhone: null,
    eventTitle: "E",
    commercialInterest: null,
    leadId: "id",
  });
  assert.doesNotMatch(min.html, /Teléfono/);
  assert.doesNotMatch(min.html, /Interés comercial/);

  // Con phone y interest → aparecen.
  const full = renderSurveyWithConsentEmail({
    leadName: "Y",
    leadEmail: "y@y.com",
    leadPhone: "+5215512345678",
    eventTitle: "E",
    commercialInterest: "precio",
    leadId: "id",
  });
  assert.match(full.html, /Teléfono/);
  assert.match(full.html, /Interés comercial/);
  // El teléfono debe tener un link wa.me para click-to-chat.
  assert.match(full.html, /https:\/\/wa\.me\/5215512345678/);
});

test("renderSurveyWithConsentEmail: footer incluye disclaimer de consentimiento", async () => {
  const { renderSurveyWithConsentEmail } = await import(
    "../src/lib/email/templates/survey-with-consent.ts"
  );
  const result = renderSurveyWithConsentEmail({
    leadName: "X",
    leadEmail: "x@x.com",
    leadPhone: null,
    eventTitle: "E",
    commercialInterest: null,
    leadId: "id",
  });
  assert.match(result.html, /aceptó recibir contacto comercial/);
  assert.match(result.html, /Qlick Marketing Integral/);
});

test("renderSurveyWithConsentEmail: appUrl default sin NEXT_PUBLIC_APP_URL", async () => {
  // Simular entorno sin env var — debería usar http://localhost:3000.
  const ORIGINAL = process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.NEXT_PUBLIC_APP_URL;

  try {
    const { renderSurveyWithConsentEmail } = await import(
      "../src/lib/email/templates/survey-with-consent.ts"
    );
    const result = renderSurveyWithConsentEmail({
      leadName: "X",
      leadEmail: "x@x.com",
      leadPhone: null,
      eventTitle: "E",
      commercialInterest: null,
      leadId: "id",
    });
    assert.match(result.html, /http:\/\/localhost:3000\/admin/);
  } finally {
    if (ORIGINAL !== undefined) process.env.NEXT_PUBLIC_APP_URL = ORIGINAL;
  }
});