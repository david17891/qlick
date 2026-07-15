import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { createEvent, type CreateEventInput } from "@/lib/events/events-server";

/**
 * CRUD admin de eventos — colección.
 *
 * POST /api/admin/events
 *   body: CreateEventInput (slug, title, description?, startsAt, endsAt?,
 *                            location?, coverImageUrl?, status?,
 *                            eventRules?, format?, streamingUrl?,
 *                            streamingProvider?, streamingAccessNote?)
 *   -> { ok: true, event }
 *
 * Server-only, admin (defensa en profundidad). Usado por el drawer de
 * creación en /admin/eventos.
 *
 * FIX 2026-07-07 (sesión David — AA4E quedó mal configurado):
 *   El handler original solo propagaba 8 campos legacy al
 *   `createEvent()` de la lib server, descartando silenciosamente
 *   los 5 campos nuevos que el drawer ya enviaba (eventRules,
 *   format, streamingUrl, streamingProvider, streamingAccessNote).
 *   Síntomas: `format` caía al default DB `in_person` aunque el
 *   admin eligiera `virtual`; `eventRules` quedaba `{}` (sin
 *   personalidad ni reglas); `streamingUrl` quedaba `null`. Ahora
 *   propagamos todo el body casteado al shape `CreateEventInput`.
 */

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!checkSupabaseConfig().configured) {
    return NextResponse.json(
      { ok: false, error: "Supabase no configurado (modo demo)." },
      { status: 501 },
    );
  }
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "No autenticado como admin." },
      { status: 401 },
    );
  }

  let body: Partial<CreateEventInput>;
  try {
    body = (await req.json()) as Partial<CreateEventInput>;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }

  if (!body.slug?.trim() || !body.title?.trim() || !body.startsAt) {
    return NextResponse.json(
      { ok: false, error: "Faltan datos requeridos (slug, title, startsAt)." },
      { status: 400 },
    );
  }

  // FIX 2026-07-07: propagar todos los campos al createEvent. Antes
  // solo pasábamos 8 legacy — los 5 nuevos (eventRules, format,
  // streamingUrl, streamingProvider, streamingAccessNote) llegaban
  // acá pero se descartaban, dejando el evento incompleto en DB.
  // FIX 2026-07-14: también priceMXN y currency (migration 20260714230000)
  // — antes no existían en el form admin, ahora sí. Misma lógica:
  // propagar todo el body, el lib server aplica defaults seguros.
  const result = await createEvent(
    {
      slug: body.slug,
      title: body.title,
      description: body.description,
      startsAt: body.startsAt,
      endsAt: body.endsAt,
      location: body.location,
      coverImageUrl: body.coverImageUrl,
      status: body.status,
      // Nuevos (Fase 7 + migration 20260707000000):
      eventRules: body.eventRules,
      format: body.format,
      streamingUrl: body.streamingUrl,
      streamingProvider: body.streamingProvider,
      streamingAccessNote: body.streamingAccessNote,
      // Pago (migration 20260714230000):
      priceMXN: body.priceMXN,
      currency: body.currency,
    },
    admin.email,
  );

  if (!result.ok || !result.event) {
    // Mapeamos las notas del server lib a status codes HTTP razonables.
    const note = result.note ?? "No se pudo crear el evento.";
    const status = note.toLowerCase().includes("duplicate") || note.toLowerCase().includes("unique")
      ? 409
      : 400;
    return NextResponse.json({ ok: false, error: note }, { status });
  }

  return NextResponse.json({ ok: true, event: result.event });
}