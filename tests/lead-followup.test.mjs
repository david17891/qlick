import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildLeadFollowupBody,
  decideLeadFollowup,
  getNextLeadFollowupAt,
  normalizeLeadFollowupMode,
} from "../src/lib/whatsapp/lead-followup.ts";

const now = new Date("2026-07-30T18:00:00.000Z");
const openInbound = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
const due = new Date(now.getTime() - 60 * 1000).toISOString();

function base(overrides = {}) {
  return {
    name: "Ana Pérez",
    status: "interested",
    intent: "enroll_course",
    tags: ["registration:incomplete"],
    consentToContact: true,
    botPaused: false,
    nextFollowUpAt: due,
    lastInboundAt: openInbound,
    lastMessageDirection: "outbound",
    lastOutboundManual: false,
    awaitingField: "email",
    sentCountInWindow: 0,
    now,
    ...overrides,
  };
}

test("followup: elegible solo para registro incompleto con ventana abierta", () => {
  const result = decideLeadFollowup(base());
  assert.equal(result.eligible, true);
  assert.equal(result.stage, "registration_incomplete");
  assert.equal(result.followupNumber, 1);
  assert.match(result.body ?? "", /Ana/);
  assert.match(result.body ?? "", /correo/);
  assert.ok((result.body ?? "").length < 180);
});

test("followup: pago pendiente usa copy corto", () => {
  const result = decideLeadFollowup(
    base({ status: "payment_pending", intent: "payment_help", tags: ["registration:payment_pending"] }),
  );
  assert.equal(result.eligible, true);
  assert.equal(result.stage, "payment_pending");
  assert.match(result.body ?? "", /pago/);
});

test("followup: saludo o información no se convierte en seguimiento comercial", () => {
  const result = decideLeadFollowup(
    base({ status: "info_requested", intent: "course_information", tags: ["conversation:info_requested"] }),
  );
  assert.equal(result.eligible, false);
  assert.equal(result.reason, "not_a_followup_stage");
});

test("followup: no envía sin consentimiento explícito", () => {
  const result = decideLeadFollowup(base({ consentToContact: false }));
  assert.equal(result.eligible, false);
  assert.equal(result.reason, "consent_missing");
});

test("followup: no envía cuando la ventana de 24 horas está cerrada", () => {
  const oldInbound = new Date(now.getTime() - 25 * 60 * 60 * 1000).toISOString();
  const result = decideLeadFollowup(base({ lastInboundAt: oldInbound }));
  assert.equal(result.eligible, false);
  assert.equal(result.reason, "window_closed");
});

test("followup: no duplica una respuesta pendiente del lead", () => {
  const result = decideLeadFollowup(base({ lastMessageDirection: "inbound" }));
  assert.equal(result.eligible, false);
  assert.equal(result.reason, "lead_needs_bot_reply");
});

test("followup: una respuesta manual detiene la automatización", () => {
  const result = decideLeadFollowup(base({ lastOutboundManual: true }));
  assert.equal(result.eligible, false);
  assert.equal(result.reason, "manual_reply_pending");
});

test("followup: máximo de dos intentos por ventana", () => {
  const result = decideLeadFollowup(base({ sentCountInWindow: 2 }));
  assert.equal(result.eligible, false);
  assert.equal(result.reason, "max_attempts_reached");
});

test("followup: no programa el segundo intento después del cierre de ventana", () => {
  const openUntil = new Date(now.getTime() + 30 * 60 * 1000).toISOString();
  assert.equal(getNextLeadFollowupAt("registration_incomplete", 1, now, openUntil), null);
});

test("followup: modo inválido o ausente queda en off", () => {
  assert.equal(normalizeLeadFollowupMode(undefined), "off");
  assert.equal(normalizeLeadFollowupMode("live"), "live");
  assert.equal(normalizeLeadFollowupMode("anything"), "off");
});

test("followup: el copy de segundo intento no es idéntico al primero", () => {
  const first = buildLeadFollowupBody("registration_incomplete", "Ana Pérez", 1, "name");
  const second = buildLeadFollowupBody("registration_incomplete", "Ana Pérez", 2, "name");
  assert.notEqual(first, second);
  assert.match(second, /inscripción/);
});
