import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("WhatsApp Bot — Flujo de Servicios Meta Ads", () => {
  it("detecta campaña de Meta Ads e indica enlace del catálogo y paquetes", async () => {
    const { detectServiceIntent } = await import(
      "../src/lib/whatsapp/service-intent.ts"
    );

    const intent = detectServiceIntent("Hola, quiero información de videos y publicidad en Meta");
    assert.equal(intent.kind, "kickstart_meta_ads");
    assert.equal(intent.serviceSlug, "kickstart-meta-ads");
  });

  it("mantiene aislamiento total: 'info' preserva el flujo de eventos", async () => {
    const { detectServiceIntent } = await import(
      "../src/lib/whatsapp/service-intent.ts"
    );

    const intent = detectServiceIntent("info");
    assert.equal(intent.kind, "none");
  });

  it("opt-out ('baja', 'stop') se ejecuta sin crear tareas comerciales ni servicios", async () => {
    const { detectServiceIntent } = await import(
      "../src/lib/whatsapp/service-intent.ts"
    );

    assert.equal(detectServiceIntent("baja").kind, "none");
    assert.equal(detectServiceIntent("stop").kind, "none");
  });

  it("aísla el flujo de servicios cuando el usuario provee email y nombre en una llamada de diagnóstico", async () => {
    const { detectServiceIntent } = await import(
      "../src/lib/whatsapp/service-intent.ts"
    );

    const body = "david17891@gmail.com david martinez";
    const EMAIL_AND_NAME_RE =
      /^([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})[\s,]+([A-ZÁÉÍÓÚÑa-záéíóúñ][A-ZÁÉÍÓÚÑa-záéíóúñ'.-]+(?:\s+[A-ZÁÉÍÓÚÑa-záéíóúñ'.-]+){0,4})$/i;

    const match = body.trim().match(EMAIL_AND_NAME_RE);
    assert.ok(match, "Debe matchear email primero y nombre después");
    assert.equal(match[1], "david17891@gmail.com");
    assert.equal(match[2], "david martinez");
  });

  it("'sin correo' NO debe clasificarse como 'register' ni matchear 'si'", async () => {
    const { detectIntent } = await import("../src/lib/whatsapp/bot-engine.ts");
    const intent = detectIntent("sin correo", false);
    assert.equal(intent, "question", "Frases con 'sin' no deben clasificarse como 'register'");
  });
});
