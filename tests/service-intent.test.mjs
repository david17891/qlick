import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Service Intent Classifier", () => {
  it("clasifica frases de forma factual y precisa", async () => {
    const { detectServiceIntent } = await import(
      "../src/lib/whatsapp/service-intent.ts"
    );

    assert.equal(detectServiceIntent("info", {}).kind, "none");
    assert.equal(detectServiceIntent("baja", {}).kind, "none");
    assert.equal(detectServiceIntent("Inscribirme", {}).kind, "none");

    const campaign = detectServiceIntent("Hola, quiero información de videos y publicidad en Meta", {});
    assert.equal(campaign.kind, "kickstart_meta_ads");
    assert.equal(campaign.serviceSlug, "kickstart-meta-ads");

    const general = detectServiceIntent("¿Qué servicios tienen?", {});
    assert.equal(general.kind, "services_general");

    const pkg = detectServiceIntent("¿Qué incluye el paquete básico?", { activeServiceSlug: "kickstart-meta-ads" });
    assert.equal(pkg.kind, "package_question");
    assert.equal(pkg.variantSlug, "basico");

    const amb = detectServiceIntent("quiero información", {});
    assert.equal(amb.kind, "ambiguous");
  });
});
