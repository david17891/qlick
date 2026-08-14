import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildPaymentHelpCopy,
  isPaymentHelpRequest,
} from "../src/lib/whatsapp/bot-engine.ts";
import { mustEscalateToHuman } from "../src/lib/ai/guardrails.ts";

const EVENT = {
  source: "db",
  id: "00000000-0000-0000-0000-000000000001",
  slug: "desarrollo-estructura-curso-canaco",
  title: "Los 4 Pilares de un Negocio que Vende",
  priceMxn: 1000,
  eventRules: {
    reservation_enabled: true,
    reservation_amount_mxn: 500,
    balance_amount_mxn: 500,
    balance_due_note: "el día del evento",
  },
};

test("reconoce respuestas al recordatorio de pago", () => {
  assert.equal(isPaymentHelpRequest("explícame"), true);
  assert.equal(isPaymentHelpRequest("¿Cómo aparto?"), true);
  assert.equal(isPaymentHelpRequest("pásame el enlace de pago"), true);
  assert.equal(isPaymentHelpRequest("¿Qué incluye el taller?"), false);
});

test("no escala una pregunta operativa de pago, pero sí una incidencia", () => {
  assert.equal(mustEscalateToHuman("¿Cómo pago?").escalate, false);
  assert.equal(mustEscalateToHuman("¿Dónde aparto?").escalate, false);
  assert.equal(mustEscalateToHuman("pagué y no aparece").escalate, true);
  assert.equal(mustEscalateToHuman("quiero un reembolso").escalate, true);
});

test("explica el apartado con el enlace de la confirmación pendiente", () => {
  const body = buildPaymentHelpCopy({
    attendeeName: "David Martinez",
    event: EVENT,
    confirmationId: "00000000-0000-0000-0000-000000000099",
  });
  assert.match(body, /apartado de \$500 MXN/);
  assert.match(body, /liquida el día del evento/);
  assert.match(body, /pagar\/evento\/desarrollo-estructura-curso-canaco\?confirmation=/);
  assert.doesNotMatch(body, /confirmado antes de verificar/i);
});

test("mantiene un enlace genérico si falta la confirmación histórica", () => {
  const body = buildPaymentHelpCopy({ attendeeName: "David Martinez", event: EVENT });
  assert.match(body, /payment_option=reservation/);
  assert.doesNotMatch(body, /confirmation=undefined/);
});
