/**
 * Templates de emails transaccionales (Fase 5).
 *
 * Convención: cada template exporta una función que toma datos tipados y
 * devuelve `{ subject, html }`. El wrapper (`brevo-client.ts`) los usa
 * directamente — el template NO manda el email, solo produce el contenido.
 *
 * **Por qué HTML inline (no React Email):** simplicidad. React Email
 * agrega 1 dep + build step. Para 2-3 templates, HTML inline es más fácil
 * de mantener. Si crece a 10+, migrar a React Email.
 *
 * **Por qué NO PII en subject:** filtros anti-spam penalizan subjects con
 * emails/nombres. Usar siempre copy genérico ("Nuevo lead del evento X").
 */

export interface SurveyWithConsentInput {
  /** Nombre del lead (para saludo en body, NO en subject). */
  leadName: string;
  /** Email del lead (NO en subject, sí en body). */
  leadEmail: string;
  /** Teléfono del lead (NO en subject, sí en body). */
  leadPhone: string | null;
  /** Título del evento de origen. */
  eventTitle: string;
  /** Interés comercial capturado en la encuesta. */
  commercialInterest: string | null;
  /** UUID del lead en CRM (para el link al drawer). */
  leadId: string;
  /** Base URL de la app. Default: NEXT_PUBLIC_APP_URL o http://localhost:3000. */
  appUrl?: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
}

/** Escapea HTML básico para evitar inyección en interpolación de strings. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Render del email cuando entra una survey con `consent_to_contact = true`.
 *
 *  Este es el único trigger de Fase 5 Bloque 1: notifica al admin que hay
 *  un nuevo lead del CRM, con link directo al drawer del lead.
 *
 *  Si `commercialInterest` es null, la fila correspondiente no se renderiza
 *  (no se muestra línea vacía). */
export function renderSurveyWithConsentEmail(
  input: SurveyWithConsentInput,
): RenderedEmail {
  const appUrl = (input.appUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000")
    .replace(/\/$/, "");
  // Construimos el URL crudo y lo escapamos para HTML (los `?` y `&`
  // deben ser `&amp;` para ser HTML5 válido en atributos href).
  const leadDrawerUrl = esc(
    `${appUrl}/admin?tab=crm&leadId=${encodeURIComponent(input.leadId)}`,
  );
  const name = esc(input.leadName || "Lead");
  const email = esc(input.leadEmail);
  const phone = input.leadPhone ? esc(input.leadPhone) : null;
  const eventTitle = esc(input.eventTitle);
  const interest = input.commercialInterest ? esc(input.commercialInterest) : null;

  const subject = `Nuevo lead del evento "${input.eventTitle}"`;

  // HTML inline. Brand colors alineados con el resto de Qlick:
  // bg-brand-50 (#faf5ff), text-brand-700 (#6d28d9), bg-brand-500 (#a855f7).
  // Botón CTA con brand-gradient (purple → pink → orange).
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
              <p style="margin:8px 0 0;font-size:14px;color:#ffffff;opacity:0.95;">Nuevo lead de evento</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">
                Hola,
              </p>
              <p style="margin:0 0 24px;font-size:16px;line-height:1.5;">
                ${name} completó la encuesta post-evento de <strong>"${eventTitle}"</strong>
                con consentimiento comercial. Ya quedó como lead en el CRM.
              </p>

              <!-- Card con datos del lead -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#faf5ff;border:1px solid #e9d5ff;border-radius:12px;margin-bottom:24px;">
                <tr>
                  <td style="padding:20px;">
                    <p style="margin:0 0 8px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#6d28d9;">Nombre</p>
                    <p style="margin:0 0 16px;font-size:16px;color:#1e293b;">${name}</p>

                    <p style="margin:0 0 8px;font-size:12px;font-weight:700;text-transform:upperpx;letter-spacing:0.5px;color:#6d28d9;">Email</p>
                    <p style="margin:0 0 16px;font-size:16px;color:#1e293b;">
                      <a href="mailto:${email}" style="color:#6d28d9;text-decoration:none;">${email}</a>
                    </p>

                    ${phone ? `
                    <p style="margin:0 0 8px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#6d28d9;">Teléfono</p>
                    <p style="margin:0 0 16px;font-size:16px;color:#1e293b;">
                      <a href="https://wa.me/${phone.replace(/\D/g, '')}" style="color:#6d28d9;text-decoration:none;">${phone}</a>
                    </p>
                    ` : ""}

                    ${interest ? `
                    <p style="margin:0 0 8px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#6d28d9;">Interés comercial</p>
                    <p style="margin:0;font-size:16px;color:#1e293b;font-style:italic;">"${interest}"</p>
                    ` : ""}
                  </td>
                </tr>
              </table>

              <!-- CTA -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:24px;">
                <tr>
                  <td align="center">
                    <a href="${leadDrawerUrl}" target="_blank" rel="noopener" style="display:inline-block;background:linear-gradient(135deg,#6d28d9 0%,#c026d3 100%);color:#ffffff;font-weight:700;font-size:16px;padding:14px 32px;border-radius:9999px;text-decoration:none;box-shadow:0 4px 12px -2px rgba(192,38,211,0.3);">
                      Ver lead en el CRM →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:13px;color:#64748b;line-height:1.5;">
                El link abre directamente el drawer del lead con badge de evento,
                historial de contactos y notas. Si querés contactar a ${name.split(" ")[0]}
                ahora, hacelo desde el botón de WhatsApp en el drawer.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;padding:20px 32px;border-top:1px solid #e2e8f0;text-align:center;">
              <p style="margin:0;font-size:12px;color:#64748b;">
                Qlick Marketing Integral · Notificación automática
              </p>
              <p style="margin:8px 0 0;font-size:11px;color:#94a3b8;">
                Este email se envía porque ${email} aceptó recibir contacto comercial
                al completar la encuesta del evento.
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