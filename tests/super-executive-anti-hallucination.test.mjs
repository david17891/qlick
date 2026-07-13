/**
 * Tests del Cortafuegos Anti-Alucinación del Súper Ejecutivo.
 *
 * Sprint: plan anti-alucinación 2026-07-13. Ver:
 *   - .harness/docs/ANTI_HALLUCINATION_CATALOG_PLAN.md
 *   - src/lib/ai/agent-prompts.ts (buildSuperExecutivePrompt)
 *   - src/lib/ai/event-context-loader.ts (loadCoursesCatalogBlock)
 *
 * Problema raíz que verificamos:
 *   Antes de este sprint, cuando `loadActiveEventContext` devolvía
 *   `source: "no_events"`, el Súper Ejecutivo quedaba con la directiva
 *   genérica "convertir en inscripciones" y ALUCINABA eventos en vivo.
 *   El fix agrega el modo `NO_ACTIVE_EVENTS_MODE` + el catálogo LMS.
 *
 * Cobertura de los 4 escenarios obligatorios del protocolo:
 *   1. Lead pide inscripción directa sin eventos.
 *   2. Lead consulta por cursos LMS 24/7.
 *   3. Lead consulta por servicios de agencia B2B.
 *   4. Lead intenta "social engineering" pidiendo un taller falso.
 *
 * Más 2 tests de regresión para asegurar que NO se activa
 * incorrectamente cuando hay eventos reales o catálogo multi-evento.
 *
 * Patrón: node --test, sin libs externas, sin red.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { buildSuperExecutivePrompt } from "../src/lib/ai/agent-prompts.ts";

/* ─────────────────────────────────────────────────────────────
 * Helpers
 * ───────────────────────────────────────────────────────────── */

function makeProfile(overrides = {}) {
  return {
    name: "Sofía",
    businessName: "Qlick",
    businessDescription: "Capacitación en marketing digital.",
    servicesOrCourses: ["Curso de Marketing Digital", "Masterclass de Ads"],
    businessHours: "L-V 9-18",
    tone: "friendly",
    escalationRules: ["Escalar si el lead pide hablar con humano"],
    allowedActions: ["Recomendar curso", "Enviar temario"],
    forbiddenActions: ["Confirmar pagos", "Prometer descuentos"],
    fallbackMessage: "No tengo esa info, te paso con un humano.",
    ...overrides,
  };
}

function makeNoEventsContext(overrides = {}) {
  return {
    profile: makeProfile(),
    activeEvent: { source: "no_events", title: "(sin evento activo)" },
    eventsListBlock: undefined,
    coursesCatalogBlock: [
      "=== CATÁLOGO DE CURSOS LMS ASINCRÓNICOS (ACADEMIA 24/7) ===",
      "Hay 2 cursos grabados disponibles para acceso inmediato:",
      "",
      "[1] Marketing + IA para Emprendedores — $499 MXN",
      "    Resumen: Aprende a usar IA para crecer tu negocio.",
      "    Enlace: https://www.qlick.digital/cursos/marketing-ia-para-emprendedores",
      "",
      "[2] Curso de Ads Avanzado — $999 MXN",
      "    Resumen: Domina Facebook Ads y Google Ads.",
      "    Enlace: https://www.qlick.digital/cursos/ads-avanzado",
      "",
      "=========================================================",
    ].join("\n"),
    eventOfferType: "unknown",
    eventRules: [],
    ...overrides,
  };
}

function makeActiveEventContext(overrides = {}) {
  return {
    profile: makeProfile(),
    activeEvent: {
      source: "db",
      title: "Masterclass de Marketing 2026",
      humanStartsAt: "2026-08-15 18:00",
      promptBlock:
        "=== EVENTO ACTIVO ===\nMasterclass de Marketing 2026\n2026-08-15 18:00",
    },
    eventsListBlock: undefined,
    eventOfferType: "free_masterclass",
    eventRules: [],
    ...overrides,
  };
}

function makeMultiEventContext(overrides = {}) {
  return {
    profile: makeProfile(),
    activeEvent: undefined,
    eventsListBlock: [
      "=== CATÁLOGO DE EVENTOS ===",
      "[1] Masterclass de Marketing 2026 — 2026-08-15",
      "[2] Taller de Ads — 2026-09-01",
      "====================================",
    ].join("\n"),
    eventOfferType: "free_masterclass",
    eventRules: [],
    ...overrides,
  };
}

/* ─────────────────────────────────────────────────────────────
 * Escenario 1: Inscripción directa sin eventos
 * ───────────────────────────────────────────────────────────── */

test("NO_ACTIVE_EVENTS_MODE: bloque estricto se inyecta cuando no hay eventos", () => {
  const prompt = buildSuperExecutivePrompt(makeNoEventsContext());
  assert.ok(
    prompt.includes("MODO ESTRICTO SIN EVENTOS EN VIVO"),
    "Debe inyectar el bloque del modo estricto",
  );
  assert.ok(
    prompt.includes("NO_ACTIVE_EVENTS_MODE"),
    "Debe etiquetar el modo con el nombre interno",
  );
  assert.ok(
    prompt.includes("NUNCA prometas inscribir"),
    "Regla dura anti-alucinación presente",
  );
  assert.ok(
    prompt.includes("TOLERANCIA CERO"),
    "Tolerancia cero explícita",
  );
});

test("NO_ACTIVE_EVENTS_MODE: bloque estricto REEMPLAZA la directiva comercial genérica", () => {
  const prompt = buildSuperExecutivePrompt(makeNoEventsContext());
  // La directiva genérica de conversión NO debe estar presente.
  assert.ok(
    !prompt.includes("convertir leads en inscripciones"),
    "La directiva genérica de conversión debe estar REEMPLAZADA",
  );
});

test("NO_ACTIVE_EVENTS_MODE: la regla anti-alucinación es verificable en el output", () => {
  const prompt = buildSuperExecutivePrompt(makeNoEventsContext());
  // El LLM debe tener la respuesta explícita a usar si el lead pregunta
  // por inscripciones. Esa respuesta es la frase que el bot DEBE decir.
  assert.ok(
    prompt.includes("En este momento no tenemos una Masterclass o taller en vivo programado"),
    "Frase veraz prefabricada presente",
  );
});

/* ─────────────────────────────────────────────────────────────
 * Escenario 2: Consulta por Cursos LMS 24/7
 * ───────────────────────────────────────────────────────────── */

test("NO_ACTIVE_EVENTS_MODE: el catálogo LMS se inyecta en el prompt", () => {
  const prompt = buildSuperExecutivePrompt(makeNoEventsContext());
  assert.ok(
    prompt.includes("CATÁLOGO DE CURSOS LMS ASINCRÓNICOS"),
    "Bloque del catálogo presente",
  );
  assert.ok(
    prompt.includes("Marketing + IA para Emprendedores"),
    "Curso 1 del catálogo presente",
  );
  assert.ok(
    prompt.includes("Curso de Ads Avanzado"),
    "Curso 2 del catálogo presente",
  );
  assert.ok(
    prompt.includes("https://www.qlick.digital/cursos/marketing-ia-para-emprendedores"),
    "Enlace veraz del curso 1",
  );
  assert.ok(
    prompt.includes("$499 MXN"),
    "Precio veraz del curso 1",
  );
});

/* ─────────────────────────────────────────────────────────────
 * Escenario 3: Consulta por Servicios de Agencia B2B
 * ───────────────────────────────────────────────────────────── */

test("NO_ACTIVE_EVENTS_MODE: la rama B2B está contemplada en el prompt", () => {
  const prompt = buildSuperExecutivePrompt(makeNoEventsContext());
  assert.ok(
    prompt.includes("SERVICIOS DE AGENCIA B2B") ||
      prompt.includes("agencia B2B") ||
      prompt.includes("consultoría"),
    "La rama de servicios B2B debe estar contemplada en el prompt",
  );
  assert.ok(
    prompt.includes("ESCALATE_HUMAN"),
    "El flag de escalamiento a humano debe estar disponible",
  );
});

/* ─────────────────────────────────────────────────────────────
 * Escenario 4: Intento de "Social Engineering" (taller falso)
 * ───────────────────────────────────────────────────────────── */

test("NO_ACTIVE_EVENTS_MODE: rechaza eventos inventados por el lead", () => {
  const prompt = buildSuperExecutivePrompt(makeNoEventsContext());
  // El protocolo pide "Tolerancia Cero a Inventar Eventos" con una
  // frase prefabricada. Verificamos que la regla existe.
  assert.ok(
    prompt.includes("No tengo registro de ese taller") ||
      prompt.includes("TOLERANCIA CERO A INVENTAR EVENTOS"),
    "Regla de rechazo a eventos inventados presente",
  );
});

/* ─────────────────────────────────────────────────────────────
 * Regresión: NO se activa incorrectamente con eventos reales
 * ───────────────────────────────────────────────────────────── */

test("regresión: con activeEvent.db el modo NO_ACTIVE_EVENTS_MODE NO se activa", () => {
  const prompt = buildSuperExecutivePrompt(makeActiveEventContext());
  assert.ok(
    !prompt.includes("MODO ESTRICTO SIN EVENTOS EN VIVO"),
    "El modo estricto NO debe activarse con un evento real",
  );
  assert.ok(
    prompt.includes("convertir leads en inscripciones"),
    "La directiva genérica de conversión debe estar presente",
  );
  assert.ok(
    prompt.includes("Masterclass de Marketing 2026"),
    "El evento real debe aparecer en el contexto",
  );
});

test("regresión: con eventsListBlock multi-evento el modo NO se activa", () => {
  const prompt = buildSuperExecutivePrompt(makeMultiEventContext());
  assert.ok(
    !prompt.includes("MODO ESTRICTO SIN EVENTOS EN VIVO"),
    "El modo estricto NO debe activarse con catálogo multi-evento",
  );
  assert.ok(
    prompt.includes("CATÁLOGO DE EVENTOS"),
    "El catálogo de eventos debe estar presente",
  );
});
