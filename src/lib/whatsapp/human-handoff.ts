/**
 * Handoff a humano via Supabase (Fase 7a.3).
 *
 * Cuando un lead clickea "Hablar con humano" en el welcome del bot,
 * persistimos un row en `handoff_requests` con: nombre, teléfono, email,
 * contexto (últimos 5 mensajes). David lo ve en el dashboard o via SQL.
 *
 * Best-effort: si falla el INSERT, el bot ya respondió al lead. El handoff
 * es solo la notificación, no bloquea el flow.
 *
 * Server-only.
 *
 * @server
 */

import { createSupabaseAdminClient } from "../supabase/admin";
import { sendEmail } from "../email/resend-client";

export interface HumanHandoffArgs {
  leadId?: string | null;
  leadName: string;
  leadPhone: string; // E.164 (e.g. +5216532935492)
  leadEmail?: string;
  lastMessages: Array<{ direction: "inbound" | "outbound"; body: string; timestamp?: string }>;
}

interface HandoffInsertResult {
  ok: boolean;
  id?: string;
  error?: string;
}

/**
 * Persiste el handoff a Supabase. Best-effort: si falla, no lanza.
 */
async function persistHandoffToDb(args: HumanHandoffArgs): Promise<HandoffInsertResult> {
  try {
    const supabase = createSupabaseAdminClient();
    // Solo guardamos los últimos 5 mensajes para no inflar la fila.
    const lastMessages = args.lastMessages.slice(-5);
    const { data, error } = await supabase
      .from("handoff_requests" as never)
      .insert({
        lead_id: args.leadId ?? null,
        lead_name: args.leadName,
        lead_phone: args.leadPhone,
        lead_email: args.leadEmail ?? null,
        last_messages: lastMessages,
        status: "pending"
      } as never)
      .select("id")
      .single();
    if (error) {
      return {
        ok: false,
        error: (error as { message?: string }).message ?? "unknown"
      };
    }
    return { ok: true, id: (data as { id?: string } | null)?.id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err)
    };
  }
}

/**
 * Email opcional: si está configurado Resend, manda el handoff también
 * por email. Si falla, no es bloqueante.
 */
async function sendHandoffEmailIfPossible(args: HumanHandoffArgs): Promise<boolean> {
  // Skip si no hay API key (evitamos ruido en dev)
  if (!process.env.RESEND_API_KEY) return false;
  try {
    const phoneClean = args.leadPhone.replace(/^\+/, "");
    const waMeLink = `https://wa.me/${phoneClean}`;
    const subject = `[Qlick Bot] ${args.leadName} quiere hablar contigo`;
    const messagesHtml = args.lastMessages
      .slice(-5)
      .map((m) => {
        const dir = m.direction === "inbound" ? "👤 Lead" : "🤖 Bot";
        return `<div style="margin:6px 0;padding:8px 12px;background:${m.direction === "inbound" ? "#e3f2fd" : "#f5f5f5"};border-radius:8px"><div style="font-size:11px;color:#666;margin-bottom:2px">${dir}</div><div>${escapeHtml(m.body)}</div></div>`;
      })
      .join("");
    const html = `<div style="font-family:sans-serif;max-width:600px"><h2>📞 ${escapeHtml(args.leadName)} quiere hablar contigo</h2><p>Tel: <a href="${waMeLink}">${escapeHtml(args.leadPhone)}</a></p>${args.leadEmail ? `<p>Email: <a href="mailto:${args.leadEmail}">${escapeHtml(args.leadEmail)}</a></p>` : ""}<h3>Última conversación</h3>${messagesHtml || "<em>Sin mensajes</em>"}<p><a href="${waMeLink}" style="display:inline-block;background:#25D366;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold">Abrir chat en WhatsApp</a></p></div>`;
    const result = await sendEmail({
      to: process.env.ADMIN_NOTIFICATION_EMAILS?.split(",")[0]?.trim() ?? "david17891@gmail.com",
      subject,
      html
    });
    return result.ok;
  } catch {
    return false;
  }
}

/**
 * Punto de entrada principal. Persiste a DB y, si está configurado, manda
 * email también. Nunca lanza. Devuelve `true` si al menos uno de los dos
 * se procesó OK.
 */
export async function sendHumanHandoff(args: HumanHandoffArgs): Promise<boolean> {
  const dbResult = await persistHandoffToDb(args);
  const emailResult = await sendHandoffEmailIfPossible(args);
  // Log para debugging en prod
  if (!dbResult.ok) {
    // eslint-disable-next-line no-console
    console.warn(
      "[human-handoff] persist failed",
      dbResult.error
    );
  }
  return dbResult.ok || emailResult;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
