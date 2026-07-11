/**
 * Template del email de "constancia de asistencia" que recibe el asistente
 * cuando el admin emite certs en batch (sprint v0.9.2 Cert Email).
 *
 * El email NO adjunta el PDF (decisión de implementación: link público al
 * cert HTML en `/cert/[folio]`). El alumno abre el link, ve el cert y
 * puede hacer Ctrl+P → "Guardar como PDF" si lo quiere offline.
 *
 * Convenciones heredadas del template `event-qr-pass.ts`:
 *  - HTML inline (no React Email).
 *  - Sin PII en subject (filtros anti-spam).
 *  - Brand colors Qlick (purple → pink → orange).
 *  - `esc()` helper para evitar inyeccion.
 *  - `formatEventDate()` / `formatEventTime()` en es-MX, tz America/Phoenix.
 */

export interface EventCertificateInput {
  /** Nombre del asistente (para saludo en body). */
  attendeeName: string;
  /** Email del asistente (destinatario, NO en subject). */
  attendeeEmail: string;
  /** Titulo del evento (e.g. "Marketing + IA para Emprendedores"). */
  eventTitle: string;
  /** Fecha/hora de inicio del evento (ISO). */
  eventStartsAt: string;
  /** Folio del cert (e.g. "QLK-2026-68558"). */
  folio: string;
  /** URL publica del cert (https://qlick.digital/cert/[folio]). */
  certUrl: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
}

// ---------------------------------------------------------------------------
// Helpers locales (mismo set que event-qr-pass.ts)
// ---------------------------------------------------------------------------

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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

// ---------------------------------------------------------------------------
// Render principal
// ---------------------------------------------------------------------------

/**
 * Render del email de constancia.
 *
 * Diseño:
 *  - Hero con saludo personalizado + emoji celebracion.
 *  - Bloque "Tu constancia" con datos del evento + folio.
 *  - CTA grande "📜 Ver mi constancia" → certUrl.
 *  - Bloque secundario: instrucciones para guardar como PDF.
 *  - Footer brand Qlick + unsubscribe no-op (transaccional, no marketing).
 *
 * Si `attendeeName` viene vacio, fallback a "Asistente" (degradacion
 * segura — no rompemos el render).
 */
export function renderEventCertificateEmail(
  input: EventCertificateInput,
): RenderedEmail {
  const name = esc((input.attendeeName || "").trim() || "Asistente");
  const email = esc(input.attendeeEmail);
  const eventTitle = esc(input.eventTitle);
  const eventDate = formatEventDate(input.eventStartsAt);
  const folio = esc(input.folio);
  // certUrl DEBE ser absoluta (https://...). Si no, fallback a placeholder.
  // David pasa appBaseUrl() + `/cert/${folio}` desde el caller.
  const certUrl = input.certUrl.startsWith("http")
    ? esc(input.certUrl)
    : `https://qlick.digital/cert/${folio}`;

  // Subject: sin PII (filtros anti-spam). Solo el evento.
  const subject = `¡Felicidades! Tu constancia de "${input.eventTitle}"`;
  // FIX 2026-07-08 (sprint v0.9.2): escapar el subject antes de
  // inyectarlo en `<title>` y `<meta>`. Si el eventTitle contiene
  // HTML/JS (e.g. desde un editor rico del admin), el `<title>` sin
  // escapar abre un XSS via subject — bug encontrado por
  // `tests/email-event-certificate-template.test.mjs` caso eventTitle.
  const subjectEsc = esc(subject);

  const html = `
<!DOCTYPE html>
<html lang="es-MX">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${subjectEsc}</title>
</head>
<body style="margin:0;padding:0;background:#1A1024;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#1A1024;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#1A1024;padding:32px 16px;">
  <tr>
    <td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#FAF7F2;border-radius:16px;overflow:hidden;box-shadow:0 12px 32px rgba(0,0,0,0.3);">

        <!-- HERO -->
        <tr>
          <td style="background:linear-gradient(135deg,#7C3AED 0%,#EC4899 50%,#F97316 100%);padding:40px 32px;text-align:center;">
            <p style="margin:0 0 8px 0;font-size:48px;line-height:1;">🎉</p>
            <h1 style="margin:0;font-size:28px;font-weight:800;color:#FAF7F2;letter-spacing:-0.5px;line-height:1.2;">
              ¡Felicidades, ${name}!
            </h1>
            <p style="margin:12px 0 0 0;font-size:15px;color:rgba(250,247,242,0.85);font-weight:500;">
              Completaste ${eventTitle}
            </p>
          </td>
        </tr>

        <!-- BODY -->
        <tr>
          <td style="padding:32px 32px 24px 32px;">
            <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;color:#1A1024;">
              Es un gusto saludarte. Queremos reconocer tu participacion y
              compromiso, y por eso te dejamos tu constancia oficial de
              asistencia al programa.
            </p>

            <!-- Bloque datos del evento -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F5EFE3;border-radius:12px;padding:20px;margin:24px 0;border:1px solid #E5DDC8;">
              <tr>
                <td>
                  <p style="margin:0 0 4px 0;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#7C3AED;font-weight:700;">
                    Constancia
                  </p>
                  <p style="margin:0 0 12px 0;font-size:18px;font-weight:700;color:#1A1024;line-height:1.3;">
                    ${eventTitle}
                  </p>
                  <p style="margin:0 0 4px 0;font-size:13px;color:#5C5C5C;">
                    <strong style="color:#1A1024;">Fecha:</strong> ${eventDate}
                  </p>
                  <p style="margin:0 0 4px 0;font-size:13px;color:#5C5C5C;">
                    <strong style="color:#1A1024;">Folio:</strong>
                    <code style="background:#FAF7F2;padding:2px 6px;border-radius:4px;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:12px;">${folio}</code>
                  </p>
                </td>
              </tr>
            </table>

            <!-- CTA -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center" style="padding:8px 0 24px 0;">
                  <a href="${certUrl}"
                     target="_blank"
                     rel="noopener noreferrer"
                     style="display:inline-block;background:linear-gradient(135deg,#7C3AED,#EC4899);color:#FAF7F2;text-decoration:none;padding:16px 36px;border-radius:12px;font-size:16px;font-weight:700;letter-spacing:0.3px;box-shadow:0 6px 20px rgba(124,58,237,0.4);">
                    📜 Ver mi constancia
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin:0 0 8px 0;font-size:13px;line-height:1.6;color:#5C5C5C;">
              <strong style="color:#1A1024;">¿Como guardarla?</strong>
              Cuando abras tu constancia, en tu navegador elegi
              <strong>Archivo → Imprimir</strong> (o <kbd style="background:#F5EFE3;padding:1px 6px;border-radius:3px;font-family:inherit;">Ctrl</kbd> + <kbd style="background:#F5EFE3;padding:1px 6px;border-radius:3px;font-family:inherit;">P</kbd>),
              y selecciona <strong>"Guardar como PDF"</strong>.
              Queda lista para imprimir o compartir.
            </p>

            <p style="margin:16px 0 0 0;font-size:13px;line-height:1.6;color:#5C5C5C;">
              Si tienes alguna duda, responde este correo y con gusto te
              ayudamos.
            </p>
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="padding:20px 32px;background:#1A1024;text-align:center;">
            <p style="margin:0 0 4px 0;font-size:11px;color:rgba(250,247,242,0.5);text-transform:uppercase;letter-spacing:1.5px;font-weight:600;">
              Qlick Marketing Digital Academy
            </p>
            <p style="margin:0;font-size:10px;color:rgba(250,247,242,0.35);">
              Este es un correo transaccional. Si no esperabas este mensaje,
              puedes ignorarlo con seguridad.
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`.trim();

  // Log minimal para debugging (no loggeamos el html completo por tamaño).
  // eslint-disable-next-line no-console
  console.log(
    `[email/event-certificate] rendered folio=${folio} to=${email} subject="${subject}"`,
  );

  return { subject, html };
}