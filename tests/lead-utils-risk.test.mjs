/**
 * Tests de calculateLeadResponseRisk + constantes de etiqueta/tono
 * de leads. Ver src/lib/crm/lead-utils.ts.
 *
 * calculateLeadResponseRisk es la heurística que muestra badges en el
 * panel CRM (Bajo/Medio/Alto). Si rompe, David no ve qué lead está
 * por perderse.
 *
 * Patrón: node --test, sin libs externas.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  calculateLeadResponseRisk,
  leadStatusLabel,
  leadSourceLabel,
  leadIntentLabel,
  statusTone,
  qualificationLabel,
  qualificationTone,
  riskTone,
  riskLabel
} from "../src/lib/crm/lead-utils.ts";

/* ─────────────────────────────────────────────────────────────
 * 1. Etiquetas legibles (es-MX)
 * ───────────────────────────────────────────────────────────── */

test("leadStatusLabel: cubre los 12 estados del pipeline", () => {
  const expected = {
    new: "Nuevo",
    contacted: "Contactado",
    interested: "Interesado",
    info_requested: "Info solicitada",
    payment_pending: "Pago pendiente",
    enrolled: "Inscrito",
    active_student: "Alumno activo",
    event_attended: "Asistió al evento",
    survey_completed: "Encuesta completada",
    lost: "Perdido",
    archived: "Archivado",
    qualified: "Calificado"
  };
  for (const [k, v] of Object.entries(expected)) {
    assert.equal(leadStatusLabel[k], v, `leadStatusLabel.${k} mal`);
  }
});

test("leadSourceLabel: incluye los 9 canales del demo", () => {
  assert.equal(leadSourceLabel.whatsapp, "WhatsApp");
  assert.equal(leadSourceLabel.facebook_ads, "Facebook Ads");
  assert.equal(leadSourceLabel.instagram_ads, "Instagram Ads");
  assert.equal(leadSourceLabel.organic, "Orgánico");
  assert.equal(leadSourceLabel.other, "Otro");
});

test("leadIntentLabel: incluye los 9 intents", () => {
  assert.equal(leadIntentLabel.course_information, "Info de curso");
  assert.equal(leadIntentLabel.enroll_course, "Inscripción");
  assert.equal(leadIntentLabel.pricing, "Precio");
  assert.equal(leadIntentLabel.unknown, "Sin intención clara");
});

/* ─────────────────────────────────────────────────────────────
 * 2. Tonos (para badges)
 * ───────────────────────────────────────────────────────────── */

test("statusTone: etapas terminales (lost/archived) son danger/neutral", () => {
  assert.equal(statusTone.lost, "danger");
  assert.equal(statusTone.archived, "neutral");
});

test("statusTone: etapas ganadoras son success", () => {
  assert.equal(statusTone.enrolled, "success");
  assert.equal(statusTone.active_student, "success");
  assert.equal(statusTone.event_attended, "success");
  assert.equal(statusTone.survey_completed, "success");
});

test("qualificationTone: cold/warm/hot/mql mapean a neutral/warning/accent/success", () => {
  assert.equal(qualificationTone.cold, "neutral");
  assert.equal(qualificationTone.warm, "warning");
  assert.equal(qualificationTone.hot, "accent");
  assert.equal(qualificationTone.mql, "success");
});

test("riskTone + riskLabel: low/medium/high", () => {
  assert.equal(riskTone.low, "success");
  assert.equal(riskTone.medium, "warning");
  assert.equal(riskTone.high, "danger");
  assert.equal(riskLabel.low, "Bajo");
  assert.equal(riskLabel.medium, "Medio");
  assert.equal(riskLabel.high, "Alto");
});

/* ─────────────────────────────────────────────────────────────
 * 3. calculateLeadResponseRisk
 * ───────────────────────────────────────────────────────────── */

/** Helper para construir un Lead mínimo (sólo los campos que la fn usa). */
function makeLead(overrides = {}) {
  return {
    id: "lead-1",
    name: "Test",
    email: "t@example.com",
    status: "new",
    source: "whatsapp",
    intent: "unknown",
    ownerId: "owner-1",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    consentToContact: true,
    ...overrides
  };
}

test("calculateLeadResponseRisk: lead recién llegado sin riesgos = low (score 15)", () => {
  const risk = calculateLeadResponseRisk(makeLead({ status: "new" }));
  assert.equal(risk.level, "low");
  assert.equal(risk.score, 15);
  assert.deepEqual(risk.reasons, ["Recién llegado, sin contacto aún"]);
});

test("calculateLeadResponseRisk: sin owner + sin consent = high (60)", () => {
  const risk = calculateLeadResponseRisk(
    makeLead({ status: "new", ownerId: undefined, consentToContact: false })
  );
  // 25 (sin owner) + 20 (sin consent) + 15 (new) = 60 -> high
  assert.equal(risk.score, 60);
  assert.equal(risk.level, "high");
  assert.ok(risk.reasons.includes("Sin responsable asignado"));
  assert.ok(risk.reasons.includes("Sin consentimiento de contacto"));
});

test("calculateLeadResponseRisk: payment_pending sin resolver dispara high", () => {
  const risk = calculateLeadResponseRisk(
    makeLead({
      status: "payment_pending",
      ownerId: "owner-1",
      consentToContact: true
    })
  );
  // 35 (payment_pending)
  assert.equal(risk.score, 35);
  assert.equal(risk.level, "medium"); // 35 no llega a 60
  assert.ok(risk.reasons.includes("Pago pendiente sin resolver"));
});

test("calculateLeadResponseRisk: nextFollowUpAt vencido suma 25", () => {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const risk = calculateLeadResponseRisk(
    makeLead({
      status: "new",
      nextFollowUpAt: yesterday
    })
  );
  // 15 (new) + 25 (vencido) = 40 → medium
  assert.equal(risk.score, 40);
  assert.equal(risk.level, "medium");
  assert.ok(risk.reasons.includes("Seguimiento vencido"));
});

test("calculateLeadResponseRisk: nextFollowUpAt futuro no suma", () => {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const risk = calculateLeadResponseRisk(
    makeLead({
      status: "new",
      nextFollowUpAt: tomorrow
    })
  );
  assert.equal(risk.score, 15);
  assert.equal(risk.level, "low");
});

test("calculateLeadResponseRisk: tormenta perfecta = high (>=60)", () => {
  // sin owner (25) + sin consent (20) + payment_pending (35) + vencido (25) = 105 -> 100
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const risk = calculateLeadResponseRisk(
    makeLead({
      status: "payment_pending",
      ownerId: undefined,
      consentToContact: false,
      nextFollowUpAt: yesterday
    })
  );
  assert.equal(risk.score, 100); // clamped
  assert.equal(risk.level, "high");
});

test("calculateLeadResponseRisk: score se clampa a 100 maximo", () => {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const risk = calculateLeadResponseRisk(
    makeLead({
      status: "payment_pending",
      ownerId: undefined,
      consentToContact: false,
      nextFollowUpAt: yesterday
    })
  );
  assert.ok(risk.score <= 100);
});

test("calculateLeadResponseRisk: interested suma 20", () => {
  const risk = calculateLeadResponseRisk(
    makeLead({
      status: "interested",
      ownerId: "owner-1",
      consentToContact: true
    })
  );
  assert.equal(risk.score, 20);
  assert.equal(risk.level, "low"); // 20 no llega a 30
  assert.ok(risk.reasons.includes("Lead caliente que puede enfriarse"));
});

test("calculateLeadResponseRisk: lead estable sin razones da mensaje default", () => {
  // status que no acumula nada + con owner + con consent + sin follow-up
  const risk = calculateLeadResponseRisk(
    makeLead({
      status: "contacted",
      ownerId: "owner-1",
      consentToContact: true
    })
  );
  assert.equal(risk.score, 0);
  assert.equal(risk.level, "low");
  assert.deepEqual(risk.reasons, ["Sin señales de riesgo"]);
});
