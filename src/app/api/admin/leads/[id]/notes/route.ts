import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { createCRMNote, getLeadNotes } from "@/lib/crm/notes-server";

/**
 * Notas internas de un lead.
 *
 * GET    /api/admin/leads/[id]/notes  -> lista notas
 * POST   /api/admin/leads/[id]/notes  -> crea nota { body }
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
  const notes = await getLeadNotes(params.id);
  return NextResponse.json({ ok: true, notes });
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

  let body: { body?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "JSON inválido." },
      { status: 400 },
    );
  }

  const text = typeof body.body === "string" ? body.body : "";
  const result = await createCRMNote(params.id, text, admin.email);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error ?? "No se pudo guardar la nota." },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true, note: result.note });
}
