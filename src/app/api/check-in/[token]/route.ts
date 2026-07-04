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
 *
 * **FIX P1 2026-07-03 (auditoria pre-scanner):** el `actor` del check-in
 * esta hardcodeado como `self` (el asistente confirma su propio check-in).
 * Cuando se implemente el scanner del staff (Commit B, ver
 * `docs/CHECK_IN_AUDIT_2026_07_03.md`), ese endpoint staff-side pasara
 * el `actor` real (email del staff que escaneo) — ver `CheckInActor`
 * type mas abajo. Este endpoint publico sigue con `self` porque la
 * autorizacion es el token, no hay forma de identificar al humano detras.
 */

import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { logAdminAction } from "@/lib/crm/audit-server";
import { resolveConfirmationIdForCheckIn } from "@/lib/events/check-in-match";

export const dynamic = "force-dynamic";

/**
 * FIX P1 2026-07-03: tipo del actor que registra un check-in.
 *
 * Hoy el endpoint publico usa `kind: "self"` (el asistente confirma su
 * propio check-in con el token del QR). Cuando se implemente el
 * scanner del staff (Commit B), el endpoint staff-side usara
 * `kind: "staff"` con el email + nombre del operador que escaneo.
 *
 * Esta definicion queda aca (en lugar de en lib/) porque es el unico
 * lugar que la usa por ahora. Cuando se sume el scanner, lo movemos
 * a `lib/check-in/actor.ts`.
 */
export type CheckInActorKind = "self" | "staff" | "system";

export interface CheckInActor {
  kind: CheckInActorKind;
  /** Email del actor (para audit log + checked_in_by). */
  email: string;
  /** Display name opcional (para UI del log admin). */
  displayName?: string | null;
}

/**
 * Actor fijo para este endpoint publico. El staff scanner tendra su
 * propio endpoint (Commit B) con actor dinamico.
 */
const PUBLIC_ACTOR: CheckInActor = {
  kind: "self",
  email: "self@qlick.checkin",
  displayName: "Asistente (self check-in via token)",
};

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
      // FIX 2026-07-03 (sesion David, privacy): NO devolvemos phone ni
      // email en el response publico del endpoint. Este endpoint es
      // accesible sin auth (cualquiera con el token del QR puede
      // pegarle). Bajo LFPDPPP (ley mexicana) email y telefono son
      // datos personales — no deben quedar visibles a terceros sin
      // consentimiento explicito del titular.
      //
      // Si el staff/admin los necesita, los consulta en el dashboard
      // admin (`/admin/eventos/[id]`) que SI tiene auth.
      //
      // NOTA: los campos SIGUEN trayendose en la query SELECT porque
      // los necesitamos internamente para matching (UPDATE
      // event_attendees, UPDATE leads, audit log). Solo los
      // omitimos del response JSON.
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
    .update({ checked_in_at: nowIso, checked_in_by: PUBLIC_ACTOR.email } as never)
    .eq("id" as never, found.row.id);
  if (tokenErr) {
    return NextResponse.json(
      { ok: false, error: `DB error (${tokenErr.code ?? "?"})` },
      { status: 500 },
    );
  }

  // 2. UPDATE o CREATE event_attendees si hay phone (en el mismo evento).
  //
  // FIX 2026-07-03 (auditoria pre-scanner): si NO existe attendee previo
  // con este (event_id, phone), lo creamos al vuelo como walk-in
  // (source='check_in'). Sin esto, el funnel post-evento (encuesta,
  // promotion a lead) no podría encontrar al asistente que nunca
  // confirmó pero llega con su QR pass.
  //
  // FIX 2026-07-03 v2 (sesion David "no se matcheo con el confirmado"):
  // intentamos resolver el confirmation_id previo del mismo (event_id,
  // phone_normalized). Si existe, el attendee se crea/actualiza con
  // `confirmation_id = matched.id` en vez de null — el lead que confirmo
  // antes queda como attended matcheado, no como walk-in.
  //
  // El chequeo NO se filtra por `checked_in_at IS NULL` (como antes)
  // porque si ya hubo check-in previo del mismo (event_id, phone) — por
  // ej. el asistente perdió el primer QR y generamos uno nuevo — ese
  // attendee ya está. Lo dejamos como está (el evento ya quedó
  // registrado, no duplicamos).
  const confirmationId = await resolveConfirmationIdForCheckIn(
    supabase,
    found.row.event_id,
    found.row.attendee_phone_normalized,
  );
  if (found.row.attendee_phone_normalized) {
    const phone = found.row.attendee_phone_normalized;
    const { data: attendeeRows, error: attErr } = await supabase
      .from("event_attendees")
      .select("id, checked_in_at, confirmation_id")
      .eq("event_id", found.row.event_id)
      .eq("phone_normalized", phone)
      .limit(1);
    if (attErr) {
      // Loggear pero NO fallar el check-in — event_qr_tokens ya quedó.
      // eslint-disable-next-line no-console
      console.warn("[api/check-in] SELECT event_attendees falló", {
        code: attErr.code,
        eventId: found.row.event_id,
      });
    } else if (attendeeRows && attendeeRows.length > 0) {
      const target = attendeeRows[0] as {
        id: string;
        checked_in_at: string | null;
        confirmation_id: string | null;
      };
      // Solo UPDATE si checked_in_at es NULL (idempotencia).
      if (!target.checked_in_at) {
        const updatePayload = {
          checked_in_at: nowIso,
          checked_in_by: PUBLIC_ACTOR.email,
          ...(confirmationId && !target.confirmation_id
            ? { confirmation_id: confirmationId }
            : {}),
        };
        const { error: updErr } = await supabase
          .from("event_attendees")
          .update(updatePayload as never)
          .eq("id", target.id);
        if (updErr) {
          // eslint-disable-next-line no-console
          console.warn("[api/check-in] UPDATE event_attendees falló", {
            code: updErr.code,
            attendeeId: target.id,
          });
        }
      }
    } else {
      // Walk-in: no existe attendee previo. Crear al vuelo con
      // confirmation_id matcheado si existe.
      // Si choca por UNIQUE(event_id, email) — caso raro donde el mismo
      // email se usó en otra confirmation con phone distinto — ignorar
      // el 23505 y seguir. El check-in en event_qr_tokens ya quedó.
      const { error: insErr } = await supabase
        .from("event_attendees")
        .insert({
          event_id: found.row.event_id,
          confirmation_id: confirmationId,
          name: found.row.attendee_name,
          email: found.row.attendee_email,
          phone_normalized: phone,
          checked_in_at: nowIso,
          checked_in_by: PUBLIC_ACTOR.email,
          source: "check_in",
        });
      if (insErr && insErr.code !== "23505") {
        // eslint-disable-next-line no-console
        console.warn("[api/check-in] INSERT event_attendees (walk-in) falló", {
          code: insErr.code,
          eventId: found.row.event_id,
        });
      }
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
  // FIX P1 2026-07-03: ahora usa PUBLIC_ACTOR (kind: "self", email del
  // sistema) en vez de hardcodear el string. Cuando el scanner del staff
  // (Commit B) este listo, su endpoint pasara un CheckInActor real con
  // el email del operador.
  await logAdminAction({
    actor_email: PUBLIC_ACTOR.email,
    action: "check_in",
    entity_type: "event_qr_token",
    entity_id: found.row.id,
    metadata: {
      eventId: found.row.event_id,
      attendeeName: found.row.attendee_name,
      attendeePhone: found.row.attendee_phone_normalized,
      actorKind: PUBLIC_ACTOR.kind,
      checkedInBy: PUBLIC_ACTOR.email,
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