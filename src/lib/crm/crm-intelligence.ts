/**
 * Inteligencia comercial del CRM (Fase 3).
 *
 * Métricas calculadas sobre datos reales en Supabase:
 *
 * - LVR (Lead Velocity Rate): crecimiento porcentual de leads nuevos en
 *   los últimos 7 días vs los 7 días previos. >0 = creciendo, <0 = bajando.
 *
 * - SLA Overdue: leads en etapa `new` o `contacted` que llevan más de
 *   48 horas sin una interacción manual (`lead_interactions`) Y sin
 *   una tarea CRM pendiente (`crm_tasks`).
 *
 * - Heat Distribution: conteo y porcentaje de leads calificados como
 *   `hot` (score>=60), `warm` (40-59), `cold` (0-39).
 *
 * - Hot Desatendidos: top N leads `hot` sin tarea agendada y sin
 *   interacción reciente. Lo usa el panel "Acciones Recomendadas
 *   para Hoy" del Resumen.
 *
 * Server-only. Usa createSupabaseAdminClient() (bypass RLS).
 *
 * @server
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkSupabaseConfig } from "@/lib/supabase/health";

/** Umbrales de calificación (alineados con lead-scoring.ts). */
export const HEAT_THRESHOLDS = {
  hot: 60,
  warm: 40,
} as const;

export interface IntelligenceOverview {
  lvrPercentage: number | null;
  lvrCurrentWeek: number;
  lvrPreviousWeek: number;
  slaOverdueCount: number;
  heat: {
    hot: number;
    warm: number;
    cold: number;
    total: number;
    hotPercentage: number;
  };
  hotDesatendidos: Array<{
    id: string;
    name: string;
    score: number | null;
    qualification: string | null;
    status: string;
    phone: string | null;
    lastInteractionAt: string | null;
    hoursSinceLastContact: number | null;
  }>;
}

const DEFAULT_INTELLIGENCE: IntelligenceOverview = {
  lvrPercentage: null,
  lvrCurrentWeek: 0,
  lvrPreviousWeek: 0,
  slaOverdueCount: 0,
  heat: { hot: 0, warm: 0, cold: 0, total: 0, hotPercentage: 0 },
  hotDesatendidos: [],
};

/**
 * Devuelve la inteligencia comercial. Si Supabase no está configurado,
 * devuelve un objeto neutral (todo en 0 / null). Esto permite que la UI
 * muestre "—" sin romperse en modo demo.
 */
export async function getCrmIntelligence(): Promise<IntelligenceOverview> {
  if (!checkSupabaseConfig().configured) {
    return DEFAULT_INTELLIGENCE;
  }

  const supabase = createSupabaseAdminClient();
  const now = new Date();

  // ─── LVR: leads nuevos (status='new' OR lead_attended) en ventana ───
  const currentWeekStart = new Date(now);
  currentWeekStart.setDate(currentWeekStart.getDate() - 7);
  const previousWeekStart = new Date(now);
  previousWeekStart.setDate(previousWeekStart.getDate() - 14);

  // Definimos "lead nuevo" como leads cuyo created_at cae en la ventana.
  // Filtrar status='new' es demasiado estricto (un lead puede pasar a
  // contacted rápido y aún así contar como recién llegado).
  const { count: currentWeekCount } = await (supabase.from("leads") as any)
    .select("id", { count: "exact", head: true })
    .gte("created_at", currentWeekStart.toISOString());

  const { count: previousWeekCount } = await (supabase.from("leads") as any)
    .select("id", { count: "exact", head: true })
    .gte("created_at", previousWeekStart.toISOString())
    .lt("created_at", currentWeekStart.toISOString());

  const lvrCurrentWeek = currentWeekCount ?? 0;
  const lvrPreviousWeek = previousWeekCount ?? 0;
  const lvrPercentage =
    lvrPreviousWeek === 0
      ? lvrCurrentWeek > 0
        ? 100 // sin base previa, todo es crecimiento
        : 0
      : ((lvrCurrentWeek - lvrPreviousWeek) / lvrPreviousWeek) * 100;

  // ─── Heat Distribution + lead set para SLA/Hot Desatendidos ───
  const { data: leadsForHeat } = await (supabase.from("leads") as any)
    .select("id, name, phone, status, score, qualification, updated_at")
    .not("status", "eq", "archived")
    .not("status", "eq", "lost");

  const leadsList = (leadsForHeat ?? []) as Array<{
    id: string;
    name: string;
    phone: string | null;
    status: string;
    score: number | null;
    qualification: string | null;
    updated_at: string;
  }>;

  let hot = 0;
  let warm = 0;
  let cold = 0;
  for (const l of leadsList) {
    const s = typeof l.score === "number" ? l.score : 0;
    if (s >= HEAT_THRESHOLDS.hot) hot++;
    else if (s >= HEAT_THRESHOLDS.warm) warm++;
    else cold++;
  }
  const total = leadsList.length;
  const hotPercentage = total > 0 ? (hot / total) * 100 : 0;

  // ─── SLA Overdue + Hot Desatendidos ───
  // Un lead está "desatendido" si:
  //   - status in ('new','contacted')
  //   - última interacción (`lead_interactions`) > 48h O nunca
  //   - NO tiene tarea pendiente (`crm_tasks.done=false AND due_at >= now`)
  //
  // Calculamos "last_contact_at" como MAX(updated_at, max(interaction.created_at)).
  // Para hacerlo eficiente tomamos todos los interactions/tasks en una sola
  // query cada uno (no N+1).

  const slaStatuses = new Set(["new", "contacted"]);
  const candidates = leadsList.filter((l) => slaStatuses.has(l.status));

  // Traemos las interactions y tasks abiertas para esos leads.
  const candidateIds = candidates.map((l) => l.id);
  const lastInteractionsByLeadId = new Map<string, string>();
  const openTasksByLeadId = new Map<string, number>();

  if (candidateIds.length > 0) {
    const { data: interactions } = await (supabase.from("lead_interactions") as any)
      .select("lead_id, created_at")
      .in("lead_id", candidateIds)
      .order("created_at", { ascending: false });
    for (const i of (interactions ?? []) as Array<{
      lead_id: string;
      created_at: string;
    }>) {
      if (!lastInteractionsByLeadId.has(i.lead_id)) {
        lastInteractionsByLeadId.set(i.lead_id, i.created_at);
      }
    }

    const { data: openTasks } = await (supabase.from("crm_tasks") as any)
      .select("lead_id")
      .in("lead_id", candidateIds)
      .eq("done", false);
    for (const t of (openTasks ?? []) as Array<{ lead_id: string }>) {
      openTasksByLeadId.set(
        t.lead_id,
        (openTasksByLeadId.get(t.lead_id) ?? 0) + 1,
      );
    }
  }

  const SLA_HOURS = 48;
  const SLA_MS = SLA_HOURS * 60 * 60 * 1000;
  const nowMs = Date.now();
  let slaOverdueCount = 0;

  const hotDesatendidosRaw: Array<{
    lead: typeof leadsList[number];
    hoursSinceLastContact: number | null;
  }> = [];

  for (const l of candidates) {
    // last contact: max(updated_at, last interaction).
    const lastIntAt = lastInteractionsByLeadId.get(l.id);
    const lastIntMs = lastIntAt ? new Date(lastIntAt).getTime() : 0;
    const updatedMs = new Date(l.updated_at).getTime();
    const lastContactMs = Math.max(lastIntMs, updatedMs);
    const hoursSince = lastContactMs > 0 ? (nowMs - lastContactMs) / (60 * 60 * 1000) : null;

    const isDesatendido =
      hoursSince === null || hoursSince * 60 * 60 * 1000 > SLA_MS;
    const hasOpenTask = (openTasksByLeadId.get(l.id) ?? 0) > 0;

    if (isDesatendido && !hasOpenTask) {
      slaOverdueCount++;
      // Solo lo añadimos al panel Hot Desatendidos si es hot.
      const s = typeof l.score === "number" ? l.score : 0;
      if (s >= HEAT_THRESHOLDS.hot) {
        hotDesatendidosRaw.push({ lead: l, hoursSinceLastContact: hoursSince });
      }
    }
  }

  const hotDesatendidos = hotDesatendidosRaw
    .sort((a, b) => {
      const sa = typeof a.lead.score === "number" ? a.lead.score : 0;
      const sb = typeof b.lead.score === "number" ? b.lead.score : 0;
      return sb - sa; // mayor score primero
    })
    .slice(0, 5)
    .map((x) => ({
      id: x.lead.id,
      name: x.lead.name,
      score: typeof x.lead.score === "number" ? x.lead.score : null,
      qualification: x.lead.qualification ?? null,
      status: x.lead.status,
      phone: x.lead.phone ?? null,
      lastInteractionAt: lastInteractionsByLeadId.get(x.lead.id) ?? null,
      hoursSinceLastContact: x.hoursSinceLastContact,
    }));

  return {
    lvrPercentage,
    lvrCurrentWeek,
    lvrPreviousWeek,
    slaOverdueCount,
    heat: { hot, warm, cold, total, hotPercentage },
    hotDesatendidos,
  };
}