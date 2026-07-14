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
import { debugLog, errorLog } from "@/lib/log";

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
  // FIX 2026-07-06 (sesion David, "nadie sin nombre"): si el attendee
  // existente tiene `name` vacío o placeholder ("Asistente", "Por
  // confirmar"), lo sobreescribimos con `found.row.attendee_name` del
  // QR token. Si tampoco el QR tiene nombre válido, lookup en leads.name
  // por phone. Asi garantizamos que TODO attendee con check-in tenga
  // nombre real (necesario para certificados post-evento).
  //
  // FIX 2026-07-14 (Sprint v0.10 Bloque 2): las 3 SELECTs de
  // verificación (event_confirmations via resolveConfirmationIdForCheckIn,
  // event_attendees, leads) son independientes entre sí (todas leen por
  // phone). Antes se hacían en serie (~3 round-trips a Supabase).
  // Ahora corren en paralelo con Promise.all → 1 round-trip de latencia
  // en vez de 3. Reduce la latencia del endpoint ~200-300ms.

  // FIX 2026-07-06: helper para resolver nombre valido. Orden de prioridad:
  //   1. qr_token.attendee_name (si tiene 2+ palabras y no es placeholder)
  //   2. leads.name por phone (si tiene 2+ palabras y no es placeholder)
  //   3. attendee.name existente (si ya era valido antes)
  //   4. null (queda null, warning visible en admin)
  //
  // FIX 2026-07-14 (Sprint v0.10 Bloque 2): `isPlaceholderName` se usa
  // inline en el update del attendee (reusando el lead name del
  // Promise.all, sin un SELECT extra). El helper resolveValidName ya no
  // es necesario.
  const isPlaceholderName = (n: string | null | undefined): boolean => {
    if (!n) return true;
    const trimmed = n.trim();
    if (trimmed.length < 2) return true;
    const lower = trimmed.toLowerCase();
    const placeholders = [
      "asistente", "por confirmar", "confirmar", "pendiente",
      "test", "n/a", "na", "anonimo", "anonymous", "sin nombre",
    ];
    return placeholders.includes(lower);
  };

  // 3 SELECTs en paralelo: confirmation_id, attendee existente, lead existente.
  // Si NO hay phone, las 3 retornan null/vacío sin tocar DB.
  const phone = found.row.attendee_phone_normalized;
  const [confirmationId, attendeeResult, leadResult] = await Promise.all([
    resolveConfirmationIdForCheckIn(supabase, found.row.event_id, phone),
    phone
      ? supabase
          .from("event_attendees")
          .select("id, checked_in_at, confirmation_id, name")
          .eq("event_id", found.row.event_id)
          .eq("phone_normalized", phone)
          .limit(1)
      : Promise.resolve({ data: [], error: null } as {
          data: Array<{
            id: string;
            checked_in_at: string | null;
            confirmation_id: string | null;
            name: string | null;
          }>;
          error: null;
        }),
    phone
      ? supabase
          .from("leads")
          .select("id, status, tags, name")
          .eq("phone_normalized", phone)
          .limit(1)
      : Promise.resolve({ data: [], error: null } as {
          data: Array<{
            id: string;
            status: string;
            tags: string[] | null;
            name: string | null;
          }>;
          error: null;
        }),
  ]);

  // FIX 2026-07-14 (Sprint v0.10 Bloque 2): los 2 UPDATEs
  // (event_attendees y leads) son independientes entre sí (distintas
  // tablas, distintas rows). Antes se hacían en serie. Ahora corren
  // en paralelo con Promise.all → 1 round-trip de latencia en vez
  // de 2. Reduce la latencia del endpoint ~100ms.
  //
  // También: el UPDATE de leads reusa el `leadResult` del Promise.all
  // anterior (ya teníamos el id, status, tags del lead), evitando un
  // SELECT extra.
  const leadRows = phone ? (leadResult.data ?? []) : [];
  const leadErr = phone ? leadResult.error : null;

  const attendeeUpdatePromise: Promise<unknown> = (async () => {
    if (!phone) return { kind: "skipped" as const };
    const attErr = attendeeResult.error;
    const attendeeRows = attendeeResult.data;
    if (attErr) {
      debugLog("[api/check-in] SELECT event_attendees falló", {
        code: attErr.code,
        eventId: found.row.event_id,
      });
      return { kind: "select_failed" as const };
    }
    if (attendeeRows && attendeeRows.length > 0) {
      const target = attendeeRows[0] as {
        id: string;
        checked_in_at: string | null;
        confirmation_id: string | null;
        name: string | null;
      };
      // FIX 2026-07-12 (C-5 de OPEN_ITEMS): UPDATE atómico con
      // `WHERE checked_in_at IS NULL` para cerrar la race condition.
      //
      // FIX 2026-07-14 (Bloque 2): reusar el lead name del
      // Promise.all (leadResult) para no hacer un SELECT extra. Si el
      // lead del paralelo no tiene name válido, fallback a null (sin un
      // SELECT adicional, ya que perderíamos el beneficio del paralelo).
      const leadFromParallel = leadRows[0];
      const leadNameFromParallel = leadFromParallel
        ? (leadFromParallel as { name: string | null }).name
        : null;
      const resolvedName = isPlaceholderName(found.row.attendee_name)
        ? (isPlaceholderName(target.name)
            ? (!isPlaceholderName(leadNameFromParallel)
                ? leadNameFromParallel!.trim()
                : null)
            : target.name!.trim())
        : found.row.attendee_name!.trim();
      const updatePayload: Record<string, unknown> = {
        checked_in_at: nowIso,
        checked_in_by: PUBLIC_ACTOR.email,
        ...(confirmationId && !target.confirmation_id
          ? { confirmation_id: confirmationId }
          : {}),
        ...(resolvedName && isPlaceholderName(target.name)
          ? { name: resolvedName }
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
        errorLog("[api/check-in] UPDATE event_attendees atómico falló", {
          code: updErr.code,
          attendeeId: target.id,
        });
        return { kind: "update_failed" as const };
      }
      if (!updated) {
        // Otro request ganó la carrera. Devolvemos alreadyCheckedIn
        // con los datos del SELECT previo (target.checked_in_at tiene
        // el valor del row ganador, no el nuestro).
        return {
          kind: "race_lost" as const,
          target,
        };
      }
      return { kind: "updated_existing" as const };
    }
    // Walk-in: no existe attendee previo. Crear al vuelo con
    // confirmation_id matcheado si existe.
    const leadFromParallel = leadRows[0];
    const leadNameFromParallel = leadFromParallel
      ? (leadFromParallel as { name: string | null }).name
      : null;
    const resolvedName = isPlaceholderName(found.row.attendee_name)
      ? (!isPlaceholderName(leadNameFromParallel)
          ? leadNameFromParallel!.trim()
          : null)
      : found.row.attendee_name!.trim();
    // Si choca por UNIQUE(event_id, email) — caso raro donde el mismo
    // email se usó en otra confirmation con phone distinto — ignorar
    // el 23505 y seguir. El check-in en event_qr_tokens ya quedó.
    const { error: insErr } = await supabase
      .from("event_attendees")
      .insert({
        event_id: found.row.event_id,
        confirmation_id: confirmationId,
        name: resolvedName,
        email: found.row.attendee_email,
        phone_normalized: phone,
        checked_in_at: nowIso,
        checked_in_by: PUBLIC_ACTOR.email,
        source: "check_in",
      });
    if (insErr && insErr.code !== "23505") {
      errorLog("[api/check-in] INSERT event_attendees (walk-in) falló", {
        code: insErr.code,
        eventId: found.row.event_id,
      });
    }
    return { kind: "walkin_inserted" as const };
  })();

  const leadPromotePromise: Promise<unknown> = (async () => {
    if (!phone) return { kind: "skipped" as const };
    if (leadErr) {
      debugLog("[api/check-in] SELECT leads (paralelo) falló", {
        code: leadErr.code,
      });
      return { kind: "select_failed" as const };
    }
    if (!leadRows || leadRows.length === 0) {
      return { kind: "no_lead" as const };
    }
    const lead = leadRows[0] as { id: string; status: string; tags: string[] | null };
    // Idempotente: si ya estaba en event_attended, no actualizamos.
    // Si estaba en lost/archived, respetamos (no resucitamos sin revisión manual).
    const wasAttended = lead.status === "event_attended";
    const wasClosed = lead.status === "lost" || lead.status === "archived";
    if (wasAttended || wasClosed) {
      return { kind: "no_promote" as const };
    }
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
      debugLog("[api/check-in] UPDATE leads (promote) falló", {
        code: updErr.code,
      });
      return { kind: "update_failed" as const };
    }
    return { kind: "promoted" as const };
  })();

  // Esperamos los 2 UPDATEs en paralelo. Bloquea la respuesta hasta
  // que ambos terminen (queremos saber si la promoción a lead falló
  // para no devolver 200 con datos inconsistentes).
  const [attendeeUpdateResult] = await Promise.all([
    attendeeUpdatePromise,
    leadPromotePromise,
  ]);

  // Si el attendee update detectó race condition, devolvemos
  // alreadyCheckedIn con el timestamp del ganador.
  // TypeScript: la IIFE devuelve un union de varios `{ kind: "..." }`.
  // El check de "kind === 'race_lost'" reduce el tipo al subset con
  // `target`. Necesitamos `as unknown` para que TS acepte la conversión
  // porque el tipo inicial es muy ancho (Promise<unknown>).
  if (
    attendeeUpdateResult &&
    typeof attendeeUpdateResult === "object" &&
    "kind" in attendeeUpdateResult &&
    attendeeUpdateResult.kind === "race_lost"
  ) {
    const raceResult = attendeeUpdateResult as unknown as {
      target: { checked_in_at: string | null; name: string | null };
    };
    return NextResponse.json({
      ok: true,
      alreadyCheckedIn: true,
      attendee: {
        name: raceResult.target.name ?? found.row.attendee_name,
        event_title: found.event.title,
      },
      checkedInAt: raceResult.target.checked_in_at,
    });
  }

  // 4. Audit log — FIRE-AND-FORGET (no bloquea la respuesta).
  // FIX 2026-07-14 (Sprint v0.10 Bloque 2): el INSERT en
  // admin_audit_log se hacía con `await`, lo que añadía ~100-200ms
  // de round-trip a Supabase al final del endpoint. Ahora se dispara
  // sin await y se loggean errores con .catch. El endpoint responde
  // al cliente con la latencia del check-in real, no del audit.
  // Trade-off: si el proceso muere entre response y audit, perdemos
  // ese log. Aceptable: el check-in YA quedó registrado en
  // event_qr_tokens + event_attendees (es la fuente de verdad).
  // El audit es secundario para debugging.
  void logAdminAction({
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
  }).catch((err: unknown) => {
    errorLog("[api/check-in] audit log falló (fire-and-forget)", {
      error: err instanceof Error ? err.message : String(err),
      qrTokenId: found.row.id,
    });
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