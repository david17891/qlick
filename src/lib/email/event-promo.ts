import { sendEmail, type SendEmailResult } from "@/lib/email/brevo-client";
import { sendEventQrPassEmail } from "@/lib/email/event-qr-pass";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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
  recipient: string | null;
  participantNames: string[];
  qrImageUrl: string;
  checkInUrl: string;
  paymentStatus: "partial" | "paid";
  eventQrTokenId?: string | null;
}): Promise<SendEmailResult> {
  if (!args.recipient) return { ok: false, mode: "prod", error: "La orden no tiene correo de contacto." };
  // Stripe puede entregar el mismo webhook más de una vez. Reusar el
  // event_email_log evita mandar el pase grupal dos veces, sin bloquear un
  // reenvío administrativo explícito desde el panel.
  const supabase = createSupabaseAdminClient();
  const { data: previous } = await supabase
    .from("event_email_log" as never)
    .select("provider_message_id")
    .eq("event_id" as never, args.event.id)
    .eq("recipient" as never, args.recipient)
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
  }, {
    eventId: args.event.id,
    eventQrTokenId: args.eventQrTokenId ?? null,
  });
}
