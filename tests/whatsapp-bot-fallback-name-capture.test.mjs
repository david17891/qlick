/**
 * Tests del fix "FALLBACK provide_name captura frases-de-cortesia como
 * nombre" (sesion David 2026-07-10).
 *
 * Cubre el bug que vio David: el bot respondia "¡Hola Quiero!" o
 * "¡Hola !hola!" porque el FALLBACK heuristico del bot-engine dejaba
 * pasar frases como "Quiero registrarme" o "!hola! david" como si
 * fueran nombres. La fix es defensa en profundidad (3 capas):
 *
 *   1. `hasIntentVerb` (nuevo): gate de seguridad en el FALLBACK y
 *      en la tool del LLM. Rechaza verbos de inscripcion/intencion.
 *   2. `hasGarbledStart` (nuevo): gate contra simbolos al inicio
 *      (cubre el caso "!hola! david" del screenshot 2).
 *   3. `isValidHumanName` v2: limpieza de puntuacion ampliada
 *      ([.,!?;:]) y check de placeholder por palabra (no solo el
 *      nombre completo). Ademas, ahora se llama tambien en el
 *      guardado (linea 4875 de bot-engine.ts) como red de seguridad.
 *
 * Cobertura:
 *   - BUG reportados por David (4)
 *   - Intencion comun (14)
 *   - Garbled (4)
 *   - Nombres validos (10)
 *   - Edge pre-existentes (5)
 *
 * Patrón: `node --test`, sin libs externas. NO usa path aliases
 * (import relativo) — el resolver de node strip-types NO entiende
 * tsconfig paths y cualquier import @/lib/... falla con
 * ERR_MODULE_NOT_FOUND. Ver memoria 2026-07-09.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @ts-check

// Imports del codigo fuente (via type-stripping de Node).
// NOTA: imports relativos solamente. NO usar @/lib/... (ver header).
import {
  hasIntentVerb,
  hasGarbledStart,
  isValidHumanName,
  matchInscriptionIntent
} from "../src/lib/whatsapp/bot-engine.ts";

/* ─────────────────────────────────────────────────────────────
 * 1. hasIntentVerb: cubre los 4 BUGs + intenciones comunes
 * ───────────────────────────────────────────────────────────── */

// === BUGs reportados por David (screenshots) ===
test("hasIntentVerb('Quiero registrarme') → true (BUG screenshot 1)", () => {
  assert.equal(hasIntentVerb("Quiero registrarme"), true);
});

test("hasIntentVerb('Quiero Registrarme') → true (BUG screenshot 1 mayus)", () => {
  assert.equal(hasIntentVerb("Quiero Registrarme"), true);
});

test("hasIntentVerb('me interesa el evento') → true (intencion comun)", () => {
  assert.equal(hasIntentVerb("me interesa el evento"), true);
});

test("hasIntentVerb('inscribirme al evento') → true", () => {
  assert.equal(hasIntentVerb("inscribirme al evento"), true);
});

test("hasIntentVerb('apartar mi lugar') → true", () => {
  assert.equal(hasIntentVerb("apartar mi lugar"), true);
});

test("hasIntentVerb('dame mi lugar') → true", () => {
  assert.equal(hasIntentVerb("dame mi lugar"), true);
});

test("hasIntentVerb('necesito inscribirme') → true", () => {
  assert.equal(hasIntentVerb("necesito inscribirme"), true);
});

test("hasIntentVerb('Si quiero inscribirme') → true (afirmativo+verbo)", () => {
  assert.equal(hasIntentVerb("Si quiero inscribirme"), true);
});

test("hasIntentVerb('gustaria saber mas') → true", () => {
  assert.equal(hasIntentVerb("gustaria saber mas"), true);
});

test("hasIntentVerb('pedir informacion') → true", () => {
  assert.equal(hasIntentVerb("pedir informacion"), true);
});

test("hasIntentVerb('hablar con alguien') → true", () => {
  assert.equal(hasIntentVerb("hablar con alguien"), true);
});

test("hasIntentVerb('solicito informacion') → true", () => {
  assert.equal(hasIntentVerb("solicito informacion"), true);
});

test("hasIntentVerb('registrame') → true (solo verbo)", () => {
  assert.equal(hasIntentVerb("registrame"), true);
});

test("hasIntentVerb('inscribime') → true (solo verbo)", () => {
  assert.equal(hasIntentVerb("inscribime"), true);
});

test("hasIntentVerb('apuntame') → true (solo verbo)", () => {
  assert.equal(hasIntentVerb("apuntame"), true);
});

test("hasIntentVerb('anotame') → true (solo verbo)", () => {
  assert.equal(hasIntentVerb("anotame"), true);
});

// === Nombres validos: NO deben matchear INTENT_VERBS ===
test("hasIntentVerb('David Martinez') → false (nombre valido)", () => {
  assert.equal(hasIntentVerb("David Martinez"), false);
});

test("hasIntentVerb('Lucia Quiero') → false (apellido Quiero - no regresion)", () => {
  // "Quiero" no esta en INTENT_VERBS (es nombre valido). El system
  // prompt del LLM cubre ese caso edge.
  assert.equal(hasIntentVerb("Lucia Quiero"), false);
});

test("hasIntentVerb('Maria Aparta') → false (Aparta NO esta en INTENT_VERBS, nombre valido)", () => {
  // FIX: "Aparta" no es "apartar" (infinitivo). El set incluye el
  // infinitivo "apartar" pero NO la conjugacion "aparta". Asi, "Maria
  // Aparta" como nombre es valido (no es regresion).
  assert.equal(hasIntentVerb("Maria Aparta"), false);
});

test("hasIntentVerb('Maria Apartar') → true (regresion aceptada, apellido Apartar)", () => {
  // TRADE-OFF ACEPTADO: "Apartar" (infinitivo) SI esta en INTENT_VERBS.
  // Como apellido es muy raro en Mexico pero posible. La alternativa
  // (no incluir "apartar" en INTENT_VERBS) romperia el caso real
  // "apartar mi lugar".
  assert.equal(hasIntentVerb("Maria Apartar"), true);
});

test("hasIntentVerb('Roberto Necesito') → true (apellido Necesito - regresion aceptada)", () => {
  // "Necesito" esta en INTENT_VERBS. trade-off documentado.
  assert.equal(hasIntentVerb("Roberto Necesito"), true);
});

test("hasIntentVerb('hola') → false (no es verbo de intencion)", () => {
  assert.equal(hasIntentVerb("hola"), false);
});

test("hasIntentVerb('') → false", () => {
  assert.equal(hasIntentVerb(""), false);
});

test("hasIntentVerb(null) → false", () => {
  assert.equal(hasIntentVerb(null), false);
});

/* ─────────────────────────────────────────────────────────────
 * 2. hasGarbledStart: cubre el caso "!hola!" del screenshot 2
 * ───────────────────────────────────────────────────────────── */

test("hasGarbledStart('!hola!') → true (BUG screenshot 2 - simbolo al inicio)", () => {
  assert.equal(hasGarbledStart("!hola!"), true);
});

test("hasGarbledStart('!hola! !hola!') → true", () => {
  assert.equal(hasGarbledStart("!hola! !hola!"), true);
});

test("hasGarbledStart('!hola! david') → true (BUG variante)", () => {
  assert.equal(hasGarbledStart("!hola! david"), true);
});

test("hasGarbledStart('1juan') → true (digito al inicio)", () => {
  assert.equal(hasGarbledStart("1juan"), true);
});

test("hasGarbledStart('?que') → true (interrogacion al inicio)", () => {
  assert.equal(hasGarbledStart("?que"), true);
});

test("hasGarbledStart('.david') → true (punto al inicio)", () => {
  assert.equal(hasGarbledStart(".david"), true);
});

test("hasGarbledStart('_david') → true (underscore al inicio)", () => {
  assert.equal(hasGarbledStart("_david"), true);
});

test("hasGarbledStart('David Martinez') → false (nombre valido)", () => {
  assert.equal(hasGarbledStart("David Martinez"), false);
});

test("hasGarbledStart('María José') → false (acentos validos)", () => {
  assert.equal(hasGarbledStart("María José"), false);
});

test("hasGarbledStart('') → false", () => {
  assert.equal(hasGarbledStart(""), false);
});

test("hasGarbledStart(null) → false", () => {
  assert.equal(hasGarbledStart(null), false);
});

/* ─────────────────────────────────────────────────────────────
 * 3. isValidHumanName v2: limpieza ampliada + check por palabra
 * ───────────────────────────────────────────────────────────── */

test("isValidHumanName('Asistente Lopez') → false (FIX: placeholder por palabra)", () => {
  // Antes: pasaba como nombre y saludo era "¡Hola Asistente!".
  // Ahora: rechaza porque "asistente" es placeholder UI.
  assert.equal(isValidHumanName("Asistente Lopez"), false);
});

test("isValidHumanName('hola, hola!') → false (FIX: limpieza ampliada)", () => {
  // Antes: "hola," no se limpiaba por coma → isValidHumanName=true.
  // Ahora: limpieza [.,!?;:] captura coma → "hola" sí es filler.
  assert.equal(isValidHumanName("hola, hola!"), false);
});

test("isValidHumanName('hola, hola!') → false (FIX: limpieza ampliada cubre coma y signo)", () => {
  // FIX v2: limpieza [.,!?;:] cubre coma, admiración, etc. "hola"
  // y "hola" son filler → allFiller=true → return false.
  assert.equal(isValidHumanName("hola, hola!"), false);
});

test("isValidHumanName('hola; hola:') → false (FIX: punto y coma y dos puntos)", () => {
  // FIX v2: limpieza [.,!?;:] cubre punto y coma y dos puntos.
  assert.equal(isValidHumanName("hola; hola:"), false);
});

test("isValidHumanName('David Martinez') → true (caso comun)", () => {
  assert.equal(isValidHumanName("David Martinez"), true);
});

test("isValidHumanName('María José López') → true (acentos)", () => {
  assert.equal(isValidHumanName("María José López"), true);
});

test("isValidHumanName('José-Luis Núñez') → true (guion)", () => {
  assert.equal(isValidHumanName("José-Luis Núñez"), true);
});

test("isValidHumanName('Por confirmar') → false (placeholder canonico)", () => {
  assert.equal(isValidHumanName("Por confirmar"), false);
});

test("isValidHumanName('Asistente') → false (placeholder UI)", () => {
  assert.equal(isValidHumanName("Asistente"), false);
});

test("isValidHumanName('david@x.com') → false (email, no letras puras)", () => {
  assert.equal(isValidHumanName("david@x.com"), false);
});

test("isValidHumanName('David') → false (1 palabra)", () => {
  assert.equal(isValidHumanName("David"), false);
});

/* ─────────────────────────────────────────────────────────────
 * 4. Regresion: matchInscriptionIntent sigue funcionando
 * ───────────────────────────────────────────────────────────── */

test("matchInscriptionIntent('Si') → true (caso base)", () => {
  assert.equal(matchInscriptionIntent("Si"), true);
});

test("matchInscriptionIntent('quiero inscribirme') → true", () => {
  assert.equal(matchInscriptionIntent("quiero inscribirme"), true);
});

test("matchInscriptionIntent('David Martinez') → false (no es intencion)", () => {
  // No rompemos la captura de nombre valido.
  assert.equal(matchInscriptionIntent("David Martinez"), false);
});
