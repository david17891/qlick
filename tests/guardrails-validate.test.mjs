/**
 * Tests unitarios de `validateAgentReply` (src/lib/ai/guardrails.ts).
 *
 * Cubre la lista FORBIDDEN_PHRASES actualizada el 2026-07-10
 * (FIX Sprint 2 hotfix David 03:40 AM): se eliminaron `descuento` y
 * `promocion` de la lista ciega porque el system prompt ya prohíbe esas
 * acciones via instrucción explícita al LLM.
 *
 * Patrón: `node --test`, sin libs externas.
 */

// @ts-check

import { test } from "node:test";
import assert from "node:assert/strict";

import { validateAgentReply } from "../src/lib/ai/guardrails.ts";

/* ─────────────────────────────────────────────────────────────
 * Frases prohibidas (aún vigentes) → validateAgentReply.ok = false
 * ───────────────────────────────────────────────────────────── */

test("bloquea 'confirmo tu pago' (regla fatal)", () => {
  const r = validateAgentReply("Perfecto, confirmo tu pago inmediato.");
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some((x) => /confirmo tu pago/i.test(x)));
});

test("bloquea 'pago aprobado' (regla fatal)", () => {
  const r = validateAgentReply("Tu pago aprobado, te di acceso.");
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some((x) => /pago aprobado/i.test(x)));
});

test("bloquea 'te di acceso' (regla fatal)", () => {
  const r = validateAgentReply("Listo, te di acceso al taller.");
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some((x) => /te di acceso/i.test(x)));
});

test("bloquea 'acceso listo' (regla fatal)", () => {
  const r = validateAgentReply("Acceso listo, entra al curso cuando quieras.");
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some((x) => /acceso listo/i.test(x)));
});

test("bloquea 'reembolso' (regla fatal de operación)", () => {
  const r = validateAgentReply("Procedo con tu reembolso de $500 MXN.");
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some((x) => /reembolso/i.test(x)));
});

test("bloquea 'gratis' (regla fatal sin contexto)", () => {
  // "gratis" sigue siendo prohibida: el LLM no debe ofrecer nada
  // gratis sin tener un evento free explícito en EVENTO ACTIVO.
  const r = validateAgentReply("El taller es gratis para todos.");
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some((x) => /gratis/i.test(x)));
});

/* ─────────────────────────────────────────────────────────────
 * FIX 2026-07-10: 'descuento' y 'promocion' YA NO son filtros ciegos.
 * El LLM puede responder con negaciones honestas.
 * ───────────────────────────────────────────────────────────── */

test("FIX 2026-07-10: 'no manejamos descuento' PASA (no bloqueado)", () => {
  // Caso real: LLM responde honestamente a "tienes descuento de
  // estudiantes?" con negación. Antes bloqueado por filtro ciego.
  // Ahora pasa (system prompt + revision humana son la red de seguridad).
  const r = validateAgentReply(
    "El taller tiene un precio único de preventa, no manejamos descuento de estudiantes."
  );
  assert.equal(r.ok, true, `reasons: ${r.reasons.join("; ")}`);
});

test("FIX 2026-07-10: 'no tenemos promoción' PASA (no bloqueado)", () => {
  const r = validateAgentReply(
    "Por el momento no tenemos promoción vigente para el taller."
  );
  assert.equal(r.ok, true, `reasons: ${r.reasons.join("; ")}`);
});

test("FIX 2026-07-10: 'sin descuento' PASA (no bloqueado)", () => {
  const r = validateAgentReply(
    "El precio del taller es sin descuento por ser preventa."
  );
  assert.equal(r.ok, true, `reasons: ${r.reasons.join("; ")}`);
});

test("FIX 2026-07-10: 'no hay descuento' PASA (no bloqueado)", () => {
  const r = validateAgentReply(
    "No hay descuento disponible para este taller en preventa."
  );
  assert.equal(r.ok, true, `reasons: ${r.reasons.join("; ")}`);
});

test("FIX 2026-07-10: 'descuento' suelto PASA (ya no es filtro)", () => {
  // El system prompt prohíbe que el LLM OFREZCA descuentos.
  // validateAgentReply ya NO bloquea la palabra "descuento" en
  // cualquier contexto. La red de seguridad es el prompt, no el filtro.
  const r = validateAgentReply("descuento");
  assert.equal(r.ok, true);
});

test("FIX 2026-07-10: 'promoción' suelta PASA (ya no es filtro)", () => {
  const r = validateAgentReply("promoción");
  assert.equal(r.ok, true);
});

test("FIX 2026-07-10: respuesta normal sobre el taller NO bloqueada", () => {
  const r = validateAgentReply(
    "El taller tiene 3 horas de duración y se imparte el 11 de julio a las 11:00 hrs."
  );
  assert.equal(r.ok, true);
});

/* ─────────────────────────────────────────────────────────────
 * Edge cases preservados
 * ───────────────────────────────────────────────────────────── */

test("string vacío: ok=true, sin razones", () => {
  const r = validateAgentReply("");
  assert.equal(r.ok, true);
  assert.deepEqual(r.reasons, []);
});

test("case-insensitive: bloquea 'GRATIS' en mayúsculas", () => {
  const r = validateAgentReply("El taller es GRATIS.");
  assert.equal(r.ok, false);
});

test("case-insensitive: bloquea 'Te Di Acceso' mixto", () => {
  const r = validateAgentReply("Listo, Te Di Acceso al curso.");
  assert.equal(r.ok, false);
});

test("múltiples reglas fatales: reasons incluye todas", () => {
  const r = validateAgentReply(
    "Confirmo tu pago aprobado. Te di acceso. Procedo con tu reembolso."
  );
  assert.equal(r.ok, false);
  assert.ok(r.reasons.length >= 3, `esperaba >=3 razones, got: ${r.reasons.length}`);
});
