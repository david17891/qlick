import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SURVEY_BUTTON_IDS,
  detectSurveyButton,
  buildSurveyQ1,
  buildSurveyQ2,
  buildSurveyQ3,
  buildSurveyQ4,
  buildSurveyThankYou,
  isSurveySkip,
  cleanBusinessText,
} from "../src/lib/whatsapp/survey-wizard.ts";

/**
 * Tests del wizard nativo de encuesta (Fase 7d / 7d.1).
 *
 * Cubre:
 * - Detectores de buttonId (todas las IDs)
 * - Builders (shape correcta: text + interactive)
 * - Skip detection + cleanBusinessText (filtros de ruido)
 *
 * Fase 7d.1 (2026-07-05): tope al wizard. El score/qualification/
 * commercial_interest se quitaron del flow — el admin decide desde
 * la tab Encuestas. Tests de scoring removidos.
 */

test("detectSurveyButton: Q1 → step 1, valores very_clear/clear/confusing", () => {
  assert.deepEqual(
    detectSurveyButton(SURVEY_BUTTON_IDS.q1_very_clear),
    { step: 1, value: "very_clear" }
  );
  assert.deepEqual(
    detectSurveyButton(SURVEY_BUTTON_IDS.q1_clear),
    { step: 1, value: "clear" }
  );
  assert.deepEqual(
    detectSurveyButton(SURVEY_BUTTON_IDS.q1_confusing),
    { step: 1, value: "confusing" }
  );
});

test("detectSurveyButton: Q2 → step 2", () => {
  assert.deepEqual(
    detectSurveyButton(SURVEY_BUTTON_IDS.q2_yes),
    { step: 2, value: "yes" }
  );
  assert.deepEqual(
    detectSurveyButton(SURVEY_BUTTON_IDS.q2_no),
    { step: 2, value: "no" }
  );
});

test("detectSurveyButton: Q3 → step 3", () => {
  assert.deepEqual(
    detectSurveyButton(SURVEY_BUTTON_IDS.q3_meta),
    { step: 3, value: "meta" }
  );
  assert.deepEqual(
    detectSurveyButton(SURVEY_BUTTON_IDS.q3_other),
    { step: 3, value: "other" }
  );
});

test("detectSurveyButton: Q4 skip → { step: 4, value: 'skip' }", () => {
  assert.deepEqual(
    detectSurveyButton(SURVEY_BUTTON_IDS.q4_skip),
    { step: 4, value: "skip" }
  );
});

test("detectSurveyButton: retorna null para IDs desconocidas (no del wizard)", () => {
  assert.equal(detectSurveyButton("survey_offer_yes"), null); // legacy intent
  assert.equal(detectSurveyButton("confirm_inscription_foo"), null);
  assert.equal(detectSurveyButton(""), null);
  assert.equal(detectSurveyButton("random_button"), null);
});

test("buildSurveyQ1: produce un interactive de tipo button con 3 options", () => {
  const built = buildSurveyQ1({ leadName: "David", eventTitle: "Pingüinos" });
  assert.ok(built.text.length > 20);
  assert.equal(built.interactive.type, "button");
  if (built.interactive.type === "button") {
    assert.equal(built.interactive.action.buttons.length, 3);
    const ids = built.interactive.action.buttons.map((b) => b.reply.id);
    assert.ok(ids.includes(SURVEY_BUTTON_IDS.q1_very_clear));
    assert.ok(ids.includes(SURVEY_BUTTON_IDS.q1_clear));
    assert.ok(ids.includes(SURVEY_BUTTON_IDS.q1_confusing));
  }
});

test("buildSurveyQ1: greeting usa el primer nombre del lead", () => {
  const built = buildSurveyQ1({
    leadName: "Juan Pérez",
    eventTitle: "Marketing"
  });
  assert.ok(built.text.startsWith("¡Hola Juan!"));
});

test("buildSurveyQ1: greeting neutro si leadName es vacío/null", () => {
  const built1 = buildSurveyQ1({ leadName: null, eventTitle: "X" });
  const built2 = buildSurveyQ1({ eventTitle: "X" });
  assert.ok(built1.text.startsWith("¡Hola!"));
  assert.ok(built2.text.startsWith("¡Hola!"));
});

test("buildSurveyQ2: tiene 3 botones (Sí/Tal vez/No)", () => {
  const built = buildSurveyQ2();
  if (built.interactive.type === "button") {
    const ids = built.interactive.action.buttons.map((b) => b.reply.id);
    assert.ok(ids.includes(SURVEY_BUTTON_IDS.q2_yes));
    assert.ok(ids.includes(SURVEY_BUTTON_IDS.q2_maybe));
    assert.ok(ids.includes(SURVEY_BUTTON_IDS.q2_no));
  }
});

test("buildSurveyQ3: tiene 3 botones (Meta/Referido/Otro)", () => {
  const built = buildSurveyQ3();
  if (built.interactive.type === "button") {
    const ids = built.interactive.action.buttons.map((b) => b.reply.id);
    assert.ok(ids.includes(SURVEY_BUTTON_IDS.q3_meta));
    assert.ok(ids.includes(SURVEY_BUTTON_IDS.q3_referred));
    assert.ok(ids.includes(SURVEY_BUTTON_IDS.q3_other));
  }
});

test("buildSurveyQ4: 1 botón (Saltar) + texto libre esperado del lead", () => {
  const built = buildSurveyQ4({ leadName: "David" });
  assert.ok(built.text.includes("opcional"));
  assert.ok(built.text.includes("saltar") || built.text.includes("Saltar"));
  if (built.interactive.type === "button") {
    assert.equal(built.interactive.action.buttons.length, 1);
    assert.equal(
      built.interactive.action.buttons[0].reply.id,
      SURVEY_BUTTON_IDS.q4_skip
    );
  }
});

test("buildSurveyThankYou: cierra con frase de gracias + mención business solo si fue capturado", () => {
  const withBiz = buildSurveyThankYou({
    leadName: "David",
    businessCaptured: true
  });
  assert.ok(withBiz.text.includes("Gracias"));
  assert.ok(withBiz.text.includes("David"));
  assert.ok(withBiz.text.includes("Tomamos nota"));

  const withoutBiz = buildSurveyThankYou({
    leadName: "David",
    businessCaptured: false
  });
  assert.ok(!withoutBiz.text.includes("Tomamos nota"));
});

test("isSurveySkip: acepta variantes lowercase/uppercase", () => {
  assert.equal(isSurveySkip("saltar"), true);
  assert.equal(isSurveySkip("Saltar"), true);
  assert.equal(isSurveySkip("SALTAR"), true);
  assert.equal(isSurveySkip("skip"), true);
  assert.equal(isSurveySkip("Skip"), true);
  assert.equal(isSurveySkip("pasar"), true);
  assert.equal(isSurveySkip("omitir"), true);
  assert.equal(isSurveySkip("next"), true);
  assert.equal(isSurveySkip("no gracias"), true);
  assert.equal(isSurveySkip("-"), true);
});

test("isSurveySkip: rechaza respuestas reales", () => {
  assert.equal(isSurveySkip(""), false);
  assert.equal(isSurveySkip("   "), false);
  assert.equal(isSurveySkip("Vendo café de especialidad"), false);
  assert.equal(isSurveySkip("Marketing digital"), false);
  assert.equal(isSurveySkip("saltar123"), false);
  assert.equal(isSurveySkip("no gracias señor"), false); // demasiado largo
});

test("cleanBusinessText: descarta vacío, 'saltar' y < 3 chars", () => {
  assert.equal(cleanBusinessText(""), undefined);
  assert.equal(cleanBusinessText("   "), undefined);
  assert.equal(cleanBusinessText("saltar"), undefined);
  assert.equal(cleanBusinessText("Skip"), undefined);
  assert.equal(cleanBusinessText("a"), undefined);
  assert.equal(cleanBusinessText("xy"), undefined);
});

test("cleanBusinessText: acepta texto real (≥ 3 chars)", () => {
  assert.equal(cleanBusinessText("Vendo café"), "Vendo café");
  assert.equal(
    cleanBusinessText("  Agencia de marketing  "),
    "Agencia de marketing"
  );
});

test("cleanBusinessText: trunca a 500 chars máximo", () => {
  const longText = "a".repeat(1000);
  const trimmed = cleanBusinessText(longText);
  assert.ok(trimmed && trimmed.length === 500);
});
