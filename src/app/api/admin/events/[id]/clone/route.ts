import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { cloneEvent } from "@/lib/events/events-server";

/**
 * Clona un evento existente (Fase 5 Paquete D).
 *
 * POST /api/admin/events/[id]/clone
 *   body: (vacío — el id viene en la URL)
 *   -> { ok: true, event, sourceEvent }
 *   -> { ok: false, error }
 *
 * Crea un nuevo evento con los mismos campos no-status del origen,
 * slug único con sufijo "-copia" / "-copia-N", título con " (Copia)",
 * status="draft" (forzado). NO copia confirmados/asistentes/encuestas/leads.
 *
 * Audit log: registra `event_clone` con `metadata.source_event_id`.
 *
 * Casos de error:
 * - 401: no autenticado como admin
 * - 404: evento origen no existe
 * - 409: conflicto de slug (otro admin creó una copia al mismo tiempo;
 *        el cliente puede reintentar)
 * - 400: Supabase no configurado u otro error genérico
 */
export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
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
  if (!params.id) {
    return NextResponse.json(
      { ok: false, error: "Falta el id del evento." },
      { status: 400 },
    );
  }

  const result = await cloneEvent(params.id, admin.email ?? "unknown");

  if (!result.ok) {
    const note = result.note ?? "No se pudo clonar el evento.";
    // Conflictos de slug (UNIQUE constraint 23505) son los únicos 409.
    const statusCode = note.includes("Slug duplicado") ? 409 : 400;
    return NextResponse.json({ ok: false, error: note }, { status: statusCode });
  }

  return NextResponse.json({
    ok: true,
    event: result.event,
    sourceEvent: result.sourceEvent,
  });
}