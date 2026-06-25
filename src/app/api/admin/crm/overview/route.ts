/**
 * Route Handler: resumen del CRM (overview) calculado sobre leads reales.
 *
 * Server-only. Usa el cliente admin (bypass de RLS) porque el CRM necesita
 * leer todos los leads sin depender de la sesión del usuario que llama.
 *
 * SEGURIDAD (D-018):
 * - El middleware ya filtra /api/admin/* (401 sin sesión, 403 sin admin).
 * - Defensa en profundidad: este handler vuelve a llamar requireAdmin().
 * - Si Supabase no está configurado (modo demo), devuelve 200 con
 *   `demo: true` para que el cliente sepa que NO debe reemplazar el overview
 *   calculado sobre mocks.
 *
 * Métricas calculadas:
 * - totalLeads, newLeads, contactedLeads, paymentPending, enrolled,
 *   activeStudents, conversionRate → derivadas de `leads` (real).
 * - overdueFollowUps, upcomingAppointments → se devuelven en 0 con
 *   `demoFields: [...]` mientras esas features no migren a Supabase.
 *
 * Dynamic: evitamos caché estático porque los leads cambian.
 */
import { NextResponse } from "next/server";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { requireAdmin } from "@/lib/auth/session";
import { getLeads } from "@/lib/crm/leads-server";
import { calculateConversionRate } from "@/lib/crm/pipeline-utils";
import type { LeadStatus, CRMOverview } from "@/types";

export const dynamic = "force-dynamic";

/** Lista blanca de statuses; evita aceptar cualquier string. */
const COUNT_STATUSES: readonly LeadStatus[] = [
  "new",
  "contacted",
  "payment_pending",
  "enrolled",
  "active_student",
];

function countByStatus(
  leads: { status: LeadStatus }[],
  status: LeadStatus,
): number {
  return leads.filter((l) => l.status === status).length;
}

export async function GET() {
  if (!checkSupabaseConfig().configured) {
    return NextResponse.json({
      ok: false,
      demo: true,
      overview: null,
      note: "Supabase no configurado. El cliente debe usar el overview demo.",
    });
  }

  // Defensa en profundidad: el middleware ya filtró, pero re-validamos.
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json(
      { ok: false, demo: false, overview: null, error: "No autenticado como admin." },
      { status: 401 },
    );
  }

  try {
    const leads = await getLeads();

    // Métricas reales (derivadas de leads reales).
    const realOverview: CRMOverview = {
      totalLeads: leads.length,
      newLeads: countByStatus(leads, "new"),
      contactedLeads: countByStatus(leads, "contacted"),
      paymentPending: countByStatus(leads, "payment_pending"),
      enrolled: countByStatus(leads, "enrolled"),
      activeStudents: countByStatus(leads, "active_student"),
      conversionRate: calculateConversionRate(leads),
      // Las siguientes métricas requieren features no migradas (Fase 4):
      overdueFollowUps: 0,
      upcomingAppointments: 0,
    };

    return NextResponse.json({
      ok: true,
      demo: false,
      overview: realOverview,
      // Campos que el cliente debe mostrar como "demo" (no persistidos en BD real).
      demoFields: ["overdueFollowUps", "upcomingAppointments"] as const,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[api/admin/crm/overview] error", err);
    return NextResponse.json(
      { ok: false, demo: false, overview: null, error: "Error leyendo overview." },
      { status: 500 },
    );
  }
}
