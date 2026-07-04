/**
 * Tests del safety net post-process del bot.
 *
 * Cubre `stripGreetingIfHasHistory()` extraído a
 * `src/lib/whatsapp/safety-net.ts`. Esta es la 3ra capa de defensa contra
 * el bug G-3 ("bot repite 'Hola Por, gracias por escribir' en cada turno"):
 *
 *   1. System prompt instruye NO saludar si isFirstMessage=false.
 *   2. Task prompt inyecta recordatorio si hay historial.
 *   3. Safety net strip mecánico del saludo (ESTA CAPA).
 *
 * Sin estos tests, si alguien toca los 6 regex del safety net, no hay
 * regression test que detecte que el bot vuelva a saludar en cada turno.
 *
 * Patrón: `node --test`, sin libs externas.
 */

// @ts-check

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  stripGreetingIfHasHistory,
  stripGreetingForTest,
} from "../src/lib/whatsapp/safety-net.ts";

/* ─────────────────────────────────────────────────────────────
 * hasHistory=false → no se toca nada (welcome esperado)
 * ───────────────────────────────────────────────────────────── */

test("hasHistory=false: 'Hola, buen día' → intacto (mensaje welcome)", () => {
  assert.equal(
    stripGreetingIfHasHistory("Hola, buen día", false),
    "Hola, buen día"
  );
});

test("hasHistory=false: cualquier string → intacto", () => {
  const input = "Por, gracias por escribir a Qlick. ¿En qué te ayudo?";
  assert.equal(stripGreetingIfHasHistory(input, false), input);
});

test("hasHistory=false: string vacío → intacto", () => {
  assert.equal(stripGreetingIfHasHistory("", false), "");
});

/* ─────────────────────────────────────────────────────────────
 * hasHistory=true + saludo conocido → strip
 * ───────────────────────────────────────────────────────────── */

test("hasHistory=true + 'Hola, ...' → strip del 'Hola, '", () => {
  assert.equal(
    stripGreetingIfHasHistory("Hola, te paso el costo: $500", true),
    "te paso el costo: $500"
  );
});

test("hasHistory=true + 'Buenas tardes, ...' → strip del saludo", () => {
  assert.equal(
    stripGreetingIfHasHistory("Buenas tardes, ¿qué evento te interesa?", true),
    "¿qué evento te interesa?"
  );
});

test("hasHistory=true + 'Buenas noches, ...' → strip del saludo", () => {
  assert.equal(
    stripGreetingIfHasHistory("Buenas noches, ya tengo el dato.", true),
    "ya tengo el dato."
  );
});

test("hasHistory=true + 'Qué tal, ...' → strip del saludo", () => {
  assert.equal(
    stripGreetingIfHasHistory("Qué tal, el costo es $500.", true),
    "el costo es $500."
  );
});

test("hasHistory=true + 'Hi, ...' → strip del saludo", () => {
  assert.equal(
    stripGreetingIfHasHistory("Hi, the event is on July 10.", true),
    "the event is on July 10."
  );
});

test("hasHistory=true + 'Hello, ...' → strip del saludo", () => {
  assert.equal(
    stripGreetingIfHasHistory("Hello, aquí está la info.", true),
    "aquí está la info."
  );
});

test("hasHistory=true + 'Hola Por, gracias por escribir a Qlick' → strip completo", () => {
  // El bug original reportado por David (2026-07-02). FIX 2026-07-04:
  // regex 3 + 4 ahora aceptan ' a Qlick' / ' al equipo' opcional.
  const input = "Hola Por, gracias por escribir a Qlick. ¿Te interesa el evento?";
  assert.equal(
    stripGreetingIfHasHistory(input, true),
    "¿Te interesa el evento?"
  );
});

test("hasHistory=true + 'Por, gracias por escribir a Qlick' → strip completo", () => {
  assert.equal(
    stripGreetingIfHasHistory(
      "Por, gracias por escribir a Qlick. El costo es $500.",
      true
    ),
    "El costo es $500."
  );
});

test("hasHistory=true + 'gracias por escribir a Qlick' (sin nombre) → strip completo", () => {
  assert.equal(
    stripGreetingIfHasHistory(
      "gracias por escribir a Qlick. ¿Qué evento te interesa?",
      true
    ),
    "¿Qué evento te interesa?"
  );
});

test("hasHistory=true + 'gracias por escribir.' (sin 'a Qlick') → strip sin comer más", () => {
  // Verifica que la mejora del regex no rompe el caso simple.
  assert.equal(
    stripGreetingIfHasHistory(
      "gracias por escribir. ¿Te interesa?",
      true
    ),
    "¿Te interesa?"
  );
});

test("hasHistory=true + 'David, gracias por contactarnos al equipo' → strip completo", () => {
  // Cubre el caso 'al equipo' (variante común en español mexicano).
  assert.equal(
    stripGreetingIfHasHistory(
      "David, gracias por contactarnos al equipo. Te paso la info.",
      true
    ),
    "Te paso la info."
  );
});

test("hasHistory=true + 'gracias por contactarnos' → strip", () => {
  assert.equal(
    stripGreetingIfHasHistory(
      "gracias por contactarnos. Te paso la info del evento.",
      true
    ),
    "Te paso la info del evento."
  );
});

test("hasHistory=true + 'Soy Qlick, asistente...' → strip", () => {
  assert.equal(
    stripGreetingIfHasHistory(
      "Soy Qlick, asistente de Qlick Marketing. ¿Cómo te ayudo?",
      true
    ),
    "¿Cómo te ayudo?"
  );
});

test("hasHistory=true + '¡Hola Por!' (con admiración, sin coma) → strip", () => {
  assert.equal(
    stripGreetingIfHasHistory("¡Hola Por! El costo es $500.", true),
    "El costo es $500."
  );
});

/* ─────────────────────────────────────────────────────────────
 * hasHistory=true + NO saludo → intacto
 * ───────────────────────────────────────────────────────────── */

test("hasHistory=true + respuesta que NO empieza con saludo → intacto", () => {
  const input = "El costo del evento es $500 MXN. ¿Te interesa apartar tu lugar?";
  assert.equal(stripGreetingIfHasHistory(input, true), input);
});

test("hasHistory=true + respuesta que contiene 'hola' en el medio → intacto", () => {
  // El 'hola' NO está al inicio, no debe strippearse.
  const input = "El evento se llama Hola Marketing (es broma, se llama Taller de Funnels).";
  assert.equal(stripGreetingIfHasHistory(input, true), input);
});

test("hasHistory=true + respuesta corta pero sustancial → intacto", () => {
  assert.equal(stripGreetingIfHasHistory("$500 MXN.", true), "$500 MXN.");
});

/* ─────────────────────────────────────────────────────────────
 * Edge cases
 * ───────────────────────────────────────────────────────────── */

test("hasHistory=true + solo saludo (queda vacío) → devuelve original (defensivo)", () => {
  // Si el LLM solo dijo "Hola" sin nada más, no queremos enviar mensaje vacío.
  assert.equal(stripGreetingIfHasHistory("Hola", true), "Hola");
});

test("hasHistory=true + solo 'Hola Por' (sin más contenido) → devuelve 'Por' (no vacío, no defensivo)", () => {
  // Después del regex 1 queda "Por" (no vacío). Como stripped !== content,
  // el código devuelve "Por". El fallback defensivo (content original)
  // solo aplica si stripped queda VACÍO.
  assert.equal(stripGreetingIfHasHistory("Hola Por", true), "Por");
});

test("hasHistory=true + solo whitespace → devuelve original", () => {
  // El trim del final hace que stripped quede '' → fallback al original.
  const result = stripGreetingIfHasHistory("   ", true);
  assert.equal(result, "   ");
});

test("hasHistory=true + string vacío → devuelve '' sin crashear", () => {
  assert.equal(stripGreetingIfHasHistory("", true), "");
});

test("stripGreetingForTest (sin hasHistory) siempre strippea — útil para debug", () => {
  // Versión lower-level: ignora hasHistory y strippea siempre.
  // Útil para verificar manualmente qué patrones matchean.
  assert.equal(
    stripGreetingForTest("Hola, ¿qué evento?"),
    "¿qué evento?"
  );
});