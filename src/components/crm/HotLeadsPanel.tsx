/**
 * Widget: "🔥 Leads Calientes sin Actividad" (CRM).
 *
 * FIX 2026-07-05 (feat/funnel-dynamic-surveys-crm, commit 12):
 * server component que muestra los leads hot/mql sin contacto reciente,
 * ordenados por score DESC. El admin ve primero a quién contactar.
 *
 * Server-only. Usa `getHotLeadsWithoutRecentActivity` de
 * `src/lib/crm/hot-leads.ts`.
 */

import { getHotLeadsWithoutRecentActivity } from "@/lib/crm/hot-leads";
import Link from "next/link";

export async function HotLeadsPanel() {
  const hotLeads = await getHotLeadsWithoutRecentActivity();

  if (hotLeads.length === 0) {
    return (
      <div className="rounded-xl bg-emerald-50/40 border border-emerald-200 p-4">
        <h2 className="text-sm font-bold uppercase text-emerald-700 mb-1">
          🔥 Leads Calientes
        </h2>
        <p className="text-xs text-emerald-800">
          No hay leads hot/mql sin actividad reciente. ¡Buen trabajo
          manteniendo el pipeline al día!
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-amber-50/40 border border-amber-200 p-4">
      <h2 className="text-sm font-bold uppercase text-amber-700 mb-2 flex items-center gap-2">
        🔥 Leads Calientes sin Actividad Reciente
        <span className="text-xs font-normal text-amber-600">
          ({hotLeads.length})
        </span>
      </h2>
      <ul className="space-y-2">
        {hotLeads.map((lead) => (
          <li
            key={lead.id}
            className="flex flex-wrap items-center justify-between gap-3 p-2 rounded-lg bg-white border border-amber-100"
          >
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm text-slate-900 truncate">
                {lead.name ?? lead.email ?? "(sin nombre)"}
              </p>
              <p className="text-xs text-slate-500">
                {lead.email ?? lead.phone ?? "—"} · score{" "}
                <span className="font-bold text-amber-700">
                  {lead.score ?? "?"}
                </span>{" "}
                · {lead.qualification ?? "?"}
              </p>
            </div>
            <Link
              href={`/admin?tab=crm&leadId=${lead.id}`}
              className="text-xs font-semibold text-amber-700 hover:text-amber-800 underline shrink-0"
            >
              Abrir →
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}