/**
 * Orquestador: enviar link de encuesta post-evento a TODOS los
 * confirmados de un evento.
 *
 * Sprint cierre-eventos-virtuales (2026-07-11, sesión David): el
 * problema que resuelve es mover confirmados → asistencia real en
 * eventos Zoom (sin webhook de Zoom). El flujo:
 *
 *   1. Admin dispara el botón "📨 Enviar link de encuesta" desde la
 *      toolbar del tab Confirmados en `/admin/eventos/[id]`.
 *   2. Este orquestador:
 *      a) Genera (o reutiliza) un `event_survey_tokens` por cada
 *         confirmado con email — la función `generateSurveyTokensForEvent`
 *         ya hace eso idempotentemente.
 *      b) Por cada confirmado con email → manda el email de invitación
 *         (template `survey-invite.ts`) con el link único a la encuesta.
 *         Marca `sent_at` del token después del envío.
 *      c) Por cada confirmado SIN email pero CON phone → devuelve un
 *         link `wa.me/<phone>?text=<msg>` pre-armado para que el admin
 *         lo mande manual (no automatizamos envíos WhatsApp outbound
 *         — eso requiere Cloud API aprobada).
 *      d) Confirmados sin email NI phone → quedan como `skipped`
 *         (no contactables desde este flow).
 *   3. El confirmado abre el link → ve la encuesta → Q0 ("¿Asististe?")
 *      → si responde "Sí", el sistema actualiza
 *      `event_attendees.checked_in_at` automáticamente (lógica ya
 *      implementada en `surveys-server.ts:271-344`).
 *
 * **Server-only.** Service role. Audit log del admin action.
 *
 * **Reusa:** `generateSurveyTokensForEvent` (survey-tokens.ts),
 * `markSurveyTokenSent` (survey-tokens.ts), `sendEmail` (brevo-client),
 * `buildDirectWhatsAppLink` (contact/whatsapp), `renderSurveyInviteEmail`
 * (email/templates/survey-invite).
 */

import { checkSupabaseConfig } from "@/lib/supabase/health";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/brevo-client";
import { renderSurveyInviteEmail } from "@/lib/email/templates/survey-invite";
import { buildDirectWhatsAppLink } from "@/lib/contact/whatsapp";
import { logAdminAction } from "@/lib/crm/audit-server";
import {
  generateSurveyTokensForEvent,
  markSurveyTokenSent,
} from "./survey-tokens";
import { buildSurveyInviteWhatsAppMessage } from "./survey-invite-message";

/* ------------------------------------------------------------------ */
/* Tipos públicos                                                       */
/* ------------------------------------------------------------------ */

export interface SendSurveyLinkItem {
  confirmationId: string;
  attendeeName: string;
  email: string | null;
  phoneNormalized: string | null;
  /** Canal real por el que se contactó al confirmado. */
  channel: "email" | "whatsapp" | "none";
  /** true si el envío fue exitoso (email enviado o link wa.me generado). */
  sent: boolean;
  note: string;
  /** Link de la encuesta (para que el admin lo re-envíe manual si quiere). */
  surveyUrl: string | null;
  /** Link wa.me pre-armado (solo si channel='whatsapp'). */
  waLink: string | null;
}

export interface SendSurveyLinkInput {
  eventId: string;
  /** Email del admin que dispara (audit log). */
  actorEmail: string;
  /** Base URL opcional. Default: env. */
  baseUrl?: string;
  /** Si true, NO manda emails — solo genera links. Útil para dry-run. */
  dryRun?: boolean;
}

export interface SendSurveyLinkResult {
  ok: boolean;
  note: string;
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  items: SendSurveyLinkItem[];
}

/* ------------------------------------------------------------------ */
/* Lecturas                                                             */
/* ------------------------------------------------------------------ */

interface ConfirmationRow {
  id: string;
  name: string;
  email: string | null;
  phone_normalized: string | null;
}

interface EventRow {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  slug: string;
}

async function fetchEvent(eventId: string): Promise<EventRow | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("events")
    .select("id, title, starts_at, ends_at, slug")
    .eq("id", eventId)
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as EventRow;
}

async function fetchConfirmations(eventId: string): Promise<ConfirmationRow[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("event_confirmations")
    .select("id, name, email, phone_normalized")
    .eq("event_id", eventId);
  if (error || !data) return [];
  return (data as unknown as ConfirmationRow[]).map((c) => ({
    id: c.id,
    name: c.name ?? "Sin nombre",
    email: c.email?.trim().toLowerCase() || null,
    phone_normalized: c.phone_normalized ?? null,
  }));
}

/* ------------------------------------------------------------------ */
/* Orquestador                                                          */
/* ------------------------------------------------------------------ */

/**
 * Genera tokens de encuesta para todos los confirmados del evento y
 * envía el link de invitación por email (Brevo) o devuelve un link
 * wa.me pre-armado para los que solo tienen teléfono.
 *
 * Idempotente a nivel de token: re-ejecutar no duplica tokens. El email
 * se re-manda cada vez (es esperado — el admin decide cuándo re-enviar).
 */
export async function sendSurveyLinkToAllConfirmations(
  input: SendSurveyLinkInput,
): Promise<SendSurveyLinkResult> {
  if (!checkSupabaseConfig().configured) {
    return {
      ok: false,
      note: "Supabase no configurado.",
      total: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      items: [],
    };
  }
  if (!input.eventId) {
    return {
      ok: false,
      note: "Falta eventId.",
      total: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      items: [],
    };
  }

  // 1. Traer evento.
  const event = await fetchEvent(input.eventId);
  if (!event) {
    return {
      ok: false,
      note: "Evento no encontrado.",
      total: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      items: [],
    };
  }

  // 2. Generar tokens (idempotente). Esto crea tokens faltantes para
  //    TODOS los confirmados con email del evento.
  const tokenResult = await generateSurveyTokensForEvent({
    eventId: input.eventId,
    baseUrl: input.baseUrl,
  });
  if (!tokenResult.ok) {
    return {
      ok: false,
      note: `No se pudieron generar tokens: ${tokenResult.note}`,
      total: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      items: [],
    };
  }

  // 3. Indexar tokens por email para lookup O(1) abajo.
  const tokenByEmail = new Map<
    string,
    { token: string; url: string }
  >();
  for (const t of tokenResult.tokens) {
    const email = t.token.email?.trim().toLowerCase() || null;
    if (email) tokenByEmail.set(email, { token: t.token.token, url: t.url });
  }

  // 4. Traer confirmados (TODOS — los que ya tienen token o no).
  const confirmations = await fetchConfirmations(input.eventId);
  if (confirmations.length === 0) {
    return {
      ok: true,
      note: "No hay confirmados en el evento.",
      total: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      items: [],
    };
  }

  // 5. Por cada confirmado: enviar email o armar wa.me link.
  const items: SendSurveyLinkItem[] = [];
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const c of confirmations) {
    const item: SendSurveyLinkItem = {
      confirmationId: c.id,
      attendeeName: c.name,
      email: c.email,
      phoneNormalized: c.phone_normalized,
      channel: "none",
      sent: false,
      note: "",
      surveyUrl: null,
      waLink: null,
    };

    // 5a. Email path.
    if (c.email) {
      const tk = tokenByEmail.get(c.email);
      if (!tk) {
        // Caso raro: el confirmado tiene email pero el token no se
        // generó. Saltamos y loggeamos.
        item.note = "No se generó token para este email.";
        failed++;
        items.push(item);
        continue;
      }
      item.surveyUrl = tk.url;

      if (input.dryRun) {
        item.channel = "email";
        item.sent = false;
        item.note = "Dry-run: email no enviado.";
        skipped++;
        items.push(item);
        continue;
      }

      const rendered = renderSurveyInviteEmail({
        attendeeName: c.name,
        eventTitle: event.title,
        eventStartsAt: event.starts_at,
        surveyUrl: tk.url,
      });
      const result = await sendEmail({
        to: c.email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      });
      item.channel = "email";
      if (result.ok) {
        item.sent = true;
        item.note =
          result.mode === "prod"
            ? `Email enviado (Brevo ${result.id ?? "?"})`
            : "Email loggeado en dev.";
        sent++;
        // Marca sent_at del token (best-effort, no rompe si falla).
        await markSurveyTokenSent(tk.token);
      } else {
        item.note = `Email falló: ${result.error ?? "?"}`;
        failed++;
      }
      items.push(item);
      continue;
    }

    // 5b. WhatsApp path (sin email).
    if (c.phone_normalized) {
      // Para WhatsApp reutilizamos el mismo flow del bot engine:
      // no creamos token en DB porque el link wa.me pre-armado
      // funciona como "deep link" desde wa.me → encuesta.
      // Si el confirmado abre el link desde el celular y NO está
      // logueado, la página `/encuesta/[token]` igual muestra la
      // Q0 + prefill del phone. Para generar un token para el path
      // WhatsApp, usamos `getOrCreateSurveyTokenForContact`.
      const { getOrCreateSurveyTokenForContact } = await import(
        "./survey-tokens"
      );
      const tkRes = await getOrCreateSurveyTokenForContact({
        eventId: input.eventId,
        email: null,
        phoneNormalized: c.phone_normalized,
        baseUrl: input.baseUrl,
      });
      if (!tkRes.ok || !tkRes.url) {
        item.note = `No se pudo generar token para WhatsApp: ${tkRes.note}`;
        failed++;
        items.push(item);
        continue;
      }
      item.surveyUrl = tkRes.url;
      const message = buildSurveyInviteWhatsAppMessage({
        attendeeName: c.name,
        eventTitle: event.title,
        surveyUrl: tkRes.url,
      });
      const waLink = buildDirectWhatsAppLink(c.phone_normalized, message);
      if (!waLink) {
        item.note = "Teléfono no válido para wa.me.";
        failed++;
        items.push(item);
        continue;
      }
      item.channel = "whatsapp";
      item.sent = true;
      item.waLink = waLink;
      item.note = "Link wa.me generado (admin lo manda manual).";
      sent++;
      items.push(item);
      continue;
    }

    // 5c. Sin email ni phone → skip.
    item.note = "Sin email ni phone — no contactable.";
    skipped++;
    items.push(item);
  }

  // 6. Audit log del admin action (best-effort).
  try {
    await logAdminAction({
      actor_email: input.actorEmail,
      action: "send_survey_link_to_confirmations",
      entity_type: "event",
      entity_id: input.eventId,
      metadata: {
        eventTitle: event.title,
        total: confirmations.length,
        sent,
        failed,
        skipped,
        dryRun: !!input.dryRun,
      },
    });
  } catch {
    // no-op
  }

  return {
    ok: true,
    note: `${sent} contacto(s) preparado(s), ${failed} fallido(s), ${skipped} sin canal.`,
    total: confirmations.length,
    sent,
    failed,
    skipped,
    items,
  };
}
