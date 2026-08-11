import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildSafeReply,
  hasInternalReasoningLeak,
  isVerifiedNameCandidate,
  redactForModel,
  trustedLeadName,
  validateBotDecision,
  validateGeneratedReply,
} from "../src/lib/whatsapp/bot-quality.ts";

test("nombres: rechaza ubicación, paquete y placeholders", () => {
  assert.equal(isVerifiedNameCandidate("En Mexicali"), false);
  assert.equal(isVerifiedNameCandidate("Paquete Premium"), false);
  assert.equal(isVerifiedNameCandidate("WhatsApp Lead"), false);
  assert.equal(isVerifiedNameCandidate("María Fernanda"), true);
  assert.equal(trustedLeadName("María Fernanda", ["name:user_verified"]), "María Fernanda");
  assert.equal(trustedLeadName("María Fernanda", []), "");
});

test("razonamiento: bloquea etiquetas y pensamientos en el mismo párrafo", () => {
  assert.equal(hasInternalReasoningLeak("<think>debo responder</think> Hola"), true);
  assert.equal(hasInternalReasoningLeak("Hola. El lead escribió que quiere pagar."), true);
  assert.equal(validateGeneratedReply("Hola. Voy a aplicar la regla y después te ayudo").ok, false);
});

test("evento pagado: nunca confirma antes del pago", () => {
  const result = validateGeneratedReply("Tu registro está confirmado y aquí tienes tu QR", {
    isPaidEvent: true,
    paymentPending: true,
    hasVerifiedPayment: false,
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes("paid_event_claim_before_payment"));
});

test("decisión estructurada: esquema estricto y redacción segura", () => {
  const parsed = validateBotDecision({
    domain: "event",
    intent: "question",
    confidence: 0.95,
    entityCandidates: [],
    answerKey: "event_info",
    nextAction: "none",
    replyDraft: "¿Quieres información de la fecha?",
  });
  assert.equal(parsed.ok, true);
  assert.equal(validateBotDecision({ ...parsed.decision, thought: "secreto" }).ok, false);
  assert.match(buildSafeReply("event"), /evento/i);
});

test("modelo: seudonimiza PII antes del proveedor", () => {
  const safe = redactForModel("María maria@example.com +52 686 123 4567 https://privado.test");
  assert.doesNotMatch(safe, /maria@example.com|686 123 4567|privado\.test/i);
  assert.match(safe, /\[EMAIL\]|\[PHONE\]|\[URL\]/);
});
