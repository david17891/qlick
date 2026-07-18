/**
 * Tests del template `survey-invite` (reauditoria XSS 2026-07-18).
 *
 * Verifica:
 * - Subject escapa inyeccion en eventTitle (XSS via <title>).
 * - Body escapa inyeccion en eventTitle.
 * - URL del survey se escapa (atributo href + texto).
 *
 * Corre con:
 *   node --experimental-strip-types --test tests/email-survey-invite-template.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";

const baseInput = {
  attendeeName: "Por",
  attendeeEmail: "david@example.com",
  eventTitle: "Marketing + IA",
  eventStartsAt: "2026-07-21T18:00:00.000Z",
  surveyUrl: "https://qlick.digital/survey/abc",
  senderName: "Equipo Qlick",
};

test("renderSurveyInviteEmail: subject usa eventTitle escapado", async () => {
  const { renderSurveyInviteEmail } = await import(
    "../src/lib/email/templates/survey-invite.ts"
  );
  const result = renderSurveyInviteEmail({
    ...baseInput,
    eventTitle: "</title><script>alert(1)</script>",
  });
  // El subject NO debe contener literal "</title>" ni "<script>".
  assert.doesNotMatch(result.subject, /<\/title>/);
  assert.doesNotMatch(result.subject, /<script>/);
  // Debe contener la version escapada.
  assert.match(result.subject, /&lt;\/title&gt;/);
  assert.match(result.subject, /&lt;script&gt;/);
});

test("renderSurveyInviteEmail: body escapa inyeccion en eventTitle", async () => {
  const { renderSurveyInviteEmail } = await import(
    "../src/lib/email/templates/survey-invite.ts"
  );
  const result = renderSurveyInviteEmail({
    ...baseInput,
    eventTitle: '"><img src=x onerror=alert(1)>',
  });
  // Tags HTML crudos del payload NO deben aparecer.
  assert.doesNotMatch(result.html, /<img/);
  assert.doesNotMatch(result.html, /<\/img/);
  // Delimitadores DEBEN estar escapados.
  assert.match(result.html, /&lt;img/);
  assert.match(result.html, /&gt;/);
  assert.match(result.html, /&quot;/);
});

test("renderSurveyInviteEmail: URL se inyecta en atributo href (escapada)", async () => {
  const { renderSurveyInviteEmail } = await import(
    "../src/lib/email/templates/survey-invite.ts"
  );
  const result = renderSurveyInviteEmail({
    ...baseInput,
    surveyUrl: 'https://qlick.digital/survey/abc" onerror="alert(1)',
  });
  // El href NO debe tener atributos crudos sin escapar.
  assert.doesNotMatch(result.html, /onerror="alert/);
  // La comilla DEBE estar escapada.
  assert.match(result.html, /&quot;/);
});

test("renderSurveyInviteEmail: subject NO incluye PII (no name ni email)", async () => {
  const { renderSurveyInviteEmail } = await import(
    "../src/lib/email/templates/survey-invite.ts"
  );
  const result = renderSurveyInviteEmail(baseInput);
  assert.match(result.subject, /Confirmanos/);
  assert.doesNotMatch(result.subject, /Por/);
  assert.doesNotMatch(result.subject, /david@example\.com/);
});
