/**
 * Tests para la captura universal de nombre humano (FIX 2026-07-09).
 *
 * Cubre:
 *   1. detectUniversalNameCapture reconoce el caso del screenshot
 *      (Mari triana baeza hernandez con currentLeadName="Mari").
 *   2. detectUniversalNameCapture RECHAZA falsos positivos:
 *      - Palabras del dominio Qlick ("Qlik Marketing",
 *        "Marketing Digital", "Marketing IA para Emprendedores").
 *      - Filler words ("Buenos días", "ah ok").
 *      - Placeholder UI ("Asistente", "Por confirmar", "Mari López Asistente").
 *      - Body de 1 palabra ("Juan").
 *      - Preguntas / intenciones ("Cómo me inscribo", "Cuál es el horario").
 *      - Body con email embebido (lo maneja extractNameAndEmailTogether).
 *   3. Safeguard de upgrade: NO captura si el nuevo nombre tiene
 *      IGUAL o MENOS palabras que el actual.
 *   4. Captura cuando el lead no tenía nombre (placeholder o vacío).
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

import { detectUniversalNameCapture } from "../src/lib/whatsapp/bot-engine.ts";

// Tildes con escapes Unicode para evitar mojibake.
const TILDE_TILDE = "\u00f3"; // ó
const I_TILDE = "\u00ed"; // í
const E_TILDE = "\u00e9"; // é
const A_TILDE = "\u00e1"; // á

/* ─────────────────────────────────────────────────────────────
 * Caso real del screenshot David 2026-07-09
 *
 * Mari ya estaba registrada con "Mari" (1 palabra, capturada por
 * FALLBACK heurístico que no validaba wordCount). Después mandó
 * "Mari triana baeza hernandez" — el bot debe capturarlo y
 * guardarlo como upgrade.
 * ───────────────────────────────────────────────────────────── */

test("caso screenshot 2026-07-09: 'Mari triana baeza hernandez' (con currentLeadName='Mari') \u2192 captura", () => {
  const result = detectUniversalNameCapture(
    "Mari triana baeza hernandez",
    { currentLeadName: "Mari" }
  );
  assert.equal(result, "Mari triana baeza hernandez");
});

test("captura universal: lead sin nombre \u2192 captura el nuevo", () => {
  // Visitor llega por primera vez con su nombre completo sin haber
  // pasado por el flow de captura. El handler welcome se encarga del
  // saludo, pero el nombre se guarda.
  const result = detectUniversalNameCapture(
    "Juan P\u00e9rez Garc\u00eda",
    { currentLeadName: null }
  );
  assert.equal(result, "Juan P\u00e9rez Garc\u00eda");
});

test("captura universal: lead con placeholder UI \u2192 captura el nuevo", () => {
  const result = detectUniversalNameCapture(
    "Luc\u00eda Hern\u00e1ndez",
    { currentLeadName: "Por confirmar" }
  );
  assert.equal(result, "Luc\u00eda Hern\u00e1ndez");
});

test("captura universal: upgrade de 2 palabras a 4 \u2192 captura", () => {
  const result = detectUniversalNameCapture(
    "Juan P\u00e9rez Garc\u00eda L\u00f3pez",
    { currentLeadName: "Juan P\u00e9rez" }
  );
  assert.equal(result, "Juan P\u00e9rez Garc\u00eda L\u00f3pez");
});

/* ─────────────────────────────────────────────────────────────
 * Falsos positivos que NO deben capturarse (palabras del dominio)
 * ───────────────────────────────────────────────────────────── */

const DOMAIN_ONLY_CASES = [
  "Qlik Marketing",
  "Marketing Digital",
  `Marketing + IA para Emprendedores`,
  "Marketing Digital Qlick",
  "Curso Marketing",
  "Taller Online",
  `Pr${TILDE_TILDE}ximo Evento`,
  "Masterclass Ventas",
  "Webinar Gratis",
  "Curso Online",
];

for (const body of DOMAIN_ONLY_CASES) {
  test(`NO captura domain-only: "${body}"`, () => {
    // currentLeadName placeholder (vac\u00edo) para que el upgrade
    // check SI aplique si el filtro domain pasara. As\u00ed nos
    // aseguramos que el \u00fanico motivo de rechazo es domain-only.
    const result = detectUniversalNameCapture(body, {
      currentLeadName: null
    });
    assert.equal(
      result,
      null,
      `detectUniversalNameCapture NO deber\u00eda capturar "${body}" (palabras del dominio)`
    );
  });
}

/* ─────────────────────────────────────────────────────────────
 * Falsos positivos que NO deben capturarse (filler / placeholder / pregunta)
 * ───────────────────────────────────────────────────────────── */

const FILLER_PLACEHOLDER_QUESTION_CASES = [
  ["Buenos d\u00edas", "Buenos d\u00edas \u2192 filler"],
  ["ah ok", "ah ok \u2192 filler"],
  ["Asistente", "Asistente \u2192 placeholder UI"],
  ["Por confirmar", "Por confirmar \u2192 placeholder UI"],
  [
    "Asistente L\u00f3pez",
    "Asistente L\u00f3pez \u2192 primera palabra es placeholder UI"
  ],
  [
    "Hola",
    "Hola \u2192 1 palabra, no es nombre v\u00e1lido"
  ],
  [
    "Juan",
    "Juan \u2192 1 palabra, no es nombre v\u00e1lido"
  ],
  [
    "C\u00f3mo me inscribo",
    "C\u00f3mo me inscribo \u2192 pregunta"
  ],
  [
    `Cu\u00e1l es el horario`,
    `Cu\u00e1l es el horario \u2192 pregunta`
  ],
  [
    "Cu\u00e1nto cuesta",
    "Cu\u00e1nto cuesta \u2192 pregunta"
  ],
  [
    "juan@gmail.com",
    "email puro \u2192 lo maneja provide_email"
  ],
  [
    "Juan P\u00e9rez juan@gmail.com",
    "nombre + email embebido \u2192 lo maneja extractNameAndEmailTogether"
  ],
  [
    "juan@gmail.com Juan P\u00e9rez",
    "email + nombre embebido \u2192 lo maneja extractNameAndEmailTogether"
  ],
];

for (const [body, desc] of FILLER_PLACEHOLDER_QUESTION_CASES) {
  test(`NO captura: "${body}" (${desc})`, () => {
    // currentLeadName placeholder (vac\u00edo) para que el upgrade
    // check SI aplique. As\u00ed el rechazo es por el filtro principal,
    // no por el safeguard.
    const result = detectUniversalNameCapture(body, {
      currentLeadName: null
    });
    assert.equal(
      result,
      null,
      `detectUniversalNameCapture NO deber\u00eda capturar "${body}"`
    );
  });
}

/* ─────────────────────────────────────────────────────────────
 * Safeguard de upgrade: NO captura si no hay upgrade real
 * ───────────────────────────────────────────────────────────── */

test("NO captura si nuevo tiene MENOS palabras que el actual", () => {
  // Lead tiene "Juan P\u00e9rez Garc\u00eda" (3 palabras). Visitor
  // manda "Juan P\u00e9rez" (2 palabras). NO es upgrade \u2014 perder\u00edamos
  // info. El visitor probablemente est\u00e1 escribiendo el nombre corto.
  const result = detectUniversalNameCapture("Juan P\u00e9rez", {
    currentLeadName: "Juan P\u00e9rez Garc\u00eda"
  });
  assert.equal(result, null);
});

test("NO captura si nuevo tiene IGUAL n\u00famero de palabras que el actual", () => {
  // Lead tiene "Juan P\u00e9rez" (2 palabras). Visitor manda
  // "David Esparza" (2 palabras). NO es upgrade \u2014 el actual ya
  // es completo. Sobre-escribir ser\u00eda destructivo.
  const result = detectUniversalNameCapture("David Esparza", {
    currentLeadName: "Juan P\u00e9rez"
  });
  assert.equal(result, null);
});

/* ─────────────────────────────────────────────────────────────
 * Edge cases de input inv\u00e1lido
 * ───────────────────────────────────────────────────────────── */

const INVALID_INPUTS = [null, undefined, "", "   ", "\n\n\t"];

for (const body of INVALID_INPUTS) {
  test(`NO captura con body inv\u00e1lido: ${JSON.stringify(body)}`, () => {
    const result = detectUniversalNameCapture(body, {
      currentLeadName: null
    });
    assert.equal(result, null);
  });
}

test("NO captura si body tiene solo d\u00edgitos", () => {
  const result = detectUniversalNameCapture("123 456 789", {
    currentLeadName: null
  });
  assert.equal(result, null);
});

test("NO captura si body es solo emojis", () => {
  const result = detectUniversalNameCapture("\u{1F44D}\u{1F60A}\u{1F389}", {
    currentLeadName: null
  });
  assert.equal(result, null);
});

test("NO captura si body > 100 chars (mismo l\u00edmite que isValidHumanName)", () => {
  const longName = "a".repeat(101);
  const result = detectUniversalNameCapture(longName, {
    currentLeadName: null
  });
  assert.equal(result, null);
});

/* ─────────────────────────────────────────────────────────────
 * Casos v\u00e1lidos adicionales (nombres humanos reales)
 * ───────────────────────────────────────────────────────────── */

const VALID_NAMES = [
  "Mar\u00eda Fern\u00e1ndez",
  `Luc\u00eda Hern\u00e1ndez L\u00f3pez`,
  "Juan P\u00e9rez",
  "Carlos M\u00e9ndez Garc\u00eda",
  `Ana Sof\u00eda Ram\u00edrez`,
  "Pedro S\u00e1nchez",
  "Roberto de la Cruz",
];

for (const name of VALID_NAMES) {
  test(`S\u00cd captura nombre humano v\u00e1lido: "${name}"`, () => {
    // currentLeadName placeholder (1 palabra) para que el upgrade
    // check aplique. Si fuera "Algo Anterior" (2 palabras) el
    // safeguard de upgrade rechazar\u00eda la captura.
    const result = detectUniversalNameCapture(name, {
      currentLeadName: "Por"
    });
    assert.equal(result, name);
  });
}

/* ─────────────────────────────────────────────────────────────
 * currentLeadName es placeholder \u2192 captura (independiente de upgrade)
 * ───────────────────────────────────────────────────────────── */

const PLACEHOLDER_CURRENTS = [
  null,
  undefined,
  "",
  "   ",
  "Por confirmar",
  "asistente",
  "Por",
  "anonimo",
];

for (const currentLeadName of PLACEHOLDER_CURRENTS) {
  test(`S\u00cd captura cuando currentLeadName es placeholder/vac\u00edo: ${JSON.stringify(currentLeadName)}`, () => {
    const result = detectUniversalNameCapture(
      "Luc\u00eda Hern\u00e1ndez L\u00f3pez",
      { currentLeadName }
    );
    assert.equal(result, "Luc\u00eda Hern\u00e1ndez L\u00f3pez");
  });
}