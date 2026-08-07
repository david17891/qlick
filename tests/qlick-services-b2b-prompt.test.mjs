/**
 * Test unitario para formatServicesPromptBlock y la integración del catálogo
 * de servicios de agencia B2B Qlick en el prompt del bot de WhatsApp.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Servicios B2B — Prompt Builder & Protocolo de Cierre Dual", () => {
  it("formatServicesPromptBlock genera el catálogo formateado detallando variantes, entregables y días de entrega", async () => {
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
            description: "+ Ads (presupuesto del cliente)",
            priceMXN: 3500,
            deliveryDaysMin: 5,
            deliveryDaysMax: 7,
            isActive: true,
            displayOrder: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            includes: ["Configuración Meta", "2 Videos IA de 10-20s", "Hasta 3 imágenes"],
          },
          {
            id: "var-2",
            serviceId: "srv-1",
            slug: "recomendado",
            label: "Recomendado",
            description: "+ Ads (presupuesto del cliente)",
            priceMXN: 12000,
            deliveryDaysMin: 7,
            deliveryDaysMax: 14,
            isActive: true,
            displayOrder: 2,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            includes: ["4 videos comerciales", "8 piezas gráficas", "30 días optimización"],
          },
        ],
      },
    ];

    const block = formatServicesPromptBlock(mockServices);

    assert.ok(block.includes("CATÁLOGO DE SERVICIOS DE AGENCIA Y CONSULTORÍA B2B QLICK"));
    assert.ok(block.includes("Kickstart de Meta Ads"));
    assert.ok(block.includes("$3,500 MXN"));
    assert.ok(block.includes("$12,000 MXN"));
    assert.ok(block.includes("+ Ads (presupuesto del cliente)"));
    assert.ok(block.includes("4 videos comerciales"));
    assert.ok(block.includes("8 piezas gráficas"));
    assert.ok(block.includes("5-7 días") || block.includes("5–7 días") || block.includes("5 a 7 días"));
    assert.ok(block.includes("7-14 días") || block.includes("7–14 días") || block.includes("7 a 14 días"));
    assert.ok(block.includes("inversión publicitaria") || block.includes("Ads"));
    assert.ok(block.includes("[[ESCALATE_HUMAN]]"));
  });

  it("formatServicesPromptBlock usa un fallback honesto cuando la lista está vacía sin mostrar precios stale", async () => {
    const { formatServicesPromptBlock } = await import(
      "../src/lib/services/services-prompt-builder.ts"
    );

    const block = formatServicesPromptBlock([]);

    assert.ok(block.includes("no pudo ser confirmado") || block.includes("no disponible"));
    assert.ok(block.includes("qlick.digital/servicios") || block.includes("especialista"));
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
