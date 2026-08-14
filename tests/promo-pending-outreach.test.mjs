import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPromoPendingBroadcast } from "../src/lib/contact/whatsapp.ts";

test("la invitación promocional solo construye links para pendientes con teléfono", () => {
  const result = buildPromoPendingBroadcast({
    confirmations: [
      { id: "pending-1", name: "Ana Sintética", phoneNormalized: "+5216530000001" },
      { id: "pending-2", name: "Sin Teléfono", phoneNormalized: null },
    ],
    eventTitle: "Los 4 Pilares de un Negocio que Vende",
    eventDate: "20 de agosto de 2026",
    eventLocation: "CANACO, San Luis Río Colorado",
    promoUrl: "https://www.qlick.digital/promo",
  });

  assert.equal(result.items.length, 1);
  assert.equal(result.skipped.length, 1);
  assert.match(result.messagePreview, /2 personas por \$1,500 MXN/);
  assert.match(result.messagePreview, /Apartado de \$200 MXN/);
  assert.match(result.messagePreview, /una sola persona por \$1,000 MXN/);
  assert.match(result.items[0].waLink, /qlick\.digital%2Fpromo/);
  assert.match(decodeURIComponent(result.items[0].waLink), /Ana Sintética/);
});

test("la invitación no afirma pago, QR ni lugar apartado antes de verificar", () => {
  const result = buildPromoPendingBroadcast({
    confirmations: [{ id: "pending-1", name: "Persona Sintética", phoneRaw: "+5216530000001" }],
    eventTitle: "Evento sintético",
    promoUrl: "https://www.qlick.digital/promo",
  });

  assert.match(result.messagePreview, /pago todavía está pendiente/);
  assert.match(result.messagePreview, /QR y el acceso se envían al verificar/);
  assert.doesNotMatch(result.messagePreview, /lugar apartado|pago confirmado/i);
});
