/**
 * Tests para el helper `buildCertificateWhatsAppLink` (Sprint Cert-Individual
 * 2026-07-15). Genera el link wa.me que David usa para mandar la constancia
 * por WhatsApp cuando el asistente no tiene email.
 *
 * Corre con `node --test` (mismo patrón que email-event-certificate-template.test.mjs):
 *   node --experimental-strip-types --test tests/email-cert-whatsapp-link.test.mjs
 *
 * Privacy: cero PII. Teléfonos y nombres son sintéticos.
 */

// @ts-check

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCertificateWhatsAppLink } from "../src/lib/email/cert-whatsapp-link.ts";

// ──────────────────────────────────────────────────────────────────────────
// Happy path
// ──────────────────────────────────────────────────────────────────────────

test("buildCertificateWhatsAppLink: teléfono E.164 produce wa.me sin +", () => {
  const link = buildCertificateWhatsAppLink({
    attendeeName: "Ana Lopez",
    attendeePhone: "+523312345678",
    folio: "QLK-2026-00001",
    eventTitle: "Masterclass de Marketing",
    certUrl: "https://qlick.digital/cert/QLK-2026-00001",
  });
  assert.equal(
    link,
    "https://wa.me/523312345678?text=" +
      encodeURIComponent(
        "Hola Ana Lopez, ¡felicidades por completar \"Masterclass de Marketing\"! 🎉\n\n" +
        "Tu constancia: https://qlick.digital/cert/QLK-2026-00001\n\n" +
        "Abre el link para ver y guardar tu constancia como PDF (folio QLK-2026-00001).",
      ),
  );
});

test("buildCertificateWhatsAppLink: teléfono con espacios y guiones se normaliza a solo dígitos", () => {
  const link = buildCertificateWhatsAppLink({
    attendeeName: "Carlos",
    attendeePhone: "+52 33 1234 5678",
    folio: "QLK-2026-00099",
    eventTitle: "Webinar Q2",
    certUrl: "https://qlick.digital/cert/QLK-2026-00099",
  });
  // Stripped: "523312345678"
  assert.ok(link.startsWith("https://wa.me/523312345678?text="));
});

// ──────────────────────────────────────────────────────────────────────────
// Edge cases de nombre
// ──────────────────────────────────────────────────────────────────────────

test("buildCertificateWhatsAppLink: nombre vacío cae a 'asistente'", () => {
  const link = buildCertificateWhatsAppLink({
    attendeeName: "",
    attendeePhone: "523312345678",
    folio: "QLK-2026-00002",
    eventTitle: "Demo",
    certUrl: "https://qlick.digital/cert/QLK-2026-00002",
  });
  // El mensaje debe empezar con "Hola asistente,"
  assert.ok(
    decodeURIComponent(link).includes("Hola asistente,"),
    "nombre vacío debe caer al fallback 'asistente'",
  );
});

test("buildCertificateWhatsAppLink: nombre con espacios extra se trimea", () => {
  const link = buildCertificateWhatsAppLink({
    attendeeName: "   Maria   ",
    attendeePhone: "523312345678",
    folio: "QLK-2026-00003",
    eventTitle: "Demo",
    certUrl: "https://qlick.digital/cert/QLK-2026-00003",
  });
  // Después del trim, no debe quedar "   Maria   " en el mensaje.
  const decoded = decodeURIComponent(link);
  assert.ok(
    decoded.includes("Hola Maria,"),
    `esperaba 'Hola Maria,' en el mensaje, got: ${decoded}`,
  );
});

// ──────────────────────────────────────────────────────────────────────────
// Encoding correcto de caracteres especiales
// ──────────────────────────────────────────────────────────────────────────

test("buildCertificateWhatsAppLink: título con acentos y ñ se encodea correctamente", () => {
  const link = buildCertificateWhatsAppLink({
    attendeeName: "José Ñandú",
    attendeePhone: "523312345678",
    folio: "QLK-2026-00004",
    eventTitle: "Diseño Estratégico",
    certUrl: "https://qlick.digital/cert/QLK-2026-00004",
  });
  const decoded = decodeURIComponent(link);
  assert.ok(decoded.includes("José Ñandú"));
  assert.ok(decoded.includes("Diseño Estratégico"));
  // El %20 debe aparecer donde haya espacios en el texto encodeado
  assert.ok(link.includes("%20") || !decoded.includes(" "), "espacios deben estar encodeados");
});

test("buildCertificateWhatsAppLink: folio y certUrl se incluyen tal cual en el mensaje", () => {
  const link = buildCertificateWhatsAppLink({
    attendeeName: "Test",
    attendeePhone: "523312345678",
    folio: "QLK-2026-99999",
    eventTitle: "X",
    certUrl: "https://qlick.digital/cert/QLK-2026-99999",
  });
  const decoded = decodeURIComponent(link);
  assert.ok(decoded.includes("(folio QLK-2026-99999)"));
  assert.ok(decoded.includes("https://qlick.digital/cert/QLK-2026-99999"));
});
