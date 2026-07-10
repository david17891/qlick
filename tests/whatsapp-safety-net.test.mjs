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
  isAckOnly,
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

/* ─────────────────────────────────────────────────────────────
 * FIX 2026-07-10 (Sprint 2 hotfix David 03:27 AM) — guardia extendida
 * ─────────────────────────────────────────────────────────────
 * Si después del strip queda un residuo con menos de 3 caracteres
 * (ej. ".", "Va", "Sí", "Ok"), devolvemos el texto original con el
 * saludo intacto en vez de enviar ese residuo al lead. Bug real: el
 * LLM devolvía "Hola." solo y caía al safety net externo.
 */

test("hasHistory=true + residuo '.' (1 char) → devuelve original", () => {
  // El LLM devolvió solo "Hola." → strippea "Hola," pero queda "."
  // Con el fix, devolvemos "Hola." original (residuo muy corto).
  assert.equal(stripGreetingIfHasHistory("Hola.", true), "Hola.");
});

test("hasHistory=true + residuo 'Va' (2 chars) → devuelve original", () => {
  // Después de "Hola, Va" → strippea "Hola," → queda "Va". <3 chars
  // → devolvemos original "Hola, Va" (mejor que enviar solo "Va").
  assert.equal(stripGreetingIfHasHistory("Hola, Va", true), "Hola, Va");
});

test("hasHistory=true + residuo 'Sí' (2 chars) → devuelve original", () => {
  assert.equal(stripGreetingIfHasHistory("Hola, Sí", true), "Hola, Sí");
});

test("hasHistory=true + residuo 'OK' (2 chars) → devuelve original", () => {
  assert.equal(stripGreetingIfHasHistory("Hola, OK", true), "Hola, OK");
});

test("hasHistory=true + residuo 'Ok' (2 chars) → devuelve original", () => {
  assert.equal(stripGreetingIfHasHistory("Hola. Ok", true), "Hola. Ok");
});

test("hasHistory=true + residuo 'Por' (3 chars exactos) → devuelve 'Por'", () => {
  // 3 chars exactos pasa el filtro (no <3), devolvemos el residuo.
  // Antes del fix: mismo comportamiento (3 chars no estaba en el filtro).
  // Después del fix: comportamiento preservado.
  assert.equal(stripGreetingIfHasHistory("Hola Por", true), "Por");
});

test("hasHistory=true + residuo 'San' (3 chars) → devuelve 'San'", () => {
  // Variante para asegurar que el límite es ESTRICTAMENTE menor a 3.
  assert.equal(stripGreetingIfHasHistory("Hola San", true), "San");
});

/* ─────────────────────────────────────────────────────────────
 * isAckOnly — FIX 2026-07-10 hotfix
 * ─────────────────────────────────────────────────────────────
 * Detecta "gracias / ok / listo / perfecto / vale / entendido / va / sí"
 * exactos (con tolerancia a whitespace y puntuación). Caso real: lead
 * manda "Gracias" tras registro completado, bot respondía con safety net.
 */

test("isAckOnly: 'gracias' → true", () => {
  assert.equal(isAckOnly("gracias"), true);
});

test("isAckOnly: 'GRACIAS' → true (case-insensitive)", () => {
  assert.equal(isAckOnly("GRACIAS"), true);
});

test("isAckOnly: 'Gracias!' → true (con puntuación trailing)", () => {
  assert.equal(isAckOnly("Gracias!"), true);
});

test("isAckOnly: '  Gracias.  ' → true (con whitespace)", () => {
  assert.equal(isAckOnly("  Gracias.  "), true);
});

test("isAckOnly: 'muchas gracias' → true", () => {
  assert.equal(isAckOnly("muchas gracias"), true);
});

test("isAckOnly: 'mil gracias' → true", () => {
  assert.equal(isAckOnly("mil gracias"), true);
});

test("isAckOnly: 'ok' → true", () => {
  assert.equal(isAckOnly("ok"), true);
});

test("isAckOnly: 'OK.' → true", () => {
  assert.equal(isAckOnly("OK."), true);
});

test("isAckOnly: 'Listo' → true", () => {
  assert.equal(isAckOnly("Listo"), true);
});

test("isAckOnly: 'listo,' → true (con coma)", () => {
  assert.equal(isAckOnly("listo,"), true);
});

test("isAckOnly: 'Perfecto!' → true", () => {
  assert.equal(isAckOnly("Perfecto!"), true);
});

test("isAckOnly: 'vale' → true", () => {
  assert.equal(isAckOnly("vale"), true);
});

test("isAckOnly: 'Va.' → true", () => {
  assert.equal(isAckOnly("Va."), true);
});

test("isAckOnly: 'entendido' → true", () => {
  assert.equal(isAckOnly("entendido"), true);
});

test("isAckOnly: 'sí' / 'si' → true (con o sin tilde)", () => {
  assert.equal(isAckOnly("sí"), true);
  assert.equal(isAckOnly("si"), true);
  assert.equal(isAckOnly("Sí."), true);
});

test("isAckOnly: 'Gracias por la info' → false (no es SOLO ack)", () => {
  // Tiene palabras extra — el contexto lo necesita el LLM.
  assert.equal(isAckOnly("Gracias por la info"), false);
});

test("isAckOnly: 'ok perfecto' → false (dos palabras)", () => {
  assert.equal(isAckOnly("ok perfecto"), false);
});

test("isAckOnly: 'perfecto, qué costo tiene?' → false (pregunta)", () => {
  assert.equal(isAckOnly("perfecto, qué costo tiene?"), false);
});

test("isAckOnly: '' → false (string vacío)", () => {
  assert.equal(isAckOnly(""), false);
});

test("isAckOnly: null → false", () => {
  assert.equal(isAckOnly(null), false);
});

test("isAckOnly: undefined → false", () => {
  assert.equal(isAckOnly(undefined), false);
});