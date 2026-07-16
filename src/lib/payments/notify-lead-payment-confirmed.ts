/**
 * FIX auditoria 2026-07-15f: notifica al lead por WhatsApp + re-envia
 * el email del QR cuando un pago de evento se confirma.
 *
 * Esta funcion es la pieza compartida entre 3 callers que tienen el
 * mismo patron "pago confirmado → notificar al lead":
 *   1. Webhook de Stripe (pago online confirmado).
 *   2. Simulator dev (`/api/dev/simulate-webhook` con `event=paid`).
 *   3. Staff mark-paid (`/api/staff/check-in/mark-paid` cuando David
 *      cobra en puerta). En este caso el confirmation se actualiza a
 *      `paid_manual` (no `paid`); el caller pasa el flag.
 *
 * Pasos:
 *   1. Buscar la confirmation del lead (por phone/email via JOIN).
 *   2. UPDATE event_confirmations.payment_status = 'paid' (default)
 *      o 'paid_manual' (si caller pasa `paymentStatusOverride`).
 *   3. Re-enviar el email del QR via sendQrPassForConfirmation (con
 *      el badge visual de estado de pago correspondiente).
 *   4. Mandar WhatsApp al lead (si tiene phone).
 *
 * Fire-and-forget: cualquier error se loggea pero NO rompe el
 * response del caller. Esta funcion esta pensada para llamarse
 * con `void ...().catch(...)` o dentro de un try/catch.
 *
 * Server-only. Usa service role, bypass RLS.
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { errorLog, infoLog } from "@/lib/log";
import { getActiveWhatsAppProvider } from "@/lib/whatsapp";

export interface NotifyLeadPaymentConfirmedArgs {
  /** leadId (auth.users.id O public.leads.id). */
  leadId: string;
  eventId: string;
  amountTotalMXN: number;
  /**
   * Override del payment_status a aplicar. Default: "paid".
   * El mark-paid endpoint pasa "paid_manual" para distinguir pago-en-puerta
   * de pago-en-linea.
   */
  paymentStatusOverride?: "paid" | "paid_manual";
  /**
   * Source tag del log para distinguir de donde viene la llamada
   * (webhook / simulator / mark-paid). Default: "payment-notify".
   */
  logSource?: string;
}

export async function notifyLeadPaymentConfirmed(
  args: NotifyLeadPaymentConfirmedArgs,
): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const ps = args.paymentStatusOverride ?? "paid";
  const logSource = args.logSource ?? "payment-notify";

  // 1. Buscar la confirmation del lead para este evento.
  const { data: confRows, error: confErr } = await supabase
    .from("event_confirmations")
    .select("id, name, email, phone_normalized, payment_status")
    .eq("event_id", args.eventId)
    .or(`phone_normalized.not.is.null,email.not.is.null`)
    .order("confirmed_at", { ascending: false })
    .limit(20);
  if (confErr) {
    errorLog(`[${logSource}] SELECT confirmation fallo`, {
      error: confErr.message,
    });
    return;
  }
  const leadRow = await supabase
    .from("leads")
    .select("id, phone_normalized, email, name")
    .eq("id", args.leadId)
    .maybeSingle();
  if (!leadRow.data) {
    errorLog(`[${logSource}] lead no existe`, {
      leadId: args.leadId,
    });
    return;
  }
  const leadPhone = (leadRow.data as { phone_normalized?: string | null })
    .phone_normalized;
  const leadEmail = (leadRow.data as { email?: string | null }).email;
  const conf = (confRows ?? []).find((c) => {
    const row = c as {
      phone_normalized?: string | null;
      email?: string | null;
    };
    return (
      (leadPhone && row.phone_normalized === leadPhone) ||
      (leadEmail && row.email === leadEmail)
    );
  }) ?? null;
  if (!conf) {
    infoLog(`[${logSource}] no encontre confirmation`, {
      leadId: args.leadId,
      eventId: args.eventId,
    });
    return;
  }
  const confId = (conf as unknown as { id: string }).id;

  // 2. UPDATE payment_status.
  const { error: payUpdErr } = await supabase
    .from("event_confirmations")
    .update({ payment_status: ps } as never)
    .eq("id", confId as never);
  if (payUpdErr) {
    errorLog(`[${logSource}] payment_status update fallo`, {
      error: payUpdErr.message,
    });
  }

  // 3. Re-enviar el email del QR (con badge visual actualizado).
  if (leadEmail) {
    try {
      const { sendQrPassForConfirmation } = await import(
        "@/lib/email/event-qr-pass"
      );
      const { getEventById } = await import("@/lib/events/events-server");
      const evt = await getEventById(args.eventId).catch(() => null);
      if (evt) {
        await sendQrPassForConfirmation({
          confirmationId: confId,
          event: evt,
        });
        infoLog(`[${logSource}] email re-enviado con badge ${ps}`, {
          confirmationId: confId,
          email: leadEmail,
        });
      }
    } catch (emailErr) {
      errorLog(`[${logSource}] email fallo`, {
        error:
          emailErr instanceof Error ? emailErr.message : String(emailErr),
      });
    }
  }

  // 4. Mandar WhatsApp al lead.
  if (leadPhone) {
    try {
      const provider = getActiveWhatsAppProvider();
      if (provider) {
        const { getEventById } = await import("@/lib/events/events-server");
        const evt = await getEventById(args.eventId).catch(() => null);
        const eventTitle = evt?.title ?? "el evento";
        const bodyText =
          ps === "paid_manual"
            ? `✅ Tu pago en puerta quedó registrado. ` +
              `Te esperamos el día del evento. ` +
              `Pase digital: te lo re-enviamos al correo por si lo necesitas.`
            : `¡Listo! Tu pago de $${args.amountTotalMXN.toLocaleString("es-MX")} MXN ` +
              `para *${eventTitle}* se confirmó. Tu QR ya está validado. ` +
              `Te esperamos el día del evento. Si tienes dudas, responde a este chat.`;
        await provider.send({ to: leadPhone, body: bodyText });
        infoLog(`[${logSource}] WhatsApp enviado`, {
          phone: leadPhone,
          eventTitle,
          paymentStatus: ps,
        });
      }
    } catch (waErr) {
      errorLog(`[${logSource}] WhatsApp fallo`, {
        error: waErr instanceof Error ? waErr.message : String(waErr),
      });
    }
  }
}
