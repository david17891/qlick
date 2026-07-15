/**
 * Endpoint público: check-in de un asistente vía el scanner del staff.
 *
 * POST /api/staff/check-in
 *   Body (JSON): {
 *     token: string,         // token del staff link
 *     qr_token: string,      // token del QR pass del asistente
 *     staff_email?: string,  // opcional, del staff que escaneó
 *     staff_displayName?: string  // opcional, display name del staff
 *   }
 *
 * **Flujo:**
 *   1. Valida el staff link (vigente + no revocado).
 *   2. Valida el qr_token (existe, no expirado, evento coincide).
 *   3. Marca check-in en event_qr_tokens, event_attendees (walk-in si no existe), leads.
 *   4. Audit log con actor = staff (email + displayName del operador).
 *   5. Bump use_count + last_used_at del staff link.
 *   6. Devuelve { ok, attendee: { name, event_title, already_checked_in } }.
 *
 * **Auth:** el staff link es la autorización (192 bits entropía). NO
 * requiere login. Esto es por diseño (decisión David 2026-07-03): el
 * staff puede ser externo y abrir el link en cualquier celular.
 *
 * **Validación cross-event:** si el staff abre el scanner del evento A
 * pero escanea un QR del evento B (por error), devolvemos 409 Conflict
 * con mensaje claro. Esto evita que un check-in se registre en el
 * evento equivocado.
 *
 * Server-only.
 */

import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { logAdminAction } from "@/lib/crm/audit-server";
import {
  validateStaffLink,
  recordStaffLinkUse,
  type EventStaffLink,
} from "@/lib/staff/links";
import { resolveConfirmationIdForCheckIn } from "@/lib/events/check-in-match";
import { debugLog, errorLog } from "@/lib/log";

export const dynamic = "force-dynamic";

interface TokenRow {
  id: string;
  event_id: string;
  attendee_name: string;
  attendee_phone_normalized: string | null;
  attendee_email: string | null;
  token: string;
  checked_in_at: string | null;
  checked_in_by: string | null;
  expires_at: string;
}

interface EventJoinRow {
  id: string;
  title: string;
  starts_at: string;
  slug: string;
}

async function fetchQrToken(
  token: string,
): Promise<{ row: TokenRow; event: EventJoinRow } | null> {
  if (!checkSupabaseConfig().configured) return null;
  const supabase = createSupabaseAdminClient();
  // FIX 2026-07-03 (sesion David, "QR no encontrado"): la query con
  // relacion embebida `event:events (...)` retornaba null aunque el token
  // existia en DB. PostgREST no infiere bien el alias `event:events`
  // para esta FK (el nombre auto-generado del constraint no matchea la
  // convencion esperada). Workaround: 2 queries separadas (token + event).
  // Mas simple y robusto que la relacion embebida.
  const { data, error } = await supabase
    .from("event_qr_tokens" as never)
    .select(
      "id, event_id, attendee_name, attendee_phone_normalized, attendee_email, token, checked_in_at, checked_in_by, expires_at",
    )
    .eq("token" as never, token)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as TokenRow;

  // Segundo query: el evento del token (separado, no embebido).
  const { data: evtData, error: evtErr } = await supabase
    .from("events")
    .select("id, title, starts_at, slug")
    .eq("id", row.event_id)
    .maybeSingle();
  if (evtErr || !evtData) return null;
  const event = evtData as EventJoinRow;
  return { row, event };
}

function isExpired(row: TokenRow): boolean {
  return new Date(row.expires_at).getTime() < Date.now();
}

export async function POST(req: Request) {
  if (!checkSupabaseConfig().configured) {
    return NextResponse.json(
      { ok: false, error: "Supabase no configurado." },
      { status: 501 },
    );
  }

  let body: {
    token?: string;
    qr_token?: string;
    staff_email?: string;
    staff_displayName?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Body invalido." }, { status: 400 });
  }

  const { token, qr_token, staff_email, staff_displayName } = body;
  if (!token || typeof token !== "string") {
    return NextResponse.json({ ok: false, error: "Falta token del staff." }, { status: 400 });
  }
  if (!qr_token || typeof qr_token !== "string") {
    return NextResponse.json({ ok: false, error: "Falta qr_token del asistente." }, { status: 400 });
  }

  // 1. Validar staff link.
  const staffValidation = await validateStaffLink(token);
  if (!staffValidation.ok) {
    const statusMap: Record<typeof staffValidation.reason, number> = {
      not_found: 404,
      expired: 410,
      revoked: 410,
      not_yet_valid: 410,
    };
    return NextResponse.json(
      { ok: false, error: `Staff link ${staffValidation.reason}.` },
      { status: statusMap[staffValidation.reason] },
    );
  }
  const staffLink: EventStaffLink = staffValidation.link;

  // 2. Validar qr_token.
  const found = await fetchQrToken(qr_token);
  if (!found) {
    return NextResponse.json(
      { ok: false, error: "QR no encontrado." },
      { status: 404 },
    );
  }
  if (isExpired(found.row)) {
    return NextResponse.json(
      { ok: false, error: "QR expirado." },
      { status: 410 },
    );
  }

  // 3. Validación cross-event: el QR debe ser del mismo evento del link.
  if (found.row.event_id !== staffLink.eventId) {
    return NextResponse.json(
      {
        ok: false,
        error: `Este QR es del evento "${found.event.title}" pero el scanner es de otro evento.`,
        crossEvent: true,
        qrEventTitle: found.event.title,
        scannerEventId: staffLink.eventId,
      },
      { status: 409 },
    );
  }

  // 4. Determinar el actor del audit. El staff puede tipear email +
  //    displayName al abrir el scanner (opcional). Si no, fallback a
  //    genérico staff@event.
  const staffActorEmail =
    staff_email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(staff_email)
      ? staff_email
      : `staff@${staffLink.eventId.slice(0, 8)}`;
  const staffActorName = staff_displayName?.trim() || "Staff externo";

  const supabase = createSupabaseAdminClient();
  const nowIso = new Date().toISOString();

  // FIX sprint 2026-07-15e: validar el estado de pago ANTES de hacer
  // check-in. Si el evento es de pago y el payment_status sigue en
  // 'pending', el staff debe cobrar en puerta antes de dejar entrar.
  // Devolvemos 403 con la info de pago + URL del endpoint de mark-paid
  // para que el scanner del staff muestre el boton "Cobrar y registrar".
  const resolvedConfId = await resolveConfirmationIdForCheckIn(
    supabase,
    found.row.event_id,
    found.row.attendee_phone_normalized,
  ).catch(() => null);
  if (resolvedConfId) {
    const { data: confRow, error: confErr } = await supabase
      .from("event_confirmations")
      .select("id, payment_status, name, email")
      .eq("id", resolvedConfId)
      .maybeSingle();
    if (!confErr && confRow) {
      const ps = (confRow as { payment_status?: string | null })
        .payment_status;
      if (ps === "revoked") {
        return NextResponse.json(
          {
            ok: false,
            error: "Pago revocado. Este asistente no puede entrar.",
            payment_status: "revoked",
            requires_action: "manual_refund_review",
            attendee: {
              name: (confRow as { name?: string | null }).name,
              event_title: found.event.title,
            },
          },
          { status: 403 },
        );
      }
      if (ps === "pending") {
        // 403 con la info de pago. El scanner del staff puede
        // usar POST /api/staff/check-in/mark-paid para registrar
        // el pago en puerta y hacer check-in en un solo paso.
        return NextResponse.json(
          {
            ok: false,
            error:
              "Pago pendiente. Cobrar en caja antes de entrar y luego marcar como pagado en puerta.",
            payment_status: "pending",
            requires_action: "collect_payment_door",
            attendee: {
              name: (confRow as { name?: string | null }).name,
              event_title: found.event.title,
            },
            confirmation_id: resolvedConfId,
            mark_paid_endpoint: `/api/staff/check-in/mark-paid?confirmation_id=${resolvedConfId}`,
          },
          { status: 403 },
        );
      }
    }
  }

  // 5. Idempotente: si ya estaba checkeado, devolver el timestamp previo.
  if (found.row.checked_in_at) {
    // Aún así, bumpear use_count (es un escaneo válido, aunque no haya
    // cambiado estado).
    await recordStaffLinkUse(staffLink.id);
    return NextResponse.json({
      ok: true,
      alreadyCheckedIn: true,
      attendee: {
        name: found.row.attendee_name,
        event_title: found.event.title,
      },
      checkedInAt: found.row.checked_in_at,
      checkedInBy: found.row.checked_in_by,
    });
  }

  // 6. UPDATE event_qr_tokens.
  const { error: tokenErr } = await supabase
    .from("event_qr_tokens" as never)
    .update({ checked_in_at: nowIso, checked_in_by: staffActorEmail } as never)
    .eq("id" as never, found.row.id);
  if (tokenErr) {
    return NextResponse.json(
      { ok: false, error: `DB error (${tokenErr.code ?? "?"})` },
      { status: 500 },
    );
  }

  // 7. UPDATE o CREATE event_attendees (walk-in si no existe).
  // Misma lógica que el endpoint público, pero con checked_in_by = staff.
  //
  // FIX 2026-07-03 (sesion David "no se matcheo con el confirmado"):
  // intentamos linkear el attendee con la confirmation previa del mismo
  // (event_id, phone_normalized) si existe. Si la confirmation existe, el
  // attendee se crea/actualiza con `confirmation_id = matched.id` en vez
  // de null. Si no hay confirmation previa, queda como walk-in real.
  //
  // FIX 2026-07-14 (Sprint v0.10 Bloque 2): las 3 SELECTs
  // (event_confirmations via resolveConfirmationIdForCheckIn,
  // event_attendees, leads) se ejecutan en paralelo con Promise.all
  // en vez de en serie. Reduce latencia ~200-300ms. El UPDATE del
  // attendee y el promote del lead también corren en paralelo
  // (independientes entre sí).
  const phone = found.row.attendee_phone_normalized;
  const [confirmationId, attendeeResult, leadResult] = await Promise.all([
    resolveConfirmationIdForCheckIn(supabase, found.row.event_id, phone),
    phone
      ? supabase
          .from("event_attendees")
          .select("id, checked_in_at, confirmation_id")
          .eq("event_id", found.row.event_id)
          .eq("phone_normalized", phone)
          .limit(1)
      : Promise.resolve({ data: [], error: null } as {
          data: Array<{
            id: string;
            checked_in_at: string | null;
            confirmation_id: string | null;
          }>;
          error: null;
        }),
    phone
      ? supabase
          .from("leads")
          .select("id, status, tags")
          .eq("phone_normalized", phone)
          .limit(1)
      : Promise.resolve({ data: [], error: null } as {
          data: Array<{ id: string; status: string; tags: string[] | null }>;
          error: null;
        }),
  ]);

  // UPDATE attendee + promote lead en paralelo.
  await Promise.all([
    (async () => {
      if (!phone) return;
      const attErr = attendeeResult.error;
      const attendeeRows = attendeeResult.data;
      if (attErr) {
        debugLog("[api/staff/check-in] SELECT event_attendees falló", {
          code: attErr.code,
        });
        return;
      }
      if (attendeeRows && attendeeRows.length > 0) {
        const target = attendeeRows[0] as {
          id: string;
          checked_in_at: string | null;
          confirmation_id: string | null;
        };
        // FIX 2026-07-12 (C-5 de OPEN_ITEMS): UPDATE atómico con
        // `WHERE checked_in_at IS NULL` (mismo patrón que el endpoint
        // público). Cierra la race condition del read-then-write.
        const updatePayload = {
          checked_in_at: nowIso,
          checked_in_by: staffActorEmail,
          ...(confirmationId && !target.confirmation_id
            ? { confirmation_id: confirmationId }
            : {}),
        };
        const { data: updated, error: updErr } = await supabase
          .from("event_attendees")
          .update(updatePayload as never)
          .eq("id", target.id)
          .is("checked_in_at", null)
          .select("id, checked_in_at")
          .maybeSingle();
        if (updErr) {
          debugLog("[api/staff/check-in] UPDATE atómico falló", {
            code: updErr.code,
            attendeeId: target.id,
          });
        } else if (!updated) {
          debugLog(
            "[api/staff/check-in] race: otro request ya marcó checked_in",
            { attendeeId: target.id }
          );
        }
        return;
      }
      // Walk-in: crear attendee al vuelo con confirmation_id matcheado
      // si existe.
      const { error: insErr } = await supabase
        .from("event_attendees")
        .insert({
          event_id: found.row.event_id,
          confirmation_id: confirmationId,
          name: found.row.attendee_name,
          email: found.row.attendee_email,
          phone_normalized: phone,
          checked_in_at: nowIso,
          checked_in_by: staffActorEmail,
          source: "check_in",
        });
      if (insErr && insErr.code !== "23505") {
        errorLog("[api/staff/check-in] INSERT walk-in falló", {
          code: insErr.code,
        });
      }
    })(),
    (async () => {
      if (!phone) return;
      const leadRows = leadResult.data ?? [];
      const leadErr = leadResult.error;
      if (leadErr || leadRows.length === 0) return;
      const lead = leadRows[0] as { id: string; status: string; tags: string[] | null };
      const wasAttended = lead.status === "event_attended";
      const wasClosed = lead.status === "lost" || lead.status === "archived";
      if (wasAttended || wasClosed) return;
      const tagToAdd = `event:${found.event.slug}:attended`;
      const existingTags = lead.tags ?? [];
      const mergedTags = existingTags.includes(tagToAdd)
        ? existingTags
        : [...existingTags, tagToAdd];
      const { error: updErr } = await supabase
        .from("leads")
        .update({
          status: "event_attended",
          tags: mergedTags,
          last_contacted_at: nowIso,
        })
        .eq("id", lead.id);
      if (updErr) {
        debugLog("[api/staff/check-in] UPDATE leads (promote) falló", {
          code: updErr.code,
        });
      }
    })(),
  ]);

  // 9. Audit log con actor = staff (FIX P1 2026-07-03: CheckInActor real).
  // FIX 2026-07-14 (Sprint v0.10 Bloque 2): fire-and-forget. No
  // bloqueamos la respuesta del endpoint en el INSERT del audit log.
  // El check-in YA quedó registrado en event_qr_tokens + event_attendees
  // (fuente de verdad). El audit es secundario.
  void logAdminAction({
    actor_email: staffActorEmail,
    action: "check_in",
    entity_type: "event_qr_token",
    entity_id: found.row.id,
    metadata: {
      eventId: found.row.event_id,
      attendeeName: found.row.attendee_name,
      attendeePhone: found.row.attendee_phone_normalized,
      actorKind: "staff",
      actorDisplayName: staffActorName,
      staffLinkId: staffLink.id,
      checkedInBy: staffActorEmail,
      ip: req.headers.get("x-forwarded-for") ?? null,
      ua: req.headers.get("user-agent") ?? null,
    },
  }).catch((err: unknown) => {
    errorLog("[api/staff/check-in] audit log falló (fire-and-forget)", {
      error: err instanceof Error ? err.message : String(err),
      qrTokenId: found.row.id,
    });
  });

  // 10. Bump métricas operacionales del staff link. También fire-and-forget
  // porque no afecta el response al staff scanner.
  void recordStaffLinkUse(staffLink.id).catch((err: unknown) => {
    debugLog("[api/staff/check-in] recordStaffLinkUse falló (fire-and-forget)", {
      error: err instanceof Error ? err.message : String(err),
    });
  });

  return NextResponse.json({
    ok: true,
    attendee: {
      name: found.row.attendee_name,
      event_title: found.event.title,
    },
    checkedInAt: nowIso,
    checkedInBy: staffActorEmail,
  });
}