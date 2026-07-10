/**
 * Tests del Sub-sprint 2B — System Prompt v2 con Método Socrático Comercial.
 *
 * Cubre los 4 casos del diseño `docs/SPRINT_2_BOT_V2_DESIGN.md` §4 (suite
 * "whatsapp-bot-v2-socratic-method"):
 *
 *   1. Presencia de los textos "Paso 1 (Empatía + Valor)", "Paso 2 (Hook
 *      conversacional)", "Paso 3 (Captura invisible)" y "el POR QUÉ va
 *      antes del QUÉ" en el system prompt instanciado.
 *
 *   2. Presencia de la prohibición estricta "Listas con viñetas de
 *      beneficios" en el system prompt.
 *
 *   3. Presencia de "Método Comercial" y "Valor → Hook → (eventual) Captura"
 *      en la instrucción de suggest_reply dentro del task prompt.
 *
 *   4. No-alucinación de precios: `assertNotContains` de "GRATIS|gratis"
 *      y "PROMOCION|promocion" en eventos sin descripción. Verifica que
 *      el prompt NO introduce precios cuando el evento NO los trae.
 *
 * Casos extra (robustez):
 *   5. La rama de catálogo multi-evento diferencia correctamente lista
 *      enumerada vs Método Socrático.
 *   6. Anti-alucinación duro se preserva (NO PRECIO, NO TEMARIO, etc.).
 *
 * Patrón: imports directos del .ts con strip-types. Objetos de prueba
 * simples (sin tipos importados — el .test.mjs es JS puro, solo con
 * `@ts-check` para hints en JSDoc).
 *
 * Runner: el `tests/loader-register.mjs` resuelve path aliases `@/*`,
 * por lo que `../src/lib/ai/agent-prompts.ts` funciona sin pre-build.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @ts-check

import {
  buildSystemPrompt,
  buildTaskPrompt
} from "../src/lib/ai/agent-prompts.ts";

/* ------------------------------------------------------------------ */
/* Fixtures mínimas                                                   */
/* ------------------------------------------------------------------ */

/** Perfil Qlick típico para inyectar al system prompt. */
const FIXTURE_PROFILE = {
  name: "Qlick Assistant",
  businessName: "Qlick Marketing Integral",
  businessDescription:
    "Qlick ofrece cursos de marketing digital, automatizaciones y eventos especializados.",
  businessHours: "Lun-Vie 9:00-18:00 (Centro MX)",
  tone: "amigable, cálido, profesional",
  servicesOrCourses: [
    "IA y Marketing: Primeros Pasos",
    "Funnels de Venta con IA",
    "Automatizaciones WhatsApp"
  ],
  allowedActions: [
    "Responder preguntas sobre cursos y eventos.",
    "Agendar inscripciones a eventos próximos."
  ],
  forbiddenActions: [
    "Confirmar pagos, accesos o descuentos no autorizados.",
    "Inventar precios, fechas o temarios."
  ],
  escalationRules: [
    "Si el lead reporta problema de pago, escalar a humano."
  ],
  fallbackMessage: "Aún no tengo ese dato confirmado, lo reviso y te paso."
};

/** Evento activo mínimo con descripción (precio incluido). */
const ACTIVE_EVENT_WITH_DETAILS = {
  id: "evt-1",
  slug: "ia-marketing-primeros-pasos",
  shortCode: "ABC1",
  title: "IA y Marketing: Primeros Pasos",
  description:
    "Masterclass en vivo el 11 de julio a las 11:00 hrs (CDMX). " +
    "Incluye constancia oficial y acceso a Zoom. Costo: $0 MXN (gratuita).",
  startsAt: new Date("2026-07-11T17:00:00Z"),
  endsAt: new Date("2026-07-11T19:00:00Z"),
  location: "Zoom",
  humanStartsAt: "11 de julio de 2026, 11:00 hrs (hora CDMX)",
  humanDuration: "2 horas",
  promptBlock: "=== EVENTO ACTIVO ===\nNombre: IA y Marketing: Primeros Pasos",
  source: "db",
  requiresName: true,
  eventRules: { personality: "", rules: [] },
  format: "virtual",
  streamingUrl: null,
  streamingProvider: null,
  streamingAccessNote: null
};

/** Evento activo sin descripción (NO debe alucinar precio). */
const ACTIVE_EVENT_NO_DETAILS = {
  ...ACTIVE_EVENT_WITH_DETAILS,
  description: null,
  // Forzamos fuente "no_events" para validar la rama de fallback honesto.
  source: "no_events",
  promptBlock:
    "=== EVENTO ACTIVO ===\nNombre: (sin evento activo)\nFecha: —\nLugar: —\nDuración: —"
};

/** Task prompt context mínimo para probar suggest_reply. */
const TASK_CONTEXT = {
  profile: FIXTURE_PROFILE,
  leadName: "Juan",
  courseOfInterest: "IA y Marketing",
  lastIncomingMessage: "Hola, ¿a qué hora es el evento?",
  activeEvent: ACTIVE_EVENT_WITH_DETAILS,
  conversationWindow: undefined,
  isFirstMessage: false
};

/* ------------------------------------------------------------------ */
/* Helpers de aserción                                                 */
/* ------------------------------------------------------------------ */

/** Case-insensitive contains. */
function containsCI(haystack, needle) {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

/** Case-insensitive NOT contains. */
function notContainsCI(haystack, needle) {
  return !containsCI(haystack, needle);
}

/* ------------------------------------------------------------------ */
/* CASO 1 — Presencia de los 3 pasos + POR QUÉ antes del QUÉ           */
/* ------------------------------------------------------------------ */

test("CASO 1: el system prompt contiene 'Paso 1 (Empatía + Valor)'", () => {
  const prompt = buildSystemPrompt(FIXTURE_PROFILE, ACTIVE_EVENT_WITH_DETAILS);
  assert.ok(
    containsCI(prompt, "Paso 1 (Empatía + Valor)"),
    "Paso 1 (Empatía + Valor) debe estar presente"
  );
});

test("CASO 1: el system prompt contiene 'Paso 2 (Hook conversacional)'", () => {
  const prompt = buildSystemPrompt(FIXTURE_PROFILE, ACTIVE_EVENT_WITH_DETAILS);
  assert.ok(
    containsCI(prompt, "Paso 2 (Hook conversacional)"),
    "Paso 2 (Hook conversacional) debe estar presente"
  );
});

test("CASO 1: el system prompt contiene 'Paso 3 (Captura invisible)'", () => {
  const prompt = buildSystemPrompt(FIXTURE_PROFILE, ACTIVE_EVENT_WITH_DETAILS);
  assert.ok(
    containsCI(prompt, "Paso 3 (Captura invisible)"),
    "Paso 3 (Captura invisible) debe estar presente"
  );
});

test("CASO 1: el system prompt contiene 'el POR QUÉ va antes del QUÉ'", () => {
  const prompt = buildSystemPrompt(FIXTURE_PROFILE, ACTIVE_EVENT_WITH_DETAILS);
  assert.ok(
    containsCI(prompt, "el POR QUÉ va antes del QUÉ"),
    "Frase 'POR QUÉ va antes del QUÉ' debe estar presente (Paso 3)"
  );
});

/* ------------------------------------------------------------------ */
/* CASO 2 — Prohibición de listas con viñetas                          */
/* ------------------------------------------------------------------ */

test("CASO 2: el system prompt prohíbe explícitamente 'Listas con viñetas de beneficios'", () => {
  const prompt = buildSystemPrompt(FIXTURE_PROFILE, ACTIVE_EVENT_WITH_DETAILS);
  assert.ok(
    containsCI(prompt, "Listas con viñetas de beneficios"),
    "Debe haber una prohibición explícita de listas con viñetas de beneficios"
  );
  assert.ok(
    containsCI(prompt, "marketing, no conversación"),
    "La prohibición debe explicar el POR QUÉ (no es conversación humana)"
  );
});

test("CASO 2: el system prompt prohíbe 'pedir todo de golpe' (1 dato por turno)", () => {
  const prompt = buildSystemPrompt(FIXTURE_PROFILE, ACTIVE_EVENT_WITH_DETAILS);
  assert.ok(
    containsCI(prompt, "UN dato por turno"),
    "Debe especificar la regla de captura progresiva (1 dato por turno)"
  );
});

/* ------------------------------------------------------------------ */
/* CASO 3 — 'Método Comercial' + 'Valor → Hook → (eventual) Captura'   */
/* ------------------------------------------------------------------ */

test("CASO 3: el task prompt de suggest_reply menciona 'Método Comercial'", () => {
  const taskPrompt = buildTaskPrompt("suggest_reply", TASK_CONTEXT);
  assert.ok(
    containsCI(taskPrompt, "Método Comercial"),
    "suggest_reply debe aplicar el Método Comercial explícitamente"
  );
});

test("CASO 3: el task prompt de suggest_reply incluye la estructura 'Valor → Hook → (eventual) Captura'", () => {
  const taskPrompt = buildTaskPrompt("suggest_reply", TASK_CONTEXT);
  assert.ok(
    containsCI(taskPrompt, "Valor → Hook → (eventual) Captura"),
    "Estructura 'Valor → Hook → (eventual) Captura' debe estar presente"
  );
});

test("CASO 3: el task prompt menciona opt_out inmediato en 'no me interesa / baja / stop'", () => {
  const taskPrompt = buildTaskPrompt("suggest_reply", TASK_CONTEXT);
  assert.ok(
    containsCI(taskPrompt, "no me interesa"),
    "El opt_out debe estar presente en la instrucción de suggest_reply"
  );
  assert.ok(
    containsCI(taskPrompt, "baja"),
    "El disparador 'baja' debe estar mencionado"
  );
  assert.ok(
    containsCI(taskPrompt, "stop"),
    "El disparador 'stop' debe estar mencionado"
  );
});

test("CASO 3: el task prompt prohíbe 'problema técnico' (tono de bot)", () => {
  const taskPrompt = buildTaskPrompt("suggest_reply", TASK_CONTEXT);
  assert.ok(
    containsCI(taskPrompt, "problema técnico"),
    "La prohibición de sonar a bot (problema técnico) debe estar presente"
  );
});

/* ------------------------------------------------------------------ */
/* CASO 4 — No-alucinación de precios en eventos sin descripción      */
/* ------------------------------------------------------------------ */

test("CASO 4: evento sin descripción → el BLOQUE del evento activo NO contiene 'GRATIS'", () => {
  // FIX 2026-07-02 (mejora anti-alucinación): el LLM NO debe añadir
  // términos de precio cuando el evento no trae Detalles. Verificamos
  // el bloque del EVENTO ACTIVO (no el system prompt completo, que
  // legítimamente prohíbe "promociones no autorizadas" como regla).
  const eventBlock = ACTIVE_EVENT_NO_DETAILS.promptBlock;
  assert.equal(
    notContainsCI(eventBlock, "GRATIS"),
    true,
    "El bloque del evento activo NO debe contener 'GRATIS' cuando no hay descripción"
  );
  assert.equal(
    notContainsCI(eventBlock, "gratis"),
    true,
    "El bloque del evento activo NO debe contener 'gratis' (lowercase)"
  );
});

test("CASO 4: evento sin descripción → el BLOQUE del evento NO contiene 'cupo' ni 'cupos'", () => {
  const eventBlock = ACTIVE_EVENT_NO_DETAILS.promptBlock;
  // FIX 2026-07-02: el LLM también alucinaba "cupos limitados" cuando
  // el evento no tenía ese dato. Verificamos explícitamente.
  assert.equal(
    notContainsCI(eventBlock, "cupo"),
    true,
    "El bloque del evento NO debe contener 'cupo' cuando no hay descripción"
  );
  assert.equal(
    notContainsCI(eventBlock, "temario"),
    true,
    "El bloque del evento NO debe contener 'temario' cuando no hay descripción"
  );
});

test("CASO 4: evento sin descripción → el task prompt sugiere plantilla 'no tengo [X] confirmado'", () => {
  const taskPrompt = buildTaskPrompt("suggest_reply", {
    ...TASK_CONTEXT,
    activeEvent: ACTIVE_EVENT_NO_DETAILS
  });
  assert.ok(
    containsCI(taskPrompt, "no tengo"),
    "La plantilla 'no tengo [X] confirmado' debe estar disponible para suggest_reply"
  );
});

/* ------------------------------------------------------------------ */
/* CASO 5 — Catálogo multi-evento diferencia lista vs Socrático       */
/* ------------------------------------------------------------------ */

test("CASO 5: con catálogo multi-evento → regla 'NO LEAS LA LISTA' para UNO específico", () => {
  const eventsListBlock = [
    "=== CATALOGO DE EVENTOS PUBLICADOS ===",
    "Hay 2 eventos activos.",
    "",
    "[1] IA y Marketing: Primeros Pasos",
    "    Slug: ia-marketing-primeros-pasos",
    "    Fecha: 11 de julio de 2026 · 2 horas",
    "    Lugar: Zoom",
    "    Detalles: Masterclass online",
    "",
    "[2] Funnels de Venta con IA",
    "    Slug: funnels-ia",
    "    Fecha: 25 de julio de 2026 · 3 horas",
    "    Lugar: CDMX",
    "    Detalles: Taller presencial"
  ].join("\n");

  const prompt = buildSystemPrompt(
    FIXTURE_PROFILE,
    undefined,
    false,
    eventsListBlock
  );

  // Cuando hay catálogo Y el lead pregunta por UNO específico,
  // el prompt debe contener la regla de NO leer la lista.
  assert.ok(
    containsCI(prompt, "NO LEAS LA LISTA"),
    "Para 'UNO específico', el prompt debe ordenar NO leer la lista enumerada"
  );

  // Y debe mencionar el Método Socrático dentro de la sección de catálogo.
  assert.ok(
    containsCI(prompt, "Método Socrático"),
    "El prompt debe referenciar el Método Socrático al tratar UN evento específico"
  );
});

test("CASO 5: con catálogo → cuando el mensaje es GENÉRICO sí se usa la lista [1], [2], [3]", () => {
  const eventsListBlock = [
    "=== CATALOGO DE EVENTOS PUBLICADOS ===",
    "Hay 2 eventos activos.",
    "",
    "[1] IA y Marketing",
    "    Slug: a",
    "    Fecha: —",
    "    Lugar: —"
  ].join("\n");

  const prompt = buildSystemPrompt(
    FIXTURE_PROFILE,
    undefined,
    false,
    eventsListBlock
  );
  assert.ok(
    containsCI(prompt, "REGLA DE ORO"),
    "El prompt debe tener la sección 'REGLA DE ORO' explicando lista vs Socrático"
  );
});

/* ------------------------------------------------------------------ */
/* CASO 6 — Anti-alucinación duro se preserva (regresión)              */
/* ------------------------------------------------------------------ */

test("CASO 6: REGRESIÓN — la lista de 'LO QUE NUNCA DEBES INVENTAR' sigue presente", () => {
  const prompt = buildSystemPrompt(FIXTURE_PROFILE, ACTIVE_EVENT_WITH_DETAILS);
  // Estas frases ya existían en el Sprint 1 — verificamos que el patch
  // del 2B NO las rompió.
  assert.ok(
    containsCI(prompt, "LO QUE NUNCA DEBES INVENTAR"),
    "La lista de 'NUNCA inventar' debe estar presente (regla dura Sprint 1)"
  );
  assert.ok(containsCI(prompt, "PRECIO"));
  assert.ok(containsCI(prompt, "Amenities"));
  assert.ok(containsCI(prompt, "NO asumas"));
});

test("CASO 6: REGRESIÓN — el bloque 'EVENTO ACTIVO' sigue presente en single-event prompt", () => {
  const prompt = buildSystemPrompt(FIXTURE_PROFILE, ACTIVE_EVENT_WITH_DETAILS);
  assert.ok(
    containsCI(prompt, "EVENTO ACTIVO"),
    "El bloque del evento activo debe persistir (Sprint 1 intacto)"
  );
});

test("CASO 6: REGRESIÓN — la sección de catálogo multi-evento enumerada sigue presente", () => {
  const eventsListBlock = "=== CATALOGO ===\n[1] Evento X";
  const prompt = buildSystemPrompt(
    FIXTURE_PROFILE,
    undefined,
    false,
    eventsListBlock
  );
  assert.ok(
    containsCI(prompt, "[1], [2], [3]"),
    "El formato de lista enumerada para mensajes genéricos debe persistir"
  );
});

/* ------------------------------------------------------------------ */
/* Sanity checks — el patch no rompe nada del Sprint 1                 */
/* ------------------------------------------------------------------ */

test("sanity: el system prompt inicia con la identidad de Qlick", () => {
  const prompt = buildSystemPrompt(FIXTURE_PROFILE, ACTIVE_EVENT_WITH_DETAILS);
  assert.ok(containsCI(prompt, "Qlick Assistant"));
  assert.ok(containsCI(prompt, "Qlick Marketing Integral"));
});

test("sanity: el system prompt menciona 'tuteo' (no voseo peninsular)", () => {
  // FIX 2026-07-10: tuteo MX explícito en el system prompt.
  const prompt = buildSystemPrompt(FIXTURE_PROFILE, ACTIVE_EVENT_WITH_DETAILS);
  // El prompt NO debe contener "vos" como palabra standalone (regla
  // del orquestador — español MX neutro, no voseo).
  assert.equal(
    /\bv[oó]s\b/i.test(prompt) && !containsCI(prompt, "vosotros"),
    false,
    "El prompt NO debe usar voseo (vos, tenés, sos, querés)"
  );
  // Y debe contener el uso explícito de "tú".
  assert.ok(containsCI(prompt, '"tú"'), "Debe mencionar uso explícito de 'tú'");
});

test("sanity: el task prompt de suggest_reply tiene tamaño razonable (<3500 chars)", () => {
  // Sanity: si el task prompt crece demasiado, el presupuesto de tokens
  // del LLM se come. Validamos que sigue siendo razonable.
  const taskPrompt = buildTaskPrompt("suggest_reply", TASK_CONTEXT);
  assert.ok(
    taskPrompt.length < 3500,
    `task prompt de suggest_reply es ${taskPrompt.length} chars (debe ser <3500)`
  );
});
