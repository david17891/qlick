import { getAdminNotificationRecipients } from "@/lib/email/admin-recipients";
import { sendEmail } from "@/lib/email/brevo-client";
import { appBaseUrl } from "@/lib/utils";

export interface ServiceLeadNotificationInput {
  leadName?: string | null;
  leadEmail?: string | null;
  phoneNormalized: string;
  serviceSlug: string;
  variantSlug?: string | null;
  category: string;
  needSummary: string;
  preferredContactTime?: string | null;
  campaignKey?: string | null;
  crmUrl?: string | null;
  isAppointmentConfirmed?: boolean;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** URL vigente del panel para que el correo no dependa de rutas legacy. */
export function buildServiceLeadCrmUrl(crmUrl?: string | null): string {
  return crmUrl?.trim() || `${appBaseUrl()}/admin?tab=servicios`;
}

export async function sendServiceLeadNotificationToAdmin(
  input: ServiceLeadNotificationInput
): Promise<{ ok: boolean; error?: string }> {
  try {
    const recipients = getAdminNotificationRecipients();
    if (!recipients || recipients.length === 0) {
      return { ok: false, error: "Sin destinatarios de notificación configurados." };
    }

    const name = input.leadName && input.leadName !== "Por confirmar" ? input.leadName : "Por confirmar";
    const phone = input.phoneNormalized;
    const email = input.leadEmail ? input.leadEmail : "No proporcionado";
    const service = input.serviceSlug;
    const variant = input.variantSlug ? input.variantSlug : "No especificado";
    const contactTime = input.preferredContactTime ? input.preferredContactTime : "Sin preferencia expresada";
    const campaign = input.campaignKey ? input.campaignKey : "Orgánico / WhatsApp directo";
    const crmLink = buildServiceLeadCrmUrl(input.crmUrl);

    const isConfirmed = input.isAppointmentConfirmed === true;
    const subject = isConfirmed
      ? `📅 CITA AGENDADA: Llamada de Diagnóstico — ${name} (${service})`
      : `Nuevo lead de servicios desde WhatsApp — ${service}`;
    const headerTitle = isConfirmed
      ? `📅 ¡Nueva Cita de Diagnóstico Agendada! (WhatsApp)`
      : `Nuevo Lead de Servicios B2B (WhatsApp)`;

    const textContent = [
      headerTitle,
      `---------------------------------------`,
      `Nombre: ${name}`,
      `WhatsApp: ${phone}`,
      `Email: ${email}`,
      `Servicio: ${service}`,
      `Paquete: ${variant}`,
      `Categoría: ${input.category}`,
      `Necesidad: ${input.needSummary}`,
      `Horario preferido de cita: ${contactTime}`,
      `Campaña: ${campaign}`,
      `---------------------------------------`,
      `Ver en CRM: ${crmLink}`,
    ].join("\n");

    const htmlContent = `
      <div style="font-family: sans-serif; line-height: 1.5; color: #111;">
        <h2 style="color: #4F46E5;">${escapeHtml(headerTitle)}</h2>
        <table style="width: 100%; max-width: 600px; border-collapse: collapse; margin-top: 12px;">
          <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Nombre:</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(name)}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">WhatsApp:</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(phone)}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Email:</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(email)}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Servicio:</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(service)}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Paquete:</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(variant)}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Categoría:</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(input.category)}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Necesidad:</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(input.needSummary)}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Horario de Cita:</td><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold; color: #4F46E5;">${escapeHtml(contactTime)}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Campaña:</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(campaign)}</td></tr>
        </table>
        <p style="margin-top: 20px;">
          <a href="${escapeHtml(crmLink)}" style="background: #4F46E5; color: #fff; padding: 10px 16px; text-decoration: none; border-radius: 6px; display: inline-block;">Abrir Solicitud en Panel de Servicios</a>
        </p>
      </div>
    `;

    const result = await sendEmail({
      to: recipients,
      subject,
      text: textContent,
      html: htmlContent,
    });

    return { ok: result.ok, error: result.error };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
