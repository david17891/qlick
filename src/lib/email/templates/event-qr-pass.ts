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
  /**
   * URL PUBLICA del QR (e.g. `https://qlick.digital/api/qr/abc123.png`).
   * FIX 2026-07-02 (sesion David): antes era un data URL inline
   * (`data:image/png;base64,...`) que NO se renderizaba en Gmail/Outlook.
   * Ahora el QR se sirve desde un endpoint publico y se referencia
   * por URL. Compatible con todos los clientes de email.
   *
   * Solo se usa si format === 'in_person' o 'hybrid'. Para eventos
   * puramente virtuales este campo se ignora.
   */
  qrImageUrl: string;
  /** URL pública del pase (la misma que codifica el QR). */
  checkInUrl: string;
  /**
   * Modalidad del evento (migration 20260707000000). Si no viene, se
   * asume 'in_person' (legacy compat).
   *
   * - `in_person` → muestra el QR como siempre.
   * - `virtual`   → muestra el bloque gate "SÍ, VOY" + reveal link.
   * - `hybrid`    → muestra ambos bloques.
   */
  format?: "in_person" | "virtual" | "hybrid";
  /**
   * URL pública del gate "SÍ, VOY" (`/api/event-gate/[token]/click`).
   * El handler registra intent_attended y redirige al streaming_url.
   *
   * Requerido si format !== 'in_person'.
   */
  gateUrl?: string;
  /**
   * Link de streaming directo (solo para mostrar en copy secundario,
   * el botón principal SIEMPRE va al gate).
   */
  streamingUrl?: string;
  /**
   * Nota visible al asistente sobre el acceso al streaming
   * (ej: "el link se desbloquea 10 min antes").
   */
  streamingAccessNote?: string;
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
   * Soporta 3 modalidades (migration 20260707000000):
   * - in_person: solo QR como antes
   * - virtual: bloque gate "SÍ, VOY" + reveal link streaming
   * - hybrid: ambos bloques
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
  // Format default = in_person para legacy compat. Si viene "hybrid" o
  // "virtual" y no hay gateUrl, caemos a in_person con warning silencioso
  // (no rompemos el render — el admin probablemente olvidó pasar el campo).
  const format = input.format ?? "in_person";
  const gateUrl = input.gateUrl ? esc(input.gateUrl) : null;
  const streamingNote = input.streamingAccessNote
    ? esc(input.streamingAccessNote)
    : null;

  // El QR image URL es publica (https://...). Validamos que sea absoluta
  // por seguridad (no inline data URLs que algunos clientes no renderizan).
  // FIX 2026-07-02: ahora se sirve desde /api/qr/[token].png en vez de
  // un data URL inline.
  const qrSrc = input.qrImageUrl.startsWith("http")
    ? input.qrImageUrl
    : `https://qlick.digital${input.qrImageUrl}`;

  // Subject: copy genérico, sin PII (anti-spam). El subject también se
  // inyecta en <title>...</title> del HTML, así que lo escapamos para
  // que un eventTitle con "<" o ">" no rompa el markup.
  // Adapt copy al formato (el subject refleja la modalidad).
  const subject =
    format === "virtual"
      ? `Tu acceso para "${esc(input.eventTitle)}"`
      : format === "hybrid"
        ? `Tu pase + acceso para "${esc(input.eventTitle)}"`
        : `Tu pase para "${esc(input.eventTitle)}"`;

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
              <p style="margin:8px 0 0;font-size:14px;color:#ffffff;opacity:0.95;">
            ${format === "virtual" ? "Tu acceso virtual está listo" :
              format === "hybrid" ? "Tu pase + acceso virtual" :
              "Tu pase está listo"}
          </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">
                Hola, ${name}
              </p>
              <p style="margin:0 0 24px;font-size:16px;line-height:1.5;">
                ${
                  format === "virtual"
                    ? `Confirmamos tu registro a <strong>"${eventTitle}"</strong>. Este evento es virtual — confirmá tu asistencia con el botón de abajo para recibir el link de acceso al stream.`
                    : format === "hybrid"
                      ? `Confirmamos tu registro a <strong>"${eventTitle}"</strong>. Podés ir presencialmente (mostrá el QR en la entrada) o sumarte virtualmente (confirmá con el botón de abajo).`
                      : `Confirmamos tu registro a <strong>"${eventTitle}"</strong>. Tu pase digital está acá. Muéstralo en la entrada — el staff lo escanea y listo.`
                }
              </p>

              ${
                /* Bloque QR: solo para in_person o hybrid. */
                format !== "virtual"
                  ? `
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
                      Escanea desde la app de cámara de tu celular o muestra esta pantalla al staff.
                    </p>
                  </td>
                </tr>
              </table>
              `
                  : ""
              }

              ${
                /* Bloque gate "SÍ, VOY": solo para virtual o hybrid. */
                format !== "in_person" && gateUrl
                  ? `
              <!-- Gate virtual: "SÍ, VOY A ENTRAR" -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:linear-gradient(135deg,#faf5ff 0%,#fdf2f8 100%);border:2px solid #6d28d9;border-radius:12px;margin-bottom:24px;">
                <tr>
                  <td align="center" style="padding:28px 24px;">
                    <p style="margin:0 0 8px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6d28d9;">
                      Acceso al evento virtual
                    </p>
                    <p style="margin:0 0 20px;font-size:14px;color:#1e293b;line-height:1.5;">
                      Confirmá que vas a entrar al stream para recibir el link de acceso.
                      ${
                        streamingNote
                          ? `<br><span style="color:#6d28d9;font-weight:600;">${streamingNote}</span>`
                          : ""
                      }
                    </p>
                    <a href="${gateUrl}" target="_blank" rel="noopener" style="display:inline-block;background:linear-gradient(135deg,#6d28d9 0%,#c026d3 100%);color:#ffffff;font-weight:700;font-size:18px;padding:18px 40px;border-radius:9999px;text-decoration:none;box-shadow:0 6px 20px -4px rgba(192,38,211,0.4);">
                      🎥 SÍ, VOY A ENTRAR
                    </a>
                    <p style="margin:16px 0 0;font-size:11px;color:#64748b;">
                      Al confirmar, te llevamos al stream en vivo.
                    </p>
                  </td>
                </tr>
              </table>
              `
                  : ""
              }

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

              <!-- CTA secundario: ver pase online (solo para in_person o hybrid).
                   Para virtual, el botón principal es el gate de arriba. -->
              ${
                format !== "virtual"
                  ? `
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:24px;">
                <tr>
                  <td align="center">
                    <a href="${checkInUrl}" target="_blank" rel="noopener" style="display:inline-block;background:linear-gradient(135deg,#6d28d9 0%,#c026d3 100%);color:#ffffff;font-weight:700;font-size:16px;padding:14px 32px;border-radius:9999px;text-decoration:none;box-shadow:0 4px 12px -2px rgba(192,38,211,0.3);">
                      Ver mi pase online
                    </a>
                  </td>
                </tr>
              </table>
              `
                  : ""
              }

              <p style="margin:0;font-size:13px;color:#64748b;line-height:1.5;">
                Si no puedes asistir, no hace falta que hagas nada. Si tienes
                dudas, responde este email y te ayudamos.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;padding:20px 32px;border-top:1px solid #e2e8f0;text-align:center;">
              <p style="margin:0;font-size:12px;color:#64748b;">
                Qlick Marketing Digital · Pase digital
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