// Sprint cierre-eventos-virtuales (2026-07-11).
//
// Tests unitarios de los helpers puros del flujo "enviar link de
// encuesta post-evento a confirmados":
//   - `renderSurveyInviteEmail` (src/lib/email/templates/survey-invite.ts)
//   - `buildSurveyInviteWhatsAppMessage` (src/lib/events/survey-invite-message.ts)
//
// Estos tests no tocan DB (no mockean Supabase) — son puros del lado
// del template. La integración con Supabase/Brevo se cubre en
// `tests/email-brevo-client.test.mjs` y los flows end-to-end del
// admin se cubren manualmente + via smoke audit.
//
// REGLAS de node --experimental-strip-types (memory rule 2026-07-09):
// estos .ts NO deben usar path aliases (@/lib/...) en sus imports — los
// helpers que probamos son puros y no requieren nada del proyecto.

import { test } from "node:test";
import assert from "node:assert/strict";

// Helper: importar el .ts via node strip-types. El test runner ya está
// configurado con --experimental-strip-types (ver package.json:test).
const surveyInviteMod = await import(
  "../src/lib/email/templates/survey-invite.ts"
);
const whatsappInviteMod = await import(
  "../src/lib/events/survey-invite-message.ts"
);

const { renderSurveyInviteEmail } = surveyInviteMod;
const { buildSurveyInviteWhatsAppMessage } = whatsappInviteMod;

// ────────────────────────────────────────────────────────────
// renderSurveyInviteEmail
// ────────────────────────────────────────────────────────────

test("renderSurveyInviteEmail: subject contiene el título del evento", () => {
  const out = renderSurveyInviteEmail({
    attendeeName: "Gabriela",
    eventTitle: "Conferencia Zoom Q3",
    eventStartsAt: "2026-07-15T17:00:00.000Z",
    surveyUrl: "https://qlick.digital/encuesta/abc123",
  });
  assert.match(out.subject, /Conferencia Zoom Q3/);
  // No debe incluir PII (nombre del asistente) en el subject.
  assert.doesNotMatch(out.subject, /Gabriela/);
});

test("renderSurveyInviteEmail: html contiene el link de la encuesta", () => {
  const out = renderSurveyInviteEmail({
    attendeeName: "Gabriela",
    eventTitle: "Conferencia Zoom Q3",
    eventStartsAt: "2026-07-15T17:00:00.000Z",
    surveyUrl: "https://qlick.digital/encuesta/abc123",
  });
  assert.match(out.html, /href="https:\/\/qlick\.digital\/encuesta\/abc123"/);
  assert.match(out.html, /Responder encuesta/);
});

test("renderSurveyInviteEmail: escapa HTML/XSS en campos dinámicos", () => {
  const out = renderSurveyInviteEmail({
    attendeeName: '<script>alert("xss")</script>',
    eventTitle: 'Evento "peligroso" & <mal>',
    eventStartsAt: "2026-07-15T17:00:00.000Z",
    surveyUrl: 'https://qlick.digital/encuesta/x"y',
  });
  // El subject está fuera de HTML — el escape solo aplica al body.
  // En el body, ningún <script> debe quedar sin escapar.
  assert.doesNotMatch(out.html, /<script>alert/);
  assert.match(out.html, /&lt;script&gt;alert/);
  // Atributos comilla doble deben estar escapados.
  assert.match(out.html, /Evento &quot;peligroso&quot; &amp; &lt;mal&gt;/);
  // El link debe estar escapado dentro de atributos HTML.
  assert.doesNotMatch(out.html, /href="https:\/\/qlick\.digital\/encuesta\/x"y"/);
  assert.match(out.html, /href="https:\/\/qlick\.digital\/encuesta\/x&quot;y"/);
});

test("renderSurveyInviteEmail: nombre vacío cae a 'Hola'", () => {
  const out = renderSurveyInviteEmail({
    attendeeName: "",
    eventTitle: "Conferencia Zoom Q3",
    eventStartsAt: "2026-07-15T17:00:00.000Z",
    surveyUrl: "https://qlick.digital/encuesta/abc123",
  });
  // "Hola," aparece como saludo default.
  assert.match(out.html, /Hola,/);
  // No debe haber "Hola ," (con espacio raro) ni "  ,".
  assert.doesNotMatch(out.html, /Hola\s+,/);
});

test("renderSurveyInviteEmail: nombre solo whitespace cae a 'Hola'", () => {
  const out = renderSurveyInviteEmail({
    attendeeName: "   ",
    eventTitle: "Conferencia Zoom Q3",
    eventStartsAt: "2026-07-15T17:00:00.000Z",
    surveyUrl: "https://qlick.digital/encuesta/abc123",
  });
  assert.match(out.html, /Hola,/);
});

test("renderSurveyInviteEmail: text plano contiene link + nombre + título", () => {
  const out = renderSurveyInviteEmail({
    attendeeName: "Gabriela",
    eventTitle: "Conferencia Zoom Q3",
    eventStartsAt: "2026-07-15T17:00:00.000Z",
    surveyUrl: "https://qlick.digital/encuesta/abc123",
  });
  assert.match(out.text, /Gabriela/);
  assert.match(out.text, /Conferencia Zoom Q3/);
  assert.match(out.text, /https:\/\/qlick\.digital\/encuesta\/abc123/);
  assert.match(out.text, /2 min/);
});

test("renderSurveyInviteEmail: fecha inválida cae al ISO crudo sin crashear", () => {
  const out = renderSurveyInviteEmail({
    attendeeName: "Gabriela",
    eventTitle: "Conferencia Zoom Q3",
    eventStartsAt: "esto no es una fecha",
    surveyUrl: "https://qlick.digital/encuesta/abc123",
  });
  // El body debe seguir rendereando OK con el ISO crudo.
  assert.match(out.html, /esto no es una fecha/);
  // El subject no debe romperse.
  assert.match(out.subject, /Conferencia Zoom Q3/);
});

test("renderSurveyInviteEmail: senderName custom aparece en footer", () => {
  const out = renderSurveyInviteEmail({
    attendeeName: "Gabriela",
    eventTitle: "X",
    eventStartsAt: "2026-07-15T17:00:00.000Z",
    surveyUrl: "https://qlick.digital/encuesta/abc",
    senderName: "Equipo Qlick Test",
  });
  assert.match(out.html, /Equipo Qlick Test/);
});

// ────────────────────────────────────────────────────────────
// buildSurveyInviteWhatsAppMessage
// ────────────────────────────────────────────────────────────

test("buildSurveyInviteWhatsAppMessage: saludo personalizado con nombre", () => {
  const msg = buildSurveyInviteWhatsAppMessage({
    attendeeName: "Gabriela",
    eventTitle: "Conferencia Zoom Q3",
    surveyUrl: "https://qlick.digital/encuesta/abc123",
  });
  assert.match(msg, /^Hola Gabriela,/m);
  assert.match(msg, /Conferencia Zoom Q3/);
  assert.match(msg, /https:\/\/qlick\.digital\/encuesta\/abc123/);
  assert.match(msg, /Equipo Qlick/);
});

test("buildSurveyInviteWhatsAppMessage: nombre vacío cae a 'Hola'", () => {
  const msg = buildSurveyInviteWhatsAppMessage({
    attendeeName: "",
    eventTitle: "Conferencia Zoom Q3",
    surveyUrl: "https://qlick.digital/encuesta/abc123",
  });
  assert.match(msg, /^Hola,/m);
  assert.doesNotMatch(msg, /Hola\s*Hola/);
});

test("buildSurveyInviteWhatsAppMessage: nombre solo whitespace cae a 'Hola'", () => {
  const msg = buildSurveyInviteWhatsAppMessage({
    attendeeName: "   ",
    eventTitle: "X",
    surveyUrl: "https://qlick.digital/encuesta/abc",
  });
  assert.match(msg, /^Hola,/m);
});

test("buildSurveyInviteWhatsAppMessage: el link aparece tal cual (wa.me no rompe URL)", () => {
  const url = "https://qlick.digital/encuesta/abc?prefill=email%40x.com";
  const msg = buildSurveyInviteWhatsAppMessage({
    attendeeName: "Gabriela",
    eventTitle: "X",
    surveyUrl: url,
  });
  // El mensaje contiene el link literal. wa.me lo encodeara al construir
  // el link final con `encodeURIComponent` (ver buildDirectWhatsAppLink).
  assert.match(msg, new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("buildSurveyInviteWhatsAppMessage: longitud razonable (no spam WhatsApp)", () => {
  const msg = buildSurveyInviteWhatsAppMessage({
    attendeeName: "Gabriela",
    eventTitle: "Conferencia Zoom Q3 sobre marketing digital avanzado",
    surveyUrl: "https://qlick.digital/encuesta/abc123",
  });
  // WhatsApp business suele cortar a ~1024 chars. El mensaje debe ser
  // mucho más corto que eso.
  assert.ok(msg.length < 500, `msg muy largo: ${msg.length} chars`);
  assert.ok(msg.length > 50, `msg muy corto: ${msg.length} chars`);
});
