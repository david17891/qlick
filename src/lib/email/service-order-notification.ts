/**
 * Email de notificación al admin cuando se crea un nuevo service_order.
 *
 * Reusa el patrón de Brevo (`sendEmail`) del sistema de eventos:
 * - Dev mode: si falta `BREVO_API_KEY`, se loggea en consola.
 * - Prod mode: requiere API key.
 *
 * Fire-and-forget desde el caller (POST /api/services/checkout). Si falla,
 * el admin igual ve el order en el panel.
 *
 * No mandamos email al cliente (por ahora): el admin lo contacta por WhatsApp
 * primero, valida, y solo entonces confirma. El email de "tu pedido está
 * confirmado" lo mandaremos cuando el admin pase el order a `confirmed`
 * (sprint futuro).
 */

import { sendEmail } from "./brevo-client";
import { ORDER_STATUS_LABELS } from "@/types/services";
import type { ServiceOrder } from "@/types/services";
import { formatMXN } from "@/lib/utils";

export interface NotifyArgs {
  order: ServiceOrder;
  /** Email del admin que recibe la notificación. Default: ADMIN_NOTIFICATION_EMAILS. */
  to?: string | string[];
}

/** Lee ADMIN_NOTIFICATION_EMAILS de .env (CSV). Filtra vacíos. */
function readAdminRecipients(): string[] {
  const raw = process.env.ADMIN_NOTIFICATION_EMAILS ?? "";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e && e.includes("@"));
}

function escape(s: string): string {
  // Escape mínimo para HTML dinámico (memory: XSS rule). Suficiente para
  // valores que vienen del form (no de usuarios externos).
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendOrderNotificationToAdmin(
  args: NotifyArgs,
): Promise<{ ok: boolean; error?: string }> {
  const recipients = args.to
    ? Array.isArray(args.to)
      ? args.to
      : [args.to]
    : readAdminRecipients();

  if (recipients.length === 0) {
    // Sin admin recipients: skip silencioso (memory: notifications son
    // best-effort, no bloqueantes).
    // eslint-disable-next-line no-console
    console.info(
      "[service-order-notification] no admin recipients, skipping",
    );
    return { ok: true };
  }

  const o = args.order;
  const statusLabel = ORDER_STATUS_LABELS[o.status];
  const amount = formatMXN(o.amountMXN);

  const subject = `Nuevo pedido ${escape(o.orderNumber)} — ${escape(o.customerName)}`;

  const html = `
    <div style="font-family: Inter, system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #AB3FEA; margin: 0 0 16px;">Nuevo pedido de servicio</h2>
      <p style="color: #4A4A4A; font-size: 14px; line-height: 1.5;">
        Se creó un nuevo pedido desde el catálogo público.
      </p>

      <table style="width: 100%; border-collapse: collapse; margin: 24px 0;">
        <tr>
          <td style="padding: 8px 12px; background: #F4F0FA; font-weight: 600; width: 40%;">Número de pedido</td>
          <td style="padding: 8px 12px;">${escape(o.orderNumber)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; background: #F4F0FA; font-weight: 600;">Cliente</td>
          <td style="padding: 8px 12px;">${escape(o.customerName)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; background: #F4F0FA; font-weight: 600;">Email</td>
          <td style="padding: 8px 12px;">
            <a href="mailto:${escape(o.customerEmail)}" style="color: #AB3FEA;">${escape(o.customerEmail)}</a>
          </td>
        </tr>
        ${
          o.customerPhone
            ? `<tr>
          <td style="padding: 8px 12px; background: #F4F0FA; font-weight: 600;">Teléfono</td>
          <td style="padding: 8px 12px;">
            <a href="https://wa.me/${escape(o.customerPhone.replace(/[^\d]/g, ""))}" style="color: #AB3FEA;">${escape(o.customerPhone)}</a>
          </td>
        </tr>`
            : ""
        }
        <tr>
          <td style="padding: 8px 12px; background: #F4F0FA; font-weight: 600;">Monto</td>
          <td style="padding: 8px 12px; font-weight: 700; color: #AB3FEA;">${escape(amount)} ${escape(o.currency)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; background: #F4F0FA; font-weight: 600;">Estado</td>
          <td style="padding: 8px 12px;">${escape(statusLabel)}</td>
        </tr>
        ${
          o.scheduledAt
            ? `<tr>
          <td style="padding: 8px 12px; background: #F4F0FA; font-weight: 600;">Agendado</td>
          <td style="padding: 8px 12px;">${escape(new Date(o.scheduledAt).toLocaleString("es-MX", { timeZone: "America/Hermosillo" }))}</td>
        </tr>`
            : ""
        }
        ${
          o.customerNotes
            ? `<tr>
          <td style="padding: 8px 12px; background: #F4F0FA; font-weight: 600; vertical-align: top;">Notas del cliente</td>
          <td style="padding: 8px 12px; white-space: pre-wrap;">${escape(o.customerNotes)}</td>
        </tr>`
            : ""
        }
      </table>

      <p style="margin: 24px 0;">
        <a href="${escape(process.env.NEXT_PUBLIC_APP_URL ?? "https://qlick.digital")}/admin/pedidos/${o.id}"
           style="display: inline-block; padding: 12px 24px; background: #AB3FEA; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">
          Ver pedido en el panel
        </a>
      </p>

      <p style="color: #888; font-size: 12px; margin-top: 32px;">
        Email automático del sistema de pedidos de Qlick. No responder a este correo.
      </p>
    </div>
  `;

  const text = `
Nuevo pedido de servicio

Número: ${o.orderNumber}
Cliente: ${o.customerName}
Email: ${o.customerEmail}
${o.customerPhone ? `Teléfono: ${o.customerPhone}\n` : ""}Monto: ${amount} ${o.currency}
Estado: ${statusLabel}
${o.scheduledAt ? `Agendado: ${new Date(o.scheduledAt).toLocaleString("es-MX", { timeZone: "America/Hermosillo" })}\n` : ""}${o.customerNotes ? `Notas: ${o.customerNotes}\n` : ""}
Ver pedido: ${process.env.NEXT_PUBLIC_APP_URL ?? "https://qlick.digital"}/admin/pedidos/${o.id}
  `.trim();

  return sendEmail({
    to: recipients.join(","),
    subject,
    html,
    text,
  });
}
