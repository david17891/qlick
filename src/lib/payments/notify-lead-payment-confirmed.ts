/**
 * FIX 2026-07-16 (sesion David, scanner cobro-en-puerta): notifica al
 * lead por WhatsApp + re-envia el email del QR cuando un pago de evento
 * se confirma.
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
 *   1. Buscar la confirmation por id (SELECT directo, no filtro JS).
 *   2. Re-enviar el email del QR via sendQrPassForConfirmation (con
 *      el badge visual de estado de pago correspondiente).
 *   3. Mandar WhatsApp al lead (si tiene phone).
 *
 * **NO actualiza payment_status** — eso lo hace el caller ANTES de
 * llamar a este helper (mark-paid en linea 247, manual-payment en
 * linea 458, etc). Esto evita el doble UPDATE y la race condition.
 *
 * **NO crea event_access** — eso es responsabilidad del caller
 * (mark-paid / manual-payment / grantEventAccess del bot-engine).
 * El helper solo NOTIFICA.
 *
 * Fire-and-forget: cualquier error se loggea pero NO rompe el
 * response del caller. Esta funcion esta pensada para llamarse
 * con `void ...().catch(...)` o dentro de un try/catch.
 *
 * Server-only. Usa service role, bypass RLS.
 *
 * FIX 2026-07-16 (auditoria scanner): antes este helper recibia
 * `leadId` + `eventId` y buscaba la confirmation por filtro JS
 * (LIMIT 20 + filter en memoria). Eso era:
 *   1. Ineficiente (traia hasta 20 confirmations para encontrar 1).
 *   2. Propenso a matchear la confirmation incorrecta si el lead
 *      tenia multiples events.
 *   3. ROTO en el path mark-paid: el caller pasaba
 *      `leadId = attendeePhone` (string "+52..."), el helper hacia
 *      `SELECT leads WHERE id = "+52..."` (no es UUID), no encontraba
 *      nada, y la notificacion se saltaba silenciosamente. El staff
 *      veia "OK" pero el asistente NO recibia ni email ni WhatsApp.
 *
 * Ahora el helper recibe `confirmationId` directo y hace un SELECT
 * por PK. Simple, rapido, correcto.
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { errorLog, infoLog } from "@/lib/log";
import { getActiveWhatsAppProvider } from "@/lib/whatsapp";

export interface NotifyLeadPaymentConfirmedArgs {
  /**
   * ID de la event_confirmation. REQUERIDO.
   * El helper hace SELECT por PK, garantiza match 1:1.
   */
  confirmationId: string;
  /**
   * ID del evento. Opcional: si no se pasa, se infiere de la
   * confirmation (SELECT trae event_id).
   */
  eventId?: string;
  /**
   * Monto del pago en MXN. Solo se usa para el WhatsApp (lo muestra
   * en el mensaje de confirmacion). Si no se pasa, no se incluye
   * en el texto.
   */
  amountTotalMXN?: number;
  /**
   * Override del payment_status badge en el email y WhatsApp.
   * Default: "paid". El mark-paid endpoint pasa "paid_manual"
   * para distinguir pago-en-puerta de pago-en-linea.
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
  if (!args.confirmationId) {
    errorLog("[payment-notify] falta confirmationId", {
      logSource: args.logSource ?? "payment-notify",
    });
    return;
  }
  const supabase = createSupabaseAdminClient();
  const ps = args.paymentStatusOverride ?? "paid";
  const logSource = args.logSource ?? "payment-notify";

  // 1. SELECT confirmation por PK.
  const { data: confRow, error: confErr } = await supabase
    .from("event_confirmations")
    .select("id, event_id, name, email, phone_normalized, payment_status")
    .eq("id", args.confirmationId)
    .maybeSingle();
  if (confErr) {
    errorLog(`[${logSource}] SELECT confirmation fallo`, {
      confirmationId: args.confirmationId,
      error: confErr.message,
    });
    return;
  }
  if (!confRow) {
    errorLog(`[${logSource}] confirmation no existe`, {
      confirmationId: args.confirmationId,
    });
    return;
  }
  const conf = confRow as unknown as {
    id: string;
    event_id: string;
    name: string | null;
    email: string | null;
    phone_normalized: string | null;
    payment_status: string | null;
  };
  const eventId = args.eventId ?? conf.event_id;
  const leadEmail = conf.email;
  const leadPhone = conf.phone_normalized;

  // 2. Re-enviar el email del QR (con badge visual actualizado).
  if (leadEmail) {
    try {
      const { sendQrPassForConfirmation } = await import(
        "@/lib/email/event-qr-pass"
      );
      const { getEventById } = await import("@/lib/events/events-server");
      const evt = await getEventById(eventId).catch(() => null);
      if (evt) {
        const emailResult = await sendQrPassForConfirmation({
          confirmationId: conf.id,
          event: evt,
        });
        if (!emailResult.ok) {
          errorLog(`[${logSource}] email fallo`, {
            confirmationId: conf.id,
            error: emailResult.error,
          });
        } else {
          infoLog(`[${logSource}] email enviado con badge ${ps}`, {
            confirmationId: conf.id,
            email: leadEmail,
          });
        }
      } else {
        errorLog(`[${logSource}] evento no encontrado para email`, {
          eventId,
          confirmationId: conf.id,
        });
      }
    } catch (emailErr) {
      errorLog(`[${logSource}] email throw`, {
        confirmationId: conf.id,
        error:
          emailErr instanceof Error ? emailErr.message : String(emailErr),
      });
    }
  }

  // 3. Mandar WhatsApp al lead.
  if (leadPhone) {
    try {
      const provider = getActiveWhatsAppProvider();
      if (provider) {
        const { getEventById } = await import("@/lib/events/events-server");
        const evt = await getEventById(eventId).catch(() => null);
        const eventTitle = evt?.title ?? "el evento";
        const amountText = args.amountTotalMXN
          ? ` de $${args.amountTotalMXN.toLocaleString("es-MX")} MXN `
          : " ";
        const bodyText =
          ps === "paid_manual"
            ? `✅ Tu pago en puerta quedó registrado${amountText}` +
              `para *${eventTitle}*. ` +
              `Te esperamos el día del evento. ` +
              `Tu pase digital te lo re-enviamos al correo por si lo necesitas.`
            : `¡Listo! Tu pago${amountText}para *${eventTitle}* se confirmó. ` +
              `Tu QR ya está validado. Te esperamos el día del evento. ` +
              `Si tienes dudas, responde a este chat.`;
        await provider.send({ to: leadPhone, body: bodyText });
        infoLog(`[${logSource}] WhatsApp enviado`, {
          confirmationId: conf.id,
          phone: leadPhone,
          eventTitle,
          paymentStatus: ps,
        });
      } else {
        infoLog(`[${logSource}] no hay WhatsApp provider activo`, {
          confirmationId: conf.id,
        });
      }
    } catch (waErr) {
      errorLog(`[${logSource}] WhatsApp throw`, {
        confirmationId: conf.id,
        error: waErr instanceof Error ? waErr.message : String(waErr),
      });
    }
  }
}
