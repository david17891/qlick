/**
 * Tests del fix "bot no debe repetir saludo cuando hay historial" (2026-07-02).
 *
 * Cubre:
 *   1. buildSystemPrompt(isFirstMessage=true) instruye saludar.
 *   2. buildSystemPrompt(isFirstMessage=false) instruye NO saludar.
 *   3. buildTaskPrompt con historial inyecta recordatorio crítico.
 *   4. buildTaskPrompt sin historial NO inyecta recordatorio.
 *
 * El safety net post-process (en bot-engine.ts) es el último recurso y se
 * prueba end-to-end con mocks del provider (no acá).
 *
 * Patrón: `node --test`, sin libs externas.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @ts-check

// Imports del código fuente (vía type-stripping de Node).
import {
  buildSystemPrompt,
  buildTaskPrompt
} from "../src/lib/ai/agent-prompts.ts";

/* ─────────────────────────────────────────────────────────────
 * Helper: perfil mínimo para tests
 * ───────────────────────────────────────────────────────────── */

const TEST_PROFILE = {
  name: "Qlick Bot",
  businessName: "Qlick Marketing Integral",
  businessDescription: "Cursos de marketing aplicado.",
  businessHours: "Lun-Vie 9-18",
  tone: "cercano",
  servicesOrCourses: ["Marketing Básico", "IA para Marketing"],
  allowedActions: ["responder preguntas"],
  forbiddenActions: ["confirmar pagos"],
  escalationRules: ["si el usuario pide humano"],
  fallbackMessage: "Un asesor te contacta pronto."
};

/* ─────────────────────────────────────────────────────────────
 * 1. buildSystemPrompt con isFirstMessage
 * ───────────────────────────────────────────────────────────── */

test("buildSystemPrompt(isFirstMessage=true) instruye saludar", () => {
  const prompt = buildSystemPrompt(TEST_PROFILE, undefined, true);
  assert.match(prompt, /Saluda al lead/i);
  // NO debe tener la regla de "NO es el primer mensaje"
  assert.doesNotMatch(prompt, /NO es el primer mensaje/);
});

test("buildSystemPrompt(isFirstMessage=false) instruye NO saludar", () => {
  const prompt = buildSystemPrompt(TEST_PROFILE, undefined, false);
  assert.match(prompt, /NO es el primer mensaje/);
  assert.match(prompt, /NUNCA con saludo/);
  // NO debe tener la regla de "Saluda al lead"
  assert.doesNotMatch(prompt, /Saluda al lead por su nombre/);
});

test("buildSystemPrompt default (sin isFirstMessage) asume primer mensaje", () => {
  const prompt = buildSystemPrompt(TEST_PROFILE);
  assert.match(prompt, /Saluda al lead/i);
  assert.doesNotMatch(prompt, /NO es el primer mensaje/);
});

/* ─────────────────────────────────────────────────────────────
 * 2. buildTaskPrompt con/sin historial
 * ───────────────────────────────────────────────────────────── */

test("buildTaskPrompt con historial inyecta el bloque + recordatorio", () => {
  const taskPrompt = buildTaskPrompt("suggest_reply", {
    leadName: "Ana",
    lastIncomingMessage: "¿Cuál es el costo?",
    conversationWindow: {
      messages: [
        { direction: "inbound", body: "Hola", timestamp: "10:00" },
        { direction: "outbound", body: "Hola, ¿en qué te ayudo?", timestamp: "10:01" }
      ],
      promptBlock: "[10:00] Ana: Hola\n[10:01] Bot: Hola, ¿en qué te ayudo?"
    }
  });
  // Contiene el historial
  assert.match(taskPrompt, /Hola, ¿en qué te ayudo\?/);
  // Contiene el recordatorio crítico
  assert.match(taskPrompt, /RECORDATORIO/);
  assert.match(taskPrompt, /NO repitas saludo/);
});

test("buildTaskPrompt sin historial NO inyecta el recordatorio", () => {
  const taskPrompt = buildTaskPrompt("suggest_reply", {
    leadName: "Ana",
    lastIncomingMessage: "Hola",
    conversationWindow: { messages: [], promptBlock: "" }
  });
  // NO contiene el recordatorio crítico
  assert.doesNotMatch(taskPrompt, /RECORDATORIO/);
  assert.doesNotMatch(taskPrompt, /NO repitas saludo/);
});

test("buildTaskPrompt sin conversationWindow tampoco inyecta recordatorio", () => {
  const taskPrompt = buildTaskPrompt("suggest_reply", {
    leadName: "Ana",
    lastIncomingMessage: "Hola"
    // conversationWindow undefined
  });
  assert.doesNotMatch(taskPrompt, /RECORDATORIO/);
});
