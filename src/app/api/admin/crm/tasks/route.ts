import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { bulkUpdateCRMTasks, getAllPendingTasks } from "@/lib/crm/tasks-server";
import type { BulkTaskAction } from "@/lib/crm/tasks-server";

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

export async function PATCH(req: NextRequest) {
  if (!checkSupabaseConfig().configured) {
    return NextResponse.json({ ok: false, error: "Supabase no configurado (modo demo)." }, { status: 501 });
  }
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: "No autenticado como admin." }, { status: 401 });

  let body: { taskIds?: unknown; action?: unknown; dueAt?: unknown; reason?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }
  const taskIds = Array.isArray(body.taskIds) && body.taskIds.every((id) => typeof id === "string")
    ? body.taskIds as string[]
    : [];
  const action = body.action;
  if (!taskIds.length || !["completed", "cancelled", "reschedule"].includes(String(action))) {
    return NextResponse.json({ ok: false, error: "taskIds y action son obligatorios." }, { status: 400 });
  }
  const result = await bulkUpdateCRMTasks({
    taskIds,
    action: action as BulkTaskAction,
    dueAt: typeof body.dueAt === "string" ? body.dueAt : undefined,
    reason: typeof body.reason === "string" ? body.reason : undefined,
    actorEmail: admin.email,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
