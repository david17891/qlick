/**
 * Template de email "Confirmanos tu asistencia" enviado a los
 * confirmados de un evento virtual/hybrid después del webinar.
 *
 * Caso de uso (Sprint cierre-eventos-virtuales 2026-07-11): David
 * necesita un mecanismo para mover confirmados → asistencia real en
 * eventos Zoom. El link apunta a `/encuesta/[token]?prefill=...` donde
 * la Q0 ("¿Asististe?") cierra el ciclo: si responde "Sí", el sistema
 * actualiza `event_attendees.checked_in_at` automáticamente.
 *
 * Convención heredada del template `event-qr-pass.ts`:
 *  - HTML inline (no React Email).
 *  - Sin PII en subject (filtros anti-spam).
 *  - Brand colors Qlick (purple → pink → orange).
 *  - `esc()` en TODA interpolación dinámica (XSS, memory rule 2026-07-08).
 */

export interface SurveyInviteInput {
  /** Nombre del confirmado (para saludo en body). "Hola" si falta. */
  attendeeName: string;
  /** Título del evento. */
  eventTitle: string;
  /** Fecha/hora de inicio del evento (ISO). */
  eventStartsAt: string;
  /** URL pública de la encuesta (`/encuesta/<token>`). */
  surveyUrl: string;
  /** Nombre corto del sender (ej. "Equipo Qlick"). Default. */
  senderName?: string;
}

export interface RenderedSurveyInvite {
  subject: string;
  html: string;
  text: string;
}

/** Escapea HTML básico para evitar inyección en interpolación. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Formato corto de fecha (es-MX, ej. "11 de julio de 2026"). */
function formatEventDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Phoenix",
  });
}

/**
 * Render del email de invitación a la encuesta post-evento.
 *
 * Subject: NO incluye PII (filtros anti-spam Gmail/Outlook).
 * Body: saludo + nombre del evento + fecha + CTA grande al link.
 * Sender: parametrizable (default "Equipo Qlick").
 */
export function renderSurveyInviteEmail(
  input: SurveyInviteInput,
): RenderedSurveyInvite {
  const sender = input.senderName ?? "Equipo Qlick";
  const safeEventTitle = esc(input.eventTitle);
  const safeName = esc(input.attendeeName?.trim() || "Hola");
  const safeUrl = esc(input.surveyUrl);
  const eventDate = formatEventDate(input.eventStartsAt);

  const subject = `Confirmanos tu asistencia a "${input.eventTitle}"`;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f8f5ff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,sans-serif;color:#1a1325;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f8f5ff;padding:32px 16px;">
  <tr>
    <td align="center">
      <table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(120,80,200,0.08);">
        <!-- Header gradient -->
        <tr>
          <td style="background:linear-gradient(135deg,#7c3aed 0%,#ec4899 60%,#f97316 100%);padding:32px 32px 24px 32px;text-align:center;">
            <p style="margin:0;font-size:13px;font-weight:600;color:rgba(255,255,255,0.9);letter-spacing:0.08em;text-transform:uppercase;">
              Qlick · Encuesta post-evento
            </p>
            <h1 style="margin:12px 0 0 0;font-size:26px;font-weight:800;color:#ffffff;line-height:1.2;">
              ${safeName},</h1>
            <p style="margin:8px 0 0 0;font-size:18px;font-weight:600;color:rgba(255,255,255,0.95);">
              ¿Pudiste asistir a "${safeEventTitle}"?
            </p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:28px 32px 8px 32px;">
            <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#3b2f55;">
              El evento fue el <strong>${esc(eventDate)}</strong>. Para
              cerrar el círculo y enviarte el certificado de asistencia (si
              corresponde), necesitamos que confirmes si estuviste presente
              y nos dejes feedback rápido.
            </p>
            <p style="margin:0 0 22px 0;font-size:15px;line-height:1.6;color:#3b2f55;">
              Tardas menos de <strong>2 minutos</strong>. La primera pregunta
              es solo un Sí / No sobre tu asistencia.
            </p>
          </td>
        </tr>

        <!-- CTA -->
        <tr>
          <td align="center" style="padding:8px 32px 28px 32px;">
            <a href="${safeUrl}"
               target="_blank"
               rel="noopener noreferrer"
               style="display:inline-block;background:linear-gradient(135deg,#7c3aed 0%,#ec4899 100%);color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:16px 32px;border-radius:12px;box-shadow:0 6px 18px rgba(124,58,237,0.32);">
              📝 Responder encuesta (2 min)
            </a>
          </td>
        </tr>

        <!-- Secondary copy -->
        <tr>
          <td style="padding:0 32px 24px 32px;">
            <p style="margin:0 0 6px 0;font-size:12px;line-height:1.5;color:#6b5d80;">
              Si el botón no funciona, copia y pega este link en tu navegador:
            </p>
            <p style="margin:0;font-size:12px;line-height:1.5;color:#7c3aed;word-break:break-all;">
              <a href="${safeUrl}" style="color:#7c3aed;text-decoration:underline;">${safeUrl}</a>
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 32px;background-color:#faf5ff;border-top:1px solid #f0e7ff;text-align:center;">
            <p style="margin:0;font-size:12px;color:#6b5d80;">
              ${esc(sender)} · Qlick Marketing Digital
            </p>
            <p style="margin:6px 0 0 0;font-size:11px;color:#9b8cb0;">
              Si no pudiste asistir, no te preocupes — solo dinos "No pude"
              en la primera pregunta y te avisamos del próximo evento.
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
    `${safeName},`,
    "",
    `¿Pudiste asistir a "${input.eventTitle}"?`,
    `El evento fue el ${eventDate}.`,
    "",
    "Para cerrar el círculo y enviarte el certificado de asistencia (si",
    "corresponde), necesitamos que confirmes si estuviste presente y nos",
    "dejes feedback rápido. Tardas menos de 2 minutos.",
    "",
    `👉 Responder encuesta: ${input.surveyUrl}`,
    "",
    "Si no pudiste asistir, no te preocupes — solo dinos 'No pude' en la",
    "primera pregunta y te avisamos del próximo evento.",
    "",
    `— ${sender}`,
  ].join("\n");

  return { subject, html, text };
}
