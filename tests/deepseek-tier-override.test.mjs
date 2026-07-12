/**
 * Tests del switch de tier Flash/Pro (Sprint v0.9.7).
 *
 * Cubre el cambio crítico: PRO_PRIORITY_TASKS queda VACÍO y
 * `chooseTier` respeta `context.tierOverride` por encima de la
 * heurística de escalación automática.
 *
 * Caso explícito antes del fix: `task = "suggest_reply"` SIEMPRE
 * iniciaba con Pro (deepseek-reasoner) → ~6s de latencia y 4x costo
 * por cada respuesta del bot, aunque Flash (deepseek-chat) cubría
 * el 95% de los casos con <1.5s.
 *
 * Después del fix: default Flash con escalación automática. Si el
 * caller (admin o simulador) quiere forzar Pro, pasa
 * `context.tierOverride = "pro"`. Si quiere FORZAR Flash (sin
 * escalación), pasa `context.tierOverride = "flash"`.
 *
 * Patrón: tests del helper puro `_chooseTierForTest`. No requiere
 * mocks de fetch ni de Supabase.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const PROVIDER_URL = pathToFileURL(
  path.join(ROOT, "src/lib/ai/deepseek-provider.ts")
).href;

test("S1: task='suggest_reply' sin override ahora inicia en FLASH (no Pro automático)", async () => {
  const { _chooseTierForTest } = await import(PROVIDER_URL);
  const tier = _chooseTierForTest("suggest_reply");
  assert.equal(
    tier,
    "flash",
    "Sprint v0.9.7: PRO_PRIORITY_TASKS quedó vacío; suggest_reply ya NO fuerza Pro"
  );
});

test("S2: tierOverride='flash' respeta FLASH incluso con flashOutcome de error", async () => {
  const { _chooseTierForTest } = await import(PROVIDER_URL);
  const tier = _chooseTierForTest("suggest_reply", {
    ok: false,
    task: "suggest_reply",
    provider: "deepseek",
    content: "",
    confidence: 0,
    needsReview: true,
    demo: false,
    note: "Flash falló"
  }, { tierOverride: "flash" });
  // Sin override, Flash fallido escalaría a Pro. Con override, NO escala.
  assert.equal(
    tier,
    "flash",
    "tierOverride='flash' debe ser ESTRICTO: no escala aunque Flash falle"
  );
});

test("S3: tierOverride='pro' respeta PRO sin importar flashOutcome", async () => {
  const { _chooseTierForTest } = await import(PROVIDER_URL);
  // flashOutcome con confianza alta y ok — sin override sería flash,
  // pero con override "pro" se respeta pro.
  const tier = _chooseTierForTest("suggest_reply", {
    ok: true,
    task: "suggest_reply",
    provider: "deepseek",
    content: "ok",
    confidence: 0.95,
    needsReview: false,
    demo: false,
    note: "Flash funcionó perfecto"
  }, { tierOverride: "pro" });
  assert.equal(
    tier,
    "pro",
    "tierOverride='pro' debe ser ESTRICTO: no se downgradea aunque Flash funcione"
  );
});

test("S4: tierOverride='flash' en escalación (con flashOutcome presente) devuelve flash, no pro", async () => {
  const { _chooseTierForTest } = await import(PROVIDER_URL);
  // Sin override, este caso escalaría a Pro (confianza < threshold 0.7).
  // Con override "flash", el simulador/admin FUERZA a quedarse en Flash.
  const tier = _chooseTierForTest("suggest_reply", {
    ok: true,
    task: "suggest_reply",
    provider: "deepseek",
    content: "respuesta con baja confianza",
    confidence: 0.4, // < threshold 0.7
    needsReview: true,
    demo: false,
    note: "Flash con baja confianza"
  }, { tierOverride: "flash" });
  assert.equal(
    tier,
    "flash",
    "tierOverride='flash' debe ganar sobre la escalación por confianza"
  );
});

test("S5: sin override, Flash con baja confianza escala a Pro (cascada original)", async () => {
  const { _chooseTierForTest } = await import(PROVIDER_URL);
  const tier = _chooseTierForTest("suggest_reply", {
    ok: true,
    task: "suggest_reply",
    provider: "deepseek",
    content: "x",
    confidence: 0.4,
    needsReview: true,
    demo: false,
    note: "baja confianza"
  });
  // Sin override, la heurística de escalación funciona: Flash con
  // confianza < 0.7 → Pro.
  assert.equal(
    tier,
    "pro",
    "sin override, la heurística flash→pro por confianza debe seguir funcionando"
  );
});
