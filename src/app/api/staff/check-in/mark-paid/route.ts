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
            "Falta `qr_token`. El scanner público debe mandar el token del QR escaneado. O inicia sesión como admin.",
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
    // FIX 2026-07-16 (sesion David, scanner cobro-en-puerta "Error
    // buscando confirmation: column event_confirmations.lead_id does
    // not exist"): event_confirmations NO tiene columna lead_id. La
    // columna lead_id se agrego a event_attendees (migration
    // 20260714120000) y a event_access (migration 20260715131000),
    // pero NO a event_confirmations (que se identifica por
    // phone_normalized o email, no por lead).
    const { data: confRow, error: confErr } = await supabase
      .from("event_confirmations")
      .select("id, event_id, name, email, phone_normalized, payment_status")
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

    // 6. Crear/recuperar event_payments (idempotente via UNIQUE
    // constraint `event_payments_manual_idempotency(confirmation_id,
    // method, idempotency_key) WHERE idempotency_key IS NOT NULL` —
    // migration 20260715120000).
    //
    // FIX 2026-07-16 (auditoria scanner cobro-en-puerta, "doble click
    // del staff crea 2 payments"): antes el codigo buscaba un existing
    // payment con `in("method", ["cash", ...])` y reusaba el primero
    // que encontrara — pero si los 2 clicks eran concurrentes
    // (race condition de <100ms entre SELECT y INSERT), ambos
    // pasaban el check y creaban 2 rows. Ahora usamos un
    // `idempotency_key` deterministico (manual:{confirmation_id}:
    // {method}) y dejamos que la UNIQUE constraint de Postgres
    // haga la deduplicacion atomica. Si el INSERT revienta con 23505
    // (UNIQUE violation), el otro proceso gano la carrera y nosotros
    // hacemos un SELECT para obtener su id.
    const idempotencyKey = `manual:${body.confirmation_id}:${paymentMethod}`;
    let paymentId: string;
    const { data: existingPayByKey } = await supabase
      .from("event_payments" as never)
      .select("id")
      .eq("confirmation_id" as never, body.confirmation_id as never)
      .eq("idempotency_key" as never, idempotencyKey as never)
      .maybeSingle();
    if (existingPayByKey) {
      paymentId = (existingPayByKey as { id: string }).id;
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
          idempotency_key: idempotencyKey,
        } as never)
        .select("id")
        .maybeSingle();
      if (payInsErr?.code === "23505") {
        // UNIQUE violation: otro proceso (doble click concurrente)
        // inserto entre nuestro SELECT y nuestro INSERT. Buscamos su row.
        const { data: raceWinner } = await supabase
          .from("event_payments" as never)
          .select("id")
          .eq("confirmation_id" as never, body.confirmation_id as never)
          .eq("idempotency_key" as never, idempotencyKey as never)
          .maybeSingle();
        if (raceWinner) {
          paymentId = (raceWinner as { id: string }).id;
          infoLog(
            "[staff/mark-paid] race condition gano el otro INSERT, reusando",
            {
              confirmationId: body.confirmation_id,
              paymentId,
            },
          );
        } else {
          return NextResponse.json(
            {
              error: `23505 UNIQUE violation pero SELECT no encontro row: ${payInsErr.message}`,
            },
            { status: 500 },
          );
        }
      } else if (payInsErr || !newPay) {
        return NextResponse.json(
          {
            error: `Error creando payment: ${
              payInsErr?.message ?? "no se obtuvo id"
            }`,
          },
          { status: 500 },
        );
      } else {
        paymentId = (newPay as { id: string }).id;
      }
    }

    // 6.5 FIX 2026-07-16 (auditoria scanner cobro-en-puerta): ademas del
    // payment, crear/actualizar el event_access para que el asistente
    // tenga acceso al evento (post-recordings, LMS, etc). Mismo patron
    // que `manual-payment.ts` (admin flow): grantEventAccess es
    // idempotente. Si ya hay uno active del mismo (userId o
    // confirmationId, eventId), refresca source y reason. Como aca NO
    // tenemos userId (guest checkout), usamos confirmationId como key
    // de idempotencia.
    //
    // Best-effort: si falla, no abortamos el flow. El staff ya cobro,
    // el payment ya esta creado, el check-in se hace igual. El
    // event_access se puede reconciliar despues.
    try {
      const { grantEventAccess } = await import(
        "@/lib/lms/event-entitlements"
      );
      const access = await grantEventAccess({
        userId: null,
        confirmationId: body.confirmation_id,
        eventId: (confRow as unknown as { event_id: string }).event_id,
        source: "manual_event_admin",
        paymentId,
        grantedReason: `staff_pay_at_door_${paymentMethod}_${new Date()
          .toISOString()
          .slice(0, 16)}`,
      });
      infoLog("[staff/mark-paid] event_access grant OK", {
        confirmationId: body.confirmation_id,
        accessId: access.id,
        source: "manual_event_admin",
      });
    } catch (accessErr) {
      // No fatal: el payment ya esta creado. El grant se puede
      // reconciliar despues via admin manual o via bot-engine.
      errorLog("[staff/mark-paid] grantEventAccess fallo (no fatal)", {
        confirmationId: body.confirmation_id,
        error:
          accessErr instanceof Error ? accessErr.message : String(accessErr),
      });
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
        // FIX 2026-07-16: antes buscabamos el attendee por lead_id,
        // pero event_confirmations NO tiene lead_id. Ahora usamos
        // confirmation_id (FK existente desde migration 20260627000000)
        // o phone_normalized como fallback. El attendee puede tener
        // lead_id=null si todavia no se promovio a lead; eso es OK
        // (la columna es nullable).
        const { data: existingAtt } = await supabase
          .from("event_attendees")
          .select("id, checked_in_at")
          .eq("confirmation_id", body.confirmation_id)
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
        } else {
          // No hay attendee previo. Crear uno nuevo linkeado a la
          // confirmation. lead_id queda null (se setea en otro flow
          // cuando el scanner publico promueve a lead).
          const { data: insAtt } = await supabase
            .from("event_attendees" as never)
            .insert({
              event_id: (confRow as unknown as { event_id: string }).event_id,
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
    //
    // FIX 2026-07-16 (auditoria scanner cobro-en-puerta): antes
    // pasabamos `leadId: attendeePhone ?? eventId` (workaround del
    // bug de que event_confirmations.lead_id no existe). Eso
    // ROMPIA la notificacion: el helper hacia SELECT leads WHERE
    // id="+52..." (no UUID), no encontraba nada, y el asistente NO
    // recibia email ni WhatsApp. Ahora pasamos confirmationId
    // directo (que SI existe) y el helper hace SELECT por PK.
    const eventId = (confRow as unknown as { event_id: string }).event_id;
    try {
      const { notifyLeadPaymentConfirmed } = await import(
        "@/lib/payments/notify-lead-payment-confirmed"
      );
      await notifyLeadPaymentConfirmed({
        confirmationId: body.confirmation_id,
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
