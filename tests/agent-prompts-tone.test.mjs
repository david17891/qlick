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

test("T9 (sprint v0.9.7 hotfix): el prompt contiene el bloque LÍMITE TÉCNICO DE REGISTRO", async () => {
  const { buildSuperExecutivePrompt } = await import(PROMPTS_URL);
  const prompt = buildSuperExecutivePrompt(buildContext());
  assert.ok(
    prompt.includes("LÍMITE TÉCNICO DE REGISTRO"),
    "el prompt debe contener el bloque 'LÍMITE TÉCNICO DE REGISTRO'"
  );
  assert.ok(
    prompt.includes("ANTI-ALUCINACIÓN"),
    "el bloque debe marcarse explícitamente como anti-alucinación"
  );
});

test("T10 (sprint v0.9.7 hotfix): el prompt explica el registro individual por WhatsApp", async () => {
  const { buildSuperExecutivePrompt } = await import(PROMPTS_URL);
  const prompt = buildSuperExecutivePrompt(buildContext());
  assert.ok(
    prompt.includes("REGISTRO INDIVIDUAL POR NÚMERO DE WHATSAPP"),
    "el prompt debe advertir al LLM que SOLO guarda datos del titular"
  );
  assert.ok(
    prompt.includes("extract_and_save_contact_info"),
    "el prompt debe mencionar la tool concreta para que el LLM entienda el límite"
  );
  assert.ok(
    prompt.includes("NUNCA prometas ni confirmes"),
    "el prompt debe tener la regla dura 'NUNCA prometas ni confirmes' para acompañantes"
  );
  assert.ok(
    prompt.includes("hermano") || prompt.includes("socio") || prompt.includes("amigo"),
    "el prompt debe nombrar explícitamente los roles de acompañante (hermano/socio/amigo)"
  );
});

test("T11 (sprint v0.9.7 hotfix): el prompt incluye copy de redirección al acompañante", async () => {
  const { buildSuperExecutivePrompt } = await import(PROMPTS_URL);
  const prompt = buildSuperExecutivePrompt(buildContext());
  assert.ok(
    prompt.includes("RESPUESTA ANTE PEDIDO DE ACOMPAÑANTES"),
    "el prompt debe incluir la sección de respuesta al pedido de acompañantes"
  );
  assert.ok(
    prompt.includes("solo puedo asociar un registro por número de WhatsApp"),
    "el copy honesto debe explicar el límite al lead"
  );
  assert.ok(
    prompt.includes("que nos mande un hola desde su WhatsApp"),
    "el copy debe redirigir al acompañante a escribir desde su propio número"
  );
});

test("T12 (sprint v0.9.7 hotfix): el bloque anti-alucinación aparece ANTES de las Reglas de Oro", async () => {
  const { buildSuperExecutivePrompt } = await import(PROMPTS_URL);
  const prompt = buildSuperExecutivePrompt(buildContext());
  const idxAnti = prompt.indexOf("LÍMITE TÉCNICO DE REGISTRO");
  const idxReglasOro = prompt.indexOf("REGLAS DE ORO GLOBALES");
  assert.ok(idxAnti > 0, "debe aparecer el bloque anti-alucinación");
  assert.ok(idxReglasOro > 0, "debe aparecer el bloque de Reglas de Oro");
  assert.ok(
    idxAnti < idxReglasOro,
    `el bloque anti-alucinación (idx ${idxAnti}) debe aparecer ANTES de las Reglas de Oro (idx ${idxReglasOro})`
  );
});
