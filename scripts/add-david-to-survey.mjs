#!/usr/bin/env node
/**
 * One-off: agregar david17891@gmail.com como recipient de la encuesta
 * post-evento del evento "Marketing + IA para Emprendedores" y mandarle
 * el link de encuesta por email.
 *
 * Acciones:
 *  1. INSERT en event_confirmations (si no existe ya para ese email).
 *  2. INSERT en event_survey_tokens (idempotente — primero busca
 *     token válido existente para el email, si no crea uno).
 *  3. Send email via Brevo API con la plantilla survey-invite.
 *
 * FIX 2026-07-13 (bug report David): "se mando una encuesta a las
 * personas del evento por correo, pero me reportan que no los deja
 * responder al final". Root cause: botón submit estaba
 * disabled={state === "filling"} (initial state). Fix ya commiteado
 * en `src/app/encuesta/[token]/EncuestaClient.tsx`. Este script
 * agrega a David como recipient para que pueda verificar el fix
 * end-to-end sin esperar al batch.
 */
import { randomBytes } from "node:crypto";

const ref = process.env.SUPABASE_PROJECT_REF;
const token = process.env.SUPABASE_ACCESS_TOKEN;
const brevoKey = process.env.BREVO_API_KEY;
const fromAddr = process.env.BREVO_FROM_ADDRESS ?? "Qlick <noreply@qlick.digital>";
// FIX 2026-07-13: NEXT_PUBLIC_APP_URL en .env.local está vacío ("")
// en este ambiente, y `??` solo fallback para null/undefined. Si llega
// vacío, usamos la URL de producción explícita (qlick.digital). En Vercel
// production el env está bien poblado, pero local/dev puede estar vacío.
const baseUrl =
  process.env.NEXT_PUBLIC_APP_URL && process.env.NEXT_PUBLIC_APP_URL.length > 0
    ? process.env.NEXT_PUBLIC_APP_URL
    : "https://qlick.digital";
const ttlDays = 30;

const EVENT_ID = "eeb2070e-9b64-4715-a684-b3c308e9d0b2";
const DAVID_EMAIL = "david17891@gmail.com";
const DAVID_NAME = "David";

if (!ref || !token) {
  console.error("Faltan SUPABASE_PROJECT_REF o SUPABASE_ACCESS_TOKEN");
  process.exit(1);
}
if (!brevoKey) {
  console.error("Falta BREVO_API_KEY");
  process.exit(1);
}

async function dbQuery(query) {
  const r = await fetch(
    `https://api.supabase.com/v1/projects/${ref}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    },
  );
  const data = await r.json();
  if (r.status !== 201 && r.status !== 200) {
    throw new Error(`DB ${r.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

// ────────────────────────────────────────────────────────────
// 1. Buscar evento
// ────────────────────────────────────────────────────────────
const events = await dbQuery(
  `SELECT id, title, slug, starts_at, ends_at FROM events WHERE id = '${EVENT_ID}'`,
);
if (events.length === 0) {
  console.error("Evento no encontrado:", EVENT_ID);
  process.exit(1);
}
const event = events[0];
console.log(`Evento: ${event.title} (${event.starts_at})`);

// ────────────────────────────────────────────────────────────
// 2. INSERT en event_confirmations (idempotente: solo si no existe ya
//    para ese email + event_id)
// ────────────────────────────────────────────────────────────
const existingConf = await dbQuery(
  `SELECT id, name, email FROM event_confirmations
   WHERE event_id = '${EVENT_ID}' AND lower(email) = lower('${DAVID_EMAIL}')`,
);
let confirmationId;
if (existingConf.length > 0) {
  confirmationId = existingConf[0].id;
  console.log(`Ya existe confirmation: id=${confirmationId} (${existingConf[0].name})`);
} else {
  const inserted = await dbQuery(
    `INSERT INTO event_confirmations (event_id, name, email, source, confirmed_at)
     VALUES ('${EVENT_ID}', '${DAVID_NAME.replace(/'/g, "''")}', '${DAVID_EMAIL}',
             'manual'::event_confirmation_source, now())
     RETURNING id, name, email`,
  );
  confirmationId = inserted[0].id;
  console.log(`Confirmation creado: id=${confirmationId} (${inserted[0].name})`);
}

// ────────────────────────────────────────────────────────────
// 3. Buscar o crear survey token
// ────────────────────────────────────────────────────────────
const baseIso = event.ends_at ?? event.starts_at ?? new Date().toISOString();
const expiresAt = new Date(
  new Date(baseIso).getTime() + ttlDays * 24 * 60 * 60 * 1000,
).toISOString();

const existingTokens = await dbQuery(
  `SELECT id, token, expires_at, submitted_survey_id
   FROM event_survey_tokens
   WHERE event_id = '${EVENT_ID}'
     AND lower(email) = lower('${DAVID_EMAIL}')
     AND submitted_survey_id IS NULL
     AND expires_at > now()
   ORDER BY created_at DESC
   LIMIT 1`,
);
let tokenStr;
if (existingTokens.length > 0) {
  tokenStr = existingTokens[0].token;
  console.log(`Token existente: ${tokenStr.slice(0, 12)}… (expira ${existingTokens[0].expires_at})`);
} else {
  tokenStr = randomBytes(24).toString("base64url");
  const insertedTok = await dbQuery(
    `INSERT INTO event_survey_tokens
       (event_id, token, email, confirmation_id, expires_at)
     VALUES ('${EVENT_ID}', '${tokenStr}', '${DAVID_EMAIL}', '${confirmationId}',
             '${expiresAt}')
     RETURNING id, token, expires_at`,
  );
  console.log(`Token nuevo: ${insertedTok[0].token.slice(0, 12)}… (id=${insertedTok[0].id}, expira ${insertedTok[0].expires_at})`);
}

const surveyUrl = `${baseUrl.replace(/\/$/, "")}/encuesta/${tokenStr}`;
console.log(`\nSurvey URL: ${surveyUrl}\n`);

// ────────────────────────────────────────────────────────────
// 4. Render email + send via Brevo
// ────────────────────────────────────────────────────────────
const eventDate = new Date(event.starts_at).toLocaleDateString("es-MX", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "America/Phoenix",
});

const subject = `Confirmanos tu asistencia a "${event.title}"`;

// Re-uso el template exacto de src/lib/email/templates/survey-invite.ts
// (sin acoplarme a TS imports desde un script .mjs).
function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f8f5ff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1325;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f8f5ff;padding:32px 16px;">
  <tr>
    <td align="center">
      <table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(120,80,200,0.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#7c3aed 0%,#ec4899 60%,#f97316 100%);padding:32px 32px 24px 32px;text-align:center;">
            <p style="margin:0;font-size:13px;font-weight:600;color:rgba(255,255,255,0.9);letter-spacing:0.08em;text-transform:uppercase;">
              Qlick · Encuesta post-evento
            </p>
            <h1 style="margin:12px 0 0 0;font-size:26px;font-weight:800;color:#ffffff;line-height:1.2;">
              ${esc(DAVID_NAME)},</h1>
            <p style="margin:8px 0 0 0;font-size:18px;font-weight:600;color:rgba(255,255,255,0.95);">
              ¿Pudiste asistir a "${esc(event.title)}"?
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px 8px 32px;">
            <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#3b2f55;">
              El evento fue el <strong>${esc(eventDate)}</strong>. Para cerrar el círculo y enviarte el certificado de asistencia (si corresponde), necesitamos que confirmes si estuviste presente y nos dejes feedback rápido.
            </p>
            <p style="margin:0 0 22px 0;font-size:15px;line-height:1.6;color:#3b2f55;">
              Tardas menos de <strong>2 minutos</strong>. La primera pregunta es solo un Sí / No sobre tu asistencia.
            </p>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:8px 32px 28px 32px;">
            <a href="${esc(surveyUrl)}" target="_blank" rel="noopener noreferrer"
               style="display:inline-block;background:linear-gradient(135deg,#7c3aed 0%,#ec4899 100%);color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:16px 32px;border-radius:12px;box-shadow:0 6px 18px rgba(124,58,237,0.32);">
              📝 Responder encuesta (2 min)
            </a>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 24px 32px;">
            <p style="margin:0 0 6px 0;font-size:12px;line-height:1.5;color:#6b5d80;">
              Si el botón no funciona, copia y pega este link en tu navegador:
            </p>
            <p style="margin:0;font-size:12px;line-height:1.5;color:#7c3aed;word-break:break-all;">
              <a href="${esc(surveyUrl)}" style="color:#7c3aed;text-decoration:underline;">${esc(surveyUrl)}</a>
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px;background-color:#faf5ff;border-top:1px solid #f0e7ff;text-align:center;">
            <p style="margin:0;font-size:12px;color:#6b5d80;">
              Equipo Qlick · Qlick Marketing Digital
            </p>
            <p style="margin:6px 0 0 0;font-size:11px;color:#9b8cb0;">
              Si no pudiste asistir, no te preocupes — solo dinos "No pude" en la primera pregunta y te avisamos del próximo evento.
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

const text = [
  `${DAVID_NAME},`,
  "",
  `¿Pudiste asistir a "${event.title}"?`,
  `El evento fue el ${eventDate}.`,
  "",
  "Para cerrar el círculo y enviarte el certificado de asistencia (si",
  "corresponde), necesitamos que confirmes si estuviste presente y nos",
  "dejes feedback rápido. Tardas menos de 2 minutos.",
  "",
  `👉 Responder encuesta: ${surveyUrl}`,
  "",
  "Si no pudiste asistir, no te preocupes — solo dinos 'No pude' en la",
  "primera pregunta y te avisamos del próximo evento.",
  "",
  "— Equipo Qlick",
].join("\n");

const brevoBody = {
  sender: { name: "Qlick", email: fromAddr.match(/<(.+)>/)?.[1] ?? "noreply@qlick.digital" },
  to: [{ email: DAVID_EMAIL, name: DAVID_NAME }],
  subject,
  htmlContent: html,
  textContent: text,
};

const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
  method: "POST",
  headers: {
    "api-key": brevoKey,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(brevoBody),
});
const brevoData = await brevoRes.json().catch(() => ({}));
if (!brevoRes.ok) {
  console.error(`Brevo error ${brevoRes.status}:`, JSON.stringify(brevoData, null, 2));
  process.exit(1);
}
console.log(`Email Brevo enviado: messageId=${brevoData.messageId ?? "?"}`);

// Marcar sent_at del token (best-effort)
await dbQuery(
  `UPDATE event_survey_tokens
   SET sent_at = now()
   WHERE event_id = '${EVENT_ID}'
     AND lower(email) = lower('${DAVID_EMAIL}')
     AND sent_at IS NULL`,
);

console.log("\nListo. David ya está como recipient y recibió el email con la encuesta.");
console.log(`Survey URL: ${surveyUrl}`);
