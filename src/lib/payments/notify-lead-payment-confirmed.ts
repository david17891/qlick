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
        // FIX 2026-07-17 (sprint event-payments manual flow, feedback David):
        // el mensaje de "pago en puerta" original era confuso ("Tu pago
        // en puerta quedó registrado") — el usuario no entiende que YA
        // quedo registrado. Lo cambiamos a un comprobante claro con
        // los datos del pago (monto, metodo, fecha) + link al QR.
        // Para pagos online (stripe), mantenemos el mensaje corto de
        // "pago confirmado" que ya funcionaba.
        const eventStart = evt?.startsAt ? new Date(evt.startsAt).toLocaleDateString("es-MX", { day: "numeric", month: "long" }) : "";
        const bodyText =
          ps === "paid_manual"
            ? `✅ *Comprobante de pago — ${eventTitle}*\n\n` +
              `💰 Monto: $${(args.amountTotalMXN ?? 0).toLocaleString("es-MX")} MXN\n` +
              `💵 Método: Efectivo (pago en puerta)\n` +
              `📅 Fecha: ${new Date().toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })}\n` +
              `🎟 Tu QR de acceso está listo${eventStart ? ` para el ${eventStart}` : ""}.\n\n` +
              `Te re-enviamos el pase al correo ${leadEmail ?? "(tu email)"} por si lo necesitas. ` +
              `Nos vemos el día del evento.`
            : `¡Listo! Tu pago${amountText}para *${eventTitle}* se confirmó. ` +
              `Tu QR ya está validado${eventStart ? ` para el ${eventStart}` : ""}. ` +
              `Te esperamos el día del evento. ` +
              `Si tienes dudas, responde a este chat.`;

        // FIX 2026-07-19 (sprint bot feedback E2E David, "ya marca
        // pagado pero no me envio ni whatsapp"): el codigo anterior
        // ignoraba el `result` del provider.send y loggeaba
        // "WhatsApp enviado" siempre (incluso si Meta retornaba
        // ok:false). Ademas NO loggeaba en lead_whatsapp_log, asi
        // que el admin no veia el outbound. FIX:
        //   1. Capturar el result del provider.send.
        //   2. Si ok=false, loggear el `note` exacto de Meta (ej.
        //      "Cloud API error: Invalid parameter"). Sin esto
        //      diagnostico es un black box.
        //   3. Loggear SIEMPRE en lead_whatsapp_log (via
        //      markWhatsAppStatus) para que el admin vea el
        //      outbound desde el panel.
        //   4. Si ok=false, errorLog con severity alta para que
        //      Vercel lo capture y David lo pueda revisar.
        const sendResult = await provider.send({ to: leadPhone, body: bodyText });
        if (!sendResult.ok) {
          errorLog(`[${logSource}] WhatsApp fallo (provider retorno ok:false)`, {
            confirmationId: conf.id,
            phone: leadPhone,
            paymentStatus: ps,
            provider: sendResult.provider ?? "unknown",
            note: sendResult.note ?? "sin note",
            externalId: sendResult.externalId ?? null,
          });
        } else {
          infoLog(`[${logSource}] WhatsApp enviado OK`, {
            confirmationId: conf.id,
            phone: leadPhone,
            eventTitle,
            paymentStatus: ps,
            externalId: sendResult.externalId ?? null,
          });
        }

        // FIX 2026-07-19: loggear en lead_whatsapp_log para que
        // el admin vea el outbound desde el panel del lead. Antes
        // el outbound del pago confirmado era invisible.
        //
        // Sub-fix 2026-07-19 (mismo sprint): NO usamos
        // `markWhatsAppStatus` porque tiene un early-return cuando
        // `prev_status === new_status` (caso normal: el lead YA
        // estaba `contactado` por el inbound "Hola"). En ese flow
        // el outbound del pago NUNCA quedaba en el log, y el admin
        // no veía nada. Aquí hacemos INSERT directo + UPDATE del
        // status solo si cambia.
        //
        // Búsqueda del lead: intentamos primero por
        // `phone_normalized` (match exacto con la confirmation);
        // si no hay match (caso real de David, donde el lead se
        // creó con un phone_raw distinto y `phone_normalized` se
        // actualizó a otro), fallback por email. Si tampoco, loggeamos
        // warning y seguimos sin romper el flow principal.
        try {
          // Cast local: el typegen de leads tiene `whatsapp_status: string`
          // (no nullable), pero defensivamente lo tratamos como `string | null`
          // para no romper si la fila no trae el campo por algún drift.
          type LeadRowLocal = { id: string; whatsapp_status: string | null };
          let leadRow: LeadRowLocal | null = null;
          const { data: leadByPhone } = await supabase
            .from("leads")
            .select("id, whatsapp_status")
            .eq("phone_normalized", leadPhone)
            .maybeSingle();
          leadRow = (leadByPhone as unknown as LeadRowLocal | null) ?? null;
          if (!leadRow && leadEmail) {
            const { data: leadByEmail } = await supabase
              .from("leads")
              .select("id, whatsapp_status")
              .eq("email", leadEmail)
              .maybeSingle();
            leadRow = (leadByEmail as unknown as LeadRowLocal | null) ?? null;
          }
          if (leadRow?.id) {
            const newStatus = sendResult.ok ? "contactado" : "no_contactado";
            // INSERT directo del log (no depende del early-return
            // de markWhatsAppStatus, así que SIEMPRE queda traza).
            const { error: logInsErr } = await supabase
              .from("lead_whatsapp_log")
              .insert({
                lead_id: leadRow.id,
                event_id: eventId ?? null,
                prev_status: leadRow.whatsapp_status ?? null,
                new_status: newStatus,
                actor_email: `${logSource}@qlick.digital`,
                message_preview: bodyText.slice(0, 200),
                metadata: {
                  source: "payment-notify",
                  confirmationId: conf.id,
                  paymentStatus: ps,
                  providerResult: sendResult.ok ? "ok" : "fail",
                  providerNote: sendResult.note ?? null,
                  externalId: sendResult.externalId ?? null,
                },
              });
            if (logInsErr) {
              errorLog(
                `[${logSource}] lead_whatsapp_log INSERT fallo (no fatal)`,
                {
                  confirmationId: conf.id,
                  leadId: leadRow.id,
                  error: logInsErr.message,
                },
              );
            }
            // UPDATE solo si el status realmente cambia (no churn).
            if (leadRow.whatsapp_status !== newStatus) {
              const { error: updErr } = await supabase
                .from("leads")
                .update({
                  whatsapp_status: newStatus,
                  last_contacted_at: new Date().toISOString(),
                })
                .eq("id", leadRow.id);
              if (updErr) {
                errorLog(
                  `[${logSource}] leads.whatsapp_status UPDATE fallo (no fatal)`,
                  {
                    leadId: leadRow.id,
                    error: updErr.message,
                  },
                );
              }
            }
          } else {
            // No encontramos lead por phone ni email. No es fatal
            // (el WhatsApp SÍ se envió al phone del confirmation), pero
            // loggeamos para que David pueda hacer match manual.
            infoLog(`[${logSource}] no se encontro lead para loggear outbound`, {
              confirmationId: conf.id,
              phone: leadPhone,
              email: leadEmail,
            });
          }
        } catch (logEx) {
          errorLog(`[${logSource}] lead_whatsapp_log throw (no fatal)`, {
            confirmationId: conf.id,
            error: logEx instanceof Error ? logEx.message : String(logEx),
          });
        }
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
