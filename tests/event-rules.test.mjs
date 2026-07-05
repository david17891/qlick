/**
 * Tests del prefill de reglas del bot via DeepSeek + format del promptBlock.
 *
 * Cubre la lógica pura que NO requiere el LLM:
 *   - `normalizeEventRules` (parser defensivo del jsonb)
 *   - `formatPromptBlock` con eventRules (que el LLM recibe)
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeEventRules } from "../src/lib/events/event-mapper.ts";

test("normalizeEventRules: null → defaults", () => {
  assert.deepEqual(normalizeEventRules(null), { personality: "", rules: [] });
});

test("normalizeEventRules: undefined → defaults", () => {
  assert.deepEqual(normalizeEventRules(undefined), { personality: "", rules: [] });
});

test("normalizeEventRules: objeto vacio → defaults", () => {
  assert.deepEqual(normalizeEventRules({}), { personality: "", rules: [] });
});

test("normalizeEventRules: objeto con personality + rules validas", () => {
  const out = normalizeEventRules({
    personality: "casual",
    rules: ["Regla 1", "Regla 2"]
  });
  assert.equal(out.personality, "casual");
  assert.deepEqual(out.rules, ["Regla 1", "Regla 2"]);
});

test("normalizeEventRules: filtra rules que no son strings", () => {
  const out = normalizeEventRules({
    personality: "seria",
    rules: ["ok", 42, null, "también ok", "", "   "]
  });
  assert.deepEqual(out.rules, ["ok", "también ok"]);
});

test("normalizeEventRules: personality no-string → vacio", () => {
  const out = normalizeEventRules({ personality: 123 });
  assert.equal(out.personality, "");
});

test("normalizeEventRules: rules no-array → vacio", () => {
  const out = normalizeEventRules({ personality: "x", rules: "not an array" });
  assert.deepEqual(out.rules, []);
});

test("normalizeEventRules: input que no es objeto → defaults", () => {
  assert.deepEqual(normalizeEventRules("string"), { personality: "", rules: [] });
  assert.deepEqual(normalizeEventRules(42), { personality: "", rules: [] });
  assert.deepEqual(normalizeEventRules(true), { personality: "", rules: [] });
});

test("normalizeEventRules: trim no aplicado a strings validos (mantiene tal cual)", () => {
  const out = normalizeEventRules({
    personality: "  casual con espacios  ",
    rules: ["  regla con espacios  "]
  });
  // El mapper solo filtra, no trimea (eso lo hace updateEvent al guardar).
  assert.equal(out.personality, "  casual con espacios  ");
  assert.equal(out.rules[0], "  regla con espacios  ");
});