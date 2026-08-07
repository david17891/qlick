import test from "node:test";
import assert from "node:assert/strict";

test("renderContactLeadEmail incluye datos del contacto y escapa HTML", async () => {
  const { renderContactLeadEmail } = await import(
    "../src/lib/email/contact-lead-notification.ts"
  );

  const result = renderContactLeadEmail({
    leadId: "lead-test-001",
    name: "Ana <Prueba>",
    email: "ana@example.com",
    phone: "+52 653 000 0000",
    topic: "Servicios para mi negocio",
    courseOfInterest: "Diseño web",
    message: "Necesito una página <informativa>.",
  });

  assert.match(result.subject, /Nuevo contacto desde la web/);
  assert.match(result.html, /Ana &lt;Prueba&gt;/);
  assert.match(result.html, /Necesito una página &lt;informativa&gt;\./);
  assert.match(result.html, /lead-test-001/);
  assert.match(result.text, /ana@example.com/);
});
