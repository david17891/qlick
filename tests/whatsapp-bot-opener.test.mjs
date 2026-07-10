/**
 * Tests para el safety-net "abridor en lugar de disculpa" (2026-07-09)
 * y para el mapeo label→intent en detectIntent (regresión 2026-07-09).
 *
 * Cubre:
 *   1. OPENER_RE matchea saludos comunes y variantes en español MX,
 *      incluyendo frases naturales con tokens extra ("Hola buen día",
 *      "Qué onda Qlick") y emojis ("Hola👋").
 *   2. OPENER_RE NO matchea labels de botones que el propio bot envía
 *      (regresión 2026-07-09: "Info evento" ya NO dispara el abridor).
 *   3. OPENER_RE NO matchea emails / frases largas / intenciones de
 *      inscripción / palabras que NO son saludos puros.
 *   4. La regla wordCount <= 4 del safety-net: solo disparamos abridor
 *      cuando el body es corto y matchea OPENER_RE.
 *   5. detectIntent mapea labels exactos de botón ("Info evento",
 *      "Próximos eventos", "Inscribirme", "Sí, inscribirme", "No,
 *      gracias") al intent interactivo correspondiente. Caso de uso:
 *      WhatsApp entrega el label como texto plano cuando la sesión
 *      de 24h venció o el visitor escribió el texto manual.
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

import { OPENER_RE, detectIntent } from "../src/lib/whatsapp/bot-engine.ts";

// Tildes con escapes Unicode para evitar mojibake.
const TILDE_TILDE = "\u00f3"; // ó
const I_TILDE = "\u00ed"; // í
const E_TILDE = "\u00e9"; // é
const A_TILDE = "\u00e1"; // á
const U_TILDE = "\u00fa"; // ú

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
  "Hola👋", // emoji al final (FIX 2026-07-09 regresión)
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
  // Frases naturales con tokens extra (saludos compuestos)
  `Hola buen d${I_TILDE}a`, // "Hola buen día" — 3 palabras
  `Qu${E_TILDE} onda Qlick`, // "Qué onda Qlick" — 3 palabras
  `Buenas tardes amigos`, // 3 palabras
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
 * OPENER_RE: NO matchea labels de botones que el propio bot envía
 * (regresión 2026-07-09: el safety-net NO debe disparar el
 * abridor cuando el inbound es un label que llegó como texto
 * plano por sesión 24h vencida o visitor manual).
 * ───────────────────────────────────────────────────────────── */

const BUTTON_LABELS = [
  "Info evento",
  `Pr${TILDE_TILDE}ximos eventos`,
  "Proximos eventos", // sin tilde (visitor lo pudo escribir así)
  "Inscribirme",
  `S${I_TILDE}, inscribirme`,
  "No, gracias",
  "Me interesa",
  "Eventos publicados",
];

for (const body of BUTTON_LABELS) {
  test(`OPENER_RE NO matchea label de bot\u00f3n: "${body}"`, () => {
    assert.equal(
      OPENER_RE.test(body),
      false,
      `OPENER_RE NO deber\u00eda matchear el label "${body}" (regresi\u00f3n 2026-07-09)`,
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
  // Palabras que estaban en la versión vieja del regex y se quitaron
  // en el fix de regresión (no son openers — son labels o intenciones).
  "Info",
  "Menu",
  `Men${U_TILDE}`,
  `Informaci${TILDE_TILDE}n`,
  "Interesado",
  "Interesada",
  "Empezar",
  "Empezamos",
  "Inicio",
  "Comenzar",
  `Qu${E_TILDE} tienen`,
  `Qu${E_TILDE} ofrecen`,
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
 * REGRESIÓN 2026-07-09 (screenshot David): el safety-net NO debe
 * disparar el abridor cuando el inbound es un label de botón que
 * llegó como texto plano. Caso: "Info evento" después de que el
 * bot envió el abridor con botones "Info evento" / "Próximos
 * eventos".
 * ───────────────────────────────────────────────────────────── */

test("safety-net NO dispara para label de bot\u00f3n 'Info evento'", () => {
  assert.equal(shouldTriggerOpenerSafetyNet("Info evento"), false);
});

test("safety-net NO dispara para label de bot\u00f3n 'Pr\u00f3ximos eventos'", () => {
  assert.equal(shouldTriggerOpenerSafetyNet("Pr\u00f3ximos eventos"), false);
});

/* ─────────────────────────────────────────────────────────────
 * Caso real del bug David (original 2026-07-09): "Hola" como
 * segundo inbound debe disparar abridor.
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

/* ─────────────────────────────────────────────────────────────
 * detectIntent: mapeo label→intent (regresión 2026-07-09)
 *
 * Cuando el visitor escribe como texto plano el label de un botón
 * que el bot le envió (típico: sesión WhatsApp de 24h vencida, o
 * el visitor tipeó el texto en vez de presionar el botón), el
 * flow debe reconocer el label y procesarlo como el buttonId
 * correspondiente, NO como pregunta abierta.
 * ───────────────────────────────────────────────────────────── */

test("detectIntent: 'Info evento' → interactive_event_yes", () => {
  // Caso exacto del screenshot de David.
  assert.equal(detectIntent("Info evento", false), "interactive_event_yes");
});

test("detectIntent: 'Pr\u00f3ximos eventos' → interactive_show_events", () => {
  assert.equal(detectIntent("Pr\u00f3ximos eventos", false), "interactive_show_events");
});

test("detectIntent: 'Proximos eventos' (sin tilde) → interactive_show_events", () => {
  // Visitor pudo escribir sin tilde por autocorrect del teclado.
  assert.equal(detectIntent("Proximos eventos", false), "interactive_show_events");
});

test("detectIntent: 'Inscribirme' → interactive_event_inscribir", () => {
  assert.equal(detectIntent("Inscribirme", false), "interactive_event_inscribir");
});

test("detectIntent: 'No, gracias' → opt_out", () => {
  assert.equal(detectIntent("No, gracias", false), "opt_out");
});

test("detectIntent: 'Hola' (segundo inbound) → greeting", () => {
  // El caso original sigue funcionando: saludo como segundo inbound
  // sigue yendo a greeting (que dispara el abridor).
  assert.equal(detectIntent("Hola", false), "greeting");
});

test("detectIntent: 'Hola' (primer mensaje) → welcome", () => {
  assert.equal(detectIntent("Hola", true), "welcome");
});

test("detectIntent: 'Qu\u00e9 onda Qlick' (segundo inbound) → question", () => {
  // GREETING_RE solo matchea "qué onda" exacto, no "qué onda Qlick".
  // detectIntent lo manda a "question", pero el safety-net interno de
  // case "question" (OPENER_RE) SÍ lo reconoce como opener y dispara
  // el abridor sin pasar por el LLM. Ver test
  // `safety-net dispara: "Qué onda Qlick"`.
  assert.equal(detectIntent("Qu\u00e9 onda Qlick", false), "question");
});

test("detectIntent: 'Qu\u00e9 onda Qlick' igual dispara abridor v\u00eda safety-net", () => {
  // Aunque detectIntent devuelve "question", el safety-net dentro de
  // case "question" lo intercepta antes del LLM (OPENER_RE matchea).
  assert.equal(shouldTriggerOpenerSafetyNet("Qu\u00e9 onda Qlick"), true);
});

test("detectIntent: 'juan@gmail.com' → provide_email", () => {
  // El regex de email sigue ganando sobre cualquier otra heurística.
  assert.equal(detectIntent("juan@gmail.com", false), "provide_email");
});