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
  calculateSurveyScore,
  getQualificationFromScore,
  QUALIFICATION_LABEL,
  isSurveySkip,
  cleanBusinessText,
} from "../src/lib/whatsapp/survey-wizard.ts";

/**
 * Tests del wizard nativo de encuesta (Fase 7d).
 *
 * Cubre:
 * - Detectores de buttonId (todas las IDs)
 * - Builders (shape correcta: text + interactive)
 * - Scoring 0-100 con reglas documentadas
 * - Qualification (cold/warm/hot/mql) por score
 * - Skip detection + cleanBusinessText (filtros de ruido)
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

test("scoring: max score con respuestas óptimas (very_clear+yes+referred+negocio)", () => {
  const best = {
    q1: "very_clear",
    q2: "yes",
    q3: "referred",
    q4_business: "Vendo café de especialidad"
  };
  // raw = 40 + 25 + 10 + 5 = 80 → normalizado 80 * 1.25 = 100
  assert.equal(calculateSurveyScore(best), 100);
});

test("scoring: answers vacíos → 0", () => {
  assert.equal(calculateSurveyScore({}), 0);
});

test("scoring: Q1 confuso + Q2 no dan 0 pts de substance, pero Q3=other suma 5 raw", () => {
  // q1 confusing (0) + q2 no (0) + q3 other (5 raw) = 5 raw → 5 * 1.25 = 6
  assert.equal(
    calculateSurveyScore({ q1: "confusing", q2: "no", q3: "other" }),
    6
  );
});

test("scoring: Q1 clear + Q2 maybe + Q3 meta → 20+10+5 = 35 → 44", () => {
  // raw = 35 → 35 * 1.25 = 43.75 → round → 44
  assert.equal(
    calculateSurveyScore({ q1: "clear", q2: "maybe", q3: "meta" }),
    44
  );
});

test("scoring: Q4_business corta pero válida cuenta como engagement", () => {
  const ans = {
    q1: "very_clear",
    q2: "yes",
    q3: "meta",
    q4_business: "x" // 1 char → cleanBusinessText lo descarta, pero aquí va directo al score
  };
  // raw = 40 + 25 + 5 + 5 = 75 → 75 * 1.25 = 93.75 → 94
  // (test del score puro: el filtro de "x" vive en cleanBusinessText)
  assert.equal(calculateSurveyScore(ans), 94);
});

test("scoring: q4_business undefined no suma", () => {
  const withBiz = calculateSurveyScore({
    q1: "very_clear",
    q2: "yes",
    q3: "meta",
    q4_business: "Tengo un negocio de ropa"
  });
  const withoutBiz = calculateSurveyScore({
    q1: "very_clear",
    q2: "yes",
    q3: "meta"
  });
  // diff crudo: 5 pts. Normalizado (× 1.25 = 6.25 → round 6).
  assert.equal(withBiz - withoutBiz, 6);
});

test("qualification ranges: 0-25 cold, 26-50 warm, 51-75 hot, 76-100 mql", () => {
  assert.equal(getQualificationFromScore(0), "cold");
  assert.equal(getQualificationFromScore(25), "cold");
  assert.equal(getQualificationFromScore(26), "warm");
  assert.equal(getQualificationFromScore(50), "warm");
  assert.equal(getQualificationFromScore(51), "hot");
  assert.equal(getQualificationFromScore(75), "hot");
  assert.equal(getQualificationFromScore(76), "mql");
  assert.equal(getQualificationFromScore(100), "mql");
});

test("QUALIFICATION_LABEL: cubre los 4 valores", () => {
  const expected = ["cold", "warm", "hot", "mql"];
  for (const q of expected) {
    assert.ok(QUALIFICATION_LABEL[q], `falta label para ${q}`);
  }
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

test("buildSurveyThankYou: cierra con frase de gracias + mención business si fue capturado", () => {
  const withBiz = buildSurveyThankYou({
    leadName: "David",
    score: 85,
    qualification: "mql",
    businessCaptured: true
  });
  assert.ok(withBiz.text.includes("Gracias"));
  assert.ok(withBiz.text.includes("David"));
  assert.ok(withBiz.text.includes("Tomamos nota"));

  const withoutBiz = buildSurveyThankYou({
    leadName: "David",
    score: 30,
    qualification: "warm",
    businessCaptured: false
  });
  assert.ok(!withoutBiz.text.includes("Tomamos nota"));
});
