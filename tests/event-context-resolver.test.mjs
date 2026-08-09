import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveEventContext } from "../src/lib/whatsapp/event-context-resolver.ts";

const previous = {
  id: "event-previous",
  slug: "marketing-ia-para-emprendedores",
  shortCode: "AA4E",
  title: "Marketing + IA para Emprendedores",
  location: "Zoom",
};

const current = {
  id: "event-current",
  slug: "desarrollo-estructura-curso-canaco",
  shortCode: "CN26",
  title: "Las 4 Patas de un Negocio que Vende",
  location: "CANACO",
};

test("resolver: botón identifica el evento actual", () => {
  const result = resolveEventContext({
    buttonId: "evt_inscribir_desarrollo-estructura-curso-canaco",
    events: [previous, current],
  });
  assert.equal(result?.event.id, current.id);
  assert.equal(result?.confidence, "explicit");
  assert.equal(result?.reason, "button_slug");
});

test("resolver: código identifica el evento anterior sin contaminar el actual", () => {
  const result = resolveEventContext({ body: "Quiero el AA4E", events: [previous, current] });
  assert.equal(result?.event.id, previous.id);
  assert.equal(result?.confidence, "explicit");
});

test("resolver: texto de título identifica el evento actual con contexto", () => {
  const result = resolveEventContext({
    body: "Me interesa el taller Las 4 Patas de un Negocio que Vende",
    events: [previous, current],
  });
  assert.equal(result?.event.id, current.id);
  assert.equal(result?.confidence, "contextual");
});

test("resolver: una conversación puede heredar el evento de un outbound previo", () => {
  const result = resolveEventContext({
    body: "Sí, quiero inscribirme",
    messages: [
      { direction: "outbound", body: "Evento CN26: Las 4 Patas de un Negocio que Vende" },
      { direction: "inbound", body: "Sí" },
    ],
    events: [previous, current],
  });
  assert.equal(result?.event.id, current.id);
  assert.equal(result?.confidence, "contextual");
  assert.equal(result?.reason, "conversation_short_code");
});

test("resolver: catálogo [2] identifica el segundo evento", () => {
  const result = resolveEventContext({ body: "el [2]", events: [previous, current] });
  assert.equal(result?.event.id, current.id);
  assert.equal(result?.confidence, "explicit");
});

test("resolver: una respuesta numérica de menú identifica el evento", () => {
  const result = resolveEventContext({ body: "2", events: [previous, current] });
  assert.equal(result?.event.id, current.id);
  assert.equal(result?.confidence, "explicit");
});

test("resolver: precio o fecha no se interpretan como selección de catálogo", () => {
  const result = resolveEventContext({
    body: "¿Cuánto cuesta? Vi que son $1,000 el 20 de agosto.",
    events: [previous, current],
  });
  assert.equal(result, null);
});

test("resolver: una conversación genérica con dos eventos queda sin asignar", () => {
  const result = resolveEventContext({
    body: "Hola, quiero más información",
    events: [previous, current],
  });
  assert.equal(result, null);
});

test("resolver: un solo evento permite fallback explícito y trazable", () => {
  const result = resolveEventContext({
    body: "Hola, quiero más información",
    events: [current],
    allowSingleEventFallback: true,
  });
  assert.equal(result?.event.id, current.id);
  assert.equal(result?.confidence, "fallback");
  assert.equal(result?.reason, "single_active_event");
});
