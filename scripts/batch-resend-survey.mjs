#!/usr/bin/env node
/**
 * Batch resend: manda el link de encuesta a TODAS las confirmaciones
 * del evento (re-usa tokens existentes via SELECT, crea los faltantes,
 * manda Brevo email a las que tengan email).
 *
 * Idempotente a nivel token: si ya existe, re-usa. El email se re-manda
 * cada vez (esperado — el admin decide cuándo re-enviar).
 *
 * Camino canónico: Management API para DB + Brevo REST para email.
 * Replica la lógica de `src/lib/events/send-survey-link.ts` (orquestador
 * server-side) sin acoplarse a los path aliases de TS.
 */
import { randomBytes } from "node:crypto";

const ref = process.env.SUPABASE_PROJECT_REF;
const token = process.env.SUPABASE_ACCESS_TOKEN;
const brevoKey = process.env.BREVO_API_KEY;
const fromAddr = process.env.BREVO_FROM_ADDRESS ?? "Qlick <noreply@qlick.digital>";
const baseUrl =
  process.env.NEXT_PUBLIC_APP_URL && process.env.NEXT_PUBLIC_APP_URL.length > 0
    ? process.env.NEXT_PUBLIC_APP_URL
    : "https://qlick.digital";
const EVENT_ID = "eeb2070e-9b64-4715-a684-b3c308e9d0b2";
const TTL_DAYS = 30;

if (!ref || !token || !brevoKey) {
  console.error("Faltan SUPABASE_PROJECT_REF/SUPABASE_ACCESS_TOKEN/BREVO_API_KEY");
  process.exit(1);
}

async function dbQuery(q) {
  const r = await fetch(
    `https://api.supabase.com/v1/projects/${ref}/database/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: q }),
    },
  );
  const data = await r.json();
  if (r.status !== 201 && r.status !== 200) {
    throw new Error(`DB ${r.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatEventDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Phoenix",
  });
}

// 1. Traer evento
const ev = await dbQuery(
  `SELECT id, title, starts_at, ends_at FROM events WHERE id = '${EVENT_ID}'`,
);
if (ev.length === 0) {
  console.error("Evento no encontrado");
  process.exit(1);
}
const event = ev[0];
console.log(`Evento: ${event.title} (${event.starts_at})`);

// 2. Traer confirmaciones
const confs = await dbQuery(
  `SELECT id, name, email, phone_normalized
   FROM event_confirmations
   WHERE event_id = '${EVENT_ID}'
     AND email IS NOT NULL
     AND trim(email) != ''
   ORDER BY confirmed_at`,
);
console.log(`Confirmaciones con email: ${confs.length}`);

// 3. Traer tokens existentes
const existing = await dbQuery(
  `SELECT id, token, email, expires_at
   FROM event_survey_tokens
   WHERE event_id = '${EVENT_ID}'`,
);
const tokenByEmail = new Map();
for (const t of existing) {
  if (t.email) {
    tokenByEmail.set(t.email.toLowerCase(), t);
  }
}
console.log(`Tokens existentes: ${existing.length}`);

// 4. Para cada confirmation: enviar email
const eventDate = formatEventDate(event.starts_at);
const baseIso = event.ends_at ?? event.starts_at ?? new Date().toISOString();
const expiresAt = new Date(
  new Date(baseIso).getTime() + TTL_DAYS * 24 * 60 * 60 * 1000,
).toISOString();

let sent = 0;
let failed = 0;
let skipped = 0;

for (const c of confs) {
  const emailLower = c.email.toLowerCase();
  let tokRow = tokenByEmail.get(emailLower);

  if (!tokRow) {
    // Crear token nuevo
    const newToken = randomBytes(24).toString("base64url");
    try {
      const inserted = await dbQuery(
        `INSERT INTO event_survey_tokens
           (event_id, token, email, confirmation_id, expires_at)
         VALUES
           ('${EVENT_ID}', '${newToken}', '${emailLower}',
            '${c.id}', '${expiresAt}')
         RETURNING id, token, expires_at`,
      );
      tokRow = {
        id: inserted[0].id,
        token: inserted[0].token,
        email: emailLower,
        expires_at: inserted[0].expires_at,
      };
    } catch (err) {
      console.error(`  ✗ Token create failed for ${emailLower}: ${err.message}`);
      failed++;
      continue;
    }
  }

  const surveyUrl = `${baseUrl.replace(/\/$/, "")}/encuesta/${tokRow.token}`;

  const subject = `Confirmanos tu asistencia a "${event.title}"`;
  const safeEventTitle = esc(event.title);
  const safeName = esc((c.name ?? "").trim() || "Hola");
  const safeUrl = esc(surveyUrl);

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
            <p style="margin:0;font-size:13px;font-weight:600;color:rgba(255,255,255,0.9);letter-spacing:0.08em;text-transform:uppercase;">Qlick · Encuesta post-evento</p>
            <h1 style="margin:12px 0 0 0;font-size:26px;font-weight:800;color:#ffffff;line-height:1.2;">${safeName},</h1>
            <p style="margin:8px 0 0 0;font-size:18px;font-weight:600;color:rgba(255,255,255,0.95);">¿Pudiste asistir a "${safeEventTitle}"?</p>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px 8px 32px;">
            <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#3b2f55;">El evento fue el <strong>${esc(eventDate)}</strong>. Para cerrar el círculo y enviarte el certificado de asistencia (si corresponde), necesitamos que confirmes si estuviste presente y nos dejes feedback rápido.</p>
            <p style="margin:0 0 22px 0;font-size:15px;line-height:1.6;color:#3b2f55;">Tardas menos de <strong>2 minutos</strong>. La primera pregunta es solo un Sí / No sobre tu asistencia.</p>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:8px 32px 28px 32px;">
            <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:linear-gradient(135deg,#7c3aed 0%,#ec4899 100%);color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:16px 32px;border-radius:12px;box-shadow:0 6px 18px rgba(124,58,237,0.32);">📝 Responder encuesta (2 min)</a>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 24px 32px;">
            <p style="margin:0 0 6px 0;font-size:12px;line-height:1.5;color:#6b5d80;">Si el botón no funciona, copia y pega este link en tu navegador:</p>
            <p style="margin:0;font-size:12px;line-height:1.5;color:#7c3aed;word-break:break-all;"><a href="${safeUrl}" style="color:#7c3aed;text-decoration:underline;">${safeUrl}</a></p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px;background-color:#faf5ff;border-top:1px solid #f0e7ff;text-align:center;">
            <p style="margin:0;font-size:12px;color:#6b5d80;">Equipo Qlick · Qlick Marketing Digital</p>
            <p style="margin:6px 0 0 0;font-size:11px;color:#9b8cb0;">Si no pudiste asistir, no te preocupes — solo dinos "No pude" en la primera pregunta y te avisamos del próximo evento.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  const text = [
    `${c.name ?? "Hola"},`,
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
    "— Equipo Qlick",
  ].join("\n");

  const brevoBody = {
    sender: {
      name: "Qlick",
      email: fromAddr.match(/<(.+)>/)?.[1] ?? "noreply@qlick.digital",
    },
    to: [{ email: emailLower, name: c.name ?? undefined }],
    subject,
    htmlContent: html,
    textContent: text,
    // FIX 2026-07-13 (David bug report): deshabilitar click tracking.
    // Sin esto, Brevo wrappea TODOS los links del HTML con
    // `sendibt2.com/tr/cl/<encrypted>` para trackear clicks. Kaspersky
    // Plus (y varios AVs europeos) marca ese tracker como
    // "data leak" → false positive → el recipient ve un 404 default
    // de Sendinblue y no llega a la encuesta. El link real
    // (qlick.digital/encuesta/<token>) responde HTTP 200 OK, pero
    // el redirect via tracker es lo que se rompe. Disable click
    // tracking = el link viaja directo. Open tracking se mantiene
    // (es invisible, no rompe nada).
    tracking: {
      click: false,
      open: true,
    },
  };

  const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": brevoKey, "Content-Type": "application/json" },
    body: JSON.stringify(brevoBody),
  });

  if (brevoRes.ok) {
    const data = await brevoRes.json().catch(() => ({}));
    sent++;
    // Mark sent_at
    await dbQuery(
      `UPDATE event_survey_tokens SET sent_at = now()
       WHERE id = '${tokRow.id}' AND sent_at IS NULL`,
    );
    process.stdout.write(`  ✓ ${emailLower} (Brevo ${data.messageId ?? "?"})\n`);
  } else {
    const errData = await brevoRes.json().catch(() => ({}));
    failed++;
    process.stdout.write(`  ✗ ${emailLower} (Brevo ${brevoRes.status}: ${JSON.stringify(errData).slice(0, 100)})\n`);
  }
}

console.log(`\nResumen: sent=${sent}, failed=${failed}, skipped=${skipped}`);
