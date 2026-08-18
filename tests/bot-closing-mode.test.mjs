import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildClosingEventCopy,
  buildClosingCardPaymentCopy,
  buildClosingFallbackCopy,
  buildClosingQrTimingCopy,
  buildClosingServiceCopy,
  buildClosingWelcomeCopy,
  buildServiceDirectContactCopy,
  detectIntent,
  isDirectServiceRequest,
  isClosingBotMode,
  isClosingHumanRequest,
  isClosingQrTimingQuestion,
} from "../src/lib/whatsapp/bot-engine.ts";
import { buildClosingPrompt, buildTaskPrompt } from "../src/lib/ai/agent-prompts.ts";

const event = {
  id: "4100ffe3-54c1-45c1-a3a6-515595a646ad",
  slug: "desarrollo-estructura-curso-canaco",
  shortCode: "CANA",
  title: "Los 4 Pilares de un Negocio que Vende",
  description: "Lugar: CANACO, Av. Álvaro Obregón 14-15, San Luis Río Colorado, Sonora",
  startsAt: new Date("2026-08-20T23:00:00.000Z"),
  endsAt: new Date("2026-08-21T03:00:00.000Z"),
  location: "CANACO, San Luis Río Colorado",
  humanStartsAt: "20 de agosto de 2026, 4:00 p. m.",
  humanDuration: "4 horas",
  promptBlock: "evento real",
  source: "db",
  requiresName: true,
  eventRules: { personality: "", rules: [] },
  format: "in_person",
  streamingUrl: null,
  streamingProvider: null,
  streamingAccessNote: null,
  priceMxn: 1000,
};

test("el modo cierre es explícito y no se confunde con otros modos", () => {
  assert.equal(isClosingBotMode("closing"), true);
  assert.equal(isClosingBotMode("human_first"), false);
  assert.equal(isClosingBotMode(null), false);
});

test("el copy de cierre conserva contexto factual y dirige a /promo", () => {
  const copy = buildClosingEventCopy(event);
  assert.match(copy, /Los 4 Pilares de un Negocio que Vende/);
  assert.match(copy, /20 de agosto de 2026/);
  assert.match(copy, /CANACO, Av\. Álvaro Obregón 14-15/);
  assert.match(copy, /2 personas por \*\$1,500 MXN\*/);
  assert.match(copy, /Apartado de \*\$200 MXN\*/);
  assert.match(copy, /Opción individual por \*\$1,000 MXN\*/);
  assert.match(copy, /Apartado individual de \*\$200 MXN\*/);
  assert.match(copy, /tarjeta, OXXO o SPEI/i);
  assert.match(copy, /https:\/\/www\.qlick\.digital\/promo/);
  assert.doesNotMatch(copy, /\+52 686 233 0617/);
  assert.doesNotMatch(copy, /reembolso|devolvemos|nombre completo|correo electrónico/i);
});

test("el primer mensaje de cierre prioriza la oferta y es más corto", () => {
  const welcome = buildClosingWelcomeCopy(event);
  const full = buildClosingEventCopy(event);
  assert.match(welcome, /2 personas por \*\$1,500 MXN\*/);
  assert.match(welcome, /apartado de \*\$200 MXN\*/);
  assert.match(welcome, /individual: \$1,000 MXN \(apartado de \$200 MXN\)/);
  assert.match(welcome, /Elige cómo pagar en los botones/);
  assert.doesNotMatch(welcome, /Tarjeta|Transferencia\/OXXO|Santander|Número para depósito|Paul Velásquez|qlick\.digital\/promo/i);
  assert.ok(welcome.length < 700);
});

test("el fallback de bienvenida no expone datos de pago antes de pulsar", () => {
  const fallback = buildClosingFallbackCopy();
  assert.match(fallback, /elige cómo pagar en los botones/i);
  assert.doesNotMatch(fallback, /Tarjeta|Transferencia\/OXXO|Santander|Número para depósito|Paul Velásquez|qlick\.digital\/promo/i);
});

test("el botón de tarjeta usa un solo enlace y no promete Zoom", () => {
  const copy = buildClosingCardPaymentCopy();
  assert.equal((copy.match(/https:\/\/www\.qlick\.digital\/promo/g) ?? []).length, 1);
  assert.doesNotMatch(copy, /Zoom|sesi[oó]n de/i);
});

test("las consultas de servicios derivan directamente al asesor", () => {
  const copy = buildClosingServiceCopy();
  assert.match(copy, /servicios de publicidad, marketing/i);
  assert.match(copy, /https:\/\/wa\.me\/5216532935492/);
  assert.match(copy, /promoción del curso/i);
  assert.doesNotMatch(copy, /nombre completo|correo electrónico|QR|pago confirmado/i);
});

test("el contacto directo de servicios es reutilizable fuera del modo cierre", () => {
  const copy = buildServiceDirectContactCopy();
  assert.match(copy, /servicios de publicidad, marketing/i);
  assert.match(copy, /https:\/\/wa\.me\/5216532935492/);
  assert.doesNotMatch(copy, /desde \$|\?De qu[eé] giro|nombre|correo/i);
});

test("una pregunta de publicidad dentro del curso no se deriva como servicio", () => {
  assert.equal(
    isDirectServiceRequest("¿La publicidad pagada y Facebook Ads los enseñan en el curso?"),
    false,
  );
  assert.equal(isDirectServiceRequest("¿Hacen páginas web?"), true);
});

test("una duda de precio por persona no abre handoff; una petición explícita sí", () => {
  assert.equal(isClosingHumanRequest("¿Cuánto cuesta una persona y cuánto aparto?"), false);
  assert.equal(isClosingHumanRequest("¿Cuánto cuesta para dos personas?"), false);
  assert.equal(isClosingHumanRequest("Quiero hablar con un asesor"), true);
  assert.equal(isClosingHumanRequest("Necesito hablar con una persona"), true);
});

test("rechazar el registro sin pedir baja conserva la conversación informativa", () => {
  assert.equal(detectIntent("No quiero registrarme, solo necesito información", false), "question");
  assert.equal(detectIntent("No me interesa", false), "opt_out");
});

test("la duda sobre cuándo llega el QR responde después de verificar el pago", () => {
  assert.equal(isClosingQrTimingQuestion("¿Cuándo recibo el QR después de pagar?"), true);
  assert.match(buildClosingQrTimingCopy(), /después de verificar tu pago/i);
  assert.match(buildClosingQrTimingCopy(), /qlick\.digital\/promo/);
  assert.equal(isClosingQrTimingQuestion("¿Me puedes mandar el QR sin pagar?"), false);
});

test("el prompt de cierre prohíbe captura, tools y confirmación de pago", () => {
  const prompt = buildClosingPrompt({ activeEvent: event });
  assert.match(prompt, /No pidas nombre, correo/);
  assert.match(prompt, /no uses herramientas/);
  assert.match(prompt, /no confirmes pagos/);
  assert.match(prompt, /qlick\.digital\/promo/);
  assert.match(prompt, /653 293 5492/);
  assert.match(prompt, /Nunca preguntes.*te interesa apartar/i);
  assert.match(prompt, /no cotices publicidad/i);
  assert.match(prompt, /CONTEXTO COMPLETO Y ESTRUCTURADO DEL CURSO/);
  assert.match(prompt, /llevar laptop propia es opcional/i);
  assert.match(prompt, /No menciones pago en puerta/i);
  assert.match(prompt, /checkout ofrece tarjeta, OXXO y SPEI/i);
  assert.match(prompt, /Dos personas: \$1,500 MXN/);
  assert.match(prompt, /Una persona: \$1,000 MXN; apartado de \$200 MXN/);
});

test("el turno de cierre inyecta historial y reemplaza la instrucción genérica de captura", () => {
  const task = buildTaskPrompt("suggest_reply", {
    closingMode: true,
    lastIncomingMessage: "¿Puedo llevar laptop?",
    activeEvent: event,
    conversationWindow: {
      phoneNormalized: "5210000000000",
      leadId: "lead-test",
      messages: [
        {
          id: "m1",
          direction: "outbound",
          messageType: "text",
          body: "El curso es presencial en CANACO.",
          timestamp: "2026-08-15T20:00:00.000Z",
          metadata: null,
        },
      ],
      promptBlock: "=== HISTORIAL DE CONVERSACION ===\n[13:00] bot: El curso es presencial en CANACO.",
    },
  });
  assert.match(task, /HISTORIAL DE CONVERSACION/);
  assert.match(task, /¿Puedo llevar laptop\?/);
  assert.match(task, /no pidas ni guardes nombre, correo, teléfono/i);
  assert.doesNotMatch(task, /INTENT:/);
});
