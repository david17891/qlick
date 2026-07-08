/**
 * Tests del fix "captura desordenada + prioridad cerrar lead" (2026-07-07).
 *
 * Sesion David 2026-07-07 ~21:35. Las conversaciones del WhatsApp del
 * 8 de julio para el evento del 11 de julio muestran que el bot NO
 * respondia bien a preguntas basicas (costo, constancia, link Zoom) y
 * tenia fugas en el flow de captura:
 *
 *   - Lead mandaba nombre + email en el mismo mensaje (caso Sitlalic) →
 *     bot ignoraba el email y trataba el body entero como nombre.
 *   - Lead respondia "Si" tras pregunta de confirmacion → bot loopaba
 *     re-preguntando.
 *   - Lead hacia una pregunta intermedia mientras el bot esperaba
 *     nombre/email → bot no contestaba la pregunta y se quedaba en
 *     bucle de re-pedir el campo.
 *   - Bot afirmaba "ya tienes tu lugar apartado" sin haber completado
 *     flow (alucinacion).
 *
 * Estos tests cubren las primitivas puras que sustentan el fix. Para
 * tests de integracion end-to-end (que ejecuten el side-effect chain
 * de provide_email cuando hay implicit_capture), usar Playwright MCP
 * contra el bot corriendo en Vercel preview.
 *
 * Patrón: `node --test`, sin libs externas.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @ts-check

// Imports del codigo fuente (via type-stripping de Node).
import { extractEmailFromText } from "../src/lib/whatsapp/email-extract.ts";
import {
  isValidHumanName,
  isQuestionOrIntent,
  cleanFirstName
} from "../src/lib/whatsapp/bot-engine.ts";
import { detectIntent } from "../src/lib/whatsapp/bot-engine.ts";

/* ─────────────────────────────────────────────────────────────
 * 1. Email embebido en body mixto (caso real de la conversacion)
 * ───────────────────────────────────────────────────────────── */

test("extractEmailFromText: 'Sitlalic Guzman ramos sitlalic.guzman@uabc.edu.mx' → email extraido", () => {
  // Caso real de la conversacion con Sitlalic.
  const body =
    "Sitlalic Guzmán ramos sitlalic.guzman@uabc.edu.mx";
  const email = extractEmailFromText(body);
  assert.ok(email, "debe encontrar un email");
  assert.equal(email?.toLowerCase(), "sitlalic.guzman@uabc.edu.mx");
});

test("extractEmailFromText: email solo (body = email) → email extraido", () => {
  const email = extractEmailFromText("david17891@gmail.com");
  assert.equal(email, "david17891@gmail.com");
});

test("extractEmailFromText: sin email en texto → null", () => {
  const email = extractEmailFromText("Solo quiero inscribirme al evento");
  assert.equal(email, null);
});

test("extractEmailFromText: email al final precedido por coma → email extraido", () => {
  const body = "Sitlalic Guzman ramos, sitlalic.guzman@uabc.edu.mx";
  const email = extractEmailFromText(body);
  assert.equal(email?.toLowerCase(), "sitlalic.guzman@uabc.edu.mx");
});

test("extractEmailFromText: email al inicio → email extraido", () => {
  const body = "david17891@gmail.com soy David Esparza";
  const email = extractEmailFromText(body);
  assert.equal(email, "david17891@gmail.com");
});

/* ─────────────────────────────────────────────────────────────
 * 2. Nombre despues de quitar email embebido (caso Sitlalic)
 * ───────────────────────────────────────────────────────────── */

test("isValidHumanName: nombre extraido de body con email embebido es valido", () => {
  // Simulamos lo que hace el handler provide_name: toma el body,
  // extrae el email, y valida el resto como nombre.
  const body = "Sitlalic Guzmán ramos sitlalic.guzman@uabc.edu.mx";
  const email = extractEmailFromText(body);
  assert.ok(email, "precondición: hay email");
  const nameOnly = body
    .replace(email, "")
    .replace(/[,;]+\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Sin email, el resto es "Sitlalic Guzmán ramos".
  assert.equal(nameOnly, "Sitlalic Guzmán ramos");
  assert.ok(isValidHumanName(nameOnly), "el nombre sin email debe ser valido");
});

test("isValidHumanName: 'Sitlalic Guzmán ramos' → valido (3 palabras con letras)", () => {
  assert.ok(isValidHumanName("Sitlalic Guzmán ramos"));
});

test("isValidHumanName: 'David Esparza' → valido", () => {
  assert.ok(isValidHumanName("David Esparza"));
});

test("isValidHumanName: 'Maria de los Angeles' → valido", () => {
  assert.ok(isValidHumanName("Maria de los Angeles"));
});

/* ─────────────────────────────────────────────────────────────
 * 3. Pregunta intermedia NO es un nombre (regresion)
 * ───────────────────────────────────────────────────────────── */

test("isQuestionOrIntent: pregunta mientras bot espera nombre → true", () => {
  // Caso David 2026-07-07: lead hace pregunta intermedia cuando el
  // bot le pidio nombre. Esta funcion la usa el handler provide_name
  // para NO guardar la pregunta como nombre.
  assert.ok(isQuestionOrIntent("cuanto cuesta?"));
  assert.ok(isQuestionOrIntent("tiene constancia?"));
  assert.ok(isQuestionOrIntent("cual es mi código de entrada?"));
  assert.ok(isQuestionOrIntent("donde se hace?"));
  assert.ok(isQuestionOrIntent("a que hora empieza?"));
});

test("isQuestionOrIntent: nombre humano NO es pregunta → false", () => {
  assert.equal(isQuestionOrIntent("David Esparza"), false);
  assert.equal(isQuestionOrIntent("Maria de los Angeles"), false);
  assert.equal(isQuestionOrIntent("Sitlalic Guzmán"), false);
});

test("isQuestionOrIntent: 'Si' suelto NO es pregunta → false (va al LLM)", () => {
  // El affirmative corto va al LLM para mantener contexto, no es
  // pregunta cerrada que requiera re-preguntar nombre.
  assert.equal(isQuestionOrIntent("Si"), false);
  assert.equal(isQuestionOrIntent("Ok"), false);
});

/* ─────────────────────────────────────────────────────────────
 * 4. cleanFirstName: placeholders + nombres reales (regresion)
 * ───────────────────────────────────────────────────────────── */

test("cleanFirstName: nombre real con acento se preserva", () => {
  assert.equal(cleanFirstName("Sitlalic Guzmán"), "Sitlalic Guzmán");
  assert.equal(cleanFirstName("María José"), "María José");
});

test("cleanFirstName: placeholder canonico se filtra", () => {
  assert.equal(cleanFirstName("Por"), "");
  assert.equal(cleanFirstName("por confirmar"), "");
});

/* ─────────────────────────────────────────────────────────────
 * 5. detectIntent: regresion (no rompimos el detector)
 * ───────────────────────────────────────────────────────────── */

test("detectIntent: email solo → provide_email", () => {
  assert.equal(
    detectIntent("david17891@gmail.com", false),
    "provide_email"
  );
});

test("detectIntent: 'Si' suelto en medio de conversacion → question", () => {
  // FIX 2026-07-02 (sesion David): affirmative corto en medio de
  // conversacion NO es register. Va al LLM para mantener contexto.
  assert.equal(detectIntent("Si", false), "question");
  assert.equal(detectIntent("Ok", false), "question");
  assert.equal(detectIntent("dale", false), "question");
});

test("detectIntent: 'Si por favor' sigue siendo register", () => {
  // Aunque el cuerpo arranca con "Si", la presencia de palabras
  // adicionales lo reclasifica como register.
  assert.equal(detectIntent("Si por favor", false), "register");
});

test("detectIntent: 'no' solo es opt_out (comportamiento actual conservado)", () => {
  // El regex OPT_OUT_RE matchea 'no' suelto (contexto negativo explicito
  // para frases mas largas). 'no' sin contexto se trata como opt-out.
  // Esto es consistente con el caso "¿quieres info?" → "no" → bot
  // descarta el flow. Refactor futuro: distinguir 'no' aislado en medio
  // de conversacion (probablemente no como respuesta a pregunta cerrada),
  // pero el comportamiento actual es seguro (sesion 2026-07-07).
  assert.equal(detectIntent("no", false), "opt_out");
});

test("detectIntent: 'no me interesa' → opt_out (contexto explicito)", () => {
  assert.equal(detectIntent("no me interesa", false), "opt_out");
});

test("detectIntent: 'cuanto cuesta?' → question (pregunta abierta)", () => {
  assert.equal(detectIntent("cuanto cuesta?", false), "question");
});

test("detectIntent: primer mensaje 'hola' → welcome", () => {
  assert.equal(detectIntent("hola", true), "welcome");
});

test("detectIntent: 'hola' posterior → greeting", () => {
  assert.equal(detectIntent("hola", false), "greeting");
});

test("detectIntent: 'Quiero inscribirme' → register", () => {
  assert.equal(detectIntent("Quiero inscribirme", true), "register");
});
