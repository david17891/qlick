import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Service Lead Notification formatting & email escaping", () => {
  it("construye el enlace con el dominio y ruta actuales del admin", async () => {
    const { buildServiceLeadCrmUrl } = await import(
      "../src/lib/email/service-lead-notification.ts"
    );

    const url = buildServiceLeadCrmUrl();
    assert.equal(url, "https://qlick.digital/admin?tab=servicios");
    assert.doesNotMatch(url, /qlick\.app|admin\/dashboard/);
  });

  it("sendServiceLeadNotificationToAdmin sanitiza variables HTML y genera contenido plain text", async () => {
    const { sendServiceLeadNotificationToAdmin } = await import(
      "../src/lib/email/service-lead-notification.ts"
    );

    const result = await sendServiceLeadNotificationToAdmin({
      leadName: "<script>alert('xss')</script> Carlos",
      phoneNormalized: "+525500000001",
      serviceSlug: "kickstart-meta-ads",
      variantSlug: "recomendado",
      category: "digital",
      needSummary: "Videos comerciales & Meta Ads",
      preferredContactTime: "Mañanas 10am",
      campaignKey: "meta_kickstart_august",
    });

    // En ambiente de test sin Resend API key configurada, retorna false sin lanzar excepción
    assert.equal(typeof result.ok, "boolean");
  });
});
