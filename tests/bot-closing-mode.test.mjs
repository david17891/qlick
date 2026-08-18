import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildClosingEventCopy,
  buildClosingServiceCopy,
  buildServiceDirectContactCopy,
  isDirectServiceRequest,
  isClosingBotMode,
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
  assert.match(copy, /tarjeta, OXXO o SPEI/i);
  assert.match(copy, /https:\/\/www\.qlick\.digital\/promo/);
  assert.doesNotMatch(copy, /\+52 686 233 0617/);
  assert.doesNotMatch(copy, /reembolso|devolvemos|nombre completo|correo electrónico/i);
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
