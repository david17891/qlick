import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { createCRMTask, getLeadTasks } from "@/lib/crm/tasks-server";

/**
 * Tareas de seguimiento de un lead.
 *
 * GET    /api/admin/leads/[id]/tasks  -> lista tareas
 * POST   /api/admin/leads/[id]/tasks  -> crea tarea { title, description?, dueAt? }
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
  const tasks = await getLeadTasks(params.id);
  return NextResponse.json({ ok: true, tasks });
}

export async function POST(
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

  let body: { title?: unknown; description?: unknown; dueAt?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "JSON inválido." },
      { status: 400 },
    );
  }

  const title = typeof body.title === "string" ? body.title : "";
  const description =
    typeof body.description === "string" ? body.description : undefined;
  const dueAt = typeof body.dueAt === "string" ? body.dueAt : undefined;

  const result = await createCRMTask(
    { leadId: params.id, title, description, dueAt },
    admin.email,
  );
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error ?? "No se pudo crear la tarea." },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true, task: result.task });
}
