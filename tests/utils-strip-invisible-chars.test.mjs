/**
 * Tests de `stripInvisibleChars` (src/lib/utils.ts).
 *
 * Sprint v0.10 Bloque 1: el audit PR #10 sección 7.2 detectó que un
 * `leads.name` con ZWSP/ZWNJ/ZWJ/BOM/word-joiner persistía el char
 * invisible literal. Este helper los elimina en el entry point +
 * createSyntheticLead, y este test verifica que cubre los 5 chars
 * correctamente + edge cases (null, empty, solo invisibles, mixto).
 *
 * Patrón: node --test, sin libs externas. Importa el .ts via path
 * absoluto (no usa @/ alias → safe con --experimental-strip-types).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const UTILS_URL = pathToFileURL(
  path.join(ROOT, "src/lib/utils.ts")
).href;

const { stripInvisibleChars } = await import(UTILS_URL);

test("Z1: elimina ZWSP (U+200B) simple", () => {
  const input = "Robert\u200BSmith";
  const out = stripInvisibleChars(input);
  assert.equal(out, "RobertSmith");
  assert.equal(out.length, 11);
});

test("Z2: elimina ZWSP doble (caso audit 7.2)", () => {
  // Caso exacto del audit adversarial PR #10 sección 7.2:
  // `Robert\u200B\u200BSmith` → `RobertSmith`
  const input = "Robert\u200B\u200BSmith";
  const out = stripInvisibleChars(input);
  assert.equal(out, "RobertSmith");
  assert.equal(out.length, 11);
});

test("Z3: elimina ZWSP + ZWNJ + ZWJ + BOM + word joiner en un solo string", () => {
  // Todos los 5 invisibles que el helper cubre.
  const input = "A\u200BB\u200CC\u200DD\uFEFFE\u2060F";
  const out = stripInvisibleChars(input);
  assert.equal(out, "ABCDEF");
});

test("Z4: solo invisibles → string vacío", () => {
  const input = "\u200B\u200C\u200D\uFEFF\u2060";
  const out = stripInvisibleChars(input);
  assert.equal(out, "");
  assert.equal(out.length, 0);
});

test("Z5: input null → string vacío", () => {
  assert.equal(stripInvisibleChars(null), "");
});

test("Z6: input undefined → string vacío", () => {
  assert.equal(stripInvisibleChars(undefined), "");
});

test("Z7: input vacío → string vacío", () => {
  assert.equal(stripInvisibleChars(""), "");
});

test("Z8: sin invisibles → devuelve input idéntico", () => {
  const input = "María López García";
  const out = stripInvisibleChars(input);
  assert.equal(out, input);
  // Sanity: no muta.
  assert.equal(input, "María López García");
});

test("Z9: invisibles en medio de palabras (ataque bypass 'John\\u200B Doe')", () => {
  // Caso de uso: "John\u200BDoe" podría pasar check de "2+ words" mal
  // implementado que solo verifica length. El helper lo colapsa a
  // "JohnDoe" (1 sola palabra) para que la validación sea correcta.
  const input = "John\u200BDoe";
  const out = stripInvisibleChars(input);
  assert.equal(out, "JohnDoe");
  assert.equal(out.split(/\s+/).filter(Boolean).length, 1);
});

test("Z10: NO elimina espacios normales (solo los 5 invisibles del spec)", () => {
  // El spec del helper es SOLO invisibles. Espacios y otros whitespace
  // visibles NO se tocan — eso es responsabilidad del caller (.trim(), etc).
  const input = "  Juan  Pérez  ";
  const out = stripInvisibleChars(input);
  assert.equal(out, "  Juan  Pérez  ");
});

test("Z11: NO elimina otros Unicode (em-dash, ñ, emojis)", () => {
  // Sanity: el helper tiene whitelist de 5 chars invisibles específicos.
  // Otros Unicode (em-dash, tildes, emojis) NO se tocan.
  const input = "José María — Pérez 🚀";
  const out = stripInvisibleChars(input);
  assert.equal(out, input);
});

test("Z12: caso de uso real — '[MASTERCLASS] María López'", () => {
  // El caso que David mencionó en el Bloque 3 (parsing de nombres).
  // Si el name viene con prefijos de origen, NO son invisibles Unicode
  // (los [] son chars visibles), así que stripInvisibleChars NO los
  // toca. Eso es correcto: el helper solo limpia invisibles.
  const input = "[MASTERCLASS] María López";
  const out = stripInvisibleChars(input);
  assert.equal(out, "[MASTERCLASS] María López");
});
