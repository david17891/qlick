/**
 * Tests de las directivas de tono y formato WhatsApp (Sprint v0.9.7).
 *
 * Cubre el cambio en `buildSuperExecutivePrompt`:
 *   - Reemplazo de las frases enlatadas rígidas con directivas de
 *     intención y tono veraz (más flexibles).
 *   - Nuevo bloque "REGLAS DE FORMATO Y ESTILO WHATSAPP (NO
 *     NEGOCIABLE)" con 4 reglas de brevedad y calidez.
 *
 * Caso explícito antes del fix: el bot terminaba cada respuesta en
 * `🎯` con la misma coletilla ("Te paso los detalles y el enlace
 * para que finalices tu registro gratuito en la plataforma 🎯"),
 * incluso cuando el lead preguntaba algo puntual. Resultado:
 * respuestas verbosas, robóticas, con copy repetido.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const PROMPTS_URL = pathToFileURL(
  path.join(ROOT, "src/lib/ai/agent-prompts.ts")
).href;

const MOCK_PROFILE = {
  name: "Qlick Asistente",
  businessName: "Qlick Marketing Digital",
  businessDescription: "Agencia de marketing y escuela de cursos.",
  businessHours: "Lun-Vie 9-18",
  tone: "amigable, cálido, veraz",
  servicesOrCourses: ["Curso de Marketing"],
  allowedActions: ["Responder preguntas"],
  forbiddenActions: ["Confirmar pagos"],
  escalationRules: ["Escalar si pide hablar con humano"],
  fallbackMessage: "Déjame confirmarte con el equipo."
};

function buildContext(overrides = {}) {
  return {
    profile: MOCK_PROFILE,
    leadName: "Juan",
    lastIncomingMessage: "Quiero inscribirme",
    eventOfferType: "free_masterclass",
    eventRules: [],
    ...overrides
  };
}

test("T1: el prompt contiene el bloque REGLAS DE FORMATO Y ESTILO WHATSAPP", async () => {
  const { buildSuperExecutivePrompt } = await import(PROMPTS_URL);
  const prompt = buildSuperExecutivePrompt(buildContext());
  assert.ok(
    prompt.includes("REGLAS DE FORMATO Y ESTILO WHATSAPP"),
    "el prompt debe contener el bloque 'REGLAS DE FORMATO Y ESTILO WHATSAPP'"
  );
});

test("T2: el prompt contiene las 4 reglas de brevedad/calidez", async () => {
  const { buildSuperExecutivePrompt } = await import(PROMPTS_URL);
  const prompt = buildSuperExecutivePrompt(buildContext());
  assert.ok(prompt.includes("BREVEDAD ABSOLUTA"), "regla 1: BREVEDAD");
  assert.ok(prompt.includes("CERO VERBOSIDAD"), "regla 2: CERO VERBOSIDAD");
  assert.ok(
    prompt.includes("NO REPITAS EL TÍTULO DEL EVENTO"),
    "regla 3: NO REPITAS TÍTULO"
  );
  assert.ok(
    prompt.includes("REGISTRO CÁLIDO Y HUMANO"),
    "regla 4: REGISTRO CÁLIDO"
  );
  // Sprint v0.9.8 Mejora 2: cadencia suave de cierre (regla 5).
  assert.ok(
    prompt.includes("CADENCIA SUAVE DE CIERRE"),
    "regla 5: CADENCIA SUAVE (anti-insistencia)"
  );
  assert.ok(
    prompt.includes("ANTI-INSISTENCIA"),
    "regla 5 marca explícitamente el flag anti-insistencia"
  );
});

test("T3: copyByOffer[free_masterclass] ya NO fuerza la coletilla rígida con 🎯", async () => {
  const { buildSuperExecutivePrompt } = await import(PROMPTS_URL);
  const prompt = buildSuperExecutivePrompt(
    buildContext({ eventOfferType: "free_masterclass" })
  );
  // El copy antiguo terminaba con "🎯" forzado y la coletilla
  // "Te paso los detalles y el enlace para que finalices tu registro
  // gratuito en la plataforma 🎯". Ahora son directivas flexibles.
  assert.ok(
    !prompt.includes(
      "Te paso los detalles y el enlace para que finalices tu registro"
    ),
    "copyByOffer ya NO debe contener la coletilla rígida del free_masterclass"
  );
  // Pero SÍ debe contener la directiva de intención.
  assert.ok(
    prompt.includes("DIRECTIVAS DE INTENCIÓN Y TONO VERAZ"),
    "el prompt debe contener la cabecera de directivas de intención"
  );
  assert.ok(
    prompt.includes("MASTERCLASS GRATUITA"),
    "el prompt debe identificar el tipo de oferta"
  );
});

test("T4: copyByOffer[paid_workshop] ya NO fuerza la coletilla rígida de pago", async () => {
  const { buildSuperExecutivePrompt } = await import(PROMPTS_URL);
  const prompt = buildSuperExecutivePrompt(
    buildContext({ eventOfferType: "paid_workshop" })
  );
  assert.ok(
    !prompt.includes("Te aparto tu lugar en el taller en este momento 🎯"),
    "copyByOffer ya NO debe contener la coletilla rígida del paid_workshop"
  );
  assert.ok(
    prompt.includes("TALLER DE PAGO"),
    "el prompt debe identificar el tipo de oferta"
  );
});

test("T5: copyByOffer[b2b_service] conserva la regla [[ESCALATE_HUMAN]] (regla dura)", async () => {
  const { buildSuperExecutivePrompt } = await import(PROMPTS_URL);
  const prompt = buildSuperExecutivePrompt(
    buildContext({ eventOfferType: "b2b_service" })
  );
  assert.ok(
    prompt.includes("[[ESCALATE_HUMAN]]"),
    "el flag interno [[ESCALATE_HUMAN]] sigue siendo regla dura del b2b"
  );
  // Y el nuevo copy NO debe tener la coletilla rígida.
  assert.ok(
    !prompt.includes("Te conecto con un especialista de nuestro equipo 🎯"),
    "copyByOffer ya NO debe contener la coletilla rígida del b2b"
  );
});

test("T6: copyByOffer[unknown] (defensivo) sigue protegiendo contra inventar", async () => {
  const { buildSuperExecutivePrompt } = await import(PROMPTS_URL);
  const prompt = buildSuperExecutivePrompt(
    buildContext({ eventOfferType: "unknown" })
  );
  assert.ok(
    prompt.includes("TIPO DE OFERTA DESCONOCIDO"),
    "el prompt debe advertir al LLM que el tipo es desconocido"
  );
  assert.ok(
    prompt.includes("NO: inventar el tipo de oferta"),
    "el prompt debe decir explícitamente que NO invente el tipo"
  );
});

test("T7: el bloque REGLAS WHATSAPP aparece ANTES de las Reglas de Oro", async () => {
  const { buildSuperExecutivePrompt } = await import(PROMPTS_URL);
  const prompt = buildSuperExecutivePrompt(buildContext());
  const idxWhatsapp = prompt.indexOf("REGLAS DE FORMATO Y ESTILO WHATSAPP");
  const idxReglasOro = prompt.indexOf("REGLAS DE ORO GLOBALES");
  assert.ok(idxWhatsapp > 0, "debe aparecer el bloque WhatsApp");
  assert.ok(idxReglasOro > 0, "debe aparecer el bloque de Reglas de Oro");
  assert.ok(
    idxWhatsapp < idxReglasOro,
    `el bloque WhatsApp (idx ${idxWhatsapp}) debe aparecer ANTES de las Reglas de Oro (idx ${idxReglasOro})`
  );
});

test("T8: el prompt sigue conteniendo JERARQUÍA DE REGLAS (D-025) intacta", async () => {
  // El cambio del sprint v0.9.7 NO debe romper la jerarquía D-025
  // (Regla Global > Regla Local). Es un test de regresión.
  const { buildSuperExecutivePrompt } = await import(PROMPTS_URL);
  const prompt = buildSuperExecutivePrompt(
    buildContext({ eventRules: ["Regla local del evento"] })
  );
  assert.ok(
    prompt.includes("JERARQUÍA DE REGLAS"),
    "la cláusula D-025 debe seguir presente"
  );
  assert.ok(
    prompt.includes("LA REGLA DE ORO") &&
      prompt.includes("GLOBAL PREVALECE EN TODOS LOS CASOS"),
    "la regla D-025 'GLOBAL PREVALECE' debe seguir presente (puede estar con line wrap)"
  );
  assert.ok(
    prompt.includes("Regla local del evento"),
    "las reglas locales deben seguir inyectándose"
  );
});

/* ================================================================== */
/* Sprint v0.9.7 hotfix (post-v0.9.7): Anti-Alucinación de Acompañantes */
/* ================================================================== */

test("T9 (sprint v0.9.8): el prompt contiene el bloque REGISTRO DE ACOMPAÑANTES con la tool add_event_guest", async () => {
  const { buildSuperExecutivePrompt } = await import(PROMPTS_URL);
  const prompt = buildSuperExecutivePrompt(buildContext());
  assert.ok(
    prompt.includes("REGISTRO DE ACOMPAÑANTES"),
    "el prompt debe contener el bloque 'REGISTRO DE ACOMPAÑANTES'"
  );
  assert.ok(
    prompt.includes("add_event_guest"),
    "el prompt debe mencionar la nueva tool por nombre para que el LLM la invoque"
  );
  assert.ok(
    prompt.includes("parent_lead_id"),
    "el prompt debe explicar el parámetro parent_lead_id"
  );
});

test("T10 (sprint v0.9.8): el prompt instruye confirmación cálida tras la tool", async () => {
  const { buildSuperExecutivePrompt } = await import(PROMPTS_URL);
  const prompt = buildSuperExecutivePrompt(buildContext());
  assert.ok(
    prompt.includes("CONFIRMACIÓN CÁLIDA"),
    "el prompt debe tener la sección de confirmación cálida post-tool"
  );
  // Cover de los 3 roles del brief original.
  assert.ok(
    prompt.includes("hermano"),
    "el prompt debe mencionar el rol 'hermano' (David lo pidió explícito)"
  );
  assert.ok(
    prompt.includes("socio"),
    "el prompt debe mencionar el rol 'socio' (David lo pidió explícito)"
  );
  assert.ok(
    prompt.includes("amigo"),
    "el prompt debe mencionar el rol 'amigo' (David lo pidió explícito)"
  );
});

test("T11 (sprint v0.9.8): el prompt advierte que NO se manda email automático al acompañante", async () => {
  const { buildSuperExecutivePrompt } = await import(PROMPTS_URL);
  const prompt = buildSuperExecutivePrompt(buildContext());
  assert.ok(
    prompt.includes("NO le mandamos email de confirmación al acompañante") ||
      prompt.includes("solo registro interno"),
    "el prompt debe aclarar la limitación: solo se registra en BD, no se manda email automático"
  );
});

test("T12 (sprint v0.9.8): el prompt ya NO contiene la coletilla anti-alucinación del sprint v0.9.7 hotfix", async () => {
  // El sprint v0.9.8 REEMPLAZÓ la regla anti-alucinación por la
  // instrucción de usar la tool. El copy antiguo ('Por aquí solo
  // puedo asociar un registro por número de WhatsApp') NO debe estar
  // presente — sería copy obsoleto/conflictivo.
  const { buildSuperExecutivePrompt } = await import(PROMPTS_URL);
  const prompt = buildSuperExecutivePrompt(buildContext());
  assert.ok(
    !prompt.includes("Por aquí solo puedo asociar un registro por número de WhatsApp"),
    "el prompt NO debe contener la coletilla obsoleta del sprint v0.9.7 (sustituida por la tool)"
  );
  assert.ok(
    !prompt.includes("NUNCA prometas ni confirmes que ya quedaron registrados ambos"),
    "el prompt NO debe contener la regla obsoleta de anti-alucinación (sustituida por uso de la tool)"
  );
});
