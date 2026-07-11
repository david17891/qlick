/**
 * Tests del agente demo (getAgentReplyTemplate, describeIntent).
 * Ver src/lib/crm/agent-utils.ts.
 *
 * Estas funciones devuelven texto pre-escrito para que David lo revise
 * antes de mandarlo por WhatsApp manual. Si rompen, el panel CRM
 * muestra copy en blanco o mal.
 *
 * Patrón: node --test, sin libs externas.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  getAgentReplyTemplate,
  describeIntent
} from "../src/lib/crm/agent-utils.ts";

function makeLead(overrides = {}) {
  return {
    name: "David Martínez",
    courseOfInterest: "Marketing Digital",
    ...overrides
  };
}

/* ─────────────────────────────────────────────────────────────
 * 1. getAgentReplyTemplate
 * ───────────────────────────────────────────────────────────── */

test("getAgentReplyTemplate: course_information usa nombre + curso", () => {
  const msg = getAgentReplyTemplate("course_information", makeLead());
  assert.ok(msg.includes("David"), "debe usar el nombre del lead");
  assert.ok(msg.includes("Marketing Digital"), "debe mencionar el curso");
  assert.ok(msg.startsWith("Hola David"), "debe empezar con saludo personalizado");
});

test("getAgentReplyTemplate: name con espacios toma solo el primer token", () => {
  // "David Martínez" -> "David"
  const msg = getAgentReplyTemplate("course_information", makeLead({ name: "David Martínez" }));
  assert.ok(msg.startsWith("Hola David"));
  assert.ok(!msg.startsWith("Hola David Martínez"));
});

test("getAgentReplyTemplate: enroll_course pide confirmacion", () => {
  const msg = getAgentReplyTemplate("enroll_course", makeLead());
  assert.ok(msg.includes("Marketing Digital"));
  assert.ok(msg.includes("Confirmas"), "debe pedir confirmacion del curso");
});

test("getAgentReplyTemplate: pricing menciona formas de pago MX", () => {
  const msg = getAgentReplyTemplate("pricing", makeLead());
  assert.ok(msg.includes("Marketing Digital"));
  // Palabras clave: tarjeta, transferencia, OXXO (cubre audiencia MX)
  assert.ok(msg.toLowerCase().includes("tarjeta") || msg.toLowerCase().includes("transferencia"));
  assert.ok(msg.includes("OXXO"));
});

test("getAgentReplyTemplate: payment_help pregunta donde se atoro", () => {
  const msg = getAgentReplyTemplate("payment_help", makeLead());
  assert.ok(msg.includes("David"));
  assert.ok(msg.includes("pago"), "debe mencionar el pago");
  assert.ok(msg.includes("?") || msg.includes("Cuál"), "debe hacer una pregunta");
});

test("getAgentReplyTemplate: support pide descripcion del problema", () => {
  const msg = getAgentReplyTemplate("support", makeLead());
  assert.ok(msg.includes("David"));
  // El template dice: "Cuéntame qué pasa con tu acceso a la plataforma"
  assert.ok(msg.toLowerCase().includes("plataforma") || msg.toLowerCase().includes("acceso"));
});

test("getAgentReplyTemplate: schedule_call ofrece agendar", () => {
  const msg = getAgentReplyTemplate("schedule_call", makeLead());
  assert.ok(msg.includes("David"));
  assert.ok(msg.toLowerCase().includes("llamada") || msg.toLowerCase().includes("agenda"));
  assert.ok(msg.includes("?") || msg.toLowerCase().includes("horario"));
});

test("getAgentReplyTemplate: course_recommendation recomienda curso", () => {
  const msg = getAgentReplyTemplate("course_recommendation", makeLead());
  assert.ok(msg.includes("Marketing Digital"));
  assert.ok(msg.toLowerCase().includes("recomiend"));
});

test("getAgentReplyTemplate: group_access pide confirmar inscripcion", () => {
  const msg = getAgentReplyTemplate("group_access", makeLead());
  assert.ok(msg.toLowerCase().includes("grupo"));
  assert.ok(msg.toLowerCase().includes("inscrit"));
});

test("getAgentReplyTemplate: unknown es fallback generico", () => {
  const msg = getAgentReplyTemplate("unknown", makeLead());
  assert.ok(msg.includes("David"));
  assert.ok(msg.toLowerCase().includes("qlick"));
  assert.ok(msg.includes("?") || msg.toLowerCase().includes("ayud"));
});

test("getAgentReplyTemplate: sin course usa default", () => {
  const msg = getAgentReplyTemplate("course_information", makeLead({ courseOfInterest: undefined }));
  assert.ok(msg.includes("los cursos de Qlick"));
});

/* ─────────────────────────────────────────────────────────────
 * 2. describeIntent
 * ───────────────────────────────────────────────────────────── */

test("describeIntent: course_information -> 'Intencion detectada: info de curso.'", () => {
  assert.equal(
    describeIntent("course_information"),
    "Intención detectada: info de curso."
  );
});

test("describeIntent: pricing -> 'Intencion detectada: precio.'", () => {
  assert.equal(
    describeIntent("pricing"),
    "Intención detectada: precio."
  );
});

test("describeIntent: unknown -> 'Intencion detectada: sin intencion clara.'", () => {
  assert.equal(
    describeIntent("unknown"),
    "Intención detectada: sin intención clara."
  );
});
