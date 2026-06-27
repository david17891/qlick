import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { createEvent, type CreateEventInput } from "@/lib/events/events-server";

/**
 * CRUD admin de eventos — colección.
 *
 * POST /api/admin/events
 *   body: CreateEventInput (slug, title, description?, startsAt, endsAt?,
 *                            location?, coverImageUrl?, status?)
 *   -> { ok: true, event }
 *
 * Server-only, admin (defensa en profundidad). Usado por el drawer de
 * creación en /admin/eventos.
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