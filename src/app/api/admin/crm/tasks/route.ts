import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { getAllPendingTasks } from "@/lib/crm/tasks-server";

/**
 * Tareas pendientes del CRM (todos los leads).
 *
 * GET /api/admin/crm/tasks -> { ok, overdue, upcoming }
 *
 * Server-only, admin (defensa en profundidad). Usado por el CRMView para
 * pintar la sección "Calendario" con citas + tareas en una sola vista.
 */

export const dynamic = "force-dynamic";

export async function GET() {
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
  const { overdue, upcoming } = await getAllPendingTasks();
  return NextResponse.json({ ok: true, overdue, upcoming });
}