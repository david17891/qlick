/**
 * Template del email de "pase digital" que recibe el asistente tras
 * inscribirse a un evento (Fase 7a, Bloque 1).
 *
 * El email embebe el QR visual (data URL PNG) que codifica la URL del
 * pase en `/check-in/[token]`. El asistente puede:
 *  - Mostrar el QR en puerta desde su celular (escaneado por el staff).
 *  - Usar el botón "Ver mi pase online" como alternativa.
 *
 * Convención heredada del template `survey-with-consent.ts`:
 *  - HTML inline (no React Email).
 *  - Sin PII en subject (filtros anti-spam).
 *  - Brand colors Qlick (purple → pink → orange).
 */

export interface EventQrPassInput {
  /** Nombre del asistente (para saludo en body). */
  attendeeName: string;
  /** Email del asistente (destinatario, NO en subject). */
  attendeeEmail: string;
  /** Título del evento. */
  eventTitle: string;
  /** Fecha/hora de inicio del evento (ISO). */
  eventStartsAt: string;
  /** Lugar del evento (opcional). */
  eventLocation: string | null;
  /** Data URL del QR (base64 PNG, ~10KB). Generado con `generateQrDataUrl`. */
  qrDataUrl: string;
  /** URL pública del pase (la misma que codifica el QR). */
  checkInUrl: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
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

/** Formato corto de fecha (es-MX, ej. "6 de julio de 2026"). */
function formatEventDate(iso: string): string {
  const d = new Date(iso);
  // Date.toLocaleDateString devuelve "Invalid Date" sin throw cuando el
  // input no parsea. Chequeamos getTime() para fallback seguro.
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Formato de hora (es-MX, ej. "18:00"). */
function formatEventTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

/**
 * Render del email de pase digital.
 *
 * El QR está embebido inline (`<img src="data:image/png;base64,...">`)
 * porque adjuntar imágenes vía Resend requiere subir el asset a un CDN
 * primero (más fricción). Para un QR de 512px (~10KB) inline es la
 * opción más simple.
 *
 * Si `eventLocation` es null, esa fila se omite (no se muestra línea vacía).
 */
export function renderEventQrPassEmail(
  input: EventQrPassInput,
): RenderedEmail {
  const name = esc(input.attendeeName || "Asistente");
  const email = esc(input.attendeeEmail);
  const eventTitle = esc(input.eventTitle);
  const eventDate = formatEventDate(input.eventStartsAt);
  const eventTime = formatEventTime(input.eventStartsAt);
  const eventLocation = input.eventLocation ? esc(input.eventLocation) : null;
  const checkInUrl = esc(input.checkInUrl);
  // El QR data URL ya viene como "data:image/png;base64,..." — no escapar
  // porque rompería el base64. Confiamos en `qrcode` lib (no produce chars
  // peligrosos para HTML attribute en este contexto).
  const qrSrc = input.qrDataUrl;

  // Subject: copy genérico, sin PII (anti-spam). El subject también se
  // inyecta en <title>...</title> del HTML, así que lo escapamos para
  // que un eventTitle con "<" o ">" no rompa el markup.
  const subject = `Tu pase para "${esc(input.eventTitle)}"`;

  const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#faf5ff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1e293b;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#faf5ff;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="560" style="max-width:560px;background:#ffffff;border-radius:16px;border:1px solid #e9d5ff;overflow:hidden;">
          <!-- Header con logo -->
          <tr>
            <td style="background:linear-gradient(135deg,#6d28d9 0%,#c026d3 50%,#f97316 100%);padding:24px 32px;text-align:center;">
              <h1 style="margin:0;font-size:24px;font-weight:700;color:#ffffff;">Qlick Marketing</h1>
              <p style="margin:8px 0 0;font-size:14px;color:#ffffff;opacity:0.95;">Tu pase está listo</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">
                Hola, ${name}
              </p>
              <p style="margin:0 0 24px;font-size:16px;line-height:1.5;">
                Confirmamos tu registro a <strong>"${eventTitle}"</strong>.
                Tu pase digital está acá. Mostralo en la entrada — el staff
                lo escanea y listo.
              </p>

              <!-- QR (centrado, en card blanca con borde) -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#faf5ff;border:1px solid #e9d5ff;border-radius:12px;margin-bottom:24px;">
                <tr>
                  <td align="center" style="padding:24px;">
                    <p style="margin:0 0 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6d28d9;">
                      Tu código QR
                    </p>
                    <img
                      src="${qrSrc}"
                      alt="Código QR de entrada para ${eventTitle}"
                      width="240"
                      height="240"
                      style="display:block;margin:0 auto;background:#ffffff;padding:12px;border-radius:8px;border:1px solid #e9d5ff;"
                    />
                    <p style="margin:12px 0 0;font-size:11px;color:#64748b;">
                      Escaneá desde la app de cámara de tu celular o mostrá esta pantalla al staff.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Card con datos del evento -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#faf5ff;border:1px solid #e9d5ff;border-radius:12px;margin-bottom:24px;">
                <tr>
                  <td style="padding:20px;">
                    <p style="margin:0 0 8px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#6d28d9;">Evento</p>
                    <p style="margin:0 0 16px;font-size:16px;color:#1e293b;">${eventTitle}</p>

                    <p style="margin:0 0 8px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#6d28d9;">Cuándo</p>
                    <p style="margin:0 0 16px;font-size:16px;color:#1e293b;">
                      ${eventDate}${eventTime ? ` · ${eventTime}` : ""}
                    </p>

                    ${eventLocation ? `
                    <p style="margin:0 0 8px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#6d28d9;">Dónde</p>
                    <p style="margin:0;font-size:16px;color:#1e293b;">${eventLocation}</p>
                    ` : ""}
                  </td>
                </tr>
              </table>

              <!-- CTA secundario: ver pase online -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:24px;">
                <tr>
                  <td align="center">
                    <a href="${checkInUrl}" target="_blank" rel="noopener" style="display:inline-block;background:linear-gradient(135deg,#6d28d9 0%,#c026d3 100%);color:#ffffff;font-weight:700;font-size:16px;padding:14px 32px;border-radius:9999px;text-decoration:none;box-shadow:0 4px 12px -2px rgba(192,38,211,0.3);">
                      Ver mi pase online
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:13px;color:#64748b;line-height:1.5;">
                Si no podés asistir, no hace falta que hagas nada. Si tenés
                dudas, respondé este email y te ayudamos.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;padding:20px 32px;border-top:1px solid #e2e8f0;text-align:center;">
              <p style="margin:0;font-size:12px;color:#64748b;">
                Qlick Marketing Integral · Pase digital
              </p>
              <p style="margin:8px 0 0;font-size:11px;color:#94a3b8;">
                Enviado a ${email} porque te registraste en este evento.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim();

  return { subject, html };
}