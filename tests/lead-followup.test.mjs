import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildLeadFollowupBody,
  decideLeadFollowup,
  getPendingRegistrationField,
  getNextLeadFollowupAt,
  hasCompletedRegistrationSignal,
  getFreeEntryPointUntil,
  isInfoRescuePending,
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

test("followup: rescata una solicitud de información sin pedir consentimiento de marketing", () => {
  const result = decideLeadFollowup(
    base({
      status: "info_requested",
      intent: "course_information",
      tags: ["conversation:info_requested"],
      consentToContact: false,
    }),
  );
  assert.equal(result.eligible, true);
  assert.equal(result.stage, "info_requested");
  assert.equal(result.followupNumber, 1);
  assert.match(result.body ?? "", /inscribirte/);
  assert.match(result.body ?? "", /nombre y correo/);
});

test("followup: reconoce el rescate pendiente para enrutar una respuesta al cierre", () => {
  assert.equal(
    isInfoRescuePending([
      { direction: "outbound", metadata: { followup_stage: "info_requested", auto_sent_source: "lead_followup" } },
      { direction: "inbound", metadata: null },
    ]),
    true,
  );
  assert.equal(
    isInfoRescuePending([
      { direction: "outbound", metadata: { followup_stage: "info_requested", auto_sent_source: "lead_followup" } },
      { direction: "inbound", metadata: null },
      { direction: "outbound", metadata: { awaiting_field: "name" } },
    ]),
    false,
  );
});

test("followup: rescate de información se detiene después de un intento", () => {
  const result = decideLeadFollowup(
    base({
      status: "info_requested",
      intent: "course_information",
      tags: ["conversation:info_requested"],
      sentCountInWindow: 1,
    }),
  );
  assert.equal(result.eligible, false);
  assert.equal(result.reason, "max_attempts_reached");
});

test("followup: una entrada de campaña conserva la ventana ampliada de 72 horas", () => {
  const campaignInbound = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
  const campaignReply = new Date(now.getTime() - 47 * 60 * 60 * 1000).toISOString();
  const freeEntryPointUntil = getFreeEntryPointUntil([
    {
      direction: "inbound",
      created_at: campaignInbound,
      metadata: { referral: { sourceType: "ad" } },
    },
    { direction: "outbound", created_at: campaignReply, metadata: { auto_sent_source: "bot" } },
  ], now);

  assert.equal(freeEntryPointUntil, new Date(new Date(campaignInbound).getTime() + 72 * 60 * 60 * 1000).toISOString());
  const result = decideLeadFollowup(base({
    lastInboundAt: campaignInbound,
    freeEntryPointUntil,
  }));
  assert.equal(result.eligible, true);
});

test("followup: un lead sin señal de solicitud no se convierte en seguimiento", () => {
  const result = decideLeadFollowup(
    base({ status: "contacted", intent: "course_information", tags: ["conversation:first_contact"] }),
  );
  assert.equal(result.eligible, false);
  assert.equal(result.reason, "not_a_followup_stage");
});

test("followup: permite completar una inscripción sin consentimiento de marketing", () => {
  const result = decideLeadFollowup(base({ consentToContact: false }));
  assert.equal(result.eligible, true);
  assert.equal(result.reason, "eligible");
});

test("followup: pago pendiente no continúa después de entregar el registro y QR", () => {
  const result = decideLeadFollowup(
    base({
      status: "payment_pending",
      intent: "payment_help",
      tags: ["registration:payment_pending", "registration:complete"],
    }),
  );
  assert.equal(result.eligible, false);
  assert.equal(result.reason, "not_a_followup_stage");
  assert.equal(hasCompletedRegistrationSignal(["registration:complete"]), true);
});

test("followup: una marca de registro por evento también corta el pago", () => {
  const result = decideLeadFollowup(
    base({
      status: "payment_pending",
      intent: "payment_help",
      tags: ["registration:payment_pending", "event:las-4-patas:registration_complete"],
    }),
  );
  assert.equal(result.eligible, false);
  assert.equal(result.reason, "not_a_followup_stage");
  assert.equal(
    hasCompletedRegistrationSignal(["event:las-4-patas:registration_complete"]),
    true,
  );
});

test("followup: una persona registrada aún puede pedir información de otro evento", () => {
  const result = decideLeadFollowup(
    base({
      status: "info_requested",
      intent: "course_information",
      tags: ["registration:complete", "conversation:info_requested"],
    }),
  );
  assert.equal(result.eligible, true);
  assert.equal(result.stage, "info_requested");
});

test("followup: no envía sin consentimiento ni señal de registro", () => {
  const result = decideLeadFollowup(
    base({
      consentToContact: false,
      status: "interested",
      intent: "enroll_course",
      tags: ["source:whatsapp_bot"],
    }),
  );
  assert.equal(result.eligible, false);
  assert.equal(result.reason, "consent_missing");
});

test("followup: recupera el campo pendiente aunque el último acuse no lo repita", () => {
  const field = getPendingRegistrationField([
    { direction: "outbound", metadata: { awaiting_field: "name" } },
    { direction: "inbound", metadata: null },
    { direction: "outbound", metadata: { trigger: "ack_only_handler" } },
  ]);
  assert.equal(field, "name");
});

test("followup: un estado explícito nulo cierra el campo anterior", () => {
  const field = getPendingRegistrationField([
    { direction: "outbound", metadata: { awaiting_field: "name" } },
    { direction: "outbound", metadata: { awaiting_field: null } },
  ]);
  assert.equal(field, null);
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

test("followup: registro incompleto sin campo explícito pide nombre y correo", () => {
  const body = buildLeadFollowupBody("registration_incomplete", "Ana Pérez", 1, null);
  assert.match(body, /nombre completo/i);
  assert.match(body, /correo/i);
  assert.match(body, /lo terminamos/i);
});
