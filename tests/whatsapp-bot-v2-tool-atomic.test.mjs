/**
 * Tests del Sub-sprint 2A — Tool atómica consolidada.
 *
 * Cubre los 4 casos del diseño `docs/SPRINT_2_BOT_V2_DESIGN.md` §4:
 *
 *   1. `getAgentTools()` retorna UNA sola tool (invariante Sprint 2).
 *   2. La tool `extract_and_save_contact_info` declara los 2 parámetros
 *      esperados (name?, email?, additionalProperties=false).
 *   3. El backend de la tool valida con `isValidHumanName` y rechaza
 *      nombres inválidos (`error_name` populated, `saved_name` absent).
 *   4. Captura atómica nombre + email en un solo mensaje: 1 tool call,
 *      ambos campos guardados en una sola operación.
 *
 * Casos extra (robustez):
 *
 *   5. Modo demo (supabase=null): valida pero no persiste.
 *   6. Solo name o solo email: cada campo se procesa independiente.
 *   7. leadId faltante: error defensivo sin tocar Supabase.
 *   8. Inputs vacíos: no-op sin error.
 *   9. UPDATE a public.leads funciona con mock chain (caso happy real).
 *
 * Patrón: imports desde src/lib/ai/agent-tools.ts y
 * src/lib/ai/tool-executors/extract-contact.ts. Mock chain de Supabase
 * (igual que leads-find-by-phone-timeout.test.mjs).
 *
 * Por la regla del runner Qlick (loader-register.mjs + loader.mjs) los
 * path aliases `@/...` SÍ resuelven. Confirmamos en sub-sprint 2A que
 * strip-types + loader soportan imports desde archivos sin aliases
 * directos en sus declaraciones (los archivos nuevos usan `@/types/supabase`
 * solo en declaration imports, no en runtime).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @ts-check

import {
  getAgentTools,
  getAgentToolByName,
  TOOL_EXTRACT_AND_SAVE_CONTACT_INFO
} from "../src/lib/ai/agent-tools.ts";

import {
  executeExtractAndSaveContact,
  isValidHumanNameLocal,
  validateAndNormalizeEmail
} from "../src/lib/ai/tool-executors/extract-contact.ts";

/* ------------------------------------------------------------------ */
/* Mock helpers                                                        */
/* ------------------------------------------------------------------ */

/**
 * Fake chain de Supabase que registra los patches que se le pasan al
 * UPDATE y permite enqueuear respuestas (success o error) para cada
 * test.
 *
 * Forma esperada por `executeExtractAndSaveContact`:
 *   supabase.from("leads").update(patch).eq("id", leadId)
 *
 * El builder post-`.update()` es a la vez Promise-like (awaitable) y
 * encadenable (`.eq()` retorna el mismo objeto). Devuelve
 * `{ error: null }` por default.
 */
function fakeSupabaseUpdateChain() {
  const calls = [];
  let nextError = null;

  // Promise-like + encadenable. Cumple el patrón thenable de JS.
  const terminal = {
    then(onFulfilled, onRejected) {
      const response = { data: null, error: nextError };
      return Promise.resolve(response).then(onFulfilled, onRejected);
    },
    // Encadenable: postgrest-js permite .eq() después de .update() y
    // retorna el mismo builder. Otros métodos comunes los aceptamos
    // como no-op.
    eq() {
      return terminal;
    },
    select() {
      return terminal;
    },
    order() {
      return terminal;
    },
    limit() {
      return terminal;
    },
    maybeSingle() {
      return this.then((r) => r);
    },
    single() {
      return this.then((r) => r);
    }
  };

  const update = (patch) => {
    calls.push({ kind: "update", patch });
    return terminal;
  };

  const from = (table) => {
    calls.push({ kind: "from", table });
    return { update };
  };

  return {
    client: { from },
    get calls() {
      return calls;
    },
    setNextError(err) {
      nextError = err;
    }
  };
}

/** Contexto base reutilizable en cada test. */
function makeCtx(overrides = {}) {
  return {
    leadId: "lead-test-123",
    supabase: null,
    ...overrides
  };
}

/* ------------------------------------------------------------------ */
/* CASO 1 — getAgentTools retorna UNA sola tool                       */
/* ------------------------------------------------------------------ */

test("getAgentTools: retorna UNA sola tool (invariante Sprint 2)", () => {
  const tools = getAgentTools();
  assert.equal(tools.length, 1, "Sprint 2 expone solo UNA tool consolidada");
  assert.equal(tools[0].type, "function");
  assert.equal(tools[0].function.name, TOOL_EXTRACT_AND_SAVE_CONTACT_INFO);
});

test("getAgentTools: la tool consolidada se llama 'extract_and_save_contact_info'", () => {
  const tools = getAgentTools();
  assert.equal(tools[0].function.name, "extract_and_save_contact_info");
});

test("getAgentTools: NO se exponen validate_name, validate_email, save_lead_* separados", () => {
  // Regla dura del diseño: NO pueden existir estas tools separadas,
  // porque la decisión arquitectónica de David es UNA sola.
  const tools = getAgentTools();
  const names = tools.map((t) => t.function.name);
  assert.ok(!names.includes("validate_name"), "validate_name NO debe existir");
  assert.ok(!names.includes("validate_email"), "validate_email NO debe existir");
  assert.ok(!names.includes("save_lead_name"), "save_lead_name NO debe existir");
  assert.ok(!names.includes("save_lead_email"), "save_lead_email NO debe existir");
});

test("getAgentToolByName: encuentra la tool por nombre", () => {
  const tool = getAgentToolByName("extract_and_save_contact_info");
  assert.ok(tool, "debe encontrar la tool");
  assert.equal(tool.function.name, "extract_and_save_contact_info");
});

test("getAgentToolByName: devuelve null si el nombre no existe", () => {
  const tool = getAgentToolByName("no_existe");
  assert.equal(tool, null);
});

/* ------------------------------------------------------------------ */
/* CASO 2 — Schema de la tool                                         */
/* ------------------------------------------------------------------ */

test("schema: type=function", () => {
  const tool = getAgentTools()[0];
  assert.equal(tool.type, "function");
});

test("schema: la description NO prohíbe la captura (deja claro CUÁNDO llamar)", () => {
  const tool = getAgentTools()[0];
  const desc = tool.function.description.toLowerCase();
  // La description debe decir al LLM CUÁNDO llamar la tool (con datos
  // explícitos del lead) y CUÁNDO NO (sin datos, no inventar).
  assert.ok(desc.includes("solo cuando el lead"), "description debe condicionar el uso");
  assert.ok(desc.includes("no llames") || desc.includes("no llamar"), "description debe advertir contra uso innecesario");
  assert.ok(desc.includes("inventad") || desc.includes("inferidos"), "description debe vetar datos inferidos");
});

test("schema: parameters.type es 'object'", () => {
  const tool = getAgentTools()[0];
  assert.equal(tool.function.parameters.type, "object");
});

test("schema: parameters declara exactamente 2 propiedades (name, email)", () => {
  const tool = getAgentTools()[0];
  const props = Object.keys(tool.function.parameters.properties);
  assert.equal(props.length, 2, "schema debe tener exactamente 2 propiedades");
  assert.deepEqual(props.sort(), ["email", "name"]);
});

test("schema: parameters.properties.name es type=string", () => {
  const tool = getAgentTools()[0];
  const name = tool.function.parameters.properties.name;
  assert.equal(name.type, "string");
});

test("schema: parameters.properties.email es type=string", () => {
  const tool = getAgentTools()[0];
  const email = tool.function.parameters.properties.email;
  assert.equal(email.type, "string");
});

test("schema: parameters.required es undefined (ambos campos son opcionales)", () => {
  const tool = getAgentTools()[0];
  assert.equal(tool.function.parameters.required, undefined,
    "required debe ser undefined porque name y email son independientes");
});

test("schema: parameters.additionalProperties=false (strict)", () => {
  const tool = getAgentTools()[0];
  assert.equal(tool.function.parameters.additionalProperties, false,
    "additionalProperties=false previene que el LLM mande datos raros");
});

/* ------------------------------------------------------------------ */
/* CASO 3 — Validación rechaza nombres inválidos                      */
/* ------------------------------------------------------------------ */

test("validate nombre vacío → error_name populated, saved_name absent", async () => {
  const result = await executeExtractAndSaveContact(
    { name: "asdf" /* no tiene 2 palabras */, email: "x@y.com" },
    makeCtx()
  );
  assert.equal(result.ok, true, "email se aceptó, así que ok=true");
  assert.equal(result.saved_name, undefined, "saved_name NO debe estar");
  assert.ok(result.error_name, "error_name debe estar populated");
  assert.ok(
    result.error_name?.toLowerCase().includes("inválid"),
    `error_name debe describir invalidez, got: ${result.error_name}`
  );
  assert.equal(result.saved_email, "x@y.com", "email sí se aceptó");
});

test("validate placeholder 'Por confirmar' → rechazado", async () => {
  const result = await executeExtractAndSaveContact(
    { name: "Por confirmar" },
    makeCtx()
  );
  assert.equal(result.ok, false, "no hay datos válidos → ok=false");
  assert.ok(result.error_name);
  assert.equal(result.saved_name, undefined);
});

test("validate placeholder 'Asistente' → rechazado", async () => {
  const result = await executeExtractAndSaveContact(
    { name: "Asistente" },
    makeCtx()
  );
  assert.equal(result.ok, false);
  assert.ok(result.error_name);
});

test("validate placeholder 'WhatsApp Lead' → rechazado", async () => {
  const result = await executeExtractAndSaveContact(
    { name: "WhatsApp Lead" },
    makeCtx()
  );
  assert.equal(result.ok, false);
  assert.ok(result.error_name);
});

test("validate nombre con solo dígitos → rechazado", async () => {
  const result = await executeExtractAndSaveContact(
    { name: "12345" },
    makeCtx()
  );
  assert.equal(result.ok, false);
  assert.ok(result.error_name);
});

test("validate nombre válido 'Juan Pérez' → aceptado", async () => {
  const result = await executeExtractAndSaveContact(
    { name: "Juan Pérez" },
    makeCtx()
  );
  assert.equal(result.ok, true);
  assert.equal(result.saved_name, "Juan Pérez");
  assert.equal(result.error_name, undefined);
});

test("validate email sin formato → rechazado (error_email populated)", async () => {
  const result = await executeExtractAndSaveContact(
    { email: "no-es-un-email" },
    makeCtx()
  );
  assert.equal(result.ok, false);
  assert.ok(result.error_email, "error_email debe estar populated");
  assert.equal(result.saved_email, undefined);
});

test("validate email válido → aceptado + lowercased", async () => {
  const result = await executeExtractAndSaveContact(
    { email: "  JUAN@GMAIL.COM  " },
    makeCtx()
  );
  assert.equal(result.ok, true);
  assert.equal(result.saved_email, "juan@gmail.com", "email normalizado a lowercase + trim");
  assert.equal(result.error_email, undefined);
});

/* ------------------------------------------------------------------ */
/* CASO 4 — Captura atómica nombre + email en un solo mensaje        */
/* ------------------------------------------------------------------ */

test("captura atómica: nombre + email en una sola llamada se procesan juntos", async () => {
  const sb = fakeSupabaseUpdateChain();
  const ctx = makeCtx({ supabase: sb.client });
  const result = await executeExtractAndSaveContact(
    { name: "Juan Pérez", email: "juan@gmail.com" },
    ctx
  );

  assert.equal(result.ok, true);
  assert.equal(result.saved_name, "Juan Pérez");
  assert.equal(result.saved_email, "juan@gmail.com");
  assert.equal(result.persisted, true, "el mock chain aceptó el UPDATE");
  assert.equal(result.demo, false);

  // Verificación extra: el mock chain recibió UN solo UPDATE con ambos
  // campos juntos (atomicidad real, NO dos UPDATEs).
  const updateCalls = sb.calls.filter((c) => c.kind === "update");
  assert.equal(updateCalls.length, 1, "debe haber UN solo UPDATE atómico");
  assert.deepEqual(updateCalls[0].patch, {
    name: "Juan Pérez",
    email: "juan@gmail.com"
  });
});

test("captura atómica: si name falla y email pasa, name NO se persiste pero email SÍ", async () => {
  const sb = fakeSupabaseUpdateChain();
  const ctx = makeCtx({ supabase: sb.client });
  const result = await executeExtractAndSaveContact(
    { name: "x", email: "juan@gmail.com" }, // 'x' no pasa (1 sola palabra)
    ctx
  );

  assert.equal(result.ok, true, "email pasó → ok=true");
  assert.equal(result.saved_email, "juan@gmail.com");
  assert.equal(result.error_name, "Nombre inválido (placeholder, demasiado corto o sin letras).");
  // El UPDATE solo lleva email (no name inválido).
  const updateCalls = sb.calls.filter((c) => c.kind === "update");
  assert.equal(updateCalls.length, 1);
  assert.equal(updateCalls[0].patch.name, undefined, "patch NO debe tener name inválido");
  assert.equal(updateCalls[0].patch.email, "juan@gmail.com");
});

/* ------------------------------------------------------------------ */
/* CASO 5 — Modo demo (supabase=null)                                  */
/* ------------------------------------------------------------------ */

test("modo demo (supabase=null): valida pero NO persiste", async () => {
  const result = await executeExtractAndSaveContact(
    { name: "Juan Pérez", email: "juan@gmail.com" },
    makeCtx({ supabase: null })
  );
  assert.equal(result.ok, true);
  assert.equal(result.saved_name, "Juan Pérez");
  assert.equal(result.saved_email, "juan@gmail.com");
  assert.equal(result.persisted, false, "modo demo NO persiste");
  assert.equal(result.demo, true);
});

/* ------------------------------------------------------------------ */
/* CASO 6 — Solo name o solo email                                    */
/* ------------------------------------------------------------------ */

test("solo name → email NO se incluye en el patch", async () => {
  const sb = fakeSupabaseUpdateChain();
  const ctx = makeCtx({ supabase: sb.client });
  await executeExtractAndSaveContact({ name: "Juan Pérez" }, ctx);
  const updateCalls = sb.calls.filter((c) => c.kind === "update");
  assert.equal(updateCalls[0].patch.email, undefined);
  assert.equal(updateCalls[0].patch.name, "Juan Pérez");
});

test("solo email → name NO se incluye en el patch", async () => {
  const sb = fakeSupabaseUpdateChain();
  const ctx = makeCtx({ supabase: sb.client });
  await executeExtractAndSaveContact({ email: "juan@gmail.com" }, ctx);
  const updateCalls = sb.calls.filter((c) => c.kind === "update");
  assert.equal(updateCalls[0].patch.name, undefined);
  assert.equal(updateCalls[0].patch.email, "juan@gmail.com");
});

/* ------------------------------------------------------------------ */
/* CASO 7 — Defensas                                                  */
/* ------------------------------------------------------------------ */

test("leadId faltante → error defensivo, NO toca Supabase", async () => {
  const sb = fakeSupabaseUpdateChain();
  const result = await executeExtractAndSaveContact(
    { name: "Juan Pérez" },
    { leadId: "", supabase: sb.client }
  );
  assert.equal(result.ok, false);
  assert.ok(result.note.includes("leadId"));
  assert.equal(sb.calls.filter((c) => c.kind === "update").length, 0,
    "NO se debe haber llamado update sin leadId");
});

test("inputs vacíos → no-op sin error", async () => {
  const result = await executeExtractAndSaveContact(
    { name: null, email: null },
    makeCtx()
  );
  assert.equal(result.ok, false);
  assert.ok(result.note.toLowerCase().includes("sin datos"));
});

test("inputs whitespace → tratados como vacíos", async () => {
  const result = await executeExtractAndSaveContact(
    { name: "   ", email: "\t\n" },
    makeCtx()
  );
  assert.equal(result.ok, false);
  assert.ok(result.note.toLowerCase().includes("sin datos"));
});

/* ------------------------------------------------------------------ */
/* CASO 9 — UPDATE real (mock chain happy path)                       */
/* ------------------------------------------------------------------ */

test("UPDATE a public.leads: chain es from → update → eq → resolved (happy path)", async () => {
  const sb = fakeSupabaseUpdateChain();
  const ctx = makeCtx({ supabase: sb.client });
  const result = await executeExtractAndSaveContact(
    { name: "Juan Pérez", email: "juan@gmail.com" },
    ctx
  );

  assert.equal(result.ok, true);
  assert.equal(result.persisted, true);
  // El chain fue invocado en el orden correcto.
  const fromCalls = sb.calls.filter((c) => c.kind === "from");
  const updateCalls = sb.calls.filter((c) => c.kind === "update");
  assert.equal(fromCalls[0].table, "leads");
  assert.equal(fromCalls.length, 1);
  assert.equal(updateCalls.length, 1);
});

test("UPDATE error → ok=false + persisted=false + nota con código", async () => {
  const sb = fakeSupabaseUpdateChain();
  sb.setNextError({ code: "42P01", message: "undefined_table" });
  const ctx = makeCtx({ supabase: sb.client });
  const result = await executeExtractAndSaveContact(
    { name: "Juan Pérez", email: "juan@gmail.com" },
    ctx
  );

  assert.equal(result.ok, false);
  assert.equal(result.persisted, false);
  assert.ok(result.note.includes("42P01"));
});

/* ------------------------------------------------------------------ */
/* Helpers puros: isValidHumanNameLocal + validateAndNormalizeEmail   */
/* ------------------------------------------------------------------ */

test("isValidHumanNameLocal: nombres válidos pasan", () => {
  assert.equal(isValidHumanNameLocal("Juan Pérez"), true);
  assert.equal(isValidHumanNameLocal("María José"), true);
  assert.equal(isValidHumanNameLocal("David Esparza"), true);
  assert.equal(isValidHumanNameLocal("José-Luis Núñez"), true);
});

test("isValidHumanNameLocal: nombres inválidos fallan", () => {
  assert.equal(isValidHumanNameLocal(""), false);
  assert.equal(isValidHumanNameLocal("x"), false);
  assert.equal(isValidHumanNameLocal("123"), false);
  assert.equal(isValidHumanNameLocal("Asdf"), false); // 1 sola palabra
  assert.equal(isValidHumanNameLocal("Por confirmar"), false);
  assert.equal(isValidHumanNameLocal("Asistente"), false);
  assert.equal(isValidHumanNameLocal("WhatsApp Lead"), false);
});

test("isValidHumanNameLocal: null y undefined se rechazan", () => {
  assert.equal(isValidHumanNameLocal(null), false);
  assert.equal(isValidHumanNameLocal(undefined), false);
});

test("validateAndNormalizeEmail: válido se normaliza a lowercase", () => {
  assert.equal(validateAndNormalizeEmail("juan@gmail.com"), "juan@gmail.com");
  assert.equal(validateAndNormalizeEmail("  JUAN@GMAIL.COM  "), "juan@gmail.com");
});

test("validateAndNormalizeEmail: inválidos devuelven null", () => {
  assert.equal(validateAndNormalizeEmail("no-es-email"), null);
  assert.equal(validateAndNormalizeEmail("foo@bar"), null);
  assert.equal(validateAndNormalizeEmail(""), null);
  assert.equal(validateAndNormalizeEmail(null), null);
  assert.equal(validateAndNormalizeEmail(undefined), null);
});
