import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { getEventContextForLead } from "@/lib/crm";

/**
 * Contexto del evento del que provino un lead.
 *
 * GET /api/admin/leads/[id]/event-context
 *
 * Devuelve el evento + datos de survey (si el link es tipo "survey") o
 * `null` si el lead no tiene origen de evento. Usado por el drawer del
 * CRM para mostrar el badge "📅 Vino de evento X".
 *
 * Server-only, admin (defensa en profundidad).
 */

export const dynamic = "force-dynamic";

export async function GET(
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
  const context = await getEventContextForLead(params.id);
  return NextResponse.json({ ok: true, context });
}