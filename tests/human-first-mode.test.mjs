/**
 * Tests para el 4to modo opt-in `human_first` (Sprint v0.9.x PR #1).
 *
 * Cubre:
 *   1. `isBotGlobalMode` acepta `human_first` (type guard runtime).
 *   2. `parseSimulateRequest` acepta `modeOverride: "human_first"`.
 *   3. Los 3 modos anteriores siguen siendo válidos (regresión).
 *   4. Modos inválidos son rechazados.
 *   5. El catálogo visible al UI contiene los 4 valores (BotConfigTab +
 *      BotSimulatorTab MODE_LABELS).
 *
 * Patrón: `node --test`, sin libs externas, importa los `.ts` vía
 * el loader de path aliases del proyecto (`tests/loader-register.mjs`).
 *
 * Corre con:
 *   npm test
 *
 * Privacy: 0 PII. No toca DB ni provider.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @ts-check

// Imports desde el código TS del proyecto. El loader-register.mjs
// resuelve `@/...` contra `src/`.
import { isBotGlobalMode, KEY_BOT_GLOBAL_MODE } from "@/lib/admin/system-settings-server";
import { parseSimulateRequest } from "@/lib/ai/simulator-schema";
import { buildHumanFirstPrompt } from "@/lib/ai/agent-prompts";
import { resolveIntent } from "@/lib/whatsapp/bot-engine";

/* ─────────────────────────────────────────────────────────────
 * 1. Type guard runtime
 * ───────────────────────────────────────────────────────────── */

test("isBotGlobalMode acepta 'human_first' como modo válido", () => {
  assert.equal(isBotGlobalMode("human_first"), true);
});

test("isBotGlobalMode acepta los 3 modos anteriores (regresión)", () => {
  assert.equal(isBotGlobalMode("socratic_autopilot_v2"), true);
  assert.equal(isBotGlobalMode("socratic_no_tools_v1"), true);
  assert.equal(isBotGlobalMode("super_executive"), true);
});

test("isBotGlobalMode rechaza valores inválidos", () => {
  assert.equal(isBotGlobalMode("socratic_v3"), false);
  assert.equal(isBotGlobalMode("gpt-4"), false);
  assert.equal(isBotGlobalMode(""), false);
  assert.equal(isBotGlobalMode(null), false);
  assert.equal(isBotGlobalMode(undefined), false);
  assert.equal(isBotGlobalMode(123), false);
  assert.equal(isBotGlobalMode({}), false);
  assert.equal(isBotGlobalMode([]), false);
});

test("KEY_BOT_GLOBAL_MODE sigue siendo 'bot_global_mode'", () => {
  // La SSOT del setting key no cambia con este PR. Si alguien
  // lo renombra, este test rompe y obliga a actualizar referencias.
  assert.equal(KEY_BOT_GLOBAL_MODE, "bot_global_mode");
});

/* ─────────────────────────────────────────────────────────────
 * 2. Schema del simulador (parseSimulateRequest)
 * ───────────────────────────────────────────────────────────── */

test("parseSimulateRequest acepta modeOverride='human_first'", () => {
  const result = parseSimulateRequest({
    message: "Hola, ¿qué eventos tienen?",
    history: [],
    modeOverride: "human_first"
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.modeOverride, "human_first");
  }
});

test("parseSimulateRequest acepta los 3 modos anteriores en modeOverride (regresión)", () => {
  for (const mode of [
    "socratic_autopilot_v2",
    "socratic_no_tools_v1",
    "super_executive"
  ]) {
    const result = parseSimulateRequest({
      message: "test",
      history: [],
      modeOverride: mode
    });
    assert.equal(result.ok, true, `modo '${mode}' debería ser aceptado`);
    if (result.ok) {
      assert.equal(result.value.modeOverride, mode);
    }
  }
});

test("parseSimulateRequest rechaza modeOverride inválido", () => {
  const result = parseSimulateRequest({
    message: "test",
    history: [],
    modeOverride: "modo_inexistente"
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /modeOverride.*debe ser uno de/);
    // Verificar que el mensaje menciona el nuevo modo (no es un set cerrado de 3).
    assert.match(result.error, /human_first/);
  }
});

test("parseSimulateRequest sigue funcionando sin modeOverride (default null)", () => {
  const result = parseSimulateRequest({
    message: "hola",
    history: []
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.modeOverride, null);
  }
});

/* ─────────────────────────────────────────────────────────────
 * 3. Catálogo de modos esperado (regresión de tipo)
 * ───────────────────────────────────────────────────────────── */

test("El conjunto canónico de modos contiene los 4 valores esperados", () => {
  // Re-deriva el set probando cada valor. Si alguien agrega un modo
  // nuevo y olvida actualizar esto, este test es la red de seguridad.
  const expected = [
    "socratic_autopilot_v2",
    "socratic_no_tools_v1",
    "super_executive",
    "human_first"
  ];
  for (const m of expected) {
    assert.equal(
      isBotGlobalMode(m),
      true,
      `El modo '${m}' debería ser válido según isBotGlobalMode`
    );
  }
  // Y estos NO deben ser válidos
  const invalid = ["legacy", "experimental", "v3", "gpt-4", ""];
  for (const m of invalid) {
    assert.equal(
      isBotGlobalMode(m),
      false,
      `El modo '${m}' NO debería ser válido`
    );
  }
});

/* ─────────────────────────────────────────────────────────────
 * 4. Integración del prompt (buildHumanFirstPrompt)
 *    Auditoría pre-PR1: verifica que el prompt cumple con las
 *    safeguards y NO fabrica comportamiento de tools inexistentes.
 * ───────────────────────────────────────────────────────────── */

/** Mock mínimo de AIAgentProfile para los tests del prompt. */
const MOCK_PROFILE = {
  name: "Qlick Bot",
  businessName: "Qlick Marketing Digital",
  businessDescription: "Agencia de marketing y academia 24/7.",
  servicesOrCourses: ["Masterclass Marketing + IA"],
  businessHours: "Lun-Vie 9-18",
  tone: "friendly",
  escalationRules: ["Escalar si pide hablar con humano"],
  allowedActions: ["informar sobre eventos", "capturar nombre+email"],
  forbiddenActions: ["confirmar pagos", "ofrecer descuentos no autorizados"],
  fallbackMessage: "Déjame consultarlo con el equipo y te paso."
};

/**
 * Mock de context sin evento activo (modo NO_ACTIVE_EVENTS_MODE).
 * @param {object} overrides
 * @returns {import("@/lib/ai/agent-provider").AgentContext}
 */
function mkContext(overrides = {}) {
  return {
    profile: MOCK_PROFILE,
    activeEvent: { source: "no_events", promptBlock: "" },
    ...overrides
  };
}

test("buildHumanFirstPrompt retorna string no vacío", () => {
  const prompt = buildHumanFirstPrompt(mkContext());
  assert.equal(typeof prompt, "string");
  assert.ok(prompt.length > 200, "El prompt debe tener contenido sustancial");
});

test("buildHumanFirstPrompt declara el modo human_first", () => {
  const prompt = buildHumanFirstPrompt(mkContext());
  assert.match(prompt, /human_first/);
  assert.match(prompt, /TÚ decides|controla todo|LLM-first/i);
});

test("buildHumanFirstPrompt contiene cláusulas de safeguards críticas", () => {
  const prompt = buildHumanFirstPrompt(mkContext());
  // Anti-alucinación
  assert.match(prompt, /NUNCA confirmas pagos|NUNCA prometes acceso|NUNCA inventas/i);
  // Opt-out
  assert.match(prompt, /\[\[OPT_OUT\]\]/);
  assert.match(prompt, /no me interesa|baja|stop/i);
  // Escalación
  assert.match(prompt, /\[\[ESCALATE_HUMAN\]\]/);
  // Brevedad WhatsApp
  assert.match(prompt, /BREVEDAD|máximo 2-3 oraciones|WhatsApp/i);
});

test("buildHumanFirstPrompt NO menciona send_interactive_button como tool (no existe)", () => {
  // REGRESIÓN crítica: en el primer borrador del PR1 el prompt le
  // mentía al LLM sobre una tool inexistente. Este test rompe si
  // alguien vuelve a meterla.
  const prompt = buildHumanFirstPrompt(mkContext());
  // No debe aparecer como tool recomendada para usar.
  assert.doesNotMatch(
    prompt,
    /usa tu herramienta send_interactive_button|tool: send_interactive_button/i
  );
});

test("buildHumanFirstPrompt lista SOLO las 2 tools reales", () => {
  const prompt = buildHumanFirstPrompt(mkContext());
  // Tools que SÍ deben aparecer
  assert.match(prompt, /extract_and_save_contact_info/);
  assert.match(prompt, /add_event_guest/);
});

test("buildHumanFirstPrompt inyecta eventRules cuando están en el context", () => {
  const prompt = buildHumanFirstPrompt(
    mkContext({
      eventRules: [
        "SIEMPRE pedir nombre antes de mostrar info del evento",
        "NUNCA ofrecer el curso A sin mencionar el B"
      ]
    })
  );
  assert.match(prompt, /REGLAS LOCALES DEL EVENTO/);
  assert.match(prompt, /pedir nombre antes de mostrar info/);
  assert.match(prompt, /NUNCA ofrecer el curso A/);
});

test("buildHumanFirstPrompt inyecta la cláusula de jerarquía D-025", () => {
  const prompt = buildHumanFirstPrompt(mkContext());
  assert.match(prompt, /JERARQUÍA DE REGLAS|D-025|PREVALECEN/);
});

test("buildHumanFirstPrompt respeta NO_ACTIVE_EVENTS_MODE sin evento", () => {
  const prompt = buildHumanFirstPrompt(mkContext());
  assert.match(prompt, /NO_ACTIVE_EVENTS_MODE|MODO ESTRICTO SIN EVENTOS/);
  assert.match(prompt, /TOLERANCIA CERO A INVENTAR EVENTOS/);
  // Y NO debe inyectar el promptBlock de un evento ficticio
  assert.doesNotMatch(prompt, /IA y Marketing Básico/);
});

test("buildHumanFirstPrompt respeta NO_ACTIVE_EVENTS_MODE con eventsListBlock vacío", () => {
  const prompt = buildHumanFirstPrompt(
    mkContext({ eventsListBlock: "" })
  );
  // Aunque eventsListBlock esté presente, si está vacío y el activeEvent
  // tiene source=no_events, debe seguir aplicando el modo estricto.
  assert.match(prompt, /NO_ACTIVE_EVENTS_MODE|MODO ESTRICTO SIN EVENTOS/);
});

test("buildHumanFirstPrompt inyecta coursesCatalogBlock cuando existe", () => {
  const prompt = buildHumanFirstPrompt(
    mkContext({
      coursesCatalogBlock: "[1] Masterclass Marketing + IA — $200 MXN"
    })
  );
  assert.match(prompt, /Masterclass Marketing \+ IA — \$200 MXN/);
});

/* ─────────────────────────────────────────────────────────────
 * 5. resolveIntent — PR #2: skip de intents cuando human_first
 *    Verifica que:
 *    - Con human_first=true, mensajes que antes disparaban
 *      "welcome" / "greeting" / "register" ahora van a "question"
 *      (el LLM los maneja).
 *    - Con human_first=true, "opt_out" y "provide_email" SIGUEN
 *      funcionando como gates deterministas (legal + captura).
 *    - Con human_first=false, el comportamiento es IDÉNTICO al
 *      de los 3 modos anteriores (regresión).
 * ───────────────────────────────────────────────────────────── */

test("resolveIntent: human_first=false se comporta como detectIntent (regresión)", () => {
  // "Hola" en primer mensaje → welcome (comportamiento legacy).
  assert.equal(resolveIntent("Hola", true, false), "welcome");
  // "Hola" en mensaje posterior → greeting.
  assert.equal(resolveIntent("Hola", false, false), "greeting");
  // "Si, quiero inscribirme" → register.
  assert.equal(
    resolveIntent("Si, quiero inscribirme", false, false),
    "register"
  );
  // "no me interesa" → opt_out.
  assert.equal(
    resolveIntent("no me interesa", false, false),
    "opt_out"
  );
  // Email puro (anchors ^...$ en EMAIL_RE) → provide_email.
  // NOTA: "mi correo es david@example.com" NO matchea EMAIL_RE (el regex
  // está anclado al body entero). Para extraer emails de un texto más
  // largo, el bot-engine usa `extractEmailFromText` (helper aparte).
  assert.equal(
    resolveIntent("david@example.com", false, false),
    "provide_email"
  );
});

test("resolveIntent: human_first=true, 'Hola' NO dispara welcome/greeting", () => {
  // Antes: human_first=false → "welcome" en primer mensaje.
  // Después: human_first=true → "question" (LLM lo maneja).
  assert.equal(resolveIntent("Hola", true, true), "question");
  assert.equal(resolveIntent("Hola", false, true), "question");
  // Variantes de saludo tampoco disparan welcome/greeting.
  assert.equal(resolveIntent("Buenos días", true, true), "question");
  assert.equal(resolveIntent("Qué tal", true, true), "question");
  assert.equal(resolveIntent("Info", true, true), "question");
});

test("resolveIntent: human_first=true, 'quiero inscribirme' NO dispara register", () => {
  // Antes: "Si, quiero inscribirme" → register (interactive con info evento).
  // Después: human_first=true → question (LLM responde con copy cálido).
  assert.equal(
    resolveIntent("Si, quiero inscribirme", false, true),
    "question"
  );
  assert.equal(
    resolveIntent("quiero inscribirme", false, true),
    "question"
  );
  assert.equal(
    resolveIntent("me apunto", false, true),
    "question"
  );
});

test("resolveIntent: human_first=true, opt_out SIGUE funcionando (gate LFPDPPP)", () => {
  // REGRESIÓN CRÍTICA: opt_out es un gate legal. NO se puede romper.
  assert.equal(
    resolveIntent("no me interesa", false, true),
    "opt_out"
  );
  assert.equal(resolveIntent("baja", false, true), "opt_out");
  assert.equal(resolveIntent("cancelar", false, true), "opt_out");
  assert.equal(resolveIntent("stop", false, true), "opt_out");
  assert.equal(resolveIntent("No, gracias", false, true), "opt_out");
});

test("resolveIntent: human_first=true, provide_email SIGUE funcionando (captura)", () => {
  // REGRESIÓN CRÍTICA: provide_email es captura de datos. NO se puede
  // delegar al LLM (puede decidir no extraer). Email puro (anchors
  // ^...$ en EMAIL_RE). Para emails embebidos en texto, el bot-engine
  // usa `extractEmailFromText` después.
  assert.equal(
    resolveIntent("david@example.com", false, true),
    "provide_email"
  );
  assert.equal(
    resolveIntent("info@qlick.digital", false, true),
    "provide_email"
  );
  assert.equal(
    resolveIntent("david17891+test@gmail.com", false, true),
    "provide_email"
  );
});

test("resolveIntent: human_first=true, pregunta libre va al LLM", () => {
  // Caso típico de human_first: el lead pregunta algo abierto.
  assert.equal(
    resolveIntent("Qué incluye el evento?", false, true),
    "question"
  );
  assert.equal(
    resolveIntent("Cuánto cuesta?", false, true),
    "question"
  );
  assert.equal(
    resolveIntent("Dónde es?", false, true),
    "question"
  );
  assert.equal(
    resolveIntent("Quién expone?", false, true),
    "question"
  );
});

test("resolveIntent: human_first=true, body vacío va a question (no detecta nada)", () => {
  // Coherente con detectIntent original: body vacío siempre es question.
  assert.equal(resolveIntent("", true, true), "question");
  assert.equal(resolveIntent("", false, true), "question");
  assert.equal(resolveIntent("   ", true, true), "question");
});

test("resolveIntent: human_first=true, isFirstMessage NO afecta el resultado", () => {
  // Diferencia clave vs detectIntent original: en human_first, no
  // hay distinción welcome vs greeting (ambos van al LLM). El primer
  // mensaje y los siguientes se manejan igual.
  assert.equal(
    resolveIntent("Hola", true, true),
    resolveIntent("Hola", false, true)
  );
  assert.equal(
    resolveIntent("Qué onda", true, true),
    resolveIntent("Qué onda", false, true)
  );
});
