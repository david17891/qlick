import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldSuppressRapidDuplicateResponse } from "../src/lib/whatsapp/response-dedup.ts";

const now = new Date("2026-08-09T17:00:00.000Z");
const base = {
  candidateIntent: "greeting",
  candidateBody: "Hola 👋 ¿Qué información te interesa?",
  lastOutboundBody: "Hola 👋 ¿Qué información te interesa?",
  lastOutboundCreatedAt: "2026-08-09T16:59:59.500Z",
  lastOutboundAutoSource: "bot",
  now
};

test("suprime el mismo welcome repetido dentro de la ventana corta", () => {
  const result = shouldSuppressRapidDuplicateResponse(base);

  assert.equal(result.suppress, true);
  assert.equal(result.reason, "rapid_duplicate_initial_response");
});

test("permite la misma respuesta después de la ventana corta", () => {
  const result = shouldSuppressRapidDuplicateResponse({
    ...base,
    lastOutboundCreatedAt: "2026-08-09T16:59:40.000Z"
  });

  assert.equal(result.suppress, false);
});

test("permite una respuesta diferente aunque llegue inmediatamente", () => {
  const result = shouldSuppressRapidDuplicateResponse({
    ...base,
    candidateBody: "Perfecto, ¿quieres inscribirte?"
  });

  assert.equal(result.suppress, false);
});

test("no bloquea captura ni respuestas posteriores al welcome", () => {
  const result = shouldSuppressRapidDuplicateResponse({
    ...base,
    candidateIntent: "question"
  });

  assert.equal(result.suppress, false);
});

test("no bloquea cuando el último mensaje no está marcado como automático", () => {
  const result = shouldSuppressRapidDuplicateResponse({
    ...base,
    lastOutboundAutoSource: null
  });

  assert.equal(result.suppress, false);
});
