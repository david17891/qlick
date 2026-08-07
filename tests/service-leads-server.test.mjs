import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Service Leads Server — Persistencia e Idempotencia CRM", () => {
  it("captureServiceInterest valida requeridos y falla amablemente si falta la DB", async () => {
    const { captureServiceInterest } = await import(
      "../src/lib/services/service-leads-server.ts"
    );

    const result = await captureServiceInterest({
      phoneNormalized: "",
      serviceSlug: "kickstart-meta-ads",
      category: "digital",
      needSummary: "Videos comerciales",
      source: "whatsapp",
      sourceMessageId: "msg-123",
      consentBasis: "inbound_service_request",
    });

    assert.equal(result.ok, false);
    assert.equal(result.persisted, false);
  });

  it("updateServiceInterestDetails no falla cuando Supabase no está en la prueba", async () => {
    const { updateServiceInterestDetails } = await import(
      "../src/lib/services/service-leads-server.ts"
    );

    const result = await updateServiceInterestDetails({
      interestId: "interest-1",
      leadName: "Carlos Gómez",
      preferredContactTime: "Tardes 4pm",
    });

    assert.equal(typeof result.ok, "boolean");
  });
});
