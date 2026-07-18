/**
 * Templates de recordatorios automáticos por email (Fase 7a, Bloque 3).
 *
 * El cron /api/cron/event-reminders manda 2 tipos:
 *   - 24h antes: "te recordamos que mañana es el evento X"
 *   - 2h antes:  "te recordamos que en 2 horas empieza el evento X"
 *
 * Convención heredada de los otros templates:
 *   - HTML inline (no React Email).
 *   - Sin PII en subject.
 *   - Brand colors Qlick.
 *   - `esc()` para evitar inyección en interpolación.
 */

export interface EventReminderInput {
  attendeeName: string;
  /** Email del destinatario (NO se incluye en subject, sí en body del log). */
  attendeeEmail: string;
  eventTitle: string;
  eventStartsAt: string; // ISO
  eventLocation: string | null;
  /**
   * Ventana del recordatorio. FIX 2026-07-10 (Sprint 2 v2): soportamos
   * las 5 ventanas (24h, 8am Phoenix, 10am Phoenix, 2h, 1h). El copy
   * del email se adapta: 24h usa copy "mañana", 8am/10am/2h/1h usan
   * copy urgente (HOY o en N horas).
   */
  reminderKind: "24h" | "8am" | "10am" | "2h" | "1h";
  /** URL del pase (`/check-in/[token]`). */
  checkInUrl: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
}

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
 * destinatario. Como el admin escribe hora local del navegador (Phoenix,
 * UTC-7) y la DB guarda timestamptz UTC, el formateo anterior desplazaba
 * la hora +7h en emails (lead recibía "mañana 17:00" cuando el evento es
 * a las 10:00 hora Pacífico). Ahora usamos la zona del proyecto.
 */
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
 * Copy del recordatorio. FIX 2026-07-10: 5 ventanas soportadas.
 *   - 24h: "te recordamos que mañana es..." + CTA "agregar a calendario"
 *   - 8am / 10am (Phoenix día del evento): "HOY es..." + CTA "abrir mi pase"
 *   - 2h / 1h:  "te recordamos que en N horas..." + CTA "abrir mi pase"
 *
 * IMPORTANTE: `subject`, `headline` y `body` retornados por esta
 * funcion son **HTML safe por construccion**:
 *   - `subject` se reasigna a `subjectSafe` en el caller.
 *   - `headline` se inyecta con esc() en el caller.
 *   - `body` se construye con `titleSafe` y `locSafe` (ya escapados)
 *     + `eventTime` (toLocaleTimeString, no produce HTML). NO re-escapar
 *     `body` en el caller porque romperia titleSafe con doble escape
 *     (e.g. "Marketing &amp; IA" -> "Marketing &amp;amp; IA").
 *   Para audit: ver "reauditoria 2026-07-18" en PROJECT-LOG.
 */
function buildReminderCopy(input: EventReminderInput): {
  subject: string;
  headline: string;
  body: string;
  ctaLabel: string;
} {
  const eventDate = formatEventDate(input.eventStartsAt);
  const eventTime = formatEventTime(input.eventStartsAt);
  // El body se inyecta en HTML interpolado (`${body}`). Hay que escapar
  // eventTitle y eventLocation para que un título con "<script>" no
  // ejecute JS en el cliente de correo.
  const titleSafe = esc(input.eventTitle);
  const locSafe = input.eventLocation ? esc(input.eventLocation) : null;

  // 8am / 10am Phoenix: copy "HOY es el taller".
  if (input.reminderKind === "8am" || input.reminderKind === "10am") {
    const hoursLabel = input.reminderKind === "8am" ? "HOY" : "En 1 hora";
    return {
      subject: `${hoursLabel}: ${input.eventTitle}`,
      headline: `${hoursLabel} es el taller`,
      body: `<strong>"${titleSafe}"</strong> ${input.reminderKind === "8am" ? "empieza HOY" : "empieza en 1 hora"} a las ${eventTime}.` +
        (locSafe ? ` Lugar: ${locSafe}.` : ""),
      ctaLabel: "Abrir mi pase",
    };
  }
  // 1h / 2h: copy "en N horas".
  if (input.reminderKind === "2h" || input.reminderKind === "1h") {
    const hoursLabel = input.reminderKind === "2h" ? "En 2 horas" : "En 1 hora";
    return {
      subject: `${hoursLabel}: ${input.eventTitle}`,
      headline: `Nos vemos en ~${input.reminderKind}`,
      body: `Te recordamos que <strong>"${titleSafe}"</strong> empieza a las ${eventTime}.` +
        (locSafe ? ` Lugar: ${locSafe}.` : ""),
      ctaLabel: "Abrir mi pase",
    };
  }
  // 24h: copy "mañana".
  return {
    subject: `Mañana: ${input.eventTitle}`,
    headline: `Te esperamos mañana`,
    body: `Te recordamos que <strong>"${titleSafe}"</strong> es mañana ${eventDate} a las ${eventTime}.` +
      (locSafe ? ` Lugar: ${locSafe}.` : ""),
    ctaLabel: "Ver mi pase",
  };
}

/**
 * Render del email de recordatorio. Reutiliza el patrón de los otros
 * templates (header gradient, body card, CTA, footer).
 */
export function renderEventReminderEmail(
  input: EventReminderInput,
): RenderedEmail {
  const name = esc(input.attendeeName || "Asistente");
  const eventTitle = esc(input.eventTitle);
  const eventDate = formatEventDate(input.eventStartsAt);
  const eventTime = formatEventTime(input.eventStartsAt);
  const eventLocation = input.eventLocation ? esc(input.eventLocation) : null;
  const checkInUrl = esc(input.checkInUrl);
  const { subject, headline, body, ctaLabel } = buildReminderCopy(input);
  // El subject se inyecta en <title>...</title>; escapamos porque eventTitle
  // podría contener "<" o ">" que rompan el markup.
  const subjectSafe = esc(subject);

  const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subjectSafe}</title>
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
              <p style="margin:8px 0 0;font-size:14px;color:#ffffff;opacity:0.95;">${esc(headline)}</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">
                Hola, ${name}
              </p>
              <p style="margin:0 0 24px;font-size:16px;line-height:1.5;">
                ${body}
              </p>

              <!-- Card con datos del evento -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#faf5ff;border:1px solid #e9d5ff;border-radius:12px;margin-bottom:24px;">
                <tr>
                  <td style="padding:20px;">
                    <p style="margin:0 0 8px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#6d28d9;">Evento</p>
                    <p style="margin:0 0 16px;font-size:16px;color:#1e293b;">${eventTitle}</p>

                    <p style="margin:0 0 8px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#6d28d9;">Cuándo</p>
                    <p style="margin:0 0 16px;font-size:16px;color:#1e293b;">
                      ${eventDate} · ${eventTime}
                    </p>

                    ${eventLocation ? `
                    <p style="margin:0 0 8px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#6d28d9;">Dónde</p>
                    <p style="margin:0;font-size:16px;color:#1e293b;">${eventLocation}</p>
                    ` : ""}
                  </td>
                </tr>
              </table>

              <!-- CTA -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:24px;">
                <tr>
                  <td align="center">
                    <a href="${checkInUrl}" target="_blank" rel="noopener" style="display:inline-block;background:linear-gradient(135deg,#6d28d9 0%,#c026d3 100%);color:#ffffff;font-weight:700;font-size:16px;padding:14px 32px;border-radius:9999px;text-decoration:none;box-shadow:0 4px 12px -2px rgba(192,38,211,0.3);">
                      ${ctaLabel}
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:13px;color:#64748b;line-height:1.5;">
                Si no puedes asistir, no hace falta que respondas — liberamos tu lugar.
                Si tienes dudas, responde este email.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;padding:20px 32px;border-top:1px solid #e2e8f0;text-align:center;">
              <p style="margin:0;font-size:12px;color:#64748b;">
                Qlick Marketing Digital · Recordatorio automático
              </p>
              <p style="margin:8px 0 0;font-size:11px;color:#94a3b8;">
                Enviado porque confirmaste tu registro. No queremos que te lo pierdas.
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