/**
 * Endpoint público: registro walk-in vía el scanner del staff.
 *
 * POST /api/staff/register-walk-in
 *   Body (JSON): {
 *     token: string,            // token del staff link
 *     name: string,             // nombre del asistente (requerido)
 *     phone?: string,           // teléfono normalizado +52XXX (requerido)
 *     email?: string,           // email opcional
 *     staff_email?: string,     // staff que registra (audit)
 *     staff_displayName?: string
 *   }
 *
 * **Caso de uso:** una persona llega al evento sin QR pass (no se
 * inscribió previamente, no recibió WhatsApp, o lo perdió). El staff
 * lo registra en puerta y le hace check-in al mismo tiempo.
 *
 * **Operación atómica (best-effort):**
 *   1. Valida staff link (vigente + no revocado + mismo evento).
 *   2. Genera token random nuevo para el walk-in.
 *   3. INSERT event_qr_tokens con checked_in_at = now (ya queda
 *      "chequeado" desde su creación).
 *   4. INSERT event_attendees con source='check_in' (walk-in directo).
 *   5. Si el teléfono matchea un lead, promueve a event_attended
 *      (mismo flujo que el check-in normal).
 *   6. Bump use_count del staff link.
 *   7. Audit log.
 *
 * **Devuelve:** { ok, attendee, qr_token, checkInUrl } para que el
 * staff pueda opcionalmente mostrarle el QR al asistente (imprimir o
 * mandar por WhatsApp después).
 *
 * **Auth:** staff link (192 bits) es la autorización. NO requiere
 * login admin (decisión David 2026-07-03).
 *
 * Server-only.
 */

import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { logAdminAction } from "@/lib/crm/audit-server";
import {
  validateStaffLink,
  recordStaffLinkUse,
  type EventStaffLink,
} from "@/lib/staff/links";
import { normalizePhone } from "@/lib/crm/phone-utils";
import { appBaseUrl } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface EventJoinRow {
  id: string;
  title: string;
  starts_at: string;
  slug: string;
}

/**
 * Normaliza un teléfono libre a formato E.164 MX (+52XXXXXXXXXX).
 * Devuelve null si no se puede normalizar.
 */
function toE164(phone: string): string | null {
  const trimmed = phone.trim();
  if (!trimmed) return null;
  // normalizePhone acepta varios formatos y devuelve +52XXX si es MX.
  const normalized = normalizePhone(trimmed);
  if (!normalized) return null;
  // Solo aceptamos +52XXXXXXXXXX (10 digitos despues del +52).
  if (!/^\+52\d{10}$/.test(normalized)) return null;
  return normalized;
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
    name?: string;
    phone?: string;
    email?: string;
    staff_email?: string;
    staff_displayName?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Body invalido." }, { status: 400 });
  }

  const { token, name, phone, email, staff_email, staff_displayName } = body;

  if (!token || typeof token !== "string") {
    return NextResponse.json({ ok: false, error: "Falta token del staff." }, { status: 400 });
  }
  const cleanName = name?.trim();
  if (!cleanName || cleanName.length < 2) {
    return NextResponse.json(
      { ok: false, error: "Falta nombre del asistente (minimo 2 caracteres)." },
      { status: 400 },
    );
  }
  if (!phone || typeof phone !== "string") {
    return NextResponse.json(
      { ok: false, error: "Falta telefono del asistente." },
      { status: 400 },
    );
  }
  const phoneE164 = toE164(phone);
  if (!phoneE164) {
    return NextResponse.json(
      {
        ok: false,
        error: "Telefono invalido. Formato esperado: +52XXXXXXXXXX (10 digitos).",
      },
      { status: 400 },
    );
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

  // 2. Resolver evento del link.
  const supabase = createSupabaseAdminClient();
  const { data: evt, error: evtErr } = await supabase
    .from("events")
    .select("id, title, starts_at, slug")
    .eq("id", staffLink.eventId)
    .maybeSingle();
  if (evtErr || !evt) {
    return NextResponse.json(
      { ok: false, error: "Evento del link no encontrado." },
      { status: 500 },
    );
  }
  const event = evt as EventJoinRow;

  // 3. Actor del audit (mismo patron que /api/staff/check-in).
  const staffActorEmail =
    staff_email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(staff_email)
      ? staff_email
      : `staff@${staffLink.eventId.slice(0, 8)}`;
  const staffActorName = staff_displayName?.trim() || "Staff externo";

  const nowIso = new Date().toISOString();

  // 4. Generar token random + INSERT event_qr_tokens (con check-in ya hecho).
  // El QR token se usa para que despues el staff pueda darle el QR al
  // asistente (imprimir o mandar por WhatsApp post-checkin).
  const newToken = randomBytes(24).toString("base64url");

  // expires_at: evento endsAt + 6h (mismo patron que event-tokens.ts)
  // Si no tiene ends_at, fallback a starts_at + 24h.
  // Por simplicidad aca usamos starts_at + 24h (el walk-in es atipico y
  // no necesitamos precision en la expiracion — ya quedo checked-in).
  const expiresAt = new Date(
    new Date(event.starts_at).getTime() + 24 * 60 * 60 * 1000,
  ).toISOString();

  const cleanEmail =
    email && email.includes("@") && email.includes(".") ? email.trim() : null;

  const { data: qrRow, error: qrErr } = await supabase
    .from("event_qr_tokens" as never)
    .insert({
      event_id: staffLink.eventId,
      attendee_phone_normalized: phoneE164,
      attendee_name: cleanName,
      attendee_email: cleanEmail,
      token: newToken,
      checked_in_at: nowIso,
      checked_in_by: staffActorEmail,
      expires_at: expiresAt,
    } as never)
    .select("id")
    .maybeSingle();

  if (qrErr || !qrRow) {
    return NextResponse.json(
      {
        ok: false,
        error: `No se pudo crear el token QR (${(qrErr as { code?: string } | null)?.code ?? "?"}).`,
      },
      { status: 500 },
    );
  }

  // 5. INSERT event_attendees (walk-in con source='check_in').
  // El constraint UNIQUE(event_id, email) puede chocar si ya existe un
  // attendee con ese email — ignorar 23505 y seguir.
  const { error: attErr } = await supabase.from("event_attendees").insert({
    event_id: staffLink.eventId,
    confirmation_id: null,
    name: cleanName,
    email: cleanEmail,
    phone_normalized: phoneE164,
    checked_in_at: nowIso,
    checked_in_by: staffActorEmail,
    source: "check_in",
  });
  if (attErr && attErr.code !== "23505") {
    // eslint-disable-next-line no-console
    console.warn("[api/staff/register-walk-in] INSERT event_attendees falló", {
      code: attErr.code,
      eventId: staffLink.eventId,
    });
  }

  // 6. Promover lead a event_attended si hay match por telefono.
  const { data: leadRows, error: leadErr } = await supabase
    .from("leads")
    .select("id, status, tags")
    .eq("phone_normalized", phoneE164)
    .limit(1);
  if (!leadErr && leadRows && leadRows.length > 0) {
    const lead = leadRows[0] as { id: string; status: string; tags: string[] | null };
    const wasAttended = lead.status === "event_attended";
    const wasClosed = lead.status === "lost" || lead.status === "archived";
    if (!wasAttended && !wasClosed) {
      const tagToAdd = `event:${event.slug}:attended`;
      const existingTags = lead.tags ?? [];
      const mergedTags = existingTags.includes(tagToAdd)
        ? existingTags
        : [...existingTags, tagToAdd];
      await supabase
        .from("leads")
        .update({
          status: "event_attended",
          tags: mergedTags,
          last_contacted_at: nowIso,
        })
        .eq("id", lead.id);
    }
  }

  // 7. Audit log con actor = staff.
  await logAdminAction({
    actor_email: staffActorEmail,
    action: "check_in_walk_in",
    entity_type: "event_qr_token",
    entity_id: (qrRow as { id: string }).id,
    metadata: {
      eventId: staffLink.eventId,
      attendeeName: cleanName,
      attendeePhone: phoneE164,
      attendeeEmail: cleanEmail,
      actorKind: "staff",
      actorDisplayName: staffActorName,
      staffLinkId: staffLink.id,
      checkedInBy: staffActorEmail,
      ip: req.headers.get("x-forwarded-for") ?? null,
      ua: req.headers.get("user-agent") ?? null,
    },
  });

  // 8. Bump use_count del staff link.
  await recordStaffLinkUse(staffLink.id);

  // 9. URLs publicas para que el staff pueda darle el QR al asistente
  // (imprimir, mandar por WhatsApp, etc).
  const checkInUrl = `${appBaseUrl()}/check-in/${encodeURIComponent(newToken)}`;
  const qrImageUrl = `${appBaseUrl()}/api/event-qr/${encodeURIComponent(newToken)}.png`;

  return NextResponse.json({
    ok: true,
    attendee: {
      name: cleanName,
      event_title: event.title,
    },
    qrToken: newToken,
    checkInUrl,
    qrImageUrl,
    checkedInAt: nowIso,
    checkedInBy: staffActorEmail,
  });
}