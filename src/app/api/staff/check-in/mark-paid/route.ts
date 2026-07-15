/**
 * POST /api/staff/check-in/mark-paid
 *
 * Sprint 2026-07-15e (sesion David, "mucha gente pagara efectivo"):
 * cuando el staff escanea un QR de un asistente que NO ha pagado
 * en linea, el endpoint /api/check-in/[token] devuelve 403 con
 * `requires_action: 'collect_payment_door'`. El staff cobra en
 * puerta (efectivo, transferencia, etc.) y llama a este endpoint
 * para:
 *   1. Marcar el `payment_status` de la confirmation como 'paid_manual'.
 *   2. Crear una fila en `event_payments` con el method='cash' (u
 *      otro) y amount_mxn del evento.
 *   3. Hacer el check-in del attendee (mismo path que el endpoint
 *      publico, pero saltando la validacion de pago).
 *
 * Auth: `requireAdmin` (gate via ADMIN_EMAIL_ALLOWLIST).
 * Loggeado en `admin_audit_log`.
 *
 * Idempotencia: si la confirmation ya esta como `paid_manual`, NO
 * crea otro payment row (busca el existente).
 *
 * Metodos aceptados: 'cash' (default), 'card_manual', 'transfer',
 * 'other'. NO aceptamos 'stripe' aca (ese lo hace el webhook).
 *
 * @server
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/crm/audit-server";
import { errorLog, infoLog } from "@/lib/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface MarkPaidRequest {
  /** UUID de la event_confirmation a marcar como pagada. */
  confirmation_id: string;
  /** Metodo de pago. Default: 'cash'. */
  payment_method?: "cash" | "card_manual" | "transfer" | "other";
  /** Monto cobrado en MXN. Default: el del evento. */
  amount_mxn?: number;
  /** Notas del staff (opcional). */
  notes?: string;
}

const VALID_METHODS = new Set([
  "cash",
  "card_manual",
  "transfer",
  "other",
] as const);

export async function POST(req: NextRequest) {
  // 1. Auth admin.
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "No admin session" }, { status: 401 });
  }

  // 2. Parse body.
  let body: MarkPaidRequest;
  try {
    body = (await req.json()) as MarkPaidRequest;
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }
  if (!body.confirmation_id || typeof body.confirmation_id !== "string") {
    return NextResponse.json(
      { error: "Falta `confirmation_id` (UUID de la confirmation)." },
      { status: 400 },
    );
  }
  const paymentMethod = body.payment_method ?? "cash";
  if (!VALID_METHODS.has(paymentMethod)) {
    return NextResponse.json(
      {
        error: `payment_method inválido. Usar uno de: ${Array.from(
          VALID_METHODS,
        ).join(", ")}.`,
      },
      { status: 400 },
    );
  }

  const supabase = createSupabaseAdminClient();

  try {
    // 3. Buscar la confirmation.
    const { data: confRow, error: confErr } = await supabase
      .from("event_confirmations")
      .select("id, event_id, lead_id, name, email, phone_normalized, payment_status")
      .eq("id", body.confirmation_id)
      .maybeSingle();
    if (confErr) {
      return NextResponse.json(
        { error: `Error buscando confirmation: ${confErr.message}` },
        { status: 500 },
      );
    }
    if (!confRow) {
      return NextResponse.json(
        { error: `Confirmation ${body.confirmation_id} no existe.` },
        { status: 404 },
      );
    }

    // 4. Determinar el monto. Default: el del evento.
    let amountMXN = body.amount_mxn;
    if (typeof amountMXN !== "number" || amountMXN <= 0) {
      // Buscar el precio del evento (regex en description porque la DB
      // no expone price_mxn en ActiveEventContext todavia).
      const { data: evtRow } = await supabase
        .from("events")
        .select("description, price_mxn")
        .eq("id", (confRow as unknown as { event_id: string }).event_id)
        .maybeSingle();
      const evt = evtRow as unknown as {
        description?: string | null;
        price_mxn?: number | string | null;
      } | null;
      if (typeof evt?.price_mxn === "number" && evt.price_mxn > 0) {
        amountMXN = evt.price_mxn;
      } else if (typeof evt?.price_mxn === "string") {
        amountMXN = parseFloat(evt.price_mxn);
      } else if (evt?.description) {
        const priceMatch = evt.description.match(
          /\$\s?(\d{1,3}(?:[,.]?\d{3})*)/,
        );
        if (priceMatch) {
          amountMXN = parseFloat(priceMatch[1].replace(/,/g, ""));
        }
      }
      if (typeof amountMXN !== "number" || amountMXN <= 0) {
        return NextResponse.json(
          {
            error:
              "No se pudo determinar el monto. Pasa `amount_mxn` explícito en el body.",
          },
          { status: 400 },
        );
      }
    }

    // 5. UPDATE payment_status='paid_manual' (idempotente).
    const prevStatus = (confRow as { payment_status?: string | null })
      .payment_status;
    if (prevStatus !== "paid_manual" && prevStatus !== "paid") {
      const { error: updErr } = await supabase
        .from("event_confirmations")
        .update({ payment_status: "paid_manual" } as never)
        .eq("id", body.confirmation_id);
      if (updErr) {
        return NextResponse.json(
          { error: `Error actualizando payment_status: ${updErr.message}` },
          { status: 500 },
        );
      }
    }

    // 6. Crear fila en event_payments (si no existe ya una manual).
    // Buscamos una fila existente con el mismo confirmation_id +
    // method='cash' o 'card_manual' o 'transfer' (los manuales).
    const { data: existingPayments } = await supabase
      .from("event_payments" as never)
      .select("id")
      .eq("confirmation_id" as never, body.confirmation_id as never)
      .in("method" as never, ["cash", "card_manual", "transfer", "other"] as never)
      .limit(1);
    const existingPayRows = (existingPayments ?? []) as unknown as {
      id: string;
    }[];
    let paymentId: string;
    if (existingPayRows.length > 0) {
      paymentId = existingPayRows[0].id;
    } else {
      const { data: newPay, error: payInsErr } = await supabase
        .from("event_payments" as never)
        .insert({
          confirmation_id: body.confirmation_id,
          method: paymentMethod,
          status: "approved",
          amount_mxn: amountMXN,
          currency: "MXN",
          notes: body.notes ?? null,
        } as never)
        .select("id")
        .maybeSingle();
      if (payInsErr || !newPay) {
        return NextResponse.json(
          {
            error: `Error creando payment: ${
              payInsErr?.message ?? "no se obtuvo id"
            }`,
          },
          { status: 500 },
        );
      }
      paymentId = (newPay as { id: string }).id;
    }

    // 7. Hacer el check-in del attendee (buscar por phone o crear walk-in).
    //    El path publico /api/check-in/[token] ya tiene la logica
    //    completa, pero aca queremos hacerlo inline sin re-validar
    //    el pago (que ya validamos). Para no duplicar logica,
    //    reusamos el helper que ya existe: hacemos un SELECT del
    //    event_qr_token por phone+event, y si existe, marcamos
    //    checked_in_at. Si no existe, no creamos walk-in (eso
    //    es responsabilidad del scanner que ya escaneo el QR).
    const phone = (confRow as { phone_normalized?: string | null })
      .phone_normalized;
    let checkedInAt: string | null = null;
    let checkedInAttendeeId: string | null = null;
    if (phone) {
      const { data: qrRow, error: qrErr } = await supabase
        .from("event_qr_tokens")
        .select("id, checked_in_at, attendee_name, attendee_email, attendee_phone_normalized")
        .eq("event_id", (confRow as unknown as { event_id: string }).event_id)
        .eq("attendee_phone_normalized", phone)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!qrErr && qrRow) {
        const token = qrRow as {
          id: string;
          checked_in_at: string | null;
        };
        const nowIso = new Date().toISOString();
        if (!token.checked_in_at) {
          const { error: checkInErr } = await supabase
            .from("event_qr_tokens" as never)
            .update({
              checked_in_at: nowIso,
              checked_in_by: admin.email ?? "staff",
            } as never)
            .eq("id" as never, token.id as never);
          if (!checkInErr) {
            checkedInAt = nowIso;
          }
        } else {
          checkedInAt = token.checked_in_at;
        }
        // Tambien crear/actualizar el event_attendees (path del check-in publico).
        const { data: existingAtt } = await supabase
          .from("event_attendees")
          .select("id, checked_in_at")
          .eq("lead_id", (confRow as unknown as { lead_id: string | null }).lead_id ?? "")
          .eq("event_id", (confRow as unknown as { event_id: string }).event_id)
          .limit(1)
          .maybeSingle();
        if (existingAtt) {
          const { data: updAtt } = await supabase
            .from("event_attendees" as never)
            .update({
              checked_in_at: nowIso,
              checked_in_by: admin.email ?? "staff",
            } as never)
            .eq("id" as never, (existingAtt as { id: string }).id as never)
            .select("id")
            .maybeSingle();
          if (updAtt) {
            checkedInAttendeeId = (updAtt as { id: string }).id;
          }
        } else if ((confRow as unknown as { lead_id: string | null }).lead_id) {
          const { data: insAtt } = await supabase
            .from("event_attendees" as never)
            .insert({
              event_id: (confRow as unknown as { event_id: string }).event_id,
              lead_id: (confRow as unknown as { lead_id: string }).lead_id,
              confirmation_id: body.confirmation_id,
              name: (confRow as { name?: string | null }).name ?? "Asistente",
              email: (confRow as { email?: string | null }).email ?? null,
              phone_normalized: phone,
              source: "manual",
              checked_in_at: nowIso,
              checked_in_by: admin.email ?? "staff",
            } as never)
            .select("id")
            .maybeSingle();
          if (insAtt) {
            checkedInAttendeeId = (insAtt as { id: string }).id;
          }
        }
      }
    }

    // 8. Audit log.
    try {
      await logAdminAction({
        action: "manual_payment_door",
        entity_type: "event_confirmation",
        entity_id: body.confirmation_id,
        actor_email: admin.email ?? "unknown",
        metadata: {
          payment_method: paymentMethod,
          amount_mxn: amountMXN,
          notes: body.notes ?? null,
          previous_payment_status: prevStatus,
          new_payment_status: "paid_manual",
          payment_id: paymentId,
          checked_in_at: checkedInAt,
          checked_in_attendee_id: checkedInAttendeeId,
        },
      });
    } catch {
      /* swallow */
    }

    infoLog("[staff/mark-paid] pago en puerta registrado", {
      confirmationId: body.confirmation_id,
      paymentId,
      paymentMethod,
      amountMXN,
      adminEmail: admin.email,
    });

    // FIX auditoria 2026-07-15f: notificar al asistente que su pago se
    // confirmo en puerta. Fire-and-forget para no bloquear el response
    // del scanner.
    //
    // 1) Re-enviar el email del QR con el badge "PAGADO" (mismo helper
    //    que el webhook de Stripe usa). El template ahora muestra el
    //    badge verde porque paymentStatus=paid_manual.
    // 2) Mandar WhatsApp al lead (si tiene phone) confirmando el pago.
    //    Patron espejado de `notifyLeadPaymentConfirmed` en el webhook
    //    de Stripe. Fire-and-forget: si falla, el lead igual ve el
    //    badge verde en su email y el staff ya le cobró.
    const attendeeEmail = (confRow as { email?: string | null }).email;
    const attendeePhone = (confRow as { phone_normalized?: string | null })
      .phone_normalized;
    const eventId = (confRow as unknown as { event_id: string }).event_id;
    if (attendeeEmail) {
      void (async () => {
        try {
          const { sendQrPassForConfirmation } = await import(
            "@/lib/email/event-qr-pass"
          );
          // Re-leemos el evento desde la DB (es solo 1 row, vale el round-trip).
          const { getEventById } = await import(
            "@/lib/events/events-server"
          );
          const evt = await getEventById(eventId);
          if (evt) {
            await sendQrPassForConfirmation({
              confirmationId: body.confirmation_id,
              event: evt,
            });
            infoLog(
              "[staff/mark-paid] email re-enviado con badge PAGADO",
              {
                confirmationId: body.confirmation_id,
                email: attendeeEmail,
              },
            );
          }
        } catch (emailErr) {
          errorLog("[staff/mark-paid] email fallo (no fatal)", {
            error:
              emailErr instanceof Error
                ? emailErr.message
                : String(emailErr),
          });
        }
      })();
    }
    if (attendeePhone) {
      void (async () => {
        try {
          const { getActiveWhatsAppProvider } = await import(
            "@/lib/whatsapp"
          );
          const provider = getActiveWhatsAppProvider();
          if (provider) {
            const { getEventById } = await import(
              "@/lib/events/events-server"
            );
            const evt = await getEventById(eventId);
            const eventTitle = evt?.title ?? "el evento";
            const message =
              `✅ Tu pago en puerta quedó registrado. ` +
              `Te esperamos el día del evento. ` +
              `Pase digital: te lo re-enviamos al correo por si lo necesitas.`;
            await provider.send({
              to: attendeePhone,
              body: message,
            });
            infoLog(
              "[staff/mark-paid] WhatsApp confirmacion enviado",
              {
                phone: attendeePhone,
                eventTitle,
              },
            );
          }
        } catch (waErr) {
          errorLog("[staff/mark-paid] WhatsApp fallo (no fatal)", {
            error:
              waErr instanceof Error ? waErr.message : String(waErr),
          });
        }
      })();
    }

    return NextResponse.json(
      {
        ok: true,
        confirmation_id: body.confirmation_id,
        payment_id: paymentId,
        payment_status: "paid_manual",
        payment_method: paymentMethod,
        amount_mxn: amountMXN,
        checked_in_at: checkedInAt,
        attendee_id: checkedInAttendeeId,
        note:
          "Pago en puerta registrado y check-in realizado. El staff NO necesita escanear el QR otra vez.",
      },
      { status: 200 },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errorLog("[staff/mark-paid] error fatal", {
      error: msg,
      confirmationId: body.confirmation_id,
    });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
