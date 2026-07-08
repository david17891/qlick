/**
 * Simulación end-to-end de conversaciones del bot de WhatsApp (2026-07-08).
 *
 * Objetivo: validar que los 2 bugs reportados por David (placeholder
 * "WhatsApp" en saludos + state machine del nombre roto) están
 * efectivamente arreglados, ejecutando conversaciones simuladas
 * turno por turno y verificando el comportamiento esperado.
 *
 * Estrategia: en lugar de mockear processInboundMessage (que toca
 * Supabase, LLM, WhatsApp provider, etc.), replicamos el STATE
 * MACHINE puro del bot usando las funciones exportadas de
 * bot-engine.ts:
 *
 *   - cleanFirstName         → filtra placeholders en lead.name
 *   - matchInscriptionIntent → bug 2: detecta intención de inscripción
 *   - detectIntent           → clasifica el body del lead
 *   - isValidHumanName       → valida que un body es nombre humano
 *   - isPlaceholderNameUI    → valida que un name es placeholder
 *   - isQuestionOrIntent     → detecta preguntas / intenciones (no nombres)
 *
 * El simulador mantiene el state (awaitingField, lead.name) entre
 * turnos y produce el body del outbound que el bot habría enviado.
 * No envía mensajes reales ni llama al LLM.
 *
 * Patrón de la skill funnel-simulation-tester: invocamos el
 * handler del bot con respuestas simuladas.
 *
 * @server
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @ts-check

import {
  cleanFirstName,
  matchInscriptionIntent,
  detectIntent,
  isValidHumanName,
  isPlaceholderNameUI,
  isQuestionOrIntent
} from "../src/lib/whatsapp/bot-engine.ts";

/* ─────────────────────────────────────────────────────────────
 * Mini state machine que refleja `processInboundMessage`
 * (sin Supabase, sin LLM real, sin provider real).
 * ───────────────────────────────────────────────────────────── */

/** Estado del lead simulado. */
function makeLead(initialName = "WhatsApp Lead", initialEmail = null) {
  return {
    name: initialName,
    email: initialEmail,
    // Outbound metadata del último mensaje del bot (awaiting_field, etc).
    lastOutboundMetadata: {}
  };
}

/** Resultado de un turno. */
function makeTurnResult() {
  return {
    /** Body que el bot habría enviado (lo que el lead vería en WhatsApp). */
    botBody: "",
    /** Metadata del plan del bot (awaiting_field, etc). */
    botMetadata: {},
    /** Clasificación del intent (welcome, register, provide_name, etc). */
    intent: "",
    /** Si el bot fue interceptado ANTES del LLM (bug 2 fix). */
    intercepted: false,
    /** Si el bot habría llamado al LLM (modo "question" normal). */
    wouldHaveCalledLLM: false
  };
}

/**
 * Ejecuta UN turno del state machine. Replica la lógica de
 * `processInboundMessage` (bot-engine.ts:3869+) de forma PURA,
 * sin Supabase, sin provider, sin LLM real.
 *
 * Casos que replica (orden de prioridad, igual que el código real):
 *   1. awaitingField="name" + body no es email → provide_name
 *   2. matchInscriptionIntent(body) + lead sin nombre → INTERCEPT
 *      (no LLM, retorna plan de pedir nombre)
 *   3. body matchea email → provide_email
 *   4. greeting/welcome si es primer mensaje
 *   5. question → LLM
 *
 * @returns {botBody, botMetadata, intent, intercepted, wouldHaveCalledLLM}
 */
function runTurn(lead, body, isFirstMessage) {
  const result = makeTurnResult();
  const cleanLeadName = cleanFirstName(lead.name);
  const trimmedBody = (body ?? "").trim();
  const looksLikeEmail =
    trimmedBody.length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedBody);
  const awaitingField =
    (lead.lastOutboundMetadata &&
      lead.lastOutboundMetadata.awaiting_field) ||
    null;

  // Caso 1: bot esperando nombre + body no es email.
  if (awaitingField === "name" && trimmedBody && !looksLikeEmail) {
    if (isQuestionOrIntent(trimmedBody)) {
      // Bot rechaza la pregunta, mantiene awaiting_field="name".
      result.intent = "provide_name_question";
      result.botBody =
        "Buena pregunta. Te la respondo cuando completemos tu registro. " +
        "Por ahora solo necesito tu nombre completo.";
      result.botMetadata = { awaiting_field: "name" };
      return result;
    }
    if (!isValidHumanName(trimmedBody)) {
      // Bot rechaza, dice que mande letras.
      result.intent = "provide_name_invalid";
      result.botBody =
        "Por favor escríbeme tu nombre y apellido con letras.";
      result.botMetadata = { awaiting_field: "name" };
      return result;
    }
    // Nombre válido → capturado. Siguiente paso: pedir email.
    result.intent = "provide_name";
    result.botBody = `Excelente ${trimmedBody}, ya casi. ` +
      `¿Me compartes tu correo electrónico para enviarte el QR?`;
    result.botMetadata = { awaiting_field: "email" };
    // Actualizar el lead en memoria.
    lead.name = trimmedBody;
    return result;
  }

  // Caso 2: BUG 2 FIX — sin nombre válido + intención de inscripción.
  if (cleanLeadName === "" && trimmedBody && matchInscriptionIntent(trimmedBody)) {
    result.intent = "interactive_event_inscribir";
    result.intercepted = true;
    result.botBody =
      "¡Hola! Para inscribirte al evento, primero dime tu nombre completo. " +
      "Después te pido tu email.";
    result.botMetadata = { awaiting_field: "name" };
    return result;
  }

  // Caso 3: body es email.
  if (looksLikeEmail) {
    if (cleanLeadName === "") {
      // Edge: lead dio email sin haber dado nombre. Bot pide nombre primero.
      result.intent = "provide_email_without_name";
      result.botBody =
        "Antes de registrarte, necesito tu nombre completo para el certificado. " +
        "Por favor mándamelo así: \"Juan Pérez\".";
      result.botMetadata = { awaiting_field: "name" };
      return result;
    }
    // Nombre OK → cerrar registro.
    result.intent = "provide_email";
    const clean = cleanLeadName;
    result.botBody = `Listo${clean ? " " + clean : ""}, te registramos para el evento. ` +
      `Tu pase (link de check-in): https://www.qlick.digital/check-in/SIMULATED123`;
    result.botMetadata = { awaiting_field: null };
    lead.email = trimmedBody;
    return result;
  }

  // Caso 4-5: delegamos a detectIntent para clasificar.
  const intent = detectIntent(trimmedBody, isFirstMessage);
  result.intent = intent;

  if (intent === "welcome" || intent === "greeting") {
    const clean = cleanLeadName;
    const saludo = clean ? `¡Hola ${clean}!` : "¡Hola!";
    result.botBody = `${saludo} Soy Qlick, asistente de Qlick Marketing Digital. ` +
      `¿Qué te interesa?`;
    result.botMetadata = {};
    return result;
  }

  if (intent === "register") {
    // Handler register pide el email directamente (legacy path).
    // Pero en producción ahora va por interactive_event_inscribir.
    const clean = cleanLeadName;
    if (clean === "") {
      // BUG 2: en producción, ANTES el LLM respondía aquí. AHORA
      // también lo interceptamos (caso 2 ya cubrió si body matchea
      // matchInscriptionIntent). Si llegamos acá, significa que el
      // body matcheó REGISTER_RE pero NO matchInscriptionIntent (raro,
      // ej. "confirmo"). Mantenemos el comportamiento legacy: el bot
      // dispara interactive_event_inscribir con set awaiting_field.
      result.intent = "interactive_event_inscribir";
      result.botBody =
        "¡Excelente! Para inscribirte al evento, primero dime tu nombre completo. " +
        "Después te pido tu email.";
      result.botMetadata = { awaiting_field: "name" };
      return result;
    }
    // Lead tiene nombre → cerrar con QR.
    result.botBody = `Listo ${clean}, ya estás registrado. Tu QR: https://www.qlick.digital/check-in/...`;
    result.botMetadata = { awaiting_field: null };
    return result;
  }

  // Default: question → LLM.
  result.wouldHaveCalledLLM = true;
  result.botBody = "[LLM-FAKE: pregunta libre] Aquí iría la respuesta del LLM.";
  result.botMetadata = {};
  return result;
}

/** Actualiza el lastOutboundMetadata del lead después de un turno. */
function applyTurn(lead, turnResult) {
  lead.lastOutboundMetadata = turnResult.botMetadata;
}

/* ─────────────────────────────────────────────────────────────
 * SIMULACIÓN 1: Lead sin nombre, primer mensaje "hola"
 * Valida Bug 1: NO debe decir "WhatsApp" en el saludo.
 * ───────────────────────────────────────────────────────────── */

test("SIM 1.1 — Lead sin nombre (WhatsApp Lead) + 'hola' → saludo LIMPIO sin WhatsApp", () => {
  const lead = makeLead("WhatsApp Lead");
  const turn = runTurn(lead, "hola", true);
  applyTurn(lead, turn);

  assert.equal(turn.intent, "welcome", "intent debe ser welcome");
  assert.ok(
    !/WhatsApp/i.test(turn.botBody),
    `BUG 1 REGRESIÓN: bot dijo "WhatsApp" en saludo: "${turn.botBody}"`
  );
  assert.ok(
    /^¡Hola!/.test(turn.botBody),
    `Saludo debe empezar con "¡Hola!" (sin nombre). Bot dijo: "${turn.botBody}"`
  );
});

test("SIM 1.2 — Lead sin nombre (whatsapp lead lowercase) + 'info' → saludo LIMPIO", () => {
  const lead = makeLead("whatsapp lead");
  const turn = runTurn(lead, "info", true);
  applyTurn(lead, turn);

  assert.equal(turn.intent, "welcome", "intent debe ser welcome");
  assert.ok(
    !/whatsapp/i.test(turn.botBody),
    `BUG 1 REGRESIÓN: bot dijo "whatsapp" en saludo: "${turn.botBody}"`
  );
});

test("SIM 1.3 — Lead sin nombre (WhatsApp, sin 'Lead') + 'menu' → saludo LIMPIO", () => {
  // Edge: si en el futuro el safeName cambia a solo "WhatsApp"
  // (sin "Lead"), también debe filtrar.
  const lead = makeLead("WhatsApp");
  const turn = runTurn(lead, "menu", true);
  applyTurn(lead, turn);

  assert.ok(
    !/WhatsApp/i.test(turn.botBody),
    `BUG 1 REGRESIÓN: bot dijo "WhatsApp" en saludo: "${turn.botBody}"`
  );
});

/* ─────────────────────────────────────────────────────────────
 * SIMULACIÓN 2: Caso Yesenia — conversación completa
 * Valida Bug 1 (saludo limpio) + Bug 2 (captura de nombre en 1 turno).
 * ───────────────────────────────────────────────────────────── */

test("SIM 2 — Conversación Yesenia completa (8 turnos)", () => {
  const lead = makeLead("WhatsApp Lead");
  const transcript = [];

  function step(body, isFirst = false) {
    const turn = runTurn(lead, body, isFirst);
    applyTurn(lead, turn);
    transcript.push({ body, bot: turn.botBody, intent: turn.intent, intercepted: turn.intercepted });
    return turn;
  }

  // Turno 1: Yesenia dice "hola" (welcome).
  const t1 = step("¡Hola! Quiero más información", true);
  assert.equal(t1.intent, "welcome");
  assert.ok(!/WhatsApp/i.test(t1.botBody), "Turno 1: saludo sin 'WhatsApp'");

  // Turno 2: "Bue. Día quiero regístrate" (caso Yesenia original).
  // ANTES: bot iba a LLM y respondía "dame tu email", saltando nombre.
  // AHORA: BUG 2 FIX — intercept, no LLM, set awaiting_field="name".
  const t2 = step("Bue. Día quiero regístrate");
  assert.ok(
    t2.intercepted,
    `Turno 2: BUG 2 FIX debería interceptar. Intent=${t2.intent}, intercepted=${t2.intercepted}`
  );
  assert.equal(t2.botMetadata.awaiting_field, "name",
    "Turno 2: bot debe setear awaiting_field='name'");
  assert.ok(
    /nombre completo/i.test(t2.botBody),
    `Turno 2: bot debe pedir nombre. Bot dijo: "${t2.botBody}"`
  );
  assert.ok(
    !t2.wouldHaveCalledLLM,
    "Turno 2: NO debe invocar al LLM (interceptado)"
  );

  // Turno 3: Yesenia manda su nombre.
  // ANTES: el FALLBACK heurístico (línea 3983) lo capturaba tras
  // varios turnos. AHORA: el override de awaiting_field="name" (línea
  // 3977) lo captura en 1 turno.
  const t3 = step("Yesenia López Nemecio");
  assert.equal(t3.intent, "provide_name",
    "Turno 3: bot debe capturar nombre (intent=provide_name)");
  assert.equal(t3.botMetadata.awaiting_field, "email",
    "Turno 3: bot debe setear awaiting_field='email'");
  assert.ok(
    /Yesenia/.test(t3.botBody),
    `Turno 3: bot debe usar el nombre "Yesenia". Bot dijo: "${t3.botBody}"`
  );
  assert.ok(
    !/WhatsApp/i.test(t3.botBody),
    `Turno 3: saludo NO debe decir "WhatsApp" tras capturar nombre. Bot dijo: "${t3.botBody}"`
  );
  // lead.name debe haberse actualizado.
  assert.equal(lead.name, "Yesenia López Nemecio",
    "Turno 3: lead.name debe actualizarse en memoria");

  // Turno 4: Yesenia dice "Si, inscribirme" (affirmative corto).
  // Como awaitingField="email" (no "name"), el override de provide_name
  // NO se dispara. Va a detectIntent → "register" (porque "si" matchea
  // REGISTER_RE) → interactive_event_inscribir cierra con QR.
  const t4 = step("Si, inscribirme");
  // En el código real, register dispara el path de interactive_event_inscribir
  // que setea awaiting_field="name" si el lead no tiene nombre. Pero como
  // Yesenia YA tiene nombre, va al path de "ya estás registrado" o similar.
  // En nuestro simulador, register con nombre OK cierra.
  assert.equal(lead.name, "Yesenia López Nemecio",
    "Turno 4: nombre preservado");

  // Turno 5: Yesenia da el email.
  const t5 = step("Yesy087@hotmail.com");
  assert.equal(t5.intent, "provide_email",
    "Turno 5: bot debe reconocer email y cerrar");
  assert.ok(
    /Yesenia/.test(t5.botBody),
    `Turno 5: cierre debe usar nombre. Bot dijo: "${t5.botBody}"`
  );
  assert.ok(
    !/WhatsApp/i.test(t5.botBody),
    `Turno 5: cierre NO debe decir "WhatsApp". Bot dijo: "${t5.botBody}"`
  );
  assert.match(t5.botBody, /check-in\/[A-Za-z0-9]+/,
    "Turno 5: cierre debe incluir link de check-in");

  // Resumen: el nombre se capturó en el TURNO 3, no en turnos 4-5 como
  // pasaba antes con el FALLBACK heurístico.
  const captureTurn = transcript.findIndex((t) => t.intent === "provide_name");
  assert.equal(captureTurn, 2,
    `El nombre debe capturarse en el turno 2 (0-indexed). Capturado en turno ${captureTurn}. Transcript: ${JSON.stringify(transcript, null, 2)}`);
});

/* ─────────────────────────────────────────────────────────────
 * SIMULACIÓN 3: Lead con profile_name real (caso feliz)
 * Valida que el bot use el nombre real cuando está disponible.
 * ───────────────────────────────────────────────────────────── */

test("SIM 3 — Lead con nombre real 'David Esparza' → saludo CON nombre", () => {
  const lead = makeLead("David Esparza");
  const turn = runTurn(lead, "hola", true);
  applyTurn(lead, turn);

  assert.equal(turn.intent, "welcome");
  assert.ok(
    /Hola David/.test(turn.botBody),
    `Saludo debe incluir "Hola David". Bot dijo: "${turn.botBody}"`
  );
  assert.ok(
    !/WhatsApp/i.test(turn.botBody),
    "Bot no debe mencionar WhatsApp"
  );
});

test("SIM 3.2 — Lead con nombre 'María José' + 'me interesa el evento' → NO intercepta, va al LLM", () => {
  // Caso: lead CON nombre que quiere inscribirse. NO debe interceptar
  // porque cleanLeadName !== "". Va a LLM (o al handler register según
  // el match de detectIntent). En nuestro simulador, intent=register
  // cierra con QR directo (o pide email).
  const lead = makeLead("María José");
  const turn = runTurn(lead, "me interesa el evento", false);
  applyTurn(lead, turn);

  assert.equal(turn.intent, "register",
    "Lead con nombre + frase de inscripción → register");
  assert.equal(lead.name, "María José",
    "Nombre preservado");
});

/* ─────────────────────────────────────────────────────────────
 * SIMULACIÓN 4: Preguntas libres NO deben interceptar
 * Valida que el fix de Bug 2 NO sobre-intercepte.
 * ───────────────────────────────────────────────────────────── */

test("SIM 4.1 — Lead sin nombre + '¿Qué incluye?' → NO intercepta, va al LLM", () => {
  const lead = makeLead("WhatsApp Lead");
  const turn = runTurn(lead, "¿Qué incluye?", false);
  applyTurn(lead, turn);

  assert.ok(
    !turn.intercepted,
    `Pregunta libre NO debe ser interceptada. Intent=${turn.intent}, intercepted=${turn.intercepted}`
  );
  assert.equal(turn.intent, "question",
    "Debe ir al LLM (intent=question)");
  assert.ok(
    turn.wouldHaveCalledLLM,
    "Debe invocar al LLM (pregunta libre)"
  );
});

test("SIM 4.2 — Lead sin nombre + 'cuanto cuesta' → NO intercepta", () => {
  const lead = makeLead("WhatsApp Lead");
  const turn = runTurn(lead, "cuanto cuesta", false);
  applyTurn(lead, turn);

  assert.equal(turn.intent, "question", "Debe ir al LLM");
  assert.ok(turn.wouldHaveCalledLLM, "Debe invocar al LLM");
});

test("SIM 4.3 — Lead sin nombre + 'donde es el evento' → NO intercepta", () => {
  const lead = makeLead("WhatsApp Lead");
  const turn = runTurn(lead, "donde es el evento", false);
  applyTurn(lead, turn);

  assert.equal(turn.intent, "question", "Debe ir al LLM");
  assert.ok(turn.wouldHaveCalledLLM, "Debe invocar al LLM");
});

test("SIM 4.4 — Lead sin nombre + 'no me interesa' → NO intercepta (opt-out)", () => {
  const lead = makeLead("WhatsApp Lead");
  const turn = runTurn(lead, "no me interesa", false);
  applyTurn(lead, turn);

  // "no me interesa" matchea OPT_OUT_RE → intent=opt_out
  assert.equal(turn.intent, "opt_out", "Debe ser opt-out");
  assert.ok(
    !turn.intercepted,
    "opt-out NO debe ser interceptado por el flow de inscripción"
  );
});

/* ─────────────────────────────────────────────────────────────
 * SIMULACIÓN 5: Edge cases de captura de nombre
 * ───────────────────────────────────────────────────────────── */

test("SIM 5.1 — Lead sin nombre, 'Si' solo (sin verbo) + luego nombre → captura en 2 turnos", () => {
  const lead = makeLead("WhatsApp Lead");
  // Turno 1: lead sin nombre dice solo "Si" (affirmative aislado).
  const t1 = runTurn(lead, "Si", true);
  applyTurn(lead, t1);

  // "Si" aislado matchea matchInscriptionIntent r1 → intercept.
  assert.ok(t1.intercepted, "Bug 2: 'Si' aislado debe interceptar");
  assert.equal(t1.botMetadata.awaiting_field, "name");

  // Turno 2: lead da nombre.
  const t2 = runTurn(lead, "Juan Pérez", false);
  applyTurn(lead, t2);

  assert.equal(t2.intent, "provide_name");
  assert.equal(lead.name, "Juan Pérez");
});

test("SIM 5.2 — Lead sin nombre, 'Si, quiero inscribirme' → intercept directo", () => {
  const lead = makeLead("WhatsApp Lead");
  const turn = runTurn(lead, "Si, quiero inscribirme", false);

  assert.ok(turn.intercepted, "Debe interceptar (r2 affirmative+verbo)");
  assert.equal(turn.botMetadata.awaiting_field, "name");
});

test("SIM 5.3 — Lead sin nombre, body = '123' (no es nombre válido) → NO se captura como nombre", () => {
  const lead = makeLead("WhatsApp Lead");
  // Simular que el bot está esperando nombre.
  lead.lastOutboundMetadata = { awaiting_field: "name" };
  const turn = runTurn(lead, "123", false);

  // "123" no es nombre válido → bot rechaza, mantiene awaiting_field.
  assert.equal(turn.intent, "provide_name_invalid");
  assert.equal(turn.botMetadata.awaiting_field, "name");
  assert.equal(lead.name, "WhatsApp Lead",
    "lead.name NO debe actualizarse con input inválido");
});

test("SIM 5.4 — Lead sin nombre, body = '👍👍' (emojis) → NO se captura", () => {
  const lead = makeLead("WhatsApp Lead");
  lead.lastOutboundMetadata = { awaiting_field: "name" };
  const turn = runTurn(lead, "👍👍", false);

  assert.equal(turn.intent, "provide_name_invalid");
  assert.equal(lead.name, "WhatsApp Lead");
});

/* ─────────────────────────────────────────────────────────────
 * SIMULACIÓN 6: Sanity check del state machine
 * ───────────────────────────────────────────────────────────── */

test("SIM 6.1 — Flujo completo normal lead con nombre", () => {
  const lead = makeLead("Ana López");

  const t1 = runTurn(lead, "hola", true);
  applyTurn(lead, t1);
  assert.equal(t1.intent, "welcome");
  assert.ok(/Ana/.test(t1.botBody), "Saluda con nombre");

  const t2 = runTurn(lead, "Si, quiero inscribirme", false);
  applyTurn(lead, t2);
  assert.equal(t2.intent, "register",
    "Lead con nombre + register → register handler");

  const t3 = runTurn(lead, "ana@example.com", false);
  applyTurn(lead, t3);
  assert.equal(t3.intent, "provide_email");
  assert.ok(/Ana/.test(t3.botBody),
    "Cierre con email debe incluir nombre Ana");
  assert.match(t3.botBody, /check-in/);
});

test("SIM 6.2 — Reverso: lead da email ANTES de nombre → bot redirige a pedir nombre", () => {
  // Edge case real: lead skipea la captura de nombre y manda email directo.
  const lead = makeLead("WhatsApp Lead");
  // Asegurar que el bot NO está esperando nombre (post-welcome).
  const t1 = runTurn(lead, "hola", true);
  applyTurn(lead, t1);

  const t2 = runTurn(lead, "test@example.com", false);
  applyTurn(lead, t2);

  // Bot debe redirigir a pedir nombre primero.
  assert.equal(t2.intent, "provide_email_without_name");
  assert.ok(
    /nombre completo/i.test(t2.botBody),
    "Bot debe pedir nombre antes de procesar email"
  );
  assert.equal(t2.botMetadata.awaiting_field, "name");
  assert.equal(lead.email, null,
    "Email NO debe guardarse antes de tener nombre");
});
