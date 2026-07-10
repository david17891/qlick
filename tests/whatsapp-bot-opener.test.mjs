/**
 * Tests para el safety-net "abridor en lugar de disculpa" (2026-07-09).
 *
 * Cubre:
 *   1. OPENER_RE matchea saludos comunes y variantes en español MX.
 *   2. OPENER_RE NO matchea emails / frases largas / comandos de inscripción.
 *   3. La regla wordCount <= 4 del safety-net: solo disparamos abridor
 *      cuando el body es corto y matchea OPENER_RE.
 *
 * Patrón: `node --test`, sin libs externas.
 *
 * NOTA sobre tildes: usamos escapes Unicode (\u00f3, \u00e9, etc.) en
 * lugar de caracteres literales para evitar problemas de encoding del
 * editor (mojibake en Windows PowerShell ISE).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @ts-check

import { OPENER_RE } from "../src/lib/whatsapp/bot-engine.ts";

// Tildes con escapes Unicode para evitar mojibake.
const TILDE_TILDE = "\u00f3"; // ó
const I_TILDE = "\u00ed"; // í
const E_TILDE = "\u00e9"; // é
const A_TILDE = "\u00e1"; // á
const U_TILDE = "\u00fa"; // ú
const INTERROGACION_INI = "\u00bf"; // ¿

/**
 * Helper: replica la lógica del safety-net en `case "question"` para
 * verificar si el body del lead debe disparar el abridor sin pasar
 * por el LLM. Mismo código que bot-engine.ts.
 */
function shouldTriggerOpenerSafetyNet(body) {
  if (!body) return false;
  const trimmed = body.trim();
  if (!trimmed) return false;
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  if (wordCount === 0 || wordCount > 4) return false;
  return OPENER_RE.test(trimmed);
}

/* ─────────────────────────────────────────────────────────────
 * OPENER_RE: matchea saludos canónicos y variantes MX
 * ───────────────────────────────────────────────────────────── */

const POSITIVE_CASES = [
  "Hola",
  "hola", // lowercase
  "HOLA", // uppercase
  "Hola!",
  "Hola.",
  "Hola,",
  "Hola👋",
  "Hi",
  "Hey",
  "Buenas",
  `Buenas tardes`,
  `Buenas noches`,
  `Buenos d${I_TILDE}as`,
  `Buenas d${I_TILDE}as`,
  `Buenas!`,
  `Qu${E_TILDE} tal`,
  `Qu${E_TILDE} onda`,
  `Qu${E_TILDE} hay`,
  `Al${TILDE_TILDE}`,
  "Hello",
  "Holi",
];

for (const body of POSITIVE_CASES) {
  test(`OPENER_RE matchea: "${body}"`, () => {
    assert.equal(
      OPENER_RE.test(body),
      true,
      `OPENER_RE deber\u00eda matchear "${body}"`,
    );
  });
}

/* ─────────────────────────────────────────────────────────────
 * OPENER_RE: matchea openers de inicio (no saludos estrictos)
 * ───────────────────────────────────────────────────────────── */

const STARTER_CASES = [
  "Info",
  "Info!",
  `Informaci${TILDE_TILDE}n`,
  `Men${U_TILDE}`,
  "Menu",
  "Interesado",
  "Interesada",
  "Empezar",
  "Empezamos",
  "Inicio",
  "Comenzar",
  `C${TILDE_TILDE}mo est${A_TILDE}s`,
  `C${TILDE_TILDE}mo andas`,
  `Qu${E_TILDE} tienen`,
  `Qu${E_TILDE} ofrecen`,
];

for (const body of STARTER_CASES) {
  test(`OPENER_RE matchea starter: "${body}"`, () => {
    assert.equal(
      OPENER_RE.test(body),
      true,
      `OPENER_RE deber\u00eda matchear "${body}"`,
    );
  });
}

/* ─────────────────────────────────────────────────────────────
 * OPENER_RE: NO matchea contenido que NO es opener
 * ───────────────────────────────────────────────────────────── */

const NEGATIVE_CASES = [
  "Quiero inscribirme al evento",
  `Cu\u00e1l es el horario`,
  `Cu\u00e1nto cuesta`,
  "Mi email es juan@gmail.com",
  "juan@gmail.com",
  "Si",
  "Ok",
  "No",
  "Tengo una pregunta sobre el temario",
  "Me interesa",
  "Baja",
  "Stop",
  "Cancelar",
  "Registrame",
  "Ap\u00fantame",
];

for (const body of NEGATIVE_CASES) {
  test(`OPENER_RE NO matchea: "${body}"`, () => {
    assert.equal(
      OPENER_RE.test(body),
      false,
      `OPENER_RE NO deber\u00eda matchear "${body}"`,
    );
  });
}

/* ─────────────────────────────────────────────────────────────
 * Safety-net: wordCount <= 4 + matchea OPENER_RE → disparar
 * ───────────────────────────────────────────────────────────── */

const SAFETY_NET_TRIGGER = [
  "Hola",
  "Hey", // 1 palabra
  `Buenas tardes`, // 2 palabras
  `Qu${E_TILDE} onda Qlick`, // 3 palabras
  `Hola buen d${I_TILDE}a`, // 3 palabras
  "Info evento", // 2 palabras
];

for (const body of SAFETY_NET_TRIGGER) {
  test(`safety-net dispara: "${body}"`, () => {
    assert.equal(
      shouldTriggerOpenerSafetyNet(body),
      true,
      `safety-net deber\u00eda disparar para "${body}"`,
    );
  });
}

/* ─────────────────────────────────────────────────────────────
 * Safety-net: NO dispara cuando wordCount > 4
 * ───────────────────────────────────────────────────────────── */

const SAFETY_NET_SKIP = [
  "Hola buen día cómo estás hoy", // 6 palabras
  `Qu\u00e9 tal c\u00f3mo est\u00e1s hermano`, // 5 palabras
  "Hey buenas tardes mi nombre es David", // 8 palabras
];

for (const body of SAFETY_NET_SKIP) {
  test(`safety-net NO dispara (demasiadas palabras): "${body}"`, () => {
    assert.equal(
      shouldTriggerOpenerSafetyNet(body),
      false,
      `safety-net NO deber\u00eda disparar para "${body}"`,
    );
  });
}

/* ─────────────────────────────────────────────────────────────
 * Safety-net: NO dispara con body vacío o null
 * ───────────────────────────────────────────────────────────── */

const SAFETY_NET_BODY_NULL = [null, undefined, "", "   ", "\n\n\t"];

for (const body of SAFETY_NET_BODY_NULL) {
  test(`safety-net NO dispara con body inválido: ${JSON.stringify(body)}`, () => {
    assert.equal(
      shouldTriggerOpenerSafetyNet(body),
      false,
    );
  });
}

/* ─────────────────────────────────────────────────────────────
 * Caso real del bug David: "Hola" como segundo inbound
 * (después del botón "Info evento") debe disparar abridor.
 * ───────────────────────────────────────────────────────────── */

test("caso real David 2026-07-09: 'Hola' como segundo inbound → abridor", () => {
  const result = shouldTriggerOpenerSafetyNet("Hola");
  assert.equal(result, true);
});

test("caso real David 2026-07-09: 'Hey' como segundo inbound → abridor", () => {
  const result = shouldTriggerOpenerSafetyNet("Hey");
  assert.equal(result, true);
});

test("caso real David 2026-07-09: 'Buenas' como segundo inbound → abridor", () => {
  const result = shouldTriggerOpenerSafetyNet("Buenas");
  assert.equal(result, true);
});
