/**
 * Tests de buildSystemPrompt + buildTaskPrompt del agente IA.
 * Ver src/lib/ai/agent-prompts.ts.
 *
 * Estos prompts son la "vacuna" contra alucinaciones del LLM. Si una
 * regla como "no inventar precio" se cae del system prompt, el bot
 * empieza a inventar costos otra vez. Cubrimos los invariantes:
 *
 *  - Inyecta nombre del agente + nombre del negocio.
 *  - Inyecta cursos, acciones permitidas/prohibidas, reglas de escalamiento.
 *  - Diferencia primer mensaje (saluda) vs no-primer (no saluda).
 *  - Inyecta el EVENTO ACTIVO cuando está presente.
 *  - Inyecta la LISTA DE EVENTOS cuando está presente (catálogo).
 *  - Reglas duras: "no inventar precio / amenities / temario / expositor / cupo".
 *  - buildTaskPrompt con/sin conversationWindow y leadProfile.
 *  - suggest_reply exige "Método Comercial".
 *  - Recordatorio final con datos del evento.
 *
 * Patrón: node --test, sin libs externas.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildSystemPrompt,
  buildTaskPrompt
} from "../src/lib/ai/agent-prompts.ts";

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
    ...overrides
  };
}

function makeEvent(overrides = {}) {
  return {
    title: "Taller de Marketing CDMX",
    humanStartsAt: "2026-07-15 10:00",
    promptBlock: "=== EVENTO ACTIVO ===\nTaller de Marketing CDMX\n2026-07-15 10:00",
    ...overrides
  };
}

function makeContext(overrides = {}) {
  return {
    profile: makeProfile(),
    ...overrides
  };
}

/* ─────────────────────────────────────────────────────────────
 * 1. buildSystemPrompt — base
 * ───────────────────────────────────────────────────────────── */

test("buildSystemPrompt: inyecta nombre del agente y del negocio", () => {
  const prompt = buildSystemPrompt(makeProfile());
  assert.ok(prompt.includes("Sofía"));
  assert.ok(prompt.includes("Qlick"));
  assert.ok(prompt.includes("Capacitación en marketing digital."));
});

test("buildSystemPrompt: inyecta cursos, permitidas, prohibidas, escalamiento", () => {
  const prompt = buildSystemPrompt(makeProfile());
  assert.ok(prompt.includes("Curso de Marketing Digital"));
  assert.ok(prompt.includes("Masterclass de Ads"));
  assert.ok(prompt.includes("Recomendar curso"));
  assert.ok(prompt.includes("Confirmar pagos"));
  assert.ok(prompt.includes("Escalar si el lead pide hablar con humano"));
});

test("buildSystemPrompt: inyecta fallback message", () => {
  const prompt = buildSystemPrompt(makeProfile());
  assert.ok(prompt.includes("No tengo esa info, te paso con un humano."));
});

/* ─────────────────────────────────────────────────────────────
 * 2. buildSystemPrompt — primer mensaje
 * ───────────────────────────────────────────────────────────── */

test("buildSystemPrompt: primer mensaje permite saludo", () => {
  const prompt = buildSystemPrompt(makeProfile(), undefined, true);
  assert.ok(prompt.includes("Saluda al lead por su nombre"));
});

test("buildSystemPrompt: NO primer mensaje prohibe saludo", () => {
  const prompt = buildSystemPrompt(makeProfile(), undefined, false);
  // La regla "no saludo" está en el bloque de Personalidad
  assert.ok(prompt.includes("NO es el primer mensaje"));
  assert.ok(prompt.includes("NUNCA con saludo"));
});

/* ─────────────────────────────────────────────────────────────
 * 3. buildSystemPrompt — activeEvent
 * ───────────────────────────────────────────────────────────── */

test("buildSystemPrompt: con activeEvent inyecta el bloque y reglas duras", () => {
  const prompt = buildSystemPrompt(
    makeProfile(),
    makeEvent(),
    true
  );
  // El bloque del evento
  assert.ok(prompt.includes("=== EVENTO ACTIVO ==="));
  assert.ok(prompt.includes("Taller de Marketing CDMX"));
  // Reglas duras
  assert.ok(prompt.includes("PRECIO / COSTO"));
  assert.ok(prompt.includes("NO asumas que un taller presencial incluye comida"));
  assert.ok(prompt.includes("Amenities"));
});

/* ─────────────────────────────────────────────────────────────
 * 4. buildSystemPrompt — eventsListBlock (catálogo)
 * ───────────────────────────────────────────────────────────── */

test("buildSystemPrompt: con eventsListBlock inyecta bloque Y reglas de catalogo", () => {
  const eventsList = "[1] Curso A — 2026-07-15\n[2] Curso B — 2026-07-22";
  const prompt = buildSystemPrompt(
    makeProfile(),
    undefined,
    true,
    eventsList
  );
  // El bloque de catálogo
  assert.ok(prompt.includes("[1] Curso A — 2026-07-15"));
  assert.ok(prompt.includes("[2] Curso B — 2026-07-22"));
  // Las reglas de catálogo
  assert.ok(prompt.includes("COMPORTAMIENTO CON EL CATALOGO DE EVENTOS"));
  assert.ok(prompt.includes("REGLA DE ORO"));
});

test("buildSystemPrompt: eventsListBlock tiene prioridad sobre activeEvent", () => {
  const prompt = buildSystemPrompt(
    makeProfile(),
    makeEvent(),
    true,
    "[1] Otro evento"
  );
  // Gana el catálogo, no el activeEvent
  assert.ok(prompt.includes("COMPORTAMIENTO CON EL CATALOGO"));
  // El bloque del activeEvent NO debe estar presente (reemplazado)
  assert.ok(!prompt.includes("=== EVENTO ACTIVO ==="));
  assert.ok(!prompt.includes("COMPORTAMIENTO CUANDO EL LEAD PREGUNTA SOBRE EL EVENTO"));
});

/* ─────────────────────────────────────────────────────────────
 * 5. buildSystemPrompt — sin evento
 * ───────────────────────────────────────────────────────────── */

test("buildSystemPrompt: sin evento ni catálogo NO inyecta bloque de evento", () => {
  const prompt = buildSystemPrompt(makeProfile(), undefined, true);
  assert.ok(!prompt.includes("=== EVENTO ACTIVO ==="));
  assert.ok(!prompt.includes("COMPORTAMIENTO CON EL CATALOGO"));
  assert.ok(!prompt.includes("COMPORTAMIENTO CUANDO EL LEAD PREGUNTA"));
});

/* ─────────────────────────────────────────────────────────────
 * 6. buildTaskPrompt — básico
 * ───────────────────────────────────────────────────────────── */

test("buildTaskPrompt: incluye nombre del lead o placeholder", () => {
  const ctx = makeContext({ leadName: "Juan Pérez" });
  const prompt = buildTaskPrompt("classify_intent", ctx);
  assert.ok(prompt.includes("Lead: Juan Pérez"));
});

test("buildTaskPrompt: lead sin nombre usa placeholder", () => {
  const ctx = makeContext();
  const prompt = buildTaskPrompt("classify_intent", ctx);
  assert.ok(prompt.includes("Lead: (sin nombre)"));
});

test("buildTaskPrompt: include curso de interes", () => {
  const ctx = makeContext({ courseOfInterest: "Masterclass de Ads" });
  const prompt = buildTaskPrompt("classify_intent", ctx);
  assert.ok(prompt.includes("Curso de interés: Masterclass de Ads"));
});

test("buildTaskPrompt: incluye ultimo mensaje entrante con highlight", () => {
  const ctx = makeContext({ lastIncomingMessage: "Cuánto cuesta?" });
  const prompt = buildTaskPrompt("classify_intent", ctx);
  assert.ok(prompt.includes(">>> ÚLTIMO MENSAJE DEL LEAD"));
  assert.ok(prompt.includes("Cuánto cuesta?"));
});

/* ─────────────────────────────────────────────────────────────
 * 7. buildTaskPrompt — suggest_reply exige Método Comercial
 * ───────────────────────────────────────────────────────────── */

test("buildTaskPrompt: suggest_reply exige Método Comercial", () => {
  const ctx = makeContext();
  const prompt = buildTaskPrompt("suggest_reply", ctx);
  assert.ok(prompt.includes("MÉTODO COMERCIAL"));
});

test("buildTaskPrompt: suggest_reply tiene recordatorio de no inventar", () => {
  const ctx = makeContext();
  const prompt = buildTaskPrompt("suggest_reply", ctx);
  assert.ok(prompt.includes("NO INVENTES"));
  assert.ok(prompt.includes("precio"));
});

/* ─────────────────────────────────────────────────────────────
 * 8. buildTaskPrompt — conversationWindow
 * ───────────────────────────────────────────────────────────── */

test("buildTaskPrompt: sin conversationWindow no inyecta recordatorio", () => {
  const ctx = makeContext();
  const prompt = buildTaskPrompt("classify_intent", ctx);
  assert.ok(!prompt.includes("RECORDATORIO: hay historial"));
});

test("buildTaskPrompt: con conversationWindow inyecta bloque y recordatorio", () => {
  const ctx = makeContext({
    conversationWindow: {
      phoneNormalized: "+5215511112222",
      leadId: "lead-1",
      messages: [
        {
          id: "m1",
          direction: "inbound",
          messageType: "text",
          body: "Hola",
          timestamp: "2026-07-11T15:00:00.000Z",
          metadata: null
        }
      ],
      promptBlock: "[15:00] lead: Hola"
    }
  });
  const prompt = buildTaskPrompt("classify_intent", ctx);
  assert.ok(prompt.includes("[15:00] lead: Hola"));
  assert.ok(prompt.includes("RECORDATORIO: hay historial"));
});

/* ─────────────────────────────────────────────────────────────
 * 9. buildTaskPrompt — leadProfile
 * ───────────────────────────────────────────────────────────── */

test("buildTaskPrompt: con leadProfile.summary inyecta contexto previo", () => {
  const ctx = makeContext({
    leadProfile: {
      leadId: "lead-1",
      summary: "Lead de CDMX, curso de marketing.",
      messagesSinceSummary: 5,
      lastSummaryAt: new Date("2026-07-10T12:00:00.000Z"),
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
      updatedAt: new Date("2026-07-10T12:00:00.000Z")
    }
  });
  const prompt = buildTaskPrompt("classify_intent", ctx);
  assert.ok(prompt.includes("CONTEXTO PREVIO DEL LEAD"));
  assert.ok(prompt.includes("Lead de CDMX, curso de marketing."));
});

test("buildTaskPrompt: con activeEvent inyecta recordatorio final con datos del evento", () => {
  const ctx = makeContext({ activeEvent: makeEvent() });
  const prompt = buildTaskPrompt("classify_intent", ctx);
  assert.ok(prompt.includes("Recordatorio final"));
  assert.ok(prompt.includes("Taller de Marketing CDMX"));
  assert.ok(prompt.includes("2026-07-15 10:00"));
});
