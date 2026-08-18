import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import type { IncomingWhatsAppMessage } from "./webhooks/types";
import { sendEmail } from "../email/brevo-client";

const EVENT_SLUG = "desarrollo-estructura-curso-canaco";
const ADVISOR_PHONE = "5216532935492";
// Cuenta de depósito publicada por el negocio para esta campaña. Puede
// reemplazarse mediante MANUAL_PAYMENT_CARD_NUMBER sin tocar el código.
const DEFAULT_MANUAL_PAYMENT_CARD_NUMBER = "5579070155517512";

export function isManualPaymentEvidence(message: IncomingWhatsAppMessage, body: string): boolean {
  if (Boolean(message.image?.id || message.document?.id)) return true;
  // Mencionar un método (“¿puedo pagar por OXXO?”) no es evidencia de pago.
  // Solo se crea un reclamo cuando la persona afirma haber pagado o menciona
  // explícitamente un comprobante/recibo.
  const normalizedBody = body.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const trimmedBody = normalizedBody.trim().replace(/^[¿¡]+|[?!.,]+$/g, "");
  if (/^(?:comprobante|recibo)$/i.test(trimmedBody)) return true;
  return /(?:^|[^a-z0-9])(?:ya\s+(?:pague|deposite|transferi)|(?:hice|realice)\s+(?:el\s+)?(?:pago|deposito|transferencia)|pago\s+realizado|(?:aqui\s+(?:esta|tienes?)|te\s+(?:mando|envio)|(?:este|aqui)\s+es|adjunto)\s+(?:mi\s+)?(?:comprobante|recibo)|deposito\s+(?:realizado|hecho)|transferencia\s+(?:realizada|hecha)|listo\s+con\s+el\s+pago)(?=$|[^a-z0-9])/i.test(normalizedBody);
}

export function buildManualPaymentInstructions(): string {
  const card = process.env.MANUAL_PAYMENT_CARD_NUMBER?.trim() || DEFAULT_MANUAL_PAYMENT_CARD_NUMBER;
  const holder = process.env.MANUAL_PAYMENT_BENEFICIARY?.trim() || "Paul Velásquez";
  const bank = process.env.MANUAL_PAYMENT_BANK?.trim() || "Santander";
  if (!card) {
    return `Puedes pagar por depósito en OXXO o transferencia. Para recibir los datos exactos, habla con un asesor aquí: https://wa.me/${ADVISOR_PHONE}`;
  }
  return [
    "Para pagar por OXXO o transferencia:",
    `🏦 ${bank}`,
    `💳 Número para depósito: ${card}`,
    `👤 A nombre de: ${holder}`,
    "",
    "Cuando termines, responde *LISTO* y manda una foto clara de tu recibo. Lo revisaremos manualmente y te avisaremos; el pago y el acceso quedan confirmados únicamente después de validarlo.",
    `Si prefieres ayuda, habla con un asesor: https://wa.me/${ADVISOR_PHONE}`,
  ].join("\n");
}

export function isManualPaymentMethodRequest(body: string): boolean {
  const channel = /\b(?:oxxo|transferencia|transferir|spei|dep[oó]sito|depositar|efectivo|cuenta|n[uú]mero\s+de\s+tarjeta|tarjeta\s+para\s+depositar)\b/i.test(body);
  const action = /\b(?:pagar|pago|apart(?:ar|ado)|depositar|transferir|datos|cuenta|n[uú]mero|d[oó]nde|como|c[oó]mo)\b/i.test(body);
  return channel && action;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function notificationRecipients(): string[] {
  return (process.env.WHATSAPP_HANDOFF_NOTIFICATION_EMAILS ?? process.env.ADMIN_NOTIFICATION_EMAILS ?? "hola@qlick.digital")
    .split(",").map((value) => value.trim()).filter(Boolean);
}

export async function createManualPaymentClaim(args: {
  supabase: SupabaseClient<Database>;
  message: IncomingWhatsAppMessage;
  body: string;
  phoneNormalized: string;
  leadId: string | null;
  leadName?: string | null;
}): Promise<{ handled: boolean; claimId?: string; created: boolean; responseBody?: string }> {
  if (!isManualPaymentEvidence(args.message, args.body)) return { handled: false, created: false };

  const { data: event } = await args.supabase.from("events").select("id, title").eq("slug", EVENT_SLUG).maybeSingle();
  const eventRow = event as { id?: string; title?: string } | null;
  const { data: confirmation } = eventRow?.id
    ? await args.supabase.from("event_confirmations" as never).select("id").eq("event_id" as never, eventRow.id as never).eq("phone_normalized" as never, args.phoneNormalized as never).maybeSingle()
    : { data: null };

  const paymentMethod = /transfer|spei/i.test(args.body) ? "transfer" : "oxxo_card";
  // Media persistence runs asynchronously from the webhook. Link the
  // attachment when it already exists, and retry the lookup immediately after
  // the claim insert so a fast receipt does not remain orphaned from review.
  const { data: existingAttachment } = await args.supabase
    .from("whatsapp_media_attachments" as never)
    .select("id")
    .eq("whatsapp_message_id" as never, args.message.messageId as never)
    .maybeSingle();
  const { data: claim, error } = await args.supabase.from("event_manual_payment_claims" as never).insert({
    event_id: eventRow?.id ?? null,
    lead_id: args.leadId,
    confirmation_id: (confirmation as { id?: string } | null)?.id ?? null,
    whatsapp_message_id: args.message.messageId,
    phone_normalized: args.phoneNormalized,
    receipt_attachment_id: (existingAttachment as { id?: string } | null)?.id ?? null,
    payment_method: paymentMethod,
    status: "review",
    customer_note: args.body.slice(0, 1000),
  } as never).select("id").maybeSingle();

  if (error && (error as { code?: string }).code !== "23505") {
    return { handled: true, created: false, responseBody: "Recibí tu aviso, pero no pude guardarlo todavía. Por favor vuelve a enviar el comprobante en un momento o escríbenos al WhatsApp del asesor." };
  }
  const claimId = (claim as { id?: string } | null)?.id;
  const created = Boolean(claimId);
  if (created) {
    const attachment = await args.supabase.from("whatsapp_media_attachments" as never).select("id, status, storage_path").eq("whatsapp_message_id" as never, args.message.messageId as never).maybeSingle();
    const attachmentRow = attachment.data as { status?: string; storage_path?: string | null } | null;
    if (attachmentRow && claimId && !(existingAttachment as { id?: string } | null)?.id && (attachmentRow as { id?: string }).id) {
      await args.supabase.from("event_manual_payment_claims" as never)
        .update({ receipt_attachment_id: (attachmentRow as { id: string }).id } as never)
        .eq("id" as never, claimId as never);
    }
    const subject = "[Qlick] Comprobante de pago manual pendiente de revisión";
    const html = `<div style="font-family:Arial,sans-serif"><h2>Comprobante pendiente de revisión</h2><p>Se recibió un aviso de pago manual para <b>${escapeHtml(eventRow?.title ?? EVENT_SLUG)}</b>.</p><p>Método: ${paymentMethod === "transfer" ? "transferencia" : "OXXO"}<br>Estado del comprobante: ${escapeHtml(attachmentRow?.status ?? "pendiente")}</p><p>Contacto: <a href="https://wa.me/${ADVISOR_PHONE}">abrir WhatsApp del asesor</a></p><p>Claim ID: ${escapeHtml(claimId ?? "pendiente")}</p></div>`;
    await sendEmail({ to: notificationRecipients(), subject, html, text: `Comprobante de pago manual pendiente. Claim ${claimId ?? "pendiente"}.` });
  }
  return {
    handled: true,
    claimId,
    created,
    responseBody: "Recibí tu aviso y tu comprobante. Lo revisaremos manualmente y te confirmaremos por este medio. Todavía no se considera confirmado ni se habilita el QR hasta validar el depósito.",
  };
}
