import { sendEmail, type SendEmailResult } from "@/lib/email/brevo-client";
import { sendEventQrPassEmail } from "@/lib/email/event-qr-pass";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { logEventEmail } from "@/lib/email/log";
import type { Event } from "@/types/events";

function esc(value: string): string {
  return value.replace(/[&<>\"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char] ?? char));
}

export async function sendPromoRegistrationEmail(args: {
  event: Event;
  recipient: string | null;
  participantNames: string[];
  paymentUrl: string;
  orderId: string;
}): Promise<SendEmailResult> {
  if (!args.recipient) return { ok: false, mode: "prod", error: "La orden no tiene correo de contacto." };
  const names = args.participantNames.length ? args.participantNames.join(" y ") : "tu grupo";
  const subject = `Tu promoción para ${args.event.title}`;
  const html = `<!doctype html><html lang="es"><body style="font-family:Arial,sans-serif;color:#1e293b;background:#faf5ff;padding:24px"><div style="max-width:560px;margin:auto;background:#fff;border:1px solid #e9d5ff;border-radius:16px;padding:28px"><h1 style="color:#6d28d9">Promoción de Qlick</h1><p>Recibimos los datos de <strong>${esc(names)}</strong> para <strong>${esc(args.event.title)}</strong>.</p><p>La promoción es para dos personas por <strong>$1,500 MXN</strong>. Puedes apartarla con <strong>$200 MXN</strong>. La segunda persona puede asignarse después.</p><p style="text-align:center"><a href="${esc(args.paymentUrl)}" style="display:inline-block;background:#6d28d9;color:#fff;padding:14px 24px;border-radius:8px;text-decoration:none;font-weight:700">Continuar al pago</a></p><p style="font-size:13px;color:#64748b">El registro se completa y el QR compartido se envía al verificar el pago o apartado. Orden: ${esc(args.orderId)}</p></div></body></html>`;
  return sendEmail({ to: args.recipient, subject, html, text: `Recibimos tu registro. Continúa al pago: ${args.paymentUrl}` });
}

export async function sendPromoPassEmail(args: {
  event: Event;
  orderId: string;
  recipient: string | null;
  participantNames: string[];
  qrImageUrl: string;
  checkInUrl: string;
  paymentStatus: "partial" | "paid";
  eventQrTokenId?: string | null;
}): Promise<SendEmailResult> {
  if (!args.recipient) return { ok: false, mode: "prod", error: "La orden no tiene correo de contacto." };
  // Stripe puede entregar el mismo webhook más de una vez. La clave incluye
  // orden, destinatario y estado para permitir la actualización apartado →
  // liquidado sin repetir el mismo estado.
  const normalizedRecipient = args.recipient.trim().toLowerCase();
  const dedupeKey = `promo-pass:${args.orderId}:${normalizedRecipient}:${args.paymentStatus}`;
  const subjectSuffix = args.paymentStatus === "paid" ? " · Pago total verificado" : " · Apartado verificado";
  const supabase = createSupabaseAdminClient();
  const { data: previous } = await supabase
    .from("event_email_log" as never)
    .select("provider_message_id")
    .eq("dedupe_key" as never, dedupeKey)
    .eq("email_type" as never, "qr_pass")
    .eq("ok" as never, true)
    .order("sent_at" as never, { ascending: false })
    .limit(1)
    .maybeSingle();
  if (previous) {
    return {
      ok: true,
      mode: "prod",
      id: (previous as { provider_message_id?: string | null }).provider_message_id ?? undefined,
    };
  }
  return sendEventQrPassEmail({
    attendeeName: args.participantNames.length ? `Grupo: ${args.participantNames.join(" y ")}` : "Grupo de 2 personas",
    attendeeEmail: args.recipient,
    eventTitle: args.event.title,
    eventStartsAt: args.event.startsAt,
    eventLocation: args.event.location ?? null,
    qrImageUrl: args.qrImageUrl,
    checkInUrl: args.checkInUrl,
    format: args.event.format,
    priceMXN: 1500,
    reservationAmountMXN: args.paymentStatus === "partial" ? 200 : undefined,
    paymentStatus: args.paymentStatus,
    subjectSuffix,
  }, {
    eventId: args.event.id,
    eventQrTokenId: args.eventQrTokenId ?? null,
    dedupeKey,
  });
}

/**
 * Comprobante legible de Qlick para una orden promocional. Stripe mantiene
 * su recibo automático independiente; este correo explica el estado de la
 * promoción, el saldo y las dos personas asociadas a la orden.
 */
export async function sendPromoPaymentReceiptEmail(args: {
  event: Event;
  recipient: string | null;
  participantNames: string[];
  orderId: string;
  amountPaidMxn: number;
  totalAmountMxn: number;
  paymentStatus: "partial" | "paid";
  paymentReference?: string | null;
}): Promise<SendEmailResult> {
  if (!args.recipient) return { ok: false, mode: "prod", error: "La orden no tiene correo de contacto." };
  const statusLabel = args.paymentStatus === "partial" ? "Apartado verificado" : "Pago total verificado";
  const remaining = Math.max(0, args.totalAmountMxn - args.amountPaidMxn);
  const names = args.participantNames.length ? args.participantNames.join(" y ") : "Grupo de 2 personas";
  const subject = `Comprobante Qlick · ${args.orderId} · ${statusLabel}`;
  const supabase = createSupabaseAdminClient();
  const { data: previous } = await supabase
    .from("event_email_log" as never)
    .select("provider_message_id")
    .eq("event_id" as never, args.event.id)
    .eq("recipient" as never, args.recipient)
    .eq("email_type" as never, "promo_receipt")
    .eq("subject" as never, subject)
    .eq("ok" as never, true)
    .limit(1)
    .maybeSingle();
  if (previous) {
    return {
      ok: true,
      mode: "prod",
      id: (previous as { provider_message_id?: string | null }).provider_message_id ?? undefined,
    };
  }
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#f7f4ff;font-family:Arial,sans-serif;color:#172033;padding:24px"><div style="max-width:600px;margin:auto;background:#fff;border:1px solid #e5d7ff;border-radius:20px;overflow:hidden"><div style="padding:26px 30px;background:linear-gradient(135deg,#5b21b6,#7c3aed);color:#fff"><div style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;opacity:.85">QLICK · COMPROBANTE</div><h1 style="margin:8px 0 0;font-size:25px">${esc(statusLabel)} ✅</h1></div><div style="padding:28px 30px"><p style="font-size:18px;margin-top:0">Tu pago para <strong>${esc(args.event.title)}</strong> fue registrado.</p><div style="background:#faf5ff;border-radius:14px;padding:18px;margin:20px 0"><p style="margin:0 0 8px"><strong>Participantes:</strong> ${esc(names)}</p><p style="margin:0 0 8px"><strong>Total de la promoción:</strong> $${args.totalAmountMxn.toLocaleString("es-MX")} MXN</p><p style="margin:0 0 8px"><strong>Pago verificado:</strong> $${args.amountPaidMxn.toLocaleString("es-MX")} MXN</p><p style="margin:0"><strong>Saldo pendiente:</strong> $${remaining.toLocaleString("es-MX")} MXN</p></div><p style="margin:8px 0"><strong>Evento:</strong> ${esc(args.event.title)}</p><p style="margin:8px 0"><strong>Fecha y lugar:</strong> ${esc(args.event.startsAt)}${args.event.location ? ` · ${esc(args.event.location)}` : ""}</p><p style="margin:8px 0"><strong>Orden:</strong> <span style="font-family:monospace">${esc(args.orderId)}</span></p>${args.paymentReference ? `<p style="margin:8px 0;color:#64748b;font-size:13px"><strong>Referencia de pago:</strong> ${esc(args.paymentReference)}</p>` : ""}<p style="margin:24px 0 0;color:#475569">El pase con QR se envía en un correo separado a cada participante con correo válido. Si fue apartado, el saldo se liquida el día del evento.</p></div><div style="padding:16px 30px;background:#fff7ed;color:#7c2d12;font-size:13px">Conserva este comprobante para cualquier aclaración.</div></div></body></html>`;
  const result = await sendEmail({
    to: args.recipient,
    subject,
    html,
    text: `${statusLabel}. ${args.event.title}. Pago verificado: $${args.amountPaidMxn} MXN. Saldo: $${remaining} MXN. Orden: ${args.orderId}`,
  });
  await logEventEmail({
    emailType: "promo_receipt",
    eventId: args.event.id,
    recipient: args.recipient,
    attendeeName: names,
    subject,
    ok: result.ok,
    error: result.error ?? null,
    providerMessageId: result.id ?? null,
  });
  return result;
}
