import test from "node:test";
import assert from "node:assert/strict";

test("el correo comunica el apartado desde el bloque de pago", async () => {
  const { renderEventQrPassEmail } = await import(
    "../src/lib/email/templates/event-qr-pass.ts"
  );
  const result = renderEventQrPassEmail({
    attendeeName: "Persona Prueba",
    attendeeEmail: "persona@example.com",
    eventTitle: "Evento de prueba",
    eventStartsAt: "2026-08-20T23:00:00.000Z",
    eventLocation: "CANACO",
    qrImageUrl: "https://qlick.digital/api/event-qr/test.png",
    checkInUrl: "https://qlick.digital/check-in/test",
    priceMXN: 1000,
    reservationAmountMXN: 500,
    paymentUrl: "https://qlick.digital/pagar/evento/test?payment_option=reservation",
    paymentStatus: "pending",
  });

  assert.match(result.html, /También puedes apartar tu lugar/);
  assert.match(result.html, /\$500 MXN/);
  assert.match(result.html, /Pagar entrada o apartar/);
});