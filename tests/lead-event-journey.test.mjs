import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyLeadEventJourneyPatch,
  assertJourneyBelongsToEvent,
  createInitialLeadEventJourney,
  isJourneyTerminal,
} from "../src/lib/whatsapp/lead-event-journey.ts";

function journey() {
  return createInitialLeadEventJourney({
    id: "journey-1",
    leadId: "lead-1",
    eventId: "event-current",
    now: "2026-08-08T18:00:00.000Z",
  });
}

test("crea un journey nuevo por persona + evento", () => {
  const result = journey();
  assert.equal(result.leadId, "lead-1");
  assert.equal(result.eventId, "event-current");
  assert.equal(result.relationshipStage, "new");
  assert.equal(result.awaitingField, "none");
  assert.equal(result.paymentStatus, "not_required");
  assert.equal(result.conversationControl, "bot");
});

test("la asistencia de otro evento no cambia el journey actual", () => {
  const previous = { ...journey(), eventId: "event-previous", relationshipStage: "attended" };
  const current = journey();
  assert.equal(previous.relationshipStage, "attended");
  assert.equal(current.relationshipStage, "new");
  assert.notEqual(previous.eventId, current.eventId);
});

test("permite avanzar de información a captura de nombre", () => {
  const result = applyLeadEventJourneyPatch(
    { ...journey(), relationshipStage: "info_requested" },
    { relationshipStage: "capturing", awaitingField: "name" },
    { source: "inbound", reason: "lead accepted registration", now: "2026-08-08T18:01:00.000Z" },
  );
  assert.equal(result.journey.relationshipStage, "capturing");
  assert.equal(result.journey.awaitingField, "name");
  assert.equal(result.transition.fromStage, "info_requested");
  assert.equal(result.transition.toStage, "capturing");
});

test("conserva la identidad lead + evento al actualizar", () => {
  const result = applyLeadEventJourneyPatch(
    journey(),
    { relationshipStage: "info_requested", lastIntent: "question" },
    { source: "inbound", reason: "information request" },
  );
  assert.equal(result.journey.leadId, "lead-1");
  assert.equal(result.journey.eventId, "event-current");
});

test("rechaza una razón vacía", () => {
  assert.throws(
    () => applyLeadEventJourneyPatch(journey(), {}, { source: "system", reason: "   " }),
    /journey_transition_reason_required/,
  );
});

test("no permite reabrir un journey terminal desde un bot", () => {
  assert.throws(
    () => applyLeadEventJourneyPatch(
      { ...journey(), relationshipStage: "attended" },
      { relationshipStage: "interested" },
      { source: "followup", reason: "automated follow-up" },
    ),
    /terminal_journey_requires_manual_reopen/,
  );
});

test("permite una reapertura terminal explícita de un humano", () => {
  const result = applyLeadEventJourneyPatch(
    { ...journey(), relationshipStage: "attended" },
    { relationshipStage: "interested" },
    { source: "manual", reason: "lead asks about a new participation exception" },
  );
  assert.equal(result.journey.relationshipStage, "interested");
});

test("no permite cambiar un pago pagado desde un bot", () => {
  assert.throws(
    () => applyLeadEventJourneyPatch(
      { ...journey(), paymentStatus: "paid" },
      { paymentStatus: "pending" },
      { source: "outbound", reason: "payment reminder" },
    ),
    /paid_journey_requires_manual_payment_change/,
  );
});

test("no permite que un follow-up quite el control a un humano", () => {
  assert.throws(
    () => applyLeadEventJourneyPatch(
      { ...journey(), conversationControl: "human" },
      { conversationControl: "bot" },
      { source: "followup", reason: "scheduled follow-up" },
    ),
    /human_control_requires_manual_resume/,
  );
});

test("valida que el journey pertenece al lead y evento esperados", () => {
  assert.doesNotThrow(() => assertJourneyBelongsToEvent(journey(), {
    leadId: "lead-1",
    eventId: "event-current",
  }));
  assert.throws(
    () => assertJourneyBelongsToEvent(journey(), {
      leadId: "lead-1",
      eventId: "event-previous",
    }),
    /journey_identity_mismatch/,
  );
});

test("identifica estados terminales para detener automatizaciones", () => {
  assert.equal(isJourneyTerminal("attended"), true);
  assert.equal(isJourneyTerminal("no_show"), true);
  assert.equal(isJourneyTerminal("closed"), true);
  assert.equal(isJourneyTerminal("registered"), false);
});
