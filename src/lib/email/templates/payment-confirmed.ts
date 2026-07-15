/**
 * Template del email "recibimos tu pago" (sprint pagos-manuales 2026-07-15).
 *
 * Se manda al cliente cuando el admin confirma manualmente un pago
 * (efectivo, OXXO, SPEI, tarjeta en puerta, transferencia) o cuando
 * el webhook de Stripe valida un pago que antes estaba pending.
 *
 * Convencion heredada del resto de templates de Qlick:
 *  - HTML inline (no React Email).
 *  - Sin PII en subject (filtros anti-spam).
 *  - Brand colors Qlick (purple -> pink -> orange).
 *  - esc() en TODA interpolacion dinamica (memoria HOT: XSS).
 */

export interface PaymentConfirmedInput {
  /** Nombre del confirmado (para saludo en body). */
  attendeeName: string;
  /** Email del confirmado (destinatario, NO en subject). */
  attendeeEmail: string;
  /** Titulo del evento. */
  eventTitle: string;
  /** Fecha/hora de inicio del evento (ISO). */
  eventStartsAt: string;
  /** Lugar del evento (opcional). */
  eventLocation: string | null;
  /** Metodo de pago que el admin registro. */
  paymentMethod: string;
  /** Monto cobrado en MXN. */
  amountMXN: number;
  /** Moneda (default MXN). */
  currency?: string;
  /** Notas opcionales del admin (visibles en el email). */
  notes?: string | null;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers locales                                                   */
/* ------------------------------------------------------------------ */

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatEventDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("es-MX", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatEventTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("es-MX", {
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    });
  } catch {
    return "";
  }
}

function methodLabel(method: string): string {
  switch (method) {
    case "card":
      return "Tarjeta";
    case "oxxo":
      return "OXXO";
    case "spei":
      return "SPEI";
    case "cash":
      return "Efectivo";
    case "transfer":
      return "Transferencia";
    default:
      return method;
  }
}

/* ------------------------------------------------------------------ */
/*  Render principal                                                  */
/* ------------------------------------------------------------------ */

export function renderPaymentConfirmedEmail(
  input: PaymentConfirmedInput,
): RenderedEmail {
  const name = esc(input.attendeeName || "Asistente");
  const email = esc(input.attendeeEmail);
  const eventTitle = esc(input.eventTitle);
  const eventDate = formatEventDate(input.eventStartsAt);
  const eventTime = formatEventTime(input.eventStartsAt);
  const eventLocation = input.eventLocation ? esc(input.eventLocation) : null;
  const method = methodLabel(input.paymentMethod);
  const currency = input.currency ?? "MXN";
  const amountFormatted = `$${input.amountMXN.toFixed(2)} ${currency}`;
  const notes = input.notes ? esc(input.notes) : null;

  const subject = `Pago confirmado · ${input.eventTitle}`;

  // HTML body. Mismo patron visual que event-qr-pass.ts y el resto
  // de templates de Qlick.
  const html = `
<!DOCTYPE html>
<html lang="es-MX">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1a1a1a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fafafa;padding:24px 0;">
  <tr>
    <td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.06);">
        <!-- Header con brand gradient (purple -> pink -> orange). -->
        <tr>
          <td style="background:linear-gradient(135deg,#7c3aed 0%,#ec4899 50%,#f97316 100%);padding:32px 24px;text-align:center;">
            <p style="margin:0;color:#ffffff;font-size:13px;letter-spacing:0.5px;text-transform:uppercase;opacity:0.85;">Qlick Marketing Digital</p>
            <h1 style="margin:8px 0 0 0;color:#ffffff;font-size:24px;font-weight:700;">¡Pago confirmado!</h1>
          </td>
        </tr>

        <!-- Saludo. -->
        <tr>
          <td style="padding:32px 24px 16px 24px;">
            <p style="margin:0;font-size:16px;line-height:1.5;">Hola <strong>${name}</strong>,</p>
            <p style="margin:12px 0 0 0;font-size:15px;line-height:1.5;color:#4a4a4a;">
              Confirmamos tu pago para el evento <strong style="color:#7c3aed;">${eventTitle}</strong>. Tu lugar esta reservado.
            </p>
          </td>
        </tr>

        <!-- Card con resumen del pago. -->
        <tr>
          <td style="padding:8px 24px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#faf5ff;border:1px solid #e9d5ff;border-radius:12px;padding:20px;">
              <tr>
                <td>
                  <p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#7c3aed;font-weight:600;">Resumen del pago</p>
                  <p style="margin:8px 0 0 0;font-size:24px;font-weight:700;color:#1a1a1a;">${amountFormatted}</p>
                  <p style="margin:4px 0 0 0;font-size:14px;color:#4a4a4a;">${method}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Detalles del evento. -->
        <tr>
          <td style="padding:24px 24px 8px 24px;">
            <p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#4a4a4a;font-weight:600;">Detalles del evento</p>
            <p style="margin:8px 0 0 0;font-size:18px;font-weight:600;color:#1a1a1a;">${eventTitle}</p>
            <p style="margin:4px 0 0 0;font-size:14px;color:#4a4a4a;">${eventDate} &middot; ${eventTime}</p>
            ${eventLocation ? `<p style="margin:4px 0 0 0;font-size:14px;color:#4a4a4a;">Lugar: ${eventLocation}</p>` : ""}
          </td>
        </tr>

        ${notes ? `
        <!-- Notas del admin. -->
        <tr>
          <td style="padding:16px 24px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:16px;">
              <tr>
                <td>
                  <p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#c2410c;font-weight:600;">Notas del equipo</p>
                  <p style="margin:8px 0 0 0;font-size:14px;color:#7c2d12;line-height:1.5;">${notes}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        ` : ""}

        <!-- Siguiente paso. -->
        <tr>
          <td style="padding:24px 24px 8px 24px;">
            <p style="margin:0;font-size:15px;line-height:1.5;color:#4a4a4a;">
              Te enviaremos los detalles finales del evento (lugar, link de Zoom si es virtual, y tu pase de ingreso) en las siguientes horas.
            </p>
            <p style="margin:12px 0 0 0;font-size:15px;line-height:1.5;color:#4a4a4a;">
              Si tienes dudas, responde a este correo o escribenos por WhatsApp.
            </p>
          </td>
        </tr>

        <!-- Footer. -->
        <tr>
          <td style="padding:24px;border-top:1px solid #f0f0f0;text-align:center;">
            <p style="margin:0;font-size:12px;color:#9a9a9a;">
              Qlick Marketing Digital &middot; Mexicali, BC, Mexico
            </p>
            <p style="margin:8px 0 0 0;font-size:11px;color:#bcbcbc;">
              Recibes este correo porque confirmaste asistencia a un evento de Qlick.
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`.trim();

  // Plain text fallback.
  const text = `
¡Pago confirmado!

Hola ${input.attendeeName || "Asistente"},

Confirmamos tu pago para el evento ${input.eventTitle}. Tu lugar esta reservado.

RESUMEN DEL PAGO
- Monto: ${amountFormatted}
- Metodo: ${method}

DETALLES DEL EVENTO
- ${eventTitle}
- ${eventDate} · ${eventTime}
${eventLocation ? `- Lugar: ${input.eventLocation}\n` : ""}${notes ? `\nNOTAS DEL EQUIPO\n${input.notes}\n` : ""}
SIGUIENTE PASO
Te enviaremos los detalles finales del evento (lugar, link de Zoom si es virtual, y tu pase de ingreso) en las siguientes horas.

Si tienes dudas, responde a este correo o escribenos por WhatsApp.

---
Qlick Marketing Digital · Mexicali, BC, Mexico
Recibes este correo porque confirmaste asistencia a un evento de Qlick.
`.trim();

  return { subject, html, text };
}
