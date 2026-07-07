/**
 * Gate de asistencia virtual — endpoint público.
 *
 * Cuando un asistente recibe el email/WhatsApp del evento virtual, el
 * botón "SÍ, VOY A ENTRAR" apunta a esta URL. El handler:
 *
 *   1. Lee el token de `event_qr_tokens` (reusamos la misma tabla que el
 *      check-in presencial — un solo token por asistente cubre ambos paths).
 *   2. Verifica que el evento sea virtual o híbrido (los presenciales
 *      usan `/check-in/[token]`).
 *   3. UPSERT en `event_attendees` con `source='zoom_export'` — primer
 *      proxy de asistencia virtual ("prometió ir"). Más adelante, la
 *      encuesta post-evento confirmará si realmente ingresó.
 *   4. Redirige al link streaming.
 *
 * Si el evento no es virtual (legacy in_person sin link streaming),
 * caemos a un redirect al home del evento.
 *
 * Server-only. Service role.
 */

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { createAttendee } from "@/lib/events/attendees-server";
import { logAdminAction } from "@/lib/crm/audit-server";

// Tokens QR son 32 chars base64url. Validamos para evitar queries absurdas.
function isValidToken(t: string | undefined): t is string {
  return !!t && /^[A-Za-z0-9_-]{16,64}$/.test(t);
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await context.params;

  // 1) Validar formato del token.
  if (!isValidToken(token)) {
    return NextResponse.redirect(
      new URL("/eventos", process.env.NEXT_PUBLIC_APP_URL ?? "https://qlick.mx"),
    );
  }

  // 2) Sin Supabase → redirect al home (modo demo).
  if (!checkSupabaseConfig().configured) {
    return NextResponse.redirect(
      new URL("/eventos", process.env.NEXT_PUBLIC_APP_URL ?? "https://qlick.mx"),
    );
  }

  const supabase = createSupabaseAdminClient();

  // 3) Lookup token. Cast `as never` por el typegen stale (mismo patrón
  // que event-tokens.ts).
  const { data: tokenRow, error: tokenErr } = await supabase
    .from("event_qr_tokens" as never)
    .select("id, event_id, attendee_name, attendee_email, attendee_phone_normalized, expires_at, checked_in_at")
    .eq("token" as never, token)
    .maybeSingle();

  if (tokenErr || !tokenRow) {
    // Token no existe o expirado → redirect a home de eventos.
    return NextResponse.redirect(
      new URL("/eventos", process.env.NEXT_PUBLIC_APP_URL ?? "https://qlick.mx"),
    );
  }

  const row = tokenRow as unknown as {
    id: string;
    event_id: string;
    attendee_name: string;
    attendee_email: string | null;
    attendee_phone_normalized: string | null;
    expires_at: string;
    checked_in_at: string | null;
  };

  // 4) Traer evento. Necesitamos `format`, `streaming_url` y `slug`.
  const { data: eventRow, error: eventErr } = await supabase
    .from("events")
    .select("id, slug, format, streaming_url")
    .eq("id", row.event_id)
    .maybeSingle();

  if (eventErr || !eventRow) {
    return NextResponse.redirect(
      new URL("/eventos", process.env.NEXT_PUBLIC_APP_URL ?? "https://qlick.mx"),
    );
  }

  const event = eventRow as unknown as {
    id: string;
    slug: string;
    format: string;
    streaming_url: string | null;
  };

  // 5) Si el evento NO es virtual/hybrid (legacy in_person), el gate no
  // aplica. Redirect al check-in público tradicional.
  if (event.format === "in_person") {
    return NextResponse.redirect(
      new URL(
        `/check-in/${encodeURIComponent(token)}`,
        process.env.NEXT_PUBLIC_APP_URL ?? "https://qlick.mx",
      ),
    );
  }

  // 6) Sin streaming_url (no debería pasar por el constraint de DB, pero
  // defendemos igual). Redirect a la landing del evento.
  if (!event.streaming_url) {
    return NextResponse.redirect(
      new URL(
        `/eventos/${encodeURIComponent(event.slug)}`,
        process.env.NEXT_PUBLIC_APP_URL ?? "https://qlick.mx",
      ),
    );
  }

  // 7) Registrar attendee con source='zoom_export'. Reusamos la función
  // createAttendee existente que hace UPSERT por (event_id, email).
  // Si email es null, el UPSERT inserta sin conflicto (Postgres permite
  // múltiples NULLs en UNIQUE constraint).
  const result = await createAttendee({
    eventId: event.id,
    name: row.attendee_name,
    email: row.attendee_email,
    phoneNormalized: row.attendee_phone_normalized,
    source: "zoom_export",
    // checkedInAt queda null hasta que confirmen con la survey post-evento.
  });

  if (!result.ok) {
    // Log y redirect al evento aunque falle el insert (no rompemos UX).
    // eslint-disable-next-line no-console
    console.error("[event-gate/click] createAttendee falló", {
      token,
      eventId: event.id,
      note: result.note,
    });
  } else {
    // Audit log para visibilidad admin ("quién clickeó SÍ, VOY").
    await logAdminAction({
      actor_email: row.attendee_email ?? `phone:${row.attendee_phone_normalized ?? "unknown"}`,
      action: "event_gate_click",
      entity_type: "event_attendee",
      entity_id: result.attendee?.id ?? null,
      metadata: {
        eventId: event.id,
        eventSlug: event.slug,
        format: event.format,
        tokenId: row.id,
      },
      before: null,
      after: { source: "zoom_export", intent: "gate_click" },
    });
  }

  // 8) Redirect al link streaming. Usamos 302 (temporal) por si David
  // cambia el link del evento — el attendee no debería quedar con un
  // link viejo cacheado.
  return NextResponse.redirect(event.streaming_url, { status: 302 });
}