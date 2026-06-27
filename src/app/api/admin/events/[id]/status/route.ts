import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { updateEventStatus } from "@/lib/events/events-server";
import type { EventStatus } from "@/types/events";

/**
 * Cambio de status de un evento (incluye archivar, publicar, volver a draft).
 *
 * PATCH /api/admin/events/[id]/status
 *   body: { status: "draft" | "published" | "archived" }
 *   -> { ok: true, event }
 *
 * Usado por los botones de la card/drawer: Publicar, Archivar, Reactivar.
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

  let body: { status?: unknown };
  try {
    body = (await req.json()) as { status?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }

  const status = body.status;
  if (
    status !== "draft" &&
    status !== "published" &&
    status !== "archived"
  ) {
    return NextResponse.json(
      { ok: false, error: "Status inválido (debe ser draft/published/archived)." },
      { status: 400 },
    );
  }

  const result = await updateEventStatus(params.id, status as EventStatus, admin.email);

  if (!result.ok || !result.event) {
    const note = result.note ?? "No se pudo cambiar el status.";
    const statusCode = note.startsWith("Conflicto") ? 409 : 400;
    return NextResponse.json({ ok: false, error: note }, { status: statusCode });
  }

  return NextResponse.json({ ok: true, event: result.event });
}