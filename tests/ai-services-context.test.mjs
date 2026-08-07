import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("AI Services Context across 5 Bot Modes", () => {
  it("inyecta servicesCatalogBlock en todos los generadores de system prompt", async () => {
    const {
      buildSystemPrompt,
      buildSuperExecutivePrompt,
      buildSuperExecutiveV2Prompt,
      buildHumanFirstPrompt,
    } = await import("../src/lib/ai/agent-prompts.ts");

    const mockProfile = {
      name: "QlickBot",
      businessName: "Qlick Digital",
      businessDescription: "Agencia de Marketing",
      servicesOrCourses: [],
      businessHours: "9am - 6pm",
      tone: "professional",
      escalationRules: [],
      allowedActions: [],
      forbiddenActions: [],
      fallbackMessage: "Lo siento, no entendí.",
    };

    const mockServicesCatalog = [
      "=== CATÁLOGO DE SERVICIOS DE AGENCIA Y CONSULTORÍA B2B QLICK ===",
      "- Kickstart de Meta Ads: $3,500 MXN",
      "  Incluye: 2 videos IA, 3 imágenes",
      "1. INVERSIÓN PUBLICITARIA SEPARADA: La inversión en Meta Ads es abonada directamente por el cliente a Meta.",
    ].join("\n");

    const socraticPrompt = buildSystemPrompt(
      mockProfile,
      undefined,
      true,
      undefined,
      undefined,
      mockServicesCatalog
    );
    assert.ok(socraticPrompt.includes("Kickstart de Meta Ads"));
    assert.ok(socraticPrompt.includes("INVERSIÓN PUBLICITARIA SEPARADA"));

    const context = {
      profile: mockProfile,
      servicesCatalogBlock: mockServicesCatalog,
    };

    const superExecPrompt = buildSuperExecutivePrompt(context);
    assert.ok(superExecPrompt.includes("Kickstart de Meta Ads"));
    assert.ok(superExecPrompt.includes("INVERSIÓN PUBLICITARIA SEPARADA"));

    const superExecV2Prompt = buildSuperExecutiveV2Prompt(context);
    assert.ok(superExecV2Prompt.includes("Kickstart de Meta Ads"));
    assert.ok(superExecV2Prompt.includes("INVERSIÓN PUBLICITARIA SEPARADA"));

    const humanFirstPrompt = buildHumanFirstPrompt(context);
    assert.ok(humanFirstPrompt.includes("Kickstart de Meta Ads"));
    assert.ok(humanFirstPrompt.includes("INVERSIÓN PUBLICITARIA SEPARADA"));
  });
});
