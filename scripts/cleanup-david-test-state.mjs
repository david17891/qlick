#!/usr/bin/env node
/**
 * Limpia el state de "test" de David para que pueda re-llenar la encuesta
 * con sus respuestas reales.
 *
 * Acciones:
 *  1. DELETE event_surveys (bcbec856-...) — el test submit mio.
 *  2. DELETE lead_event_links asociados (cascade, pero por las dudas).
 *  3. RESET event_survey_tokens del evento (clear submitted_survey_id,
 *     clear sent_at, status=valid) para que el link se pueda usar de nuevo.
 *  4. DELETE event_attendees (891706df-...) — el row que backfille.
 *  5. REVERT lead status: 'event_attended' -> 'new', remove tag
 *     'event:marketing-ia-para-emprendedores:attended'.
 *  6. DELETE event_certificates del folio QLK-2026-68559.
 *
 * Output: confirma cada paso y deja todo en estado pre-test, listo para
 * que David abra el link directo y llene la encuesta con respuestas reales.
 */
const ref = process.env.SUPABASE_PROJECT_REF;
const token = process.env.SUPABASE_ACCESS_TOKEN;
const EVENT_ID = "eeb2070e-9b64-4715-a684-b3c308e9d0b2";
const SURVEY_ID = "bcbec856-5d71-4412-9730-ce0cf5901bf8";
const LEAD_ID = "20b290db-148f-4a2f-aff4-72b3ab9efa6c";
const ATTENDEE_ID = "891706df-b0af-4882-af16-cb32ca360f03";
const FOLIO = "QLK-2026-68559";

async function dbQuery(q) {
  const r = await fetch(
    `https://api.supabase.com/v1/projects/${ref}/database/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: q }),
    },
  );
  const d = await r.json();
  if (r.status !== 201 && r.status !== 200) {
    throw new Error(`DB ${r.status}: ${JSON.stringify(d)}`);
  }
  return d;
}

console.log("\n=== Limpieza state test de David (evento eeb2070e) ===\n");

// 1. Estado previo
const before = await dbQuery(
  `SELECT
     (SELECT count(*) FROM event_surveys WHERE id = '${SURVEY_ID}') AS surveys,
     (SELECT count(*) FROM event_attendees WHERE id = '${ATTENDEE_ID}') AS attendees,
     (SELECT count(*) FROM event_certificates WHERE folio = '${FOLIO}') AS certs,
     (SELECT status FROM leads WHERE id = '${LEAD_ID}') AS lead_status,
     (SELECT tags FROM leads WHERE id = '${LEAD_ID}') AS lead_tags`,
);
console.log("Pre-estado:", JSON.stringify(before[0], null, 2));

// 2. DELETE survey
console.log("\n[1/6] DELETE event_surveys...");
const delSurvey = await dbQuery(
  `DELETE FROM event_surveys WHERE id = '${SURVEY_ID}' RETURNING id`,
);
console.log("  borrados:", delSurvey.length);

// 3. DELETE lead_event_links (cascade debería hacerlo, pero por defensa)
console.log("\n[2/6] DELETE lead_event_links del lead...");
const delLinks = await dbQuery(
  `DELETE FROM lead_event_links WHERE lead_id = '${LEAD_ID}' RETURNING id`,
);
console.log("  borrados:", delLinks.length);

// 4. RESET survey token (submitted_survey_id y sent_at)
console.log("\n[3/6] RESET event_survey_tokens (clear submitted_survey_id + sent_at)...");
const resetTok = await dbQuery(
  `UPDATE event_survey_tokens
   SET submitted_survey_id = NULL, sent_at = NULL
   WHERE event_id = '${EVENT_ID}'
     AND lower(email) = 'david17891@gmail.com'
   RETURNING id, token, email, submitted_survey_id, sent_at`,
);
console.log("  tokens reseteados:", resetTok.length, JSON.stringify(resetTok[0], null, 2));

// 5. DELETE attendee
console.log("\n[4/6] DELETE event_attendees (backfilled)...");
const delAtt = await dbQuery(
  `DELETE FROM event_attendees WHERE id = '${ATTENDEE_ID}' RETURNING id, email`,
);
console.log("  borrados:", delAtt.length, JSON.stringify(delAtt[0]));

// 6. REVERT lead (status: event_attended -> new, remove event:tag)
console.log("\n[5/6] REVERT leads (status event_attended -> new, remove event tag)...");
const leadBefore = await dbQuery(
  `SELECT status, tags FROM leads WHERE id = '${LEAD_ID}'`,
);
console.log("  lead antes:", JSON.stringify(leadBefore[0]));

const updatedLead = await dbQuery(
  `UPDATE leads
   SET status = 'new',
       tags = (
         SELECT COALESCE(array_agg(t), ARRAY[]::text[])
         FROM unnest(tags) AS t
         WHERE t <> 'event:marketing-ia-para-emprendedores:attended'
       )
   WHERE id = '${LEAD_ID}'
   RETURNING id, status, tags`,
);
console.log("  lead después:", JSON.stringify(updatedLead[0], null, 2));

// 7. DELETE cert
console.log("\n[6/6] DELETE event_certificates (folio QLK-2026-68559)...");
const delCert = await dbQuery(
  `DELETE FROM event_certificates WHERE folio = '${FOLIO}' RETURNING id, folio`,
);
console.log("  borrados:", delCert.length, JSON.stringify(delCert[0]));

// 8. Estado final
console.log("\n=== Estado final (verificación) ===");
const after = await dbQuery(
  `SELECT
     (SELECT count(*) FROM event_surveys WHERE event_id = '${EVENT_ID}') AS total_surveys,
     (SELECT count(*) FROM event_attendees WHERE event_id = '${EVENT_ID}') AS total_attendees,
     (SELECT count(*) FROM event_certificates WHERE event_id = '${EVENT_ID}') AS total_certs,
     (SELECT count(*) FROM event_survey_tokens
        WHERE event_id = '${EVENT_ID}' AND submitted_survey_id IS NOT NULL) AS submitted_tokens`,
);
console.log("Total encuestas (debe ser 0):", after[0]?.total_surveys);
console.log("Total attendees:", after[0]?.total_attendees, "(solo Mavis Demo, sin David)");
console.log("Total certs:", after[0]?.total_certs, "(debe ser 0)");
console.log("Tokens submitted:", after[0]?.submitted_tokens, "(debe ser 0)");

console.log("\nListo. David puede abrir el link directo y llenar la encuesta con sus respuestas reales:");
console.log("  https://qlick.digital/encuesta/godx6nVb2aCHEAk60qQ88VOwwnZV7bfe");
console.log("\nO esperar el re-send del batch (siguiente paso).");
