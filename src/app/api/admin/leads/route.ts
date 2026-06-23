import { NextResponse } from "next/server";
import { getLeads } from "@/lib/crm/leads-server";
import { checkSupabaseConfig } from "@/lib/supabase/health";

/**
 * Route Handler: lista de leads para el CRM admin.
 *
 * Server-only. Usa el cliente admin (bypass de RLS) porque el CRM necesita leer
 * todos los leads sin depender de la sesión del usuario que llama.
 *
 * ⚠️ SEGURIDAD — ESTADO ACTUAL (DORMIDO):
 * No hay auth real todavía (D-004, mock en localStorage). Para honrar la regla
 * "sin auth, sin datos reales expuestos", el endpoint está DORMIDO con
 * `AUTH_READY = false`: aunque Supabase esté configurado, devuelve 503 hasta
 * que exista Supabase Auth + middleware de admin (Fase 1). Así nunca sirve
 * datos reales sin protección, ni siquiera accidentalmente.
 *
 * Para activarlo en Fase 1:
 * 1. Implementar el check de sesión + rol admin/instructor dentro de GET().
 * 2. Cambiar AUTH_READY a true.
 *
 * Dynamic: evitamos caché estático porque los leads cambian.
 */
export const dynamic = "force-dynamic";

/**
 * Kill-switch de la lectura HTTP de leads.
 * false = el endpoint nunca devuelve datos reales, sin importar la config.
 * Flip a true solo cuando el check de auth admin esté implementado abajo.
 */
const AUTH_READY = false;

export async function GET() {
  // Bloqueo dominante: sin auth admin, sin datos reales (ni siquiera en prod).
  if (!AUTH_READY) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Lectura de leads requiere autenticación admin (Fase 1). El endpoint está inerte.",
        leads: [],
      },
      { status: 503 },
    );
  }

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

  // TODO (Fase 1 auth): verificar sesión + rol admin/instructor aquí.
  //   const supabase = createSupabaseServerClient();
  //   const { data: { user } } = await supabase.auth.getUser();
  //   if (!user) return NextResponse.json({ error: "no auth" }, { status: 401 });
  //   if (user.app_role !== "admin" && user.app_role !== "instructor") {
  //     return NextResponse.json({ error: "forbidden" }, { status: 403 });
  //   }

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
