import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { updateEvent, type UpdateEventInput } from "@/lib/events/events-server";

/**
 * CRUD admin de eventos — item.
 *
 * PATCH /api/admin/events/[id]
 *   body: UpdateEventInput (cualquier subset de title, description,
 *                            startsAt, endsAt, location, coverImageUrl)
 *   -> { ok: true, event }
 *
 * No se permite cambiar slug ni status (eso va por POST /events o
 * PATCH /events/[id]/status).
 */

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
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

  let body: Partial<UpdateEventInput>;
  try {
    body = (await req.json()) as Partial<UpdateEventInput>;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }

  const result = await updateEvent(params.id, body, admin.email);

  if (!result.ok || !result.event) {
    const note = result.note ?? "No se pudo actualizar el evento.";
    const status = note === "Evento no existe."
      ? 404
      : note === "Sin cambios para aplicar."
        ? 400
        : 400;
    return NextResponse.json({ ok: false, error: note }, { status });
  }

  return NextResponse.json({ ok: true, event: result.event });
}