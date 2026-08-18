import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildManualPaymentInstructions,
  isManualPaymentEvidence,
  isManualPaymentMethodRequest,
} from "../src/lib/whatsapp/manual-payment-claims.ts";

test("detecta comprobante o aviso de pago manual sin confirmar el pago", () => {
  assert.equal(isManualPaymentEvidence({ messageId: "wamid.image", from: "+5210000000000", type: "image", image: { id: "media_1" } }, ""), true);
  assert.equal(isManualPaymentEvidence({ messageId: "wamid.text", from: "+5210000000000", type: "text" }, "ya pagué por OXXO"), true);
  assert.equal(isManualPaymentEvidence({ messageId: "wamid.question", from: "+5210000000000", type: "text" }, "¿Puedo pagar por OXXO o transferencia?"), false);
  assert.equal(isManualPaymentEvidence({ messageId: "wamid.question", from: "+5210000000000", type: "text" }, "¿Cuándo recibo el QR después de pagar?"), false);
  assert.equal(isManualPaymentEvidence({ messageId: "wamid.receipt", from: "+5210000000000", type: "text" }, "Aquí está mi comprobante"), true);
  assert.equal(isManualPaymentEvidence({ messageId: "wamid.question", from: "+5210000000000", type: "text" }, "¿qué incluye?"), false);
});

test("identifica la solicitud de instrucciones manuales", () => {
  assert.equal(isManualPaymentMethodRequest("¿Cómo pago por transferencia?"), true);
  assert.equal(isManualPaymentMethodRequest("¿Me pasas el número de tarjeta para depositar?"), true);
  assert.equal(isManualPaymentMethodRequest("¿Dónde hago el depósito en OXXO?"), true);
  assert.equal(isManualPaymentMethodRequest("¿Aceptan tarjeta?"), false);
});

test("las instrucciones manuales incluyen los datos públicos de depósito", () => {
  const previous = process.env.MANUAL_PAYMENT_CARD_NUMBER;
  delete process.env.MANUAL_PAYMENT_CARD_NUMBER;
  const copy = buildManualPaymentInstructions();
  assert.match(copy, /Santander/);
  assert.match(copy, /5579/);
  if (previous) process.env.MANUAL_PAYMENT_CARD_NUMBER = previous;
});
