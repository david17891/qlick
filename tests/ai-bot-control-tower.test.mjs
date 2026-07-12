/**
 * Tests de la Torre de Control AI (Sprint v15 PR #2).
 *
 * Cubre los 5 invariantes del "cerebro" del agente Súper Ejecutivo:
 *
 *  1. Primacía de Reglas de Oro Globales sobre locales (D-025):
 *     `buildSuperExecutivePrompt` siempre inyecta la cláusula
 *     "JERARQUÍA DE REGLAS: LA REGLA DE ORO GLOBAL PREVALECE".
 *
 *  2. `validateAgentReply` con `isFreeEvent: true` permite "gratis":
 *     La masterclass gratuita SÍ puede decir "registro gratuito"
 *     (copy veraz, no alucinación). El resto de frases prohibidas
 *     siguen bloqueadas.
 *
 *  3. `classifyEventType` con `price > 0` devuelve "paid_workshop":
 *     La verdad dura de la DB gana sobre la heurística de descripción.
 *
 *  4. `stripEscalateFlag` limpia `[[ESCALATE_HUMAN]]` del output:
 *     El flag interno es del orquestador; el lead NO debe verlo.
 *
 *  5. `buildSuperExecutivePrompt` elige la rama de copy veraz según
 *     `EventOfferType` (4 ramas: free/paid/b2b/unknown).
 *
 * Patrón: node --test, sin libs externas, mismo estilo que
 * tests/agent-prompts.test.mjs.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { buildSuperExecutivePrompt } from "@/lib/ai/agent-prompts";
import { validateAgentReply, stripEscalateFlag } from "@/lib/ai/guardrails";
import { classifyEventType } from "@/lib/ai/event-context-loader";

/* ─────────────────────────────────────────────────────────────────── */
/*  Fixtures                                                            */
/* ─────────────────────────────────────────────────────────────────── */

const MOCK_PROFILE = {
  name: "Sofía",
  businessName: "Qlick Marketing Digital",
  businessDescription: "Cursos y eventos de marketing digital.",
  businessHours: "Lun-Vie 9-18",
  tone: "amigable, cálido, veraz",
  servicesOrCourses: ["Curso de Marketing", "Masterclass de Ads"],
  allowedActions: ["Responder preguntas", "Derivar con humano"],
  forbiddenActions: ["Confirmar pagos", "Prometer descuentos no autorizados"],
  escalationRules: ["Escalar si pide hablar con humano"],
  fallbackMessage: "Déjame confirmarte con el equipo."
};

function buildContext(overrides = {}) {
  return {
    profile: MOCK_PROFILE,
    leadName: "Juan",
    lastIncomingMessage: "Quiero inscribirme al taller",
    ...overrides
  };
}

/* ─────────────────────────────────────────────────────────────────── */
/*  Test 1: Primacía de Reglas de Oro Globales (D-025)                 */
/* ─────────────────────────────────────────────────────────────────── */

test("buildSuperExecutivePrompt: inyecta cláusula de jerarquía global > local", () => {
  const ctx = buildContext({
    eventRules: ["REGLA LOCAL: cobra 50% de anticipo"],
    eventOfferType: "paid_workshop"
  });
  const prompt = buildSuperExecutivePrompt(ctx);
  // La cláusula de jerarquía debe aparecer textual.
  assert.match(
    prompt,
    /JERARQU[ÍI]A DE REGLAS/i,
    "El prompt Súper Ejecutivo debe incluir la cláusula de jerarquía"
  );
  // FIX 2026-07-11: el texto tiene saltos de línea entre GLOBAL y
  // PREVALECE, así que usamos \s+ en lugar de depender de . (que
  // NO matchea \n sin el flag s).
  assert.match(
    prompt,
    /GLOBAL\s+PREVALECE/i,
    "La cláusula debe afirmar que la GLOBAL prevalece"
  );
});

/* ─────────────────────────────────────────────────────────────────── */
/*  Test 2: validateAgentReply con isFreeEvent: true permite "gratis"  */
/* ─────────────────────────────────────────────────────────────────── */

test("validateAgentReply: isFreeEvent=true permite 'gratis' pero bloquea 'te di acceso'", () => {
  // Reply con la palabra EXACTA "gratis" (no "gratuito") para que el
  // filtro FORBIDDEN_PHRASES.matchee de verdad.
  const replyFree = "El evento es gratis, te paso los detalles para registrarte.";
  const okFree = validateAgentReply(replyFree, { isFreeEvent: true });
  assert.equal(okFree.ok, true, "Masterclass gratuita SÍ puede decir 'gratis'");

  // Misma respuesta pero SIN isFreeEvent: debe bloquearse.
  const okPaid = validateAgentReply(replyFree, { isFreeEvent: false });
  assert.equal(okPaid.ok, false, "Sin isFreeEvent, 'gratis' se bloquea");
  assert.ok(
    okPaid.reasons.some((r) => r.toLowerCase().includes("gratis")),
    "La razón debe mencionar 'gratis'"
  );

  // D-016 sigue vigente: 'te di acceso' se bloquea en TODOS los modos.
  const replyFalseConfirm = "Listo, te di acceso a la plataforma.";
  const okFalseFree = validateAgentReply(replyFalseConfirm, { isFreeEvent: true });
  assert.equal(okFalseFree.ok, false, "'te di acceso' se bloquea incluso con isFreeEvent");
  assert.ok(
    okFalseFree.reasons.some((r) => r.toLowerCase().includes("te di acceso")),
    "La razón debe mencionar 'te di acceso'"
  );
});

/* ─────────────────────────────────────────────────────────────────── */
/*  Test 3: classifyEventType con price > 0 → paid_workshop            */
/* ─────────────────────────────────────────────────────────────────── */

test("classifyEventType: price > 0 gana sobre descripción 'gratis' (verdad dura)", () => {
  const evt = {
    price: 1500,
    description: "Masterclass gratis con descuento especial"
  };
  const offer = classifyEventType(evt);
  assert.equal(offer, "paid_workshop", "price > 0 debe ganar sobre heurística de texto");
});

test("classifyEventType: price === 0 → free_masterclass", () => {
  const offer = classifyEventType({ price: 0, description: "Cualquier cosa" });
  assert.equal(offer, "free_masterclass", "price === 0 debe ser free_masterclass");
});

test("classifyEventType: heurística de descripción cuando price es null", () => {
  const offer = classifyEventType({
    price: null,
    description: "Webinar gratis, entrada libre"
  });
  assert.equal(offer, "free_masterclass", "Descripción 'gratis' sin price → free");
});

test("classifyEventType: default defensivo → 'unknown'", () => {
  const offer = classifyEventType({
    price: null,
    description: "Taller premium de marketing"
  });
  assert.equal(offer, "unknown", "Sin price ni 'gratis' en descripción → unknown");
});

/* ─────────────────────────────────────────────────────────────────── */
/*  Test 4: stripEscalateFlag limpia [[ESCALATE_HUMAN]]                */
/* ─────────────────────────────────────────────────────────────────── */

test("stripEscalateFlag: limpia el flag interno del output del LLM", () => {
  const raw = "Te conecto con un especialista. [[ESCALATE_HUMAN]]";
  const clean = stripEscalateFlag(raw);
  assert.equal(
    clean,
    "Te conecto con un especialista.",
    "stripEscalateFlag debe remover el flag y trim"
  );
  assert.ok(
    !clean.includes("[[ESCALATE_HUMAN]]"),
    "El flag NO debe quedar en el output"
  );
});

test("stripEscalateFlag: es case-insensitive", () => {
  const clean1 = stripEscalateFlag("Hola [[escalate_human]] mundo");
  const clean2 = stripEscalateFlag("Hola [[ESCALATE_HUMAN]] mundo");
  assert.equal(clean1, "Hola  mundo");
  assert.equal(clean2, "Hola  mundo");
});

test("stripEscalateFlag: input vacío devuelve vacío", () => {
  assert.equal(stripEscalateFlag(""), "");
  assert.equal(stripEscalateFlag(null), "");
});

/* ─────────────────────────────────────────────────────────────────── */
/*  Test 5: buildSuperExecutivePrompt elige la rama correcta           */
/* ─────────────────────────────────────────────────────────────────── */

test("buildSuperExecutivePrompt: free_masterclass usa copy 'registro gratuito'", () => {
  const ctx = buildContext({ eventOfferType: "free_masterclass" });
  const prompt = buildSuperExecutivePrompt(ctx);
  assert.match(
    prompt,
    /MASTERCLASS GRATUITA/i,
    "Debe inyectar la rama MASTERCLASS GRATUITA"
  );
  // FIX 2026-07-12 (sprint v0.9.7): la coletilla rígida "finalices tu
  // registro gratuito en la plataforma 🎯" fue reemplazada por
  // directivas de intención flexibles ("SÍ: invitar al lead a
  // finalizar su registro gratuito en la plataforma"). Verificamos
  // que la NUEVA forma esté presente Y la antigua NO (defensa contra
  // regresión a la coletilla rígida).
  assert.match(
    prompt,
    /finalizar\s+su\s+registro\s+gratuito/i,
    "Debe incluir la intención 'finalizar su registro gratuito' en la nueva directiva"
  );
  assert.doesNotMatch(
    prompt,
    /Te paso los detalles y el enlace para que finalices tu registro/i,
    "No debe contener la coletilla rígida 'Te paso los detalles y el enlace para que finalices tu registro'"
  );
});

test("buildSuperExecutivePrompt: paid_workshop usa copy 'enlace de pago' y prohíbe 'liga'", () => {
  const ctx = buildContext({ eventOfferType: "paid_workshop" });
  const prompt = buildSuperExecutivePrompt(ctx);
  assert.match(
    prompt,
    /TALLER DE PAGO/i,
    "Debe inyectar la rama TALLER DE PAGO"
  );
  assert.match(
    prompt,
    /enlace de pago/i,
    "Debe incluir el copy 'enlace de pago'"
  );
  // La regla dura debe mencionar PROHIBIDO 'right now' y 'liga'.
  const matchesRightNowLiga = /right now/i.test(prompt) && /liga/i.test(prompt);
  assert.ok(
    matchesRightNowLiga,
    "La regla dura debe mencionar la prohibición de 'right now' y 'liga'"
  );
});

test("buildSuperExecutivePrompt: b2b_service emite [[ESCALATE_HUMAN]]", () => {
  const ctx = buildContext({ eventOfferType: "b2b_service" });
  const prompt = buildSuperExecutivePrompt(ctx);
  assert.match(
    prompt,
    /SERVICIO B2B/i,
    "Debe inyectar la rama SERVICIO B2B"
  );
  assert.match(
    prompt,
    /\[\[ESCALATE_HUMAN\]\]/,
    "La rama b2b_service debe emitir el flag de escalación"
  );
});

test("buildSuperExecutivePrompt: unknown usa copy defensivo 'déjame confirmarte'", () => {
  const ctx = buildContext({ eventOfferType: "unknown" });
  const prompt = buildSuperExecutivePrompt(ctx);
  assert.match(
    prompt,
    /TIPO DE OFERTA DESCONOCIDO/i,
    "Debe inyectar la rama DESCONOCIDO (defensivo)"
  );
  assert.match(
    prompt,
    /D[ée]jame confirmarte/i,
    "Debe incluir el copy defensivo"
  );
});
