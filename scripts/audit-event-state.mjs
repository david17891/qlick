#!/usr/bin/env node
// Diagnóstico: estado actual de attendees, surveys, certs
// para el evento Marketing + IA para Emprendedores.
const ref = process.env.SUPABASE_PROJECT_REF;
const token = process.env.SUPABASE_ACCESS_TOKEN;
const EVENT_ID = "eeb2070e-9b64-4715-a684-b3c308e9d0b2";
if (!ref || !token) {
  console.error("Faltan SUPABASE_PROJECT_REF o SUPABASE_ACCESS_TOKEN");
  process.exit(1);
}
async function dbQuery(q) {
  const r = await fetch(
    `https://api.supabase.com/v1/projects/${ref}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: q }),
    },
  );
  return r.json();
}

// 1. Confirmaciones (deberían ser 32 ahora, 31 originales + David)
const confs = await dbQuery(
  `SELECT id, name, email, source, confirmed_at
   FROM event_confirmations
   WHERE event_id = '${EVENT_ID}'
   ORDER BY confirmed_at DESC`,
);
console.log(`\n=== event_confirmations (${confs.length}) ===`);
for (const c of confs) {
  console.log(`  ${c.confirmed_at}  ${c.source.padEnd(14)}  ${c.name.padEnd(40)} <${c.email}>`);
}

// 2. Attendees
const atts = await dbQuery(
  `SELECT id, name, email, phone_normalized, source, checked_in_at, checked_in_by
   FROM event_attendees
   WHERE event_id = '${EVENT_ID}'
   ORDER BY checked_in_at DESC NULLS LAST`,
);
console.log(`\n=== event_attendees (${atts.length}) ===`);
for (const a of atts) {
  const ci = a.checked_in_at ? a.checked_in_at : "(sin check-in)";
  const by = a.checked_in_by ? `by=${a.checked_in_by}` : "";
  console.log(`  ${ci}  src=${a.source.padEnd(18)}  ${a.name ?? "(sin nombre)"} <${a.email}> ${by}`);
}

// 3. Survey tokens
const toks = await dbQuery(
  `SELECT id, token, email, expires_at, sent_at, submitted_survey_id
   FROM event_survey_tokens
   WHERE event_id = '${EVENT_ID}'
   ORDER BY created_at DESC`,
);
console.log(`\n=== event_survey_tokens (${toks.length}) ===`);
const submitted = toks.filter((t) => t.submitted_survey_id).length;
const sentNotSub = toks.filter((t) => t.sent_at && !t.submitted_survey_id).length;
const notSent = toks.filter((t) => !t.sent_at).length;
console.log(`  submitted=${submitted}  sent-not-submitted=${sentNotSub}  not-sent=${notSent}`);
for (const t of toks) {
  const status = t.submitted_survey_id
    ? "✓ submitted"
    : t.sent_at
    ? "✉ sent (pending)"
    : "— not sent";
  console.log(`  ${status}  email=${t.email}  sent_at=${t.sent_at ?? "—"}`);
}

// 4. Surveys submitted
const surveys = await dbQuery(
  `SELECT id, respondent_email, responses, consent_to_contact, created_at
   FROM event_surveys
   WHERE event_id = '${EVENT_ID}'
   ORDER BY created_at DESC`,
);
console.log(`\n=== event_surveys submitted (${surveys.length}) ===`);
for (const s of surveys) {
  console.log(`  ${s.created_at}  <${s.respondent_email}>`);
  if (s.responses) {
    const keys = Object.keys(s.responses);
    console.log(`    responses keys: ${keys.join(", ")}`);
  }
}

// 5. Certificados emitidos
const certs = await dbQuery(
  `SELECT id, attendee_id, folio, status, issued_at
   FROM event_certificates
   WHERE event_id = '${EVENT_ID}'
   ORDER BY issued_at DESC`,
);
console.log(`\n=== event_certificates (${certs.length}) ===`);
for (const c of certs) {
  console.log(`  ${c.issued_at}  ${c.folio}  status=${c.status}  attendee=${c.attendee_id}`);
}
