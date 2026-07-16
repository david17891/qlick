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
 * Auth (FIX 2026-07-16 sprint cobro-en-puerta):
 *   - `requireAdmin` si el caller está logueado como admin (path del
 *     panel admin del evento).
 *   - Validación por `qr_token` del cuerpo (path del scanner público
 *     del staff). El scanner ya tiene el `qr_token` en memoria
 *     (lo escaneó del QR del asistente). El backend valida que el
 *     `qr_token` existe en `event_qr_tokens`, no está expirado, y
 *     corresponde al `event_id` de la confirmation.
 *
 * Si NINGUNO de los dos paths está autenticado, retorna 401.
 * Loggeado en `admin_audit_log` con `actor_email` del admin si
 * está logueado, o "staff:qr:<token_prefix>" si viene del scanner.
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
  /**
   * FIX 2026-07-16: token del QR escaneado por el staff. Requerido
   * si NO hay sesión admin (path del scanner público). El backend
   * valida que el `qr_token` existe en `event_qr_tokens`, no está
   * expirado, y corresponde al `event_id` de la confirmation.
   */
  qr_token?: string;
  /** Metodo de pago. Default: 'cash'. */
  payment_method?: "cash" | "card_manual" | "transfer" | "other";
  /** Monto cobrado en MXN. Default: el del evento. */
  amount_mxn?: number;
  /** Notas del staff (opcional). */
  notes?: string;
  /**
   * Email opcional del operador (cacheado en localStorage del
   * scanner). Solo se usa como `actor_email` del audit log si
   * NO hay sesión admin. Si tampoco, queda "staff:qr:<token_prefix>".
   */
  staff_email?: string;
}

const VALID_METHODS = new Set([
  "cash",
  "card_manual",
  "transfer",
  "other",
] as const);

export async function POST(req: NextRequest) {
  // 1. Parse body primero (necesitamos `qr_token` antes de decidir auth).
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

  // 2. Auth: admin OR qr_token. El scanner público usa qr_token
  // (sin login); el panel admin usa sesión admin. Si ninguno, 401.
  const admin = await requireAdmin();
  let actorEmail: string;
  let authSource: "admin" | "qr_token";
  if (admin) {
    actorEmail = admin.email ?? "unknown_admin";
    authSource = "admin";
  } else {
    // Path del scanner público: validar qr_token.
    if (!body.qr_token || typeof body.qr_token !== "string") {
      return NextResponse.json(
        {
          error:
            "Falta `qr_token`. El scanner público debe mandar el token del QR escaneado. O loguéate como admin.",
        },
        { status: 401 },
      );
    }
    actorEmail = body.staff_email
      ? `staff:${body.staff_email}`
      : `staff:qr:${body.qr_token.slice(0, 8)}`;
    authSource = "qr_token";
  }
  // Después del `if (!body.qr_token)` que retorna en el path qr_token,
  // TypeScript no estrecha `body.qr_token` a `string`. Reasignamos a
  // una const local para que las queries abajo no necesiten `!`.
  const qrTokenForLookup: string = body.qr_token ?? "";

  const supabase = createSupabaseAdminClient();

  // 3. Si auth=qr_token, validar el token contra event_qr_tokens.
  let validatedQrEventId: string | null = null;
  if (authSource === "qr_token") {
    const { data: qrRow, error: qrErr } = await supabase
      .from("event_qr_tokens")
      .select("id, event_id, expires_at")
      .eq("token", qrTokenForLookup)
      .maybeSingle();
    if (qrErr) {
      return NextResponse.json(
        { error: `Error validando qr_token: ${qrErr.message}` },
        { status: 500 },
      );
    }
    if (!qrRow) {
      return NextResponse.json(
        { error: "qr_token inválido o no existe." },
        { status: 403 },
      );
    }
    const tokenExpires = (qrRow as { expires_at?: string | null })
      .expires_at;
    if (tokenExpires && new Date(tokenExpires) < new Date()) {
      return NextResponse.json(
        { error: "qr_token expirado. Pedí al asistente un nuevo pase." },
        { status: 403 },
      );
    }
    validatedQrEventId = (qrRow as { event_id: string }).event_id;
  }

  try {
    // 4. Buscar la confirmation.
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

    // 5. FIX 2026-07-16: si auth=qr_token, validar que la confirmation
    // corresponde al event_id del qr_token (defense in depth — un
    // staff con un QR de un evento no puede marcar como pagado el
    // confirmation de OTRO evento).
    if (
      authSource === "qr_token" &&
      validatedQrEventId &&
      (confRow as unknown as { event_id: string }).event_id !==
        validatedQrEventId
    ) {
      return NextResponse.json(
        {
          error:
            "El qr_token y la confirmation son de eventos distintos. Esto no debería pasar.",
        },
        { status: 403 },
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
              checked_in_by: actorEmail,
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
              checked_in_by: actorEmail,
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
              checked_in_by: actorEmail,
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
        actor_email: actorEmail,
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
      actorEmail,
      authSource,
    });

    // FIX auditoria 2026-07-15f v2 (refactor): el codigo inline de
    // email + WhatsApp se movio a
    // `@/lib/payments/notify-lead-payment-confirmed` (mismo helper que
    // el webhook de Stripe y el simulator dev usan). El mark-paid pasa
    // paymentStatusOverride="paid_manual" para que el badge del email
    // diga "pago fue registrado en puerta" (no "pago en línea se
    // confirmó").
    const attendeeEmail = (confRow as { email?: string | null }).email;
    const attendeePhone = (confRow as { phone_normalized?: string | null })
      .phone_normalized;
    const eventId = (confRow as unknown as { event_id: string }).event_id;
    if (attendeeEmail) {
      void (async () => {
        try {
          const { notifyLeadPaymentConfirmed } = await import(
            "@/lib/payments/notify-lead-payment-confirmed"
          );
          // effectiveLeadId: el helper hace SELECT por lead.id. Si
          // el confirmation no tiene leadId (caso raro), usamos el
          // phone_normalized como fallback. El simulator usa el mismo
          // truco.
          const effectiveLeadId = attendeePhone ?? eventId;
          await notifyLeadPaymentConfirmed({
            leadId: effectiveLeadId,
            eventId,
            amountTotalMXN: amountMXN,
            paymentStatusOverride: "paid_manual",
            logSource: "staff-mark-paid",
          });
        } catch (notifErr) {
          errorLog("[staff/mark-paid] notifyLead fallo (no fatal)", {
            error:
              notifErr instanceof Error
                ? notifErr.message
                : String(notifErr),
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
