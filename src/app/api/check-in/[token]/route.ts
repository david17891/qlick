/**
 * Endpoint público de check-in por token.
 *
 * GET  /api/check-in/[token]
 *   Devuelve info del asistente (nombre, evento, fecha) sin marcar check-in.
 *   Útil para que la página `/check-in/[token]` muestre el contexto
 *   antes de pedir confirmación. Status:
 *     - 200 + payload si el token existe y no expiró.
 *     - 404 si el token no existe.
 *     - 410 si el token existe pero expiró.
 *
 * POST /api/check-in/[token]
 *   Marca el check-in en `event_qr_tokens` y (si hay match por phone)
 *   también en `event_attendees`. Idempotente: si ya estaba
 *   checked-in, devuelve 200 con el timestamp previo.
 *   Status:
 *     - 200 + { ok, attendee } si check-in exitoso.
 *     - 404 si el token no existe.
 *     - 410 si el token existe pero expiró.
 *
 * Este endpoint es PÚBLICO (sin auth) porque el asistente escanea el QR
 * y la página es accesible desde el celular del invitado. La
 * "autorización" es el token: 32 chars base64url = 192 bits de
 * entropía, suficiente para que adivinarlo sea computacionalmente
 * inviable. El audit log registra cada hit (incluyendo IP) para
 * trazabilidad de quién hizo check-in.
 */

import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { logAdminAction } from "@/lib/crm/audit-server";

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
  ends_at: string | null;
  location: string | null;
  slug: string;
}

async function fetchToken(
  token: string,
): Promise<{ row: TokenRow; event: EventJoinRow } | null> {
  if (!checkSupabaseConfig().configured) return null;
  const supabase = createSupabaseAdminClient();
  // JOIN con events para devolver título + fecha al cliente.
  // `event_qr_tokens` aún no está en el typegen; casteamos via
  // `as never` (mismo patrón que `audit-server.ts`).
  const { data, error } = await supabase
    .from("event_qr_tokens" as never)
    .select(
      `
      id,
      event_id,
      attendee_name,
      attendee_phone_normalized,
      attendee_email,
      token,
      checked_in_at,
      checked_in_by,
      expires_at,
      event:events ( id, title, starts_at, ends_at, location, slug )
    `,
    )
    .eq("token" as never, token)
    .maybeSingle();
  if (error || !data) return null;
  type RowWithJoin = TokenRow & { event: EventJoinRow | EventJoinRow[] | null };
  const row = data as unknown as RowWithJoin;
  const event = Array.isArray(row.event) ? row.event[0] : row.event;
  if (!event) return null;
  return { row, event };
}

function isExpired(row: TokenRow): boolean {
  return new Date(row.expires_at).getTime() < Date.now();
}

export async function GET(
  _req: Request,
  ctx: { params: { token: string } },
) {
  if (!checkSupabaseConfig().configured) {
    return NextResponse.json(
      { ok: false, error: "Supabase no configurado (modo demo)." },
      { status: 501 },
    );
  }
  const { token } = ctx.params;
  if (!token) {
    return NextResponse.json({ ok: false, error: "Token faltante." }, { status: 400 });
  }
  const found = await fetchToken(token);
  if (!found) {
    return NextResponse.json(
      { ok: false, error: "Token no encontrado." },
      { status: 404 },
    );
  }
  if (isExpired(found.row)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Token expirado.",
        expired_at: found.row.expires_at,
      },
      { status: 410 },
    );
  }
  return NextResponse.json({
    ok: true,
    attendee: {
      name: found.row.attendee_name,
      phone: found.row.attendee_phone_normalized,
      email: found.row.attendee_email,
    },
    event: {
      id: found.event.id,
      title: found.event.title,
      startsAt: found.event.starts_at,
      endsAt: found.event.ends_at,
      location: found.event.location,
      slug: found.event.slug,
    },
    alreadyCheckedIn: Boolean(found.row.checked_in_at),
    checkedInAt: found.row.checked_in_at,
  });
}

export async function POST(
  req: Request,
  ctx: { params: { token: string } },
) {
  if (!checkSupabaseConfig().configured) {
    return NextResponse.json(
      { ok: false, error: "Supabase no configurado (modo demo)." },
      { status: 501 },
    );
  }
  const { token } = ctx.params;
  if (!token) {
    return NextResponse.json({ ok: false, error: "Token faltante." }, { status: 400 });
  }
  const found = await fetchToken(token);
  if (!found) {
    return NextResponse.json(
      { ok: false, error: "Token no encontrado." },
      { status: 404 },
    );
  }
  if (isExpired(found.row)) {
    return NextResponse.json(
      { ok: false, error: "Token expirado.", expired_at: found.row.expires_at },
      { status: 410 },
    );
  }

  const supabase = createSupabaseAdminClient();
  const nowIso = new Date().toISOString();

  // Idempotente: si ya estaba checked-in, devolvemos su timestamp.
  if (found.row.checked_in_at) {
    return NextResponse.json({
      ok: true,
      alreadyCheckedIn: true,
      attendee: {
        name: found.row.attendee_name,
        event_title: found.event.title,
      },
      checkedInAt: found.row.checked_in_at,
    });
  }

  // 1. UPDATE event_qr_tokens
  const { error: tokenErr } = await supabase
    .from("event_qr_tokens" as never)
    .update({ checked_in_at: nowIso, checked_in_by: "self" } as never)
    .eq("id" as never, found.row.id);
  if (tokenErr) {
    return NextResponse.json(
      { ok: false, error: `DB error (${tokenErr.code ?? "?"})` },
      { status: 500 },
    );
  }

  // 2. UPDATE event_attendees si hay match por phone (en el mismo evento).
  if (found.row.attendee_phone_normalized) {
    const { data: attendeeRows, error: attErr } = await supabase
      .from("event_attendees")
      .select("id, checked_in_at")
      .eq("event_id", found.row.event_id)
      .eq("phone_normalized", found.row.attendee_phone_normalized)
      .is("checked_in_at", null)
      .limit(1);
    if (!attErr && attendeeRows && attendeeRows.length > 0) {
      const target = attendeeRows[0] as { id: string };
      await supabase
        .from("event_attendees")
        .update({ checked_in_at: nowIso, checked_in_by: "self" })
        .eq("id", target.id);
    }
  }

  // 3. Bloque 2 (Fase 7a): promover el lead a `event_attended` en el funnel.
  // Buscar el lead por phone y actualizar status. Si no hay match (asistió
  // como walk-in sin estar en el CRM), loggear pero NO fallar — el check-in
  // en event_qr_tokens + event_attendees ya quedó registrado arriba.
  if (found.row.attendee_phone_normalized) {
    const { data: leadRows, error: leadErr } = await supabase
      .from("leads")
      .select("id, status, tags")
      .eq("phone_normalized", found.row.attendee_phone_normalized)
      .limit(1);
    if (!leadErr && leadRows && leadRows.length > 0) {
      const lead = leadRows[0] as { id: string; status: string; tags: string[] | null };
      // Idempotente: si ya estaba en event_attended, no actualizamos.
      // Si estaba en lost/archived, respetamos (no resucitamos sin revisión manual).
      const wasAttended = lead.status === "event_attended";
      const wasClosed = lead.status === "lost" || lead.status === "archived";
      if (!wasAttended && !wasClosed) {
        const tagToAdd = `event:${found.event.slug}:attended`;
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
  }

  // 4. Audit log.
  await logAdminAction({
    actor_email: "self@qlick.checkin",
    action: "check_in",
    entity_type: "event_qr_token",
    entity_id: found.row.id,
    metadata: {
      eventId: found.row.event_id,
      attendeeName: found.row.attendee_name,
      attendeePhone: found.row.attendee_phone_normalized,
      checkedInBy: "self",
      ip: req.headers.get("x-forwarded-for") ?? null,
      ua: req.headers.get("user-agent") ?? null,
    },
  });

  return NextResponse.json({
    ok: true,
    attendee: {
      name: found.row.attendee_name,
      event_title: found.event.title,
    },
    checkedInAt: nowIso,
  });
}