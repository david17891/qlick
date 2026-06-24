import { NextResponse } from "next/server";
import { getLeads } from "@/lib/crm/leads-server";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { requireAdmin } from "@/lib/auth/session";

/**
 * Route Handler: lista de leads para el CRM admin.
 *
 * Server-only. Usa el cliente admin (bypass de RLS) porque el CRM necesita leer
 * todos los leads sin depender de la sesión del usuario que llama.
 *
 * SEGURIDAD (D-018):
 * - El middleware ya filtra /api/admin/* (401 sin sesión, 403 sin admin).
 * - Defensa en profundidad: este handler vuelve a llamar requireAdmin().
 * - Si Supabase no está configurado (modo demo), devuelve 501 + leads demo.
 *
 * Dynamic: evitamos caché estático porque los leads cambian.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  // Bloqueo defensivo: si no hay Supabase configurado, no hay datos reales.
  if (!checkSupabaseConfig().configured) {
    return NextResponse.json(
      {
        ok: false,
        error: "Supabase no configurado (modo demo).",
        demo: true,
        leads: [],
      },
      { status: 501 },
    );
  }

  // Auth admin: defensa en profundidad (el middleware ya validó).
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "No autenticado como admin.", leads: [] },
      { status: 401 },
    );
  }

  try {
    const leads = await getLeads();
    return NextResponse.json({ ok: true, leads, demo: false });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[api/admin/leads] error", err);
    return NextResponse.json(
      { ok: false, error: "Error leyendo leads.", leads: [] },
      { status: 500 },
    );
  }
}
