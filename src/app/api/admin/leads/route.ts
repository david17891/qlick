import { NextRequest, NextResponse } from "next/server";
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

export async function GET(req: NextRequest) {
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
    // Sprint v0.10 Bloque 3: paginación server-side con `?page=N&limit=M`
    // (1-indexed, convención estándar HTTP). Aplica `.range((page-1)*limit,
    // page*limit-1)` en Supabase. Defaults: page=1, limit=50. Cap de
    // limit=200 para no freir Supabase.
    //
    // Back-compat: aceptamos `pageSize` (alias de `limit`) y `page=0`
    // (legacy 0-indexed, lo tratamos como page=1). Si el caller manda
    // ambos `page` y `pageSize`, gana `page` + `limit`.
    const rawPage = req.nextUrl.searchParams.get("page");
    const rawLimit = req.nextUrl.searchParams.get("limit");
    const rawPageSize = req.nextUrl.searchParams.get("pageSize");
    const MAX_LIMIT = 200;
    const DEFAULT_LIMIT = 50;
    let page = 1;
    let limit = DEFAULT_LIMIT;
    if (rawPage !== null) {
      const n = Number(rawPage);
      if (Number.isFinite(n) && n >= 0) {
        // Compat: page=0 (legacy) → 1. Cualquier page < 1 → 1.
        page = Math.max(1, Math.floor(n));
      }
    }
    if (rawLimit !== null) {
      const n = Number(rawLimit);
      if (Number.isFinite(n) && n > 0) {
        limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(n)));
      }
    } else if (rawPageSize !== null) {
      const n = Number(rawPageSize);
      if (Number.isFinite(n) && n > 0) {
        limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(n)));
      }
    }
    // getLeads internamente usa page 0-indexed y pageSize. Convertimos.
    const { leads, total, page: p, pageSize: ps } = await getLeads({
      page: page - 1,
      pageSize: limit,
    });
    // Devolvemos page 1-indexed y limit (no pageSize) al cliente para
    // consistencia con la request.
    return NextResponse.json({
      ok: true,
      leads,
      total,
      page,
      limit: ps,
      // Mantenemos `pageSize` en la response para back-compat con
      // consumidores que aún lo esperan.
      pageSize: ps,
      totalPages: ps > 0 ? Math.ceil(total / ps) : 0,
      demo: false,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[api/admin/leads] error", err);
    return NextResponse.json(
      { ok: false, error: "Error leyendo leads.", leads: [] },
      { status: 500 },
    );
  }
}
