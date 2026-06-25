import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { updateLeadStatus } from "@/lib/crm/leads-admin-server";

/**
 * Operaciones admin sobre un lead concreto.
 *
 * PATCH /api/admin/leads/[id] { status: LeadStatus }
 *   -> cambia el status del lead (audit log + interacción del sistema).
 *
 * Defensa en profundidad: middleware ya validó admin; aquí re-validamos.
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
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "JSON inválido." },
      { status: 400 },
    );
  }

  const status = typeof body.status === "string" ? body.status : "";
  const result = await updateLeadStatus(params.id, status, admin.email);

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.note ?? "No se pudo actualizar." },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true, lead: result.lead });
}
