/**
 * GET /api/services/catalog
 *
 * Devuelve el catálogo público de servicios activos con sus variants.
 * Usado por /servicios (página de catálogo público).
 *
 * Response:
 *   {
 *     ok: true,
 *     services: [
 *       {
 *         id, slug, category, displayName, shortDescription, ...,
 *         variants: [{ id, slug, label, priceMXN, deliveryDaysMin, ... }]
 *       },
 *       ...
 *     ]
 *   }
 *
 * Acceso: público (anon). Las RLS de services + service_variants ya filtran
 * por is_active=true, así que el cliente público no ve servicios inactivos.
 *
 * Rate limit: no (es un read público cheap; el catálogo cabe en 1 payload).
 */

import { NextResponse } from "next/server";
import { getActiveServices } from "@/lib/services";
import { checkSupabaseConfig } from "@/lib/supabase/health";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  if (!checkSupabaseConfig().configured) {
    // Modo demo: devolver catálogo vacío. La página /servicios cae a un
    // empty state con el mensaje "Pronto publicaremos los servicios".
    return NextResponse.json({ ok: true, services: [] });
  }

  const services = await getActiveServices();
  return NextResponse.json({ ok: true, services });
}
