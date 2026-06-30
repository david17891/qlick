/**
 * CampaignsTab — dashboard de campañas Meta Marketing API.
 *
 * Server Component que lee al render. Muestra:
 *  - 5 stat cards: Gasto total, Impresiones, Clicks, CTR (%), CPL.
 *  - Selector de período (7d / 30d / this_month) via URL ?campaign_period=...
 *  - Tabla con cada campaña y sus métricas.
 *  - Sección de atribución al evento (leads con source=facebook_ads
 *    cruzados con confirmaciones del evento).
 *  - Banner `demo` cuando no hay env vars de Meta configuradas.
 *
 * Modo demo: si no hay META_ACCESS_TOKEN + META_AD_ACCOUNT_ID, el lib
 * `marketing-api` devuelve data mock coherente. El banner avisa al
 * admin que está viendo placeholders.
 */

import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import {
  getAccountInsights,
  getCampaignAttribution,
  listCampaigns,
  type Campaign,
  type CampaignAttribution,
  type InsightRow,
  type MetaApiResult,
} from "@/lib/meta/marketing-api";
import { formatMXN } from "@/lib/utils";

interface Props {
  eventId: string;
  /** Query param: "last_7d" | "last_30d" | "this_month". Default: "last_30d". */
  period?: string;
}

const PERIOD_OPTIONS = [
  { value: "last_7d", label: "Últimos 7 días" },
  { value: "last_30d", label: "Últimos 30 días" },
  { value: "this_month", label: "Este mes" },
] as const;

type PeriodValue = (typeof PERIOD_OPTIONS)[number]["value"];

function resolvePeriod(input: string | undefined): PeriodValue {
  if (input === "last_7d" || input === "this_month") return input;
  return "last_30d";
}

const STATUS_LABEL: Record<Campaign["status"], string> = {
  ACTIVE: "Activa",
  PAUSED: "Pausada",
  DELETED: "Eliminada",
  ARCHIVED: "Archivada",
};

const STATUS_TONE: Record<Campaign["status"], "success" | "neutral" | "warning"> = {
  ACTIVE: "success",
  PAUSED: "warning",
  DELETED: "neutral",
  ARCHIVED: "neutral",
};

export async function CampaignsTab({ eventId, period }: Props) {
  const resolvedPeriod = resolvePeriod(period);

  // Fetch en paralelo: campaigns, insights y atribución.
  const [campaignsResult, insightsResult, attributionResult]: [
    MetaApiResult<Campaign[]>,
    MetaApiResult<InsightRow[]>,
    MetaApiResult<CampaignAttribution[]>,
  ] = await Promise.all([
    listCampaigns(),
    getAccountInsights({
      datePreset: resolvedPeriod,
      level: "campaign",
    }),
    getCampaignAttribution(eventId, { datePreset: resolvedPeriod }),
  ]);

  const isDemo =
    campaignsResult.demo || insightsResult.demo || attributionResult.demo;
  const hasError = Boolean(
    campaignsResult.error || insightsResult.error || attributionResult.error,
  );

  // Agregados del período.
  const totalSpend = insightsResult.data.reduce((a, r) => a + r.spend, 0);
  const totalImpressions = insightsResult.data.reduce(
    (a, r) => a + r.impressions,
    0,
  );
  const totalClicks = insightsResult.data.reduce((a, r) => a + r.clicks, 0);
  const ctrGlobal =
    totalImpressions > 0
      ? Math.round((totalClicks / totalImpressions) * 1000) / 10
      : 0;
  const totalLeads = attributionResult.data.reduce(
    (a, r) => a + r.leads_count,
    0,
  );
  const cplGlobal = totalLeads > 0 ? Math.round(totalSpend / totalLeads) : 0;

  // Index insights por campaign_id para la tabla.
  const insightsByCampaign = new Map<string, InsightRow>();
  for (const row of insightsResult.data) {
    if (row.campaign_id) insightsByCampaign.set(row.campaign_id, row);
  }
  // Index attribution por campaign_id.
  const attrByCampaign = new Map<string, CampaignAttribution>();
  for (const row of attributionResult.data) {
    if (row.campaign_id) attrByCampaign.set(row.campaign_id, row);
  }

  return (
    <Card className="overflow-hidden mb-6">
      <div className="p-5 border-b border-brand-50">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-ink">📣 Campañas Meta</h2>
            <p className="text-xs text-ink-muted mt-1">
              Performance del ad account y atribución a este evento.
            </p>
          </div>
          {/* Selector de período (URL-driven, server-side). */}
          <form
            method="GET"
            action=""
            className="flex items-center gap-2"
            role="search"
            aria-label="Período del dashboard"
          >
            <input type="hidden" name="tab" value="campaigns" />
            <label
              htmlFor="campaign-period"
              className="text-xs font-semibold text-ink-muted"
            >
              Período:
            </label>
            <select
              id="campaign-period"
              name="campaign_period"
              defaultValue={resolvedPeriod}
              className="px-3 py-1.5 border border-brand-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-300"
            >
              {PERIOD_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="px-3 py-1.5 bg-brand-500 text-white rounded-lg text-sm font-semibold hover:bg-brand-600 transition"
            >
              Aplicar
            </button>
          </form>
        </div>
      </div>

      {/* Banner demo / error */}
      {isDemo && (
        <div className="px-5 py-3 bg-amber-50 border-b border-amber-200 text-xs text-amber-800">
          ⚠️ Modo demo: no hay <code>META_ACCESS_TOKEN</code> +{" "}
          <code>META_AD_ACCOUNT_ID</code> configuradas. Mostrando datos
          placeholder.
        </div>
      )}
      {hasError && !isDemo && (
        <div className="px-5 py-3 bg-rose-50 border-b border-rose-200 text-xs text-rose-800">
          ❌ Error leyendo Meta API:{" "}
          {campaignsResult.error ??
            insightsResult.error ??
            attributionResult.error}
        </div>
      )}

      {/* 5 stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-5 border-b border-brand-50 bg-brand-50/20">
        <StatCard
          label="Gasto total"
          value={formatMXN(totalSpend)}
          tone="brand"
        />
        <StatCard
          label="Impresiones"
          value={totalImpressions.toLocaleString("es-MX")}
          tone="blue"
        />
        <StatCard
          label="Clicks"
          value={totalClicks.toLocaleString("es-MX")}
          tone="amber"
        />
        <StatCard
          label="CTR"
          value={`${ctrGlobal}%`}
          tone="emerald"
          hint={`${totalClicks} / ${totalImpressions}`}
        />
        <StatCard
          label="CPL"
          value={totalLeads > 0 ? formatMXN(cplGlobal) : "—"}
          tone="neutral"
          hint={`${totalLeads} leads atribuidos`}
        />
      </div>

      {/* Tabla de campañas */}
      <div className="p-5 border-b border-brand-50">
        <h3 className="text-xs font-bold uppercase text-brand-600 mb-3">
          Campañas ({insightsResult.data.length})
        </h3>
        {insightsResult.data.length === 0 ? (
          <p className="text-sm text-ink-muted italic">
            No hay datos de campañas para este período.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-brand-50/50 text-ink-muted text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2 font-semibold">Campaña</th>
                  <th className="text-left px-4 py-2 font-semibold">Estado</th>
                  <th className="text-right px-4 py-2 font-semibold">Gasto</th>
                  <th className="text-right px-4 py-2 font-semibold">
                    Impresiones
                  </th>
                  <th className="text-right px-4 py-2 font-semibold">Clicks</th>
                  <th className="text-right px-4 py-2 font-semibold">CTR</th>
                  <th className="text-right px-4 py-2 font-semibold">CPL</th>
                  <th className="text-right px-4 py-2 font-semibold">
                    Leads atribuidos
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-50">
                {insightsResult.data.map((row) => {
                  const campaign = campaignsResult.data.find(
                    (c) => c.id === row.campaign_id,
                  );
                  const attr = row.campaign_id
                    ? attrByCampaign.get(row.campaign_id)
                    : undefined;
                  const leadsCount = attr?.leads_count ?? 0;
                  const cpl =
                    leadsCount > 0 ? Math.round(row.spend / leadsCount) : null;
                  return (
                    <tr key={row.campaign_id ?? row.campaign_name} className="hover:bg-brand-50/30">
                      <td className="px-4 py-3 font-medium text-ink">
                        {row.campaign_name ?? "(sin nombre)"}
                      </td>
                      <td className="px-4 py-3">
                        {campaign ? (
                          <Badge tone={STATUS_TONE[campaign.status]}>
                            {STATUS_LABEL[campaign.status]}
                          </Badge>
                        ) : (
                          <span className="text-xs text-ink-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-ink-soft">
                        {formatMXN(row.spend)}
                      </td>
                      <td className="px-4 py-3 text-right text-ink-soft">
                        {row.impressions.toLocaleString("es-MX")}
                      </td>
                      <td className="px-4 py-3 text-right text-ink-soft">
                        {row.clicks.toLocaleString("es-MX")}
                      </td>
                      <td className="px-4 py-3 text-right text-ink-soft">
                        {row.ctr}%
                      </td>
                      <td className="px-4 py-3 text-right text-ink-soft">
                        {cpl !== null ? formatMXN(cpl) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {leadsCount > 0 ? (
                          <Badge tone="success">{leadsCount}</Badge>
                        ) : (
                          <span className="text-xs text-ink-muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Atribución al evento */}
      <div className="p-5">
        <h3 className="text-xs font-bold uppercase text-brand-600 mb-3">
          🎯 Atribución al evento
        </h3>
        <p className="text-xs text-ink-muted mb-3">
          Leads con <code>source=&quot;facebook_ads&quot;</code> del CRM
          vinculados a este evento (vía <code>lead_event_links</code>).
        </p>
        {attributionResult.data.length === 0 ? (
          <p className="text-sm text-ink-muted italic">
            Sin leads atribuidos a campañas Meta para este evento.
          </p>
        ) : (
          <ul className="space-y-2">
            {attributionResult.data.map((row) => (
              <li
                key={`${row.campaign_id}-${row.campaign_name}`}
                className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg border border-brand-100 bg-white"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-ink truncate">
                    {row.campaign_name}
                  </p>
                  {row.utm_campaign && (
                    <p className="text-xs text-ink-muted">
                      utm_campaign: {row.utm_campaign}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-ink-soft">
                    <strong>{row.leads_count}</strong> leads
                  </span>
                  {row.cpl > 0 && (
                    <Badge tone="neutral">CPL {formatMXN(row.cpl)}</Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-xs text-ink-muted">
          Tip: para mejorar la atribución, agregá el tag{" "}
          <code>utm:campaign:&lt;nombre&gt;</code> a los leads desde el
          CRM.{" "}
          <Link href={`/admin?tab=crm`} className="underline text-brand-700">
            Ir al CRM →
          </Link>
        </p>
      </div>
    </Card>
  );
}

function StatCard({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone: "brand" | "blue" | "amber" | "emerald" | "neutral";
  hint?: string;
}) {
  const colorClass: Record<typeof tone, string> = {
    brand: "text-brand-700",
    blue: "text-blue-700",
    amber: "text-amber-700",
    emerald: "text-emerald-700",
    neutral: "text-ink",
  };
  return (
    <div className="rounded-xl bg-white border border-brand-100 p-3">
      <p className="text-[10px] uppercase text-ink-muted font-semibold">
        {label}
      </p>
      <p className={`text-xl font-bold mt-1 ${colorClass[tone]}`}>{value}</p>
      {hint && <p className="text-[10px] text-ink-muted mt-0.5">{hint}</p>}
    </div>
  );
}