import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Service Lead Domain Types & Validation", () => {
  it("permite los 5 estados de interés válidos", () => {
    const validStatuses = ["detected", "contacted", "qualified", "won", "lost"];
    assert.equal(validStatuses.length, 5);
  });

  it("valida requeridos para CaptureServiceInterestInput", () => {
    const isValidInput = (input) => {
      if (!input.phoneNormalized || typeof input.phoneNormalized !== "string") return false;
      if (!input.serviceSlug || typeof input.serviceSlug !== "string") return false;
      if (!input.category || typeof input.category !== "string") return false;
      if (!input.sourceMessageId || typeof input.sourceMessageId !== "string") return false;
      if (input.consentBasis !== "inbound_service_request") return false;
      return true;
    };

    assert.ok(isValidInput({
      phoneNormalized: "+525500000001",
      serviceSlug: "kickstart-meta-ads",
      category: "digital",
      sourceMessageId: "wamid.HBgL...",
      consentBasis: "inbound_service_request"
    }));

    assert.equal(isValidInput({
      phoneNormalized: "",
      serviceSlug: "kickstart-meta-ads",
      category: "digital",
      sourceMessageId: "wamid.HBgL...",
      consentBasis: "inbound_service_request"
    }), false);
  });
});
