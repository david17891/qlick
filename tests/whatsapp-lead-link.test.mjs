/**
 * Tests para el link directo de WhatsApp admin->lead (Sub-bloque C base).
 *
 * Helpers puros en `src/lib/contact/whatsapp.ts`:
 * - `buildDirectWhatsAppLink(phone, message)` — wa.me/{phone}?text=...
 *   (a diferencia de getWhatsAppLink, que apunta al numero de la empresa).
 * - `buildLeadOutreachMessage({leadName, eventTitle, commercialInterest})`
 *   — template del mensaje del admin al lead.
 *
 * Corre con `node --test`:
 *   node --test tests/whatsapp-lead-link.test.mjs
 */

// @ts-check

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildDirectWhatsAppLink,
  buildLeadOutreachMessage,
} from "../src/lib/contact/whatsapp.ts";

// ─────────────────────────────────────────────────────────────
// buildDirectWhatsAppLink
// ─────────────────────────────────────────────────────────────

test("buildDirectWhatsAppLink: phone valido E.164", () => {
  const link = buildDirectWhatsAppLink("+523312345678", "Hola");
  assert.equal(link, "https://wa.me/523312345678?text=Hola");
});

test("buildDirectWhatsAppLink: phone con espacios y parentesis se limpia", () => {
  const link = buildDirectWhatsAppLink("+52 (33) 1234-5678", "Hola");
  assert.equal(link, "https://wa.me/523312345678?text=Hola");
});

test("buildDirectWhatsAppLink: mensaje URL-encoded", () => {
  const link = buildDirectWhatsAppLink("+523312345678", "Hola, soy de Qlick");
  assert.ok(link);
  assert.ok(link.includes("%20"), "espacios deben ser %20");
  assert.ok(!link.includes(" "), "no debe tener espacios literales");
});

test("buildDirectWhatsAppLink: null si phone es null/undefined", () => {
  assert.equal(buildDirectWhatsAppLink(null, "Hola"), null);
  assert.equal(buildDirectWhatsAppLink(undefined, "Hola"), null);
  assert.equal(buildDirectWhatsAppLink("", "Hola"), null);
});

test("buildDirectWhatsAppLink: null si phone tiene menos de 10 digitos", () => {
  assert.equal(buildDirectWhatsAppLink("+12345", "Hola"), null);
  assert.equal(buildDirectWhatsAppLink("123", "Hola"), null);
  assert.equal(buildDirectWhatsAppLink("abc", "Hola"), null);
});

// ─────────────────────────────────────────────────────────────
// buildLeadOutreachMessage
// ─────────────────────────────────────────────────────────────

test("buildLeadOutreachMessage: con nombre + evento + interest", () => {
  const msg = buildLeadOutreachMessage({
    leadName: "Ana Ramirez",
    eventTitle: "Taller de Funnels",
    commercialInterest: "Ads en Meta, embudos",
  });
  assert.match(msg, /^Hola Ana Ramirez,/);
  assert.match(msg, /Taller de Funnels/);
  assert.match(msg, /Ads en Meta, embudos/);
  assert.match(msg, /Qlick/);
  assert.match(msg, /agendar una llamada/);
});

test("buildLeadOutreachMessage: sin eventTitle, fallback generico", () => {
  const msg = buildLeadOutreachMessage({ leadName: "Beto" });
  assert.match(msg, /dar seguimiento a tu interes en nuestros cursos/);
  assert.doesNotMatch(msg, /undefined/);
});

test("buildLeadOutreachMessage: sin commercialInterest, no aparece la linea", () => {
  const msg = buildLeadOutreachMessage({
    leadName: "Carla",
    eventTitle: "Conferencia",
  });
  assert.doesNotMatch(msg, /mencionaste interes/);
  assert.match(msg, /Conferencia/);
});

test("buildLeadOutreachMessage: nombre vacio -> saludo generico", () => {
  const msg = buildLeadOutreachMessage({
    leadName: "   ",
    eventTitle: "X",
  });
  assert.match(msg, /^Hola,/);
});

test("buildLeadOutreachMessage: integracion con buildDirectWhatsAppLink", () => {
  // Caso real: el admin tiene un lead con telefono + evento + interest.
  // Generamos el mensaje y construimos el link completo. El admin solo
  // hace click.
  const lead = {
    name: "David Esparza",
    phone: "+526865551234",
    eventTitle: "Taller de Funnels",
    commercialInterest: "Ads en Meta",
  };
  const message = buildLeadOutreachMessage({
    leadName: lead.name,
    eventTitle: lead.eventTitle,
    commercialInterest: lead.commercialInterest,
  });
  const link = buildDirectWhatsAppLink(lead.phone, message);
  assert.ok(link);
  assert.match(link, /^https:\/\/wa\.me\/526865551234\?text=/);
  // El link contiene el nombre (URL-encoded)
  assert.ok(link.includes("David") || link.includes("David%20Esparza"));
  // Y el titulo del evento
  assert.ok(link.includes("Taller") || link.includes("Taller%20de%20Funnels"));
});
