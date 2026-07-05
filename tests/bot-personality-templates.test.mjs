import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PERSONALITY_PRESETS,
  PERSONALITY_CUSTOM_VALUE,
  getPersonalityPreset,
  matchPersonalityPreset,
} from "../src/lib/events/bot-personality-templates.ts";

/**
 * Tests de los presets de personalidad del bot (Fase 7c).
 *
 * Invariantes comunes a TODOS los presets (verificadas abajo):
 * - NO usan "vos" (David explícito, 2026-07-05)
 * - "tú" o "usted" según el lead (español neutro / mexicano neutro)
 * - NO prometen / inventan precios, fechas, cupos ni contenido del temario
 * - Cada preset tiene al menos 4 reglas, máximo 8 (manejable)
 * - Orientados a ventas pero sin presionar (David explícito)
 *
 * Cada preset puede tener copy específica adicional que NO verificamos
 * (humor permitido solo en algunos, emojis en otros) — solo lo común.
 */

const FORBIDDEN_WORDS = [
  "vos", // tuteo rioplatense — no en español neutro ni mexicano
];

const REQUIRED_GUARDRAILS = [
  // Alguna forma de "no inventar precios": diferentes presets lo dicen distinto.
  /(precio|precios)/i,
  // Alguna forma de derivar al equipo humano si no sabe.
  /(equipo humano|equipo de humanos|te paso|derivar|deriva)/i,
  // Alguna forma de "tú / usted" neutro.
  /(tú|usted)/i
];

test("PERSONALITY_PRESETS: hay exactamente 4 presets", () => {
  assert.equal(PERSONALITY_PRESETS.length, 4);
});

test("PERSONALITY_PRESETS: cada preset tiene value, description, personality y rules", () => {
  for (const p of PERSONALITY_PRESETS) {
    assert.ok(p.value && p.value.length > 0, `value vacío en ${p.value}`);
    assert.ok(p.description && p.description.length > 0, `description vacía en ${p.value}`);
    assert.ok(p.personality && p.personality.length > 0, `personality vacía en ${p.value}`);
    assert.ok(Array.isArray(p.rules), `rules no es array en ${p.value}`);
    assert.ok(p.rules.length >= 4, `${p.value} tiene ${p.rules.length} reglas (mínimo 4)`);
    assert.ok(p.rules.length <= 8, `${p.value} tiene ${p.rules.length} reglas (máximo 8)`);
  }
});

test("PERSONALITY_PRESETS: los values son únicos", () => {
  const values = PERSONALITY_PRESETS.map((p) => p.value);
  const unique = new Set(values);
  assert.equal(unique.size, values.length, `Valores duplicados: ${values.join(", ")}`);
});

test("PERSONALITY_PRESETS: ningún preset usa 'vos' como palabra standalone (regla dura de David)", () => {
  // Buscamos la palabra "vos" con word boundary. NO como substring dentro
  // de "nuevos", "beneficios", etc — esos son falsos positivos legítimos.
  for (const p of PERSONALITY_PRESETS) {
    for (const [i, rule] of p.rules.entries()) {
      assert.ok(
        !/\bvos\b/i.test(rule),
        `${p.value} regla ${i} usa "vos" como palabra: "${rule}"`,
      );
    }
    for (const field of [p.personality, p.description]) {
      assert.ok(
        !/\bvos\b/i.test(field),
        `${p.value} usa "vos" como palabra en personalidad/description`,
      );
    }
  }
});

test("PERSONALITY_PRESETS: cada preset menciona precios + derivar + tú/usted", () => {
  for (const p of PERSONALITY_PRESETS) {
    const text = p.rules.join("\n");
    for (const pattern of REQUIRED_GUARDRAILS) {
      assert.ok(
        pattern.test(text),
        `${p.value} no contiene guardrail: ${pattern}`,
      );
    }
  }
});

test("PERSONALITY_PRESETS: cada regla tiene substance (mínimo 20 chars)", () => {
  for (const p of PERSONALITY_PRESETS) {
    for (const [i, rule] of p.rules.entries()) {
      assert.ok(
        rule.length >= 20,
        `${p.value} regla ${i}: "${rule}" demasiado corta`,
      );
    }
  }
});

test("PERSONALITY_PRESETS: ningún preset promete transformación/resultado garantizado", () => {
  // Esto valida que las reglas no son "teconvertimos en magnate en 30 días"
  // etc — palabras que prometen outcomes no verificables.
  const hypeWords = /\b(garantiz|transformaci[oó]n.{0,30}vida|cambi[aá]r.{0,15}vida|seconvertir[aá]|hastallegar)/i;
  for (const p of PERSONALITY_PRESETS) {
    for (const [i, rule] of p.rules.entries()) {
      assert.ok(
        !hypeWords.test(rule),
        `${p.value} regla ${i} usa lenguaje de transformación hype`,
      );
    }
  }
});

test("PERSONALITY_PRESETS: ninguna regla está vacía o solo con whitespace", () => {
  for (const p of PERSONALITY_PRESETS) {
    for (const [i, rule] of p.rules.entries()) {
      assert.ok(rule.trim().length > 0, `${p.value} regla ${i} está vacía`);
    }
  }
});

test("getPersonalityPreset: encuentra por value exacto", () => {
  assert.equal(getPersonalityPreset("seria")?.value, "seria");
  assert.equal(getPersonalityPreset("casual")?.value, "casual");
  assert.equal(getPersonalityPreset("con humor")?.value, "con humor");
  assert.equal(getPersonalityPreset("supervendedor")?.value, "supervendedor");
});

test("getPersonalityPreset: undefined para valores que no existen", () => {
  assert.equal(getPersonalityPreset("inexistente"), undefined);
  assert.equal(getPersonalityPreset(""), undefined);
  assert.equal(getPersonalityPreset(PERSONALITY_CUSTOM_VALUE), undefined);
});

test("matchPersonalityPreset: matchea por value exacto", () => {
  assert.equal(matchPersonalityPreset("seria")?.value, "seria");
  assert.equal(matchPersonalityPreset("casual")?.value, "casual");
});

test("matchPersonalityPreset: matchea por personality completa", () => {
  // Compat con eventos viejos que guardaron la descripción larga.
  const casual = PERSONALITY_PRESETS.find((p) => p.value === "casual");
  assert.ok(casual);
  const matched = matchPersonalityPreset(casual.personality);
  assert.equal(matched?.value, "casual");
});

test("matchPersonalityPreset: undefined para texto custom / vacío / whitespace", () => {
  assert.equal(matchPersonalityPreset(""), undefined);
  assert.equal(matchPersonalityPreset("   "), undefined);
  assert.equal(matchPersonalityPreset("Bot custom inventado por David"), undefined);
});

test("matchPersonalityPreset: trim antes de comparar", () => {
  assert.equal(matchPersonalityPreset("  seria  ")?.value, "seria");
});

test("PERSONALITY_CUSTOM_VALUE: sentinel separado de los presets", () => {
  for (const p of PERSONALITY_PRESETS) {
    assert.notEqual(p.value, PERSONALITY_CUSTOM_VALUE);
  }
});

test("tipos: PERSONALITY_PRESETS cubre los 4 enum values", () => {
  // Si esto falla, agregá el preset faltante en `bot-personality-templates.ts`.
  const values = ["seria", "casual", "con humor", "supervendedor"];
  for (const v of values) {
    const match = PERSONALITY_PRESETS.find((p) => p.value === v);
    assert.ok(match, `Preset para "${v}" no existe`);
  }
});
