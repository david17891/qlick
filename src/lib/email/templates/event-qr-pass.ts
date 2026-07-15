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
   * Precio del evento en MXN (sprint pagos-manuales 2026-07-15). Si es
   * > 0, el email agrega un bloque "Esta entrada cuesta $X" + botón al
   * checkout publico. Si es 0 o undefined, no se muestra nada (evento
   * gratis, no aplica).
   */
  priceMXN?: number;
  /**
   * URL publica del checkout del evento (sprint 2026-07-15). Apunta a
   * `/pagar/evento/[slug]?confirmation=[id]` para que el pago quede
   * linkeado al confirmado correcto. Solo se muestra si `priceMXN > 0`
   * y si `paymentUrl` esta set.
   */
  paymentUrl?: string;
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

/**
 * FIX 2026-07-07 (sesión David, "bot pone 17:00 UTC cuando admin escribió
 * 10:00"): antes usábamos `timeZone: "UTC"` y mostrábamos la hora UTC al
 * destinatario del pase. Como el admin escribe hora local del navegador
 * (Phoenix, UTC-7) y la DB guarda timestamptz UTC, el formateo anterior
 * desplazaba la hora +7h. Ahora usamos la zona del proyecto.
 */
/** Formato corto de fecha (es-MX, ej. "11 de julio de 2026"). */
function formatEventDate(iso: string): string {
  const d = new Date(iso);
  // Date.toLocaleDateString devuelve "Invalid Date" sin throw cuando el
  // input no parsea. Chequeamos getTime() para fallback seguro.
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Phoenix",
  });
}

/** Formato de hora (es-MX, ej. "10:00"). */
function formatEventTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Phoenix",
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
  // FIX 2026-07-08 (audit XSS): escapamos el URL antes de inyectarlo en
  // `src="${qrSrc}"` aunque hoy viene 100% interno (bot-engine.ts construye
  // la URL con un token DB y un appBaseUrl fijo). Defensa en profundidad:
  // si alguien cambia el upstream para leer de DB sin sanitizar, el
  // template sigue siendo seguro. La validación de `startsWith("http")`
  // + concatenación con `qlick.digital` se aplica ANTES del escape
  // (queremos el URL semántico para el atributo src, no la versión
  // escapada que rompería los `:` y `/`).
  const qrSrcRaw = input.qrImageUrl.startsWith("http")
    ? input.qrImageUrl
    : `https://qlick.digital${input.qrImageUrl}`;
  const qrSrc = esc(qrSrcRaw);

  // Subject: copy genérico, sin PII (anti-spam). El subject también se
  // inyecta en <title>...</title> del HTML, así que lo escapamos para
  // que un eventTitle con "<" o ">" no rompa el markup.
  // Adapt copy al formato (el subject refleja la modalidad).
  // Migration 20260707093000: virtual/hybrid pueden NO tener link aún —
  // el subject siempre dice "tu pase" (no promete acceso a algo que
  // aún no existe).
  const hasVirtualAccess = (format === "virtual" || format === "hybrid") && Boolean(gateUrl);
  const subject = `Tu pase para "${esc(input.eventTitle)}"`;
  // Mostrar QR cuando NO hay acceso virtual garantizado (porque es la
  // pieza que el asistente guarda). Migración 20260707093000: virtual
  // sin link también muestra QR — es el "pase" que el asistente debe
  // conservar hasta que llegue el link del stream.
  const showQr = format === "in_person" || format === "hybrid" || !hasVirtualAccess;

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
            ${hasVirtualAccess
                ? (format === "hybrid"
                    ? "Tu pase + acceso virtual están listos"
                    : "Tu acceso virtual está listo")
                : "Tu pase está listo"}
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
                  format === "virtual" && hasVirtualAccess
                    ? `Gracias por registrarte a <strong>"${eventTitle}"</strong>. Este evento es virtual — confirma tu asistencia con el botón de abajo para recibir el link de acceso al stream.`
                    : format === "virtual"
                      ? `Gracias por registrarte a <strong>"${eventTitle}"</strong>. Este es un evento virtual. Tu pase con QR ya está listo (te lo mandamos al final del correo), y el link del stream te lo enviamos por correo el día del evento.`
                      : format === "hybrid" && hasVirtualAccess
                        ? `Gracias por registrarte a <strong>"${eventTitle}"</strong>. Puedes ir presencialmente (muestra el QR en la entrada) o sumarte virtualmente (confirma con el botón de abajo).`
                        : format === "hybrid"
                          ? `Gracias por registrarte a <strong>"${eventTitle}"</strong>. Puedes ir presencialmente (muestra el QR en la entrada) o esperar al link del stream que te enviaremos por correo el día del evento.`
                          : `Gracias por registrarte a <strong>"${eventTitle}"</strong>. Tu pase digital está aquí. Muéstralo en la entrada — el staff lo escanea y listo.`
                }
              </p>

              ${
                /*
                  Bloque de pago (sprint pagos-manuales 2026-07-15). Solo
                  se muestra si el evento es de cobro (priceMXN > 0) y si
                  el caller paso `paymentUrl`. CTA: boton al checkout
                  publico. Copy: cuanto cuesta + aclaracion "tu lugar
                  queda reservado al pagar".
                */
                input.priceMXN && input.priceMXN > 0 && input.paymentUrl
                  ? `
              <!-- Pago requerido -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;margin-bottom:24px;">
                <tr>
                  <td style="padding:20px;">
                    <p style="margin:0 0 8px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#c2410c;">
                      Pago requerido para confirmar tu lugar
                    </p>
                    <p style="margin:0 0 12px;font-size:22px;font-weight:700;color:#1a1a1a;">
                      $${input.priceMXN.toLocaleString("es-MX")} MXN
                    </p>
                    <p style="margin:0 0 16px;font-size:13px;line-height:1.5;color:#7c2d12;">
                      Tu lugar queda <strong>reservado provisionalmente</strong> al confirmar asistencia. Para que el admin marque el pago como confirmado, completa el pago por tarjeta, OXXO, SPEI o transferencia.
                    </p>
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto;">
                      <tr>
                        <td align="center" style="background:#c2410c;border-radius:8px;">
                          <a href="${esc(input.paymentUrl)}" target="_blank" style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
                            Pagar entrada →
                          </a>
                        </td>
                      </tr>
                    </table>
                    <p style="margin:12px 0 0;font-size:11px;color:#9a9a9a;">
                      Si prefieres pagar en efectivo en puerta o por transferencia, avísale al equipo de Qlick y te registramos el pago a mano.
                    </p>
                  </td>
                </tr>
              </table>
              `
                  : ""
              }

              ${
                /* Bloque QR: in_person, hybrid, o virtual SIN link. */
                showQr
                  ? `
              <!-- QR (centrado, en card blanca con borde) -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#faf5ff;border:1px solid #e9d5ff;border-radius:12px;margin-bottom:24px;">
                <tr>
                  <td align="center" style="padding:24px;">
                    <p style="margin:0 0 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6d28d9;">
                      ${format === "in_person" ? "Tu código QR" : "Tu pase digital"}
                    </p>
                    <img
                      src="${qrSrc}"
                      alt="Pase digital para ${eventTitle}"
                      width="240"
                      height="240"
                      style="display:block;margin:0 auto;background:#ffffff;padding:12px;border-radius:8px;border:1px solid #e9d5ff;"
                    />
                    <p style="margin:12px 0 0;font-size:11px;color:#64748b;">
                      ${format === "in_person"
                        ? "Escanea desde la app de cámara de tu celular o muestra esta pantalla al staff."
                        : "Guarda este pase. Cuando llegue el día del evento lo usarás para confirmar tu asistencia virtual."}
                    </p>
                  </td>
                </tr>
              </table>
              `
                  : ""
              }

              ${
                /* Bloque gate "SÍ, VOY": solo para virtual/hybrid CON link. */
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
                      Confirma que vas a entrar al stream para recibir el link de acceso.
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

              ${
                /* Migration 20260707093000: bloque "link pendiente" para
                    virtual/hybrid SIN link aún. NO promete fecha exacta
                    (eso lo controla el operador al cargar el link). */
                (format === "virtual" || format === "hybrid") && !gateUrl
                  ? `
              <!-- Link pendiente: lo enviamos el día del evento -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:linear-gradient(135deg,#fffbeb 0%,#fef3c7 100%);border:2px solid #f59e0b;border-radius:12px;margin-bottom:24px;">
                <tr>
                  <td style="padding:24px;">
                    <p style="margin:0 0 8px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#b45309;">
                      ⏳ Link del stream pendiente
                    </p>
                    <p style="margin:0 0 0;font-size:14px;color:#1e293b;line-height:1.5;">
                      Aún no tenemos configurado el link del evento — te lo enviamos
                      por correo y por WhatsApp el día del evento. Estate atento a
                      tu bandeja de entrada.
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