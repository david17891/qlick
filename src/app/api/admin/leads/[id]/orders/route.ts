/**
 * GET /api/admin/leads/[id]/orders
 *
 * Devuelve los service_orders asociados a un lead (1 lead → N orders).
 * Usado por la sección "Servicios contratados" del LeadDetailDrawer del CRM.
 *
 * Server-only, admin. Bypass RLS via service role.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { getOrdersByLeadId } from "@/lib/services";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

  const orders = await getOrdersByLeadId(params.id);
  return NextResponse.json({ ok: true, orders });
}
