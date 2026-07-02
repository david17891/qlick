/**
 * Cliente de Meta Marketing API (Graph API v20.0) — solo lectura.
 *
 * Wrapper server-side para leer campañas, adsets, ads e insights del
 * Meta Ads Manager. NO creamos campañas por API en esta capa: la
 * intención es darle al admin una vista del performance de lo que ya
 * está corriendo en Meta desde el panel.
 *
 * Variables de entorno necesarias:
 * - META_ACCESS_TOKEN: System User Token con permiso `ads_read`.
 * - META_AD_ACCOUNT_ID: formato `act_1234567890`.
 * - META_PIXEL_ID: opcional, documentado para Conversions API (futuro).
 *
 * Modo demo (sin env vars): devuelve data mock coherente para que
 * el dashboard se vea razonable en dev. La UI indica `demo: true`
 * para que David sepa que está viendo placeholders.
 *
 * Rate limits: si Meta responde 429, hacemos retry con backoff
 * exponencial (3 intentos, 500ms → 1s → 2s).
 *
 * @server
 */

const GRAPH_API_VERSION = "v20.0";
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 500;

// ─────────────────────────────────────────────────────────────
// Tipos públicos
// ─────────────────────────────────────────────────────────────

export type CampaignStatus = "ACTIVE" | "PAUSED" | "DELETED" | "ARCHIVED";

export interface Campaign {
  id: string;
  name: string;
  status: CampaignStatus;
  objective: string;
  daily_budget?: string;
  lifetime_budget?: string;
  created_time: string;
  updated_time: string;
}

export interface InsightRow {
  campaign_id?: string;
  campaign_name?: string;
  impressions: number;
  clicks: number;
  spend: number;
  ctr: number;
  cpc: number;
  cpm: number;
  date_start: string;
  date_stop: string;
}

export interface CampaignAttribution {
  campaign_id: string;
  campaign_name: string;
  utm_source?: string;
  utm_campaign?: string;
  leads_count: number;
  conversions_count: number;
  cpl: number;
}

export interface ListCampaignsParams {
  status?: "active" | "paused";
  /** Meta date_preset (ej. "last_7d", "last_30d", "this_month"). */
  datePreset?: string;
}

export interface InsightsParams {
  datePreset?: string;
  level?: "account" | "campaign" | "adset" | "ad";
}

export interface CampaignInsightsParams {
  datePreset?: string;
  /** Breakdowns (ej. ["age", "gender", "publisher_platform"]). */
  breakdowns?: string[];
}

export interface MetaApiResult<T> {
  data: T;
  /** true si se usó data mock por falta de env vars. */
  demo: boolean;
  /** Si falló, código de error (ej. "RATE_LIMITED", "AUTH_ERROR"). */
  error?: string;
}

// ─────────────────────────────────────────────────────────────
// Configuración
// ─────────────────────────────────────────────────────────────

function getMetaConfig(): {
  accessToken: string | null;
  adAccountId: string | null;
  pixelId: string | null;
  configured: boolean;
} {
  const accessToken = process.env.META_ACCESS_TOKEN ?? null;
  const adAccountId = process.env.META_AD_ACCOUNT_ID ?? null;
  const pixelId = process.env.META_PIXEL_ID ?? null;
  const configured = Boolean(accessToken && adAccountId);
  return { accessToken, adAccountId, pixelId, configured };
}

// ─────────────────────────────────────────────────────────────
// Fetch con retry ante 429
// ─────────────────────────────────────────────────────────────

interface FetchOptions {
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
  accessToken: string;
}

async function graphFetch<T>(
  path: string,
  params: Record<string, string | undefined>,
  options: FetchOptions,
): Promise<T> {
  const url = new URL(`${GRAPH_API_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") {
      url.searchParams.set(k, v);
    }
  }
  url.searchParams.set("access_token", options.accessToken);

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await fetch(url.toString(), {
        method: options.method ?? "GET",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.status === 429 || res.status === 503) {
        // Rate limited — backoff and retry.
        const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
        await sleep(backoff);
        continue;
      }
      if (!res.ok) {
        const body = await res.text();
        throw new Error(
          `Meta API error ${res.status}: ${body.slice(0, 300)}`,
        );
      }
      return (await res.json()) as T;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt === MAX_RETRIES - 1) break;
      const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
      await sleep(backoff);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError ?? new Error("Meta API: unknown error after retries");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─────────────────────────────────────────────────────────────
// Mappers (Graph API -> nuestros tipos)
// ─────────────────────────────────────────────────────────────

/** Mapea una fila cruda de `/{ad-account-id}/insights` a InsightRow. */
function mapInsightRow(raw: Record<string, string>): InsightRow {
  return {
    campaign_id: raw.campaign_id,
    campaign_name: raw.campaign_name,
    impressions: Number(raw.impressions ?? 0),
    clicks: Number(raw.clicks ?? 0),
    spend: Number(raw.spend ?? 0),
    ctr: Number(raw.ctr ?? 0),
    cpc: Number(raw.cpc ?? 0),
    cpm: Number(raw.cpm ?? 0),
    date_start: raw.date_start ?? "",
    date_stop: raw.date_stop ?? "",
  };
}

/** Mapea una fila cruda de `/{ad-account-id}/campaigns` a Campaign. */
function mapCampaignRow(raw: Record<string, unknown>): Campaign {
  return {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? ""),
    status: (raw.status as CampaignStatus) ?? "PAUSED",
    objective: String(raw.objective ?? ""),
    daily_budget: raw.daily_budget ? String(raw.daily_budget) : undefined,
    lifetime_budget: raw.lifetime_budget
      ? String(raw.lifetime_budget)
      : undefined,
    created_time: String(raw.created_time ?? ""),
    updated_time: String(raw.updated_time ?? ""),
  };
}

// ─────────────────────────────────────────────────────────────
// MOCK data (modo demo, sin env vars)
// ─────────────────────────────────────────────────────────────

function mockCampaigns(): Campaign[] {
  return [
    {
      id: "cmp_001_demo",
      name: "Conferencia Taller de Funnels — Tráfico",
      status: "ACTIVE",
      objective: "OUTCOME_LEADS",
      daily_budget: "50000", // 50 MXN/día en centavos
      created_time: "2026-06-01T00:00:00Z",
      updated_time: "2026-06-15T00:00:00Z",
    },
    {
      id: "cmp_002_demo",
      name: "Masterclass Pixel Meta — Engagement",
      status: "ACTIVE",
      objective: "OUTCOME_ENGAGEMENT",
      daily_budget: "30000",
      created_time: "2026-06-05T00:00:00Z",
      updated_time: "2026-06-20T00:00:00Z",
    },
    {
      id: "cmp_003_demo",
      name: "Webinar Embudos — Lookalike 1%",
      status: "PAUSED",
      objective: "OUTCOME_LEADS",
      daily_budget: "75000",
      created_time: "2026-05-15T00:00:00Z",
      updated_time: "2026-06-10T00:00:00Z",
    },
  ];
}

function mockInsights(datePreset: string | undefined): InsightRow[] {
  const today = new Date();
  const start = new Date(today);
  if (datePreset === "last_7d") start.setDate(today.getDate() - 7);
  else if (datePreset === "this_month")
    start.setDate(1);
  else start.setDate(today.getDate() - 30);
  const dateStart = start.toISOString().slice(0, 10);
  const dateStop = today.toISOString().slice(0, 10);
  return [
    {
      campaign_id: "cmp_001_demo",
      campaign_name: "Conferencia Taller de Funnels — Tráfico",
      impressions: 18420,
      clicks: 612,
      spend: 3240.5,
      ctr: 3.32,
      cpc: 5.3,
      cpm: 175.9,
      date_start: dateStart,
      date_stop: dateStop,
    },
    {
      campaign_id: "cmp_002_demo",
      campaign_name: "Masterclass Pixel Meta — Engagement",
      impressions: 9750,
      clicks: 421,
      spend: 2150.0,
      ctr: 4.32,
      cpc: 5.1,
      cpm: 220.5,
      date_start: dateStart,
      date_stop: dateStop,
    },
    {
      campaign_id: "cmp_003_demo",
      campaign_name: "Webinar Embudos — Lookalike 1%",
      impressions: 6230,
      clicks: 198,
      spend: 1480.75,
      ctr: 3.18,
      cpc: 7.48,
      cpm: 237.7,
      date_start: dateStart,
      date_stop: dateStop,
    },
  ];
}

// ─────────────────────────────────────────────────────────────
// API pública
// ─────────────────────────────────────────────────────────────

/**
 * Lista campañas del ad account. Solo lectura.
 *
 * Si no hay env vars configuradas, devuelve mock data con `demo: true`
 * para que el dashboard funcione en dev.
 */
export async function listCampaigns(
  params: ListCampaignsParams = {},
): Promise<MetaApiResult<Campaign[]>> {
  const cfg = getMetaConfig();
  if (!cfg.configured) {
    return { data: mockCampaigns(), demo: true };
  }

  try {
    interface RawResponse {
      data: Array<Record<string, unknown>>;
    }
    const resp = await graphFetch<RawResponse>(
      `/${cfg.adAccountId}/campaigns`,
      {
        fields: "id,name,status,objective,daily_budget,lifetime_budget,created_time,updated_time",
        filtering: params.status
          ? JSON.stringify([
              { field: "effective_status", operator: "IN", value: [params.status.toUpperCase()] },
            ])
          : undefined,
      },
      { accessToken: cfg.accessToken! },
    );
    const campaigns = resp.data.map(mapCampaignRow);
    return { data: campaigns, demo: false };
  } catch (err) {
    return {
      data: [],
      demo: false,
      error: err instanceof Error ? err.message : "unknown",
    };
  }
}

/**
 * Devuelve insights agregados del ad account (o desglosados por nivel).
 * Level `account` = totales; `campaign` = 1 row por campaña.
 */
export async function getAccountInsights(
  params: InsightsParams = {},
): Promise<MetaApiResult<InsightRow[]>> {
  const cfg = getMetaConfig();
  if (!cfg.configured) {
    return { data: mockInsights(params.datePreset), demo: true };
  }

  try {
    interface RawResponse {
      data: Array<Record<string, string>>;
    }
    const resp = await graphFetch<RawResponse>(
      `/${cfg.adAccountId}/insights`,
      {
        fields: "campaign_id,campaign_name,impressions,clicks,spend,ctr,cpc,cpm",
        date_preset: params.datePreset ?? "last_30d",
        level: params.level ?? "campaign",
        time_increment: "all_days",
      },
      { accessToken: cfg.accessToken! },
    );
    return { data: resp.data.map(mapInsightRow), demo: false };
  } catch (err) {
    return {
      data: [],
      demo: false,
      error: err instanceof Error ? err.message : "unknown",
    };
  }
}

/**
 * Devuelve insights de una campaña específica, opcionalmente con breakdowns
 * (ej. ["age", "gender"] para segmentación demográfica).
 */
export async function getCampaignInsights(
  campaignId: string,
  params: CampaignInsightsParams = {},
): Promise<MetaApiResult<InsightRow[]>> {
  const cfg = getMetaConfig();
  if (!cfg.configured) {
    return { data: mockInsights(params.datePreset), demo: true };
  }

  try {
    interface RawResponse {
      data: Array<Record<string, string>>;
    }
    const resp = await graphFetch<RawResponse>(
      `/${campaignId}/insights`,
      {
        fields: "campaign_id,campaign_name,impressions,clicks,spend,ctr,cpc,cpm",
        date_preset: params.datePreset ?? "last_30d",
        breakdowns: params.breakdowns?.join(","),
        time_increment: "all_days",
      },
      { accessToken: cfg.accessToken! },
    );
    return { data: resp.data.map(mapInsightRow), demo: false };
  } catch (err) {
    return {
      data: [],
      demo: false,
      error: err instanceof Error ? err.message : "unknown",
    };
  }
}

/**
 * Atribución cruzada: campaigns Meta -> leads del CRM con source=facebook_ads
 * confirmados para este evento. Devuelve lista con leads_count, conversions y CPL.
 *
 * Nota: este método cruza data de Meta + Supabase (leads + event_confirmations).
 * Por eso vive en este lib y no en marketing-api puro: la atribución es
 * semántica de Qlick, no de Meta.
 */
export async function getCampaignAttribution(
  eventId: string,
  params: { datePreset?: string } = {},
): Promise<MetaApiResult<CampaignAttribution[]>> {
  const cfg = getMetaConfig();
  if (!cfg.configured) {
    return {
      data: [
        {
          campaign_id: "cmp_001_demo",
          campaign_name: "Conferencia Taller de Funnels — Tráfico",
          utm_source: "facebook",
          utm_campaign: "taller-funnels",
          leads_count: 12,
          conversions_count: 4,
          cpl: 270,
        },
        {
          campaign_id: "cmp_002_demo",
          campaign_name: "Masterclass Pixel Meta — Engagement",
          utm_source: "instagram",
          utm_campaign: "pixel-meta",
          leads_count: 7,
          conversions_count: 2,
          cpl: 307,
        },
      ],
      demo: true,
    };
  }

  // Importación dinámica para evitar ciclos y mantener marketing-api puro.
  // La atribución real necesita:
  // 1. Insights de Meta (spend por campaign)
  // 2. Leads con source='facebook_ads' del CRM vinculados al evento
  //    (via lead_event_links.event_id = eventId)
  // 3. Confirmaciones del evento (event_confirmations.event_id = eventId)
  // Cruzamos por utm_campaign en metadata del lead (si existe) o por
  // proximidad temporal.
  try {
    const { createSupabaseAdminClient } = await import(
      "@/lib/supabase/admin"
    );
    const { checkSupabaseConfig } = await import("@/lib/supabase/health");
    if (!checkSupabaseConfig().configured) {
      return { data: [], demo: false, error: "Supabase no configurado." };
    }
    const supabase = createSupabaseAdminClient();
    // JOIN: leads -> lead_event_links filtrado por eventId.
    // Filtramos por source='facebook_ads' para atribución Meta.
    const { data: leadRows, error: leadErr } = await supabase
      .from("lead_event_links")
      .select(
        `
        link_type,
        link_id,
        lead:leads ( id, source, tags )
      `,
      )
      .eq("event_id", eventId);
    if (leadErr) {
      return {
        data: [],
        demo: false,
        error: `Supabase: ${leadErr.message}`,
      };
    }
    const metaLeads = (leadRows ?? []).filter(
      (r) => (r.lead as { source?: string } | null)?.source === "facebook_ads",
    );

    // Insights de cuenta para tener spend por campaign.
    const insightsResult = await getAccountInsights({
      datePreset: params.datePreset ?? "last_30d",
      level: "campaign",
    });

    // Mapeamos campaign_name -> count de leads.
    const counts = new Map<string, number>();
    for (const r of metaLeads) {
      const tags = (r.lead as { tags?: string[] | null } | null)?.tags ?? [];
      // Convención: si el lead tiene tag con formato "utm:campaign:<name>"
      // lo atribuimos a esa campaña; si no, lo agrupamos como "unattributed".
      const tagMatch = tags.find((t) => t.startsWith("utm:campaign:"));
      const key = tagMatch ? tagMatch.slice("utm:campaign:".length) : "unattributed";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const attributions: CampaignAttribution[] = insightsResult.data.map(
      (row) => {
        const campaignName = row.campaign_name ?? "(sin nombre)";
        const leads = counts.get(campaignName) ?? 0;
        return {
          campaign_id: row.campaign_id ?? "",
          campaign_name: campaignName,
          utm_source: "facebook",
          utm_campaign: campaignName,
          leads_count: leads,
          conversions_count: 0, // se completaría con link a conversions
          cpl: leads > 0 ? Math.round(row.spend / leads) : 0,
        };
      },
    );

    // Si hay leads "unattributed", los sumamos como un row aparte.
    const unattributed = counts.get("unattributed") ?? 0;
    if (unattributed > 0) {
      attributions.push({
        campaign_id: "",
        campaign_name: "(sin atribución UTM)",
        utm_source: "facebook",
        utm_campaign: "",
        leads_count: unattributed,
        conversions_count: 0,
        cpl: 0,
      });
    }

    return { data: attributions, demo: insightsResult.demo };
  } catch (err) {
    return {
      data: [],
      demo: false,
      error: err instanceof Error ? err.message : "unknown",
    };
  }
}