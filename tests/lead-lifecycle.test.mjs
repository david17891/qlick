import { test } from "node:test";
import assert from "node:assert/strict";
import { decideLeadLifecycle } from "../src/lib/whatsapp/lead-lifecycle.ts";

const base = {
  currentStatus: "new",
  currentIntent: "unknown",
  awaitingField: null,
  eventSlug: "las-4-patas",
};

test("lead lifecycle: separa información concreta de un saludo aislado", () => {
  const info = decideLeadLifecycle({
    ...base,
    botIntent: "question",
    body: "Hola, quiero más información del evento",
  });
  const greeting = decideLeadLifecycle({
    ...base,
    botIntent: "greeting",
    body: "Hola",
  });

  assert.equal(info.status, "info_requested");
  assert.equal(info.intent, "course_information");
  assert.equal(greeting.status, "contacted");
  assert.equal(greeting.nextFollowUpAt, null);
});

test("lead lifecycle: inscripción inicia una oportunidad y seguimiento", () => {
  const result = decideLeadLifecycle({
    ...base,
    currentStatus: "info_requested",
    botIntent: "interactive_event_inscribir",
    body: "Quiero apartar mi lugar",
  });

  assert.equal(result.status, "interested");
  assert.equal(result.intent, "enroll_course");
  assert.deepEqual(result.tagsToAdd, [
    "event:las-4-patas:registration_started",
    "registration:incomplete",
  ]);
  assert.ok(result.nextFollowUpAt);
});

test("lead lifecycle: un acuse no cierra un registro que espera datos", () => {
  const result = decideLeadLifecycle({
    ...base,
    currentStatus: "interested",
    currentIntent: "enroll_course",
    botIntent: "provide_name",
    body: "gracias",
    awaitingField: "name",
  });

  assert.equal(result.status, "interested");
  assert.equal(result.intent, "enroll_course");
});

test("lead lifecycle: correo capturado deja el lead en pago pendiente", () => {
  const result = decideLeadLifecycle({
    ...base,
    currentStatus: "interested",
    currentIntent: "enroll_course",
    botIntent: "provide_email",
    body: "cliente@example.com",
    awaitingField: "email",
  });

  assert.equal(result.status, "payment_pending");
  assert.equal(result.intent, "payment_help");
  assert.ok(result.tagsToAdd.includes("registration:payment_pending"));
});

test("lead lifecycle: nombre y correo en un solo mensaje también llegan a pago pendiente", () => {
  const result = decideLeadLifecycle({
    ...base,
    currentStatus: "new",
    botIntent: "provide_name",
    body: "Ana Pérez ana@example.com",
  });

  assert.equal(result.status, "payment_pending");
  assert.equal(result.intent, "payment_help");
});

test("lead lifecycle: no degrada un alumno o una asistencia existente", () => {
  const result = decideLeadLifecycle({
    ...base,
    currentStatus: "enrolled",
    currentIntent: "enroll_course",
    botIntent: "question",
    body: "Hola",
  });

  assert.equal(result.status, "enrolled");
  assert.equal(result.tagsToAdd.length, 0);
});
