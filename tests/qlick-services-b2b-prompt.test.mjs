/**
 * Test unitario para formatServicesPromptBlock y la integración del catálogo
 * de servicios de agencia B2B Qlick en el prompt del bot de WhatsApp.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Servicios B2B — Prompt Builder & Protocolo de Cierre Dual", () => {
  it("formatServicesPromptBlock genera el catálogo formateado cuando se pasa una lista de servicios", async () => {
    const { formatServicesPromptBlock } = await import(
      "../src/lib/services/services-prompt-builder.ts"
    );

    const mockServices = [
      {
        id: "srv-1",
        slug: "kickstart-meta-ads",
        displayName: "Kickstart de Meta Ads",
        shortDescription: "Campañas efectivas en Facebook e Instagram.",
        bullets: ["Estrategia Meta", "Imágenes y Video con IA", "Segmentación"],
        defaultPriceMXN: 3500,
        defaultCurrency: "MXN",
        category: "digital",
        longDescription: null,
        icon: null,
        requiresScheduling: false,
        requiresDocuments: false,
        deliverableType: "video",
        isActive: true,
        displayOrder: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isPopular: true,
        variants: [
          {
            id: "var-1",
            serviceId: "srv-1",
            slug: "basico",
            label: "Básico",
            description: null,
            priceMXN: 3500,
            deliveryDaysMin: 3,
            deliveryDaysMax: 5,
            isActive: true,
            displayOrder: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            includes: ["Configuración Meta", "1 Video IA"],
          },
          {
            id: "var-2",
            serviceId: "srv-1",
            slug: "recomendado",
            label: "Recomendado",
            description: null,
            priceMXN: 12000,
            deliveryDaysMin: 7,
            deliveryDaysMax: 10,
            isActive: true,
            displayOrder: 2,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            includes: ["4 Videos", "8 Gráficos", "3 Campañas"],
          },
        ],
      },
    ];

    const block = formatServicesPromptBlock(mockServices);

    assert.ok(block.includes("CATÁLOGO DE SERVICIOS DE AGENCIA Y CONSULTORÍA B2B QLICK"));
    assert.ok(block.includes("Kickstart de Meta Ads"));
    assert.ok(block.includes("$3,500 MXN"));
    assert.ok(block.includes("$12,000 MXN"));
    assert.ok(block.includes("FLUJO DE CIERRE DUAL"));
    assert.ok(block.includes("11:00 a. m. y 6:00 p. m."));
    assert.ok(block.toLowerCase().includes("día siguiente"));
    assert.ok(block.includes("[[ESCALATE_HUMAN]]"));
  });

  it("formatServicesPromptBlock usa el fallback seguro si la lista está vacía", async () => {
    const { formatServicesPromptBlock } = await import(
      "../src/lib/services/services-prompt-builder.ts"
    );

    const block = formatServicesPromptBlock([]);

    assert.ok(block.includes("Presencia Local / Google Business Profile"));
    assert.ok(block.includes("Diseño Web Adaptable"));
    assert.ok(block.includes("Auditoría y Diagnóstico de Negocio 1a1"));
    assert.ok(block.includes("Kickstart de Meta Ads"));
    assert.ok(block.includes("11:00 a. m. y 6:00 p. m."));
  });

  it("detectIntent clasifica 'servicios?', 'diseño web', 'anuncios' como 'question' para ir al LLM", async () => {
    const { detectIntent } = await import(
      "../src/lib/whatsapp/bot-engine.ts"
    );

    assert.equal(detectIntent("servicios?", false), "question");
    assert.equal(detectIntent("servicios?", true), "question");
    assert.equal(detectIntent("Hola, qué servicios tienen?", true), "question");
    assert.equal(detectIntent("Quiero información de diseño web", true), "question");
  });
});
