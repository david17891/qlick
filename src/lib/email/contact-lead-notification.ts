/** Notificación interna cuando el formulario público crea un lead real. */

import { getAdminNotificationRecipients } from "./admin-recipients.ts";
import { sendEmail } from "./brevo-client.ts";

export interface ContactLeadNotificationInput {
  leadId: string;
  name: string;
  email: string;
  phone?: string;
  topic: string;
  courseOfInterest?: string;
  message: string;
}

export interface ContactLeadEmailContent {
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderContactLeadEmail(
  input: ContactLeadNotificationInput,
): ContactLeadEmailContent {
  const name = escapeHtml(input.name);
  const email = escapeHtml(input.email);
  const phone = input.phone ? escapeHtml(input.phone) : "";
  const topic = escapeHtml(input.topic);
  const course = input.courseOfInterest
    ? escapeHtml(input.courseOfInterest)
    : "";
  const message = escapeHtml(input.message);
  const leadUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://qlick.digital"}/admin?tab=crm`;

  return {
    subject: `Nuevo contacto desde la web — ${topic}`,
    html: `
      <div style="font-family: Inter, system-ui, sans-serif; max-width: 620px; margin: 0 auto;">
        <h2 style="color: #AB3FEA;">Nuevo contacto desde qlick.digital</h2>
        <p style="color: #4A4A4A; line-height: 1.5;">Se creó un lead nuevo en el CRM.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr><td style="padding: 8px 12px; background: #F4F0FA; font-weight: 600;">Nombre</td><td style="padding: 8px 12px;">${name}</td></tr>
          <tr><td style="padding: 8px 12px; background: #F4F0FA; font-weight: 600;">Email</td><td style="padding: 8px 12px;"><a href="mailto:${email}">${email}</a></td></tr>
          ${phone ? `<tr><td style="padding: 8px 12px; background: #F4F0FA; font-weight: 600;">WhatsApp / teléfono</td><td style="padding: 8px 12px;">${phone}</td></tr>` : ""}
          <tr><td style="padding: 8px 12px; background: #F4F0FA; font-weight: 600;">Interés</td><td style="padding: 8px 12px;">${topic}</td></tr>
          ${course ? `<tr><td style="padding: 8px 12px; background: #F4F0FA; font-weight: 600;">Servicio o curso</td><td style="padding: 8px 12px;">${course}</td></tr>` : ""}
          <tr><td style="padding: 8px 12px; background: #F4F0FA; font-weight: 600; vertical-align: top;">Mensaje</td><td style="padding: 8px 12px; white-space: pre-wrap;">${message}</td></tr>
        </table>
        <p><a href="${escapeHtml(leadUrl)}" style="display: inline-block; padding: 12px 20px; background: #AB3FEA; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">Abrir CRM</a></p>
        <p style="color: #888; font-size: 12px;">Lead ID: ${escapeHtml(input.leadId)}</p>
      </div>
    `,
    text: [
      "Nuevo contacto desde qlick.digital",
      "",
      `Nombre: ${input.name}`,
      `Email: ${input.email}`,
      input.phone ? `WhatsApp / teléfono: ${input.phone}` : "",
      `Interés: ${input.topic}`,
      input.courseOfInterest ? `Servicio o curso: ${input.courseOfInterest}` : "",
      `Mensaje: ${input.message}`,
      "",
      `Abrir CRM: ${leadUrl}`,
      `Lead ID: ${input.leadId}`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

export async function sendContactLeadNotificationToAdmin(
  input: ContactLeadNotificationInput,
): Promise<{ ok: boolean; error?: string }> {
  const recipients = getAdminNotificationRecipients();
  if (recipients.length === 0) {
    return { ok: false, error: "ADMIN_NOTIFICATION_EMAILS no configurado" };
  }

  const content = renderContactLeadEmail(input);
  const result = await sendEmail({
    to: recipients,
    subject: content.subject,
    html: content.html,
    text: content.text,
    replyTo: input.email,
  });

  return result.ok ? { ok: true } : { ok: false, error: result.error };
}
