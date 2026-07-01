/**
 * Handoff a humano vía email (Fase 7a.3).
 *
 * Cuando un lead clickea el botón "Hablar con humano" en el welcome, mandamos
 * email a David con: nombre, teléfono, último mensaje, link wa.me para abrir
 * el chat directamente desde WhatsApp Web / app móvil. Así David puede
 * responder en segundos sin tener que abrir la DB.
 *
 * Best-effort: si falla el email, el bot ya respondió al lead con "Te paso
 * con un humano". El email es solo la notificación, no bloquea el flow.
 *
 * Server-only.
 *
 * @server
 */

import { sendEmail } from "../email/resend-client";

export interface HumanHandoffArgs {
  leadName: string;
  leadPhone: string; // E.164 (e.g. +5216532935492)
  leadEmail?: string;
  lastMessages: Array<{ direction: "inbound" | "outbound"; body: string; timestamp?: string }>;
  /** Email destino (David). Default: `david17891@gmail.com`. */
  to?: string;
}

/**
 * Envía el email de handoff. Devuelve `true` si el email se envió (o se
 * loggeó en dev), `false` si falló. Nunca lanza.
 */
export async function sendHumanHandoffEmail(args: HumanHandoffArgs): Promise<boolean> {
  const recipient = args.to ?? "david17891@gmail.com";
  const phoneClean = args.leadPhone.replace(/^\+/, "");
  const waMeLink = `https://wa.me/${phoneClean}`;
  const subject = `[Qlick Bot] ${args.leadName} quiere hablar contigo`;

  const messagesHtml = args.lastMessages
    .slice(-5)
    .map((m) => {
      const dir = m.direction === "inbound" ? "👤 Lead" : "🤖 Bot";
      const time = m.timestamp
        ? new Date(m.timestamp).toLocaleString("es-MX", {
            hour: "2-digit",
            minute: "2-digit",
            day: "2-digit",
            month: "short"
          })
        : "";
      return `<div style="margin:6px 0;padding:8px 12px;background:${m.direction === "inbound" ? "#e3f2fd" : "#f5f5f5"};border-radius:8px">
        <div style="font-size:11px;color:#666;margin-bottom:2px">${dir} · ${time}</div>
        <div>${escapeHtml(m.body)}</div>
      </div>`;
    })
    .join("");

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#1a1a1a">📞 ${escapeHtml(args.leadName)} quiere hablar contigo</h2>
      <p style="color:#444">El lead clickeó <strong>"Hablar con humano"</strong> en el bot. Acá tenés el contexto:</p>

      <table style="margin:20px 0;width:100%;border-collapse:collapse">
        <tr>
          <td style="padding:8px;background:#f9f9f9;width:120px"><strong>Nombre</strong></td>
          <td style="padding:8px;background:#f9f9f9">${escapeHtml(args.leadName)}</td>
        </tr>
        <tr>
          <td style="padding:8px;width:120px"><strong>Teléfono</strong></td>
          <td style="padding:8px"><a href="${waMeLink}">${escapeHtml(args.leadPhone)}</a></td>
        </tr>
        ${
          args.leadEmail
            ? `<tr>
                <td style="padding:8px;background:#f9f9f9;width:120px"><strong>Email</strong></td>
                <td style="padding:8px;background:#f9f9f9"><a href="mailto:${args.leadEmail}">${escapeHtml(args.leadEmail)}</a></td>
              </tr>`
            : ""
        }
      </table>

      <h3>Última conversación</h3>
      <div style="margin:10px 0">${messagesHtml || "<em>Sin mensajes</em>"}</div>

      <p style="margin-top:30px">
        <a href="${waMeLink}"
           style="display:inline-block;background:#25D366;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold">
          Abrir chat en WhatsApp
        </a>
      </p>
      <p style="font-size:12px;color:#888;margin-top:8px">
        Si el botón no abre, copiá este link: ${waMeLink}
      </p>

      <hr style="margin-top:30px;border:none;border-top:1px solid #eee">
      <p style="font-size:11px;color:#999">
        Email automático del bot de Qlick (Fase 7a.3). El lead está esperando tu respuesta.
      </p>
    </div>
  `;

  const result = await sendEmail({
    to: recipient,
    subject,
    html
  });
  return result.ok;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
