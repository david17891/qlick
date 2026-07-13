# AI Ads Hub — Plan Maestro

**Fecha de diseño:** 2026-07-09 (re-documentado tras sesión reparada)
**Workspace:** `C:\Users\User\Documents\Click`
**Rama:** `docs/fase-A-ads-hub-plan` (creada desde `main` limpio)
**Status:** PLANEACIÓN — no se mergea a `main` ni a `feat/*` activa antes del 11-jul-2026
**Trigger de arranque:** Fase 1 comienza el 11-jul-2026 (post-evento en vivo del 10-jul)
**Owner del plan:** Mavis (sesión `mvs_56c0dd2dfeaa42f695393b08bb781ebd`)

---

## TL;DR — dónde estamos hoy y hacia dónde vamos

El módulo `src/lib/meta/marketing-api.ts` y `CampaignsTab.tsx` ya están construidos como lector pasivo + read-only + server-only + modo demo (548 líneas, retry con backoff ante 429, todo server-side, cero PII). Lo que falta es la capa de inteligencia y atribución calificada que pediste. Esto **NO se toca antes del 10-jul**. Diseñamos ahora; implementamos en una rama nueva `feat/fase-N-ai-ads-hub` que se mergea a `main` el 11-jul.

---

## 1. Diagnóstico verificado (leído del código real, no inventado)

| Capa | Estado actual | Lo que falta |
|---|---|---|
| **Cliente Meta API** | ✅ `marketing-api.ts` ya implementa `listCampaigns`, `getAccountInsights`, `getCampaignInsights`, `getCampaignAttribution` con Graph API v20.0, System User Token, retry 429/503, modo demo sin env vars, read-only puro (no llama `ads_management` nunca). | Nada — está bien para Ads. Solo le sumamos un cron job que la use. |
| **Atribución campaigns → leads** | ⚠️ `getCampaignAttribution` cruza `leads.source='facebook_ads'` con `leads.tags` con prefijo `utm:campaign:*` (frágil, depende de tag manual). Reporta `leads_count` y CPL básico. No cruza con `event_attendees.checked_in_at` (asistencia real), ni con `event_surveys.consent_to_contact=true` (leads comerciales), ni con `payments` (ventas reales). | Atribución multi-touch calificada con CPL real, %asistencia, ROAS estimado. |
| **Campo UTM nativo en leads** | ❌ No existe. Solo tag `utm:campaign:*` por convención. `masterclass_registrations` SÍ tiene `utm_source/utm_campaign` nativos, pero `leads` no. | Migración para agregar `utm_source`, `utm_campaign`, `utm_content`, `utm_term` a `leads` (nullable, retrocompatible). |
| **Snapshot histórico Meta** | ❌ No existe. Cada vez que abrís `CampaignsTab` se llama Meta en vivo — vulnerable a 429 si múltiples admins. | Tabla `meta_campaign_snapshots` + cron diario + service `listSnapshots`. |
| **Motor IA** | ❌ No existe. | `src/lib/meta/ai-ads-auditor.ts` con system prompt "AI Media Buyer", payload anonimizado, 4 tipos de alerta. |
| **UI Hub** | ⚠️ Tabla + stat cards + sección de atribución separadas. | Tarjetas IA al tope, badges de calidad CRM por fila, exportador ejecutivo. |
| **MCP server externo** | ❌ No existe. | `qlick-ads-mcp` con 3 tools. |
| **Variables entorno activas** | `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`, `META_PIXEL_ID` están documentadas en `marketing-api.ts` pero no están en `.env.local` ni Vercel (la app arranca en modo demo). | Paul debe generar System User Token con `ads_read` y meter ambas env vars (ver §6). |

### Leyes innegociables chequeadas

- ✅ **Ley 1 (bot-engine intacto):** cero cambios a `src/lib/whatsapp/bot-engine.ts`, webhooks, registration in-vivo. Ads vive aislado en `src/lib/meta/`.
- ✅ **Ley 2 (PII):** `ai-ads-auditor.ts` recibirá solo agregados anónimos (sin nombres/teléfono).
- ✅ **Ley 3 (server-only):** tokens en `process.env.*` server-side, jamás `NEXT_PUBLIC_*`.
- ✅ **Ley 4 (soft-delete):** ninguna migración hace `.delete()` físico.

### Blindaje anti-bloqueo chequeado

- ✅ System User Token permanente (prohibido perfil personal).
- ✅ Scope único `ads_read` (prohibido `ads_management`).
- ✅ Caché defensiva: el cron descarga 1/día; UI y LLM leen Supabase, NO a Meta.
- ✅ Business Asset interno: misma estrategia de App Empresarial que ya está documentada en `docs/PARTNER_META_SETUP.md` (App "Qlick Bot" en Business Manager "Negocio de Paul Velasquez").

---

## 2. Blueprint Arquitectónico

```
                         ┌─────────────────────────────────────────┐
                         │  META BUSINESS MANAGER (Business Asset) │
                         │  - App Empresarial "Qlick Bot" (interior│
                         │    del mismo BM de Paul, NO App Review) │
                         │  - System User "qlick_ads_reader"       │
                         │  - Token permanente con scope           │
                         │    "ads_read" ÚNICAMENTE                │
                         │  - Ad Account act_xxxxxxxxxx            │
                         └────────────────┬────────────────────────┘
                                          │
                                          │  GET /act_xxx/insights
                                          │  GET /act_xxx/campaigns
                                          │  (System User Token)
                                          ▼
            ┌────────────────────────────────────────────────────────┐
            │  CRON JOB DIARIO                                       │
            │  vercel.json: { "path": "/api/cron/meta-sync",         │
            │                    "schedule": "0 6 * * *" }          │
            │                                                        │
            │  1. fetchCampaigns()                                   │
            │  2. fetchInsights(date_preset=today)                   │
            │  3. UPSERT a meta_campaign_snapshots (cualquier freq)  │
            │  4. intenta 2 veces si 429, espera 5 min entre reint.  │
            │  5. marca last_sync_at y last_sync_status              │
            │  6. NUNCA falla la app: errores → columna error_msg    │
            └─────────────────────────┬──────────────────────────────┘
                                      │
                                      ▼
            ┌─────────────────────────────────────────────────────────┐
            │  SUPABASE — fuente única de verdad para la app         │
            │                                                         │
            │  meta_campaigns            (id, name, status, objective│
            │                              daily_budget, …, synced_at)│
            │  meta_ad_sets              (campaign_id, name, …)       │
            │  meta_ads                  (adset_id, name, creative_id)│
            │  meta_campaign_snapshots   (campaign_id, date, spend,   │
            │                              impressions, clicks, ctr,   │
            │                              cpc, cpm, frequency, …)     │
            │                                                         │
            │  leads + utm_* migration (ya existe + columnas nuevas) │
            │  event_attendees.checked_in_at (ya existe)             │
            │  event_surveys.consent_to_contact (ya existe)          │
            │  payments.amount_mxn (ya existe)                       │
            └─────────────────────────┬───────────────────────────────┘
                                      │
              ┌───────────────────────┼───────────────────────┐
              │                       │                       │
              ▼                       ▼                       ▼
    ┌──────────────────┐  ┌──────────────────────┐  ┌────────────────────┐
    │ ADMIN UI         │  │ AI ADS AUDITOR       │  │ qlick-ads-mcp      │
    │ /admin/eventos/  │  │ src/lib/meta/        │  │ servidor MCP nuevo │
    │ [id]?tab=ads_hub │  │ ai-ads-auditor.ts    │  │ (stdio o http)     │
    │                  │  │                      │  │                    │
    │ Server Component │  │ 1. Lee snapshots +   │  │ 3 tools:           │
    │ → 5 stat cards   │  │    leads agregados   │  │  - get_meta_       │
    │ → AI Insights    │  │    POR CAMPAÑA       │  │    campaign_perf   │
    │   (top carousel) │  │ 2. Construye payload │  │  - get_crm_       │
    │ → Tabla con      │  │    ANONIMIZADO       │  │    campaign_roi    │
    │   badges CRM     │  │ 3. Llama LLM         │  │  - simulate_       │
    │ → Botón export   │  │ 4. Cachea 6h en      │  │    budget_scaling  │
    └──────────────────┘  │    ai_insights_cache  │  └────────────────────┘
                          │ 5. Devuelve alerta +  │
                          │    severidad          │
                          └──────────────────────┘
                                    │
                                    ▼
                          ┌──────────────────────┐
                          │  LLM PROVIDER        │
                          │  - Default: DeepSeek │
                          │    Flash (económico) │
                          │  - Fallback: Claude  │
                          │    Sonnet (calidad)  │
                          │  - Server-only, sin  │
                          │    PII en el prompt  │
                          └──────────────────────┘
```

**Regla de oro del flujo:** Meta se lee 1 vez al día (cron). El resto del sistema — UI, IA, MCP — consume siempre Supabase. Esto cumple el blindaje anti-rate-limit y anti-bloqueo.

---

## 3. Plan de implementación por fases — diseño post-evento

> **Importante:** NO se mergea nada a `main` ni a `feat/*` activa antes del 10-jul-2026. Todo el trabajo es plan + docs + migraciones SQL en rama aparte hasta el 11-jul.

### Fase 0 — Branching y freeze (HOY, 2026-07-09) — esta fase

| Acción | Riesgo | Comando |
|---|---|---|
| Crear rama de trabajo en workspace local | 0 | `git checkout -b docs/fase-A-ads-hub-plan` ✅ |
| Documentar el plan en `docs/AI_ADS_HUB_PLAN.md` | 0 | escribir este mismo MD ya redactado (en progreso) |
| Entrada en `data/PROJECT-LOG.md` | 0 | `## 2026-07-09 · Plan AI Ads Hub diseñado` |
| Entrada en `docs/OPEN_ITEMS.md` | 0 | pendientes Ads Hub |
| NO hacer push hasta el 11-jul (mantener a David libre para hotfixes de evento) | 0 | esperar |

### Fase 1 — Snapshot + cron + UTM columns (post-evento, 11–13 jul)

**Archivos a crear:**

- `supabase/migrations/20260711000000_meta_ads_snapshot_tables.sql` — DDL abajo
- `supabase/migrations/20260711010000_leads_utm_columns.sql` — DDL abajo
- `src/lib/meta/snapshot-service.ts` — `upsertCampaignSnapshots(datePreset)`
- `src/app/api/cron/meta-sync/route.ts` — endpoint cron
- `tests/meta-sync.test.mjs` — test idempotente

**Cambios a `vercel.json`:**

```json
{
  "path": "/api/cron/meta-sync",
  "schedule": "0 6 * * *"
}
```

> ⚠️ **Trampa Hobby verificada:** ya hay 3 crons diarios (`0 8`, `0 3`, `0 5`). Sumar uno más `0 6` sigue siendo diario-permitido (Hobby tolera varios crons diarios pero TODOS deben ser 1/día). Si en algún momento queremos sub-diario, hay que migrar a Supabase `pg_cron` (ya hay skill `mavis` para eso).

**Modificación mínima a `marketing-api.ts`:**

- Agregar `getDailyAccountSnapshot()` que devuelve un row agregado para hoy (no por fecha histórica).
- `getCampaignAttribution` se extiende (no se sobreescribe) con sub-consulta a `meta_campaign_snapshots` para usar el snapshot y reducir llamadas en vivo.

**DDL propuesto (`meta_ads_snapshot_tables.sql`):**

```sql
-- Catálogo de campañas (cambia poco)
CREATE TABLE meta_campaigns (
  ad_account_id      text NOT NULL,            -- act_xxxx
  campaign_id        text PRIMARY KEY,         -- 1234567890
  name               text NOT NULL,
  objective          text,
  status             text,                     -- ACTIVE | PAUSED | DELETED | ARCHIVED
  daily_budget_cents bigint,
  lifetime_budget_cents bigint,
  synced_at          timestamptz DEFAULT now()
);

CREATE TABLE meta_ad_sets (
  adset_id    text PRIMARY KEY,
  campaign_id text NOT NULL REFERENCES meta_campaigns(campaign_id),
  name        text NOT NULL,
  status      text,
  synced_at   timestamptz DEFAULT now()
);

CREATE TABLE meta_ads (
  ad_id       text PRIMARY KEY,
  adset_id    text NOT NULL REFERENCES meta_ad_sets(adset_id),
  name        text NOT NULL,
  creative_id text,
  status      text,
  synced_at   timestamptz DEFAULT now()
);

-- Snapshots diarios — append-only con UNIQUE(campaign_id, date)
CREATE TABLE meta_campaign_snapshots (
  id          bigserial PRIMARY KEY,
  campaign_id text NOT NULL REFERENCES meta_campaigns(campaign_id),
  date        date NOT NULL,                  -- día del snapshot
  impressions bigint NOT NULL DEFAULT 0,
  clicks      bigint NOT NULL DEFAULT 0,
  spend_mxn   numeric(12,2) NOT NULL DEFAULT 0,
  ctr_pct     numeric(6,3),
  cpc_mxn     numeric(10,4),
  cpm_mxn     numeric(10,4),
  frequency   numeric(6,3),
  reach       bigint,
  leads_meta  bigint,
  synced_at   timestamptz DEFAULT now(),
  UNIQUE (campaign_id, date)
);

CREATE INDEX meta_snapshots_campaign_date_idx
  ON meta_campaign_snapshots (campaign_id, date DESC);

-- Metadata del cron
CREATE TABLE meta_sync_state (
  id                int PRIMARY KEY DEFAULT 1,
  last_sync_at      timestamptz,
  last_sync_status  text,                     -- 'ok' | 'rate_limited' | 'auth_error' | 'unknown'
  last_error_msg    text,
  next_retry_at     timestamptz,
  CONSTRAINT single_row CHECK (id = 1)
);

-- RLS — mismo patrón que el resto del repo (ver docs/AGENT_SUPABASE_PROTOCOL.md §8)
ALTER TABLE meta_campaigns           ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_ad_sets             ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_ads                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_campaign_snapshots  ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_sync_state          ENABLE ROW LEVEL SECURITY;

-- Lectura solo para admins autenticados
CREATE POLICY "admin read meta_ads" ON meta_campaigns
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_audit_log WHERE actor_email = auth.jwt() ->> 'email'));

-- Mismo patrón en las otras 4 tablas.
-- Service role tiene bypass total (lo usa el cron).
```

**DDL UTM (`leads_utm_columns.sql`):**

```sql
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS utm_source    text,
  ADD COLUMN IF NOT EXISTS utm_campaign  text,
  ADD COLUMN IF NOT EXISTS utm_content   text,
  ADD COLUMN IF NOT EXISTS utm_term      text;

CREATE INDEX IF NOT EXISTS leads_utm_campaign_idx
  ON leads (utm_campaign) WHERE utm_campaign IS NOT NULL;

-- Backfill mínimo desde tags existentes (idempotente, seguro).
UPDATE leads
SET utm_campaign = substring(tag from 'utm:campaign:(.*)$')
WHERE utm_campaign IS NULL
  AND EXISTS (SELECT 1 FROM unnest(tags) tag WHERE tag LIKE 'utm:campaign:%');

-- El bot-engine.ts NO se toca — el código de captura nueva de UTMs debe
-- vivir en el handler de formulario público y en masterclass_registrations
-- (que ya tiene utm_*), NO en el motor del bot.
```

**Verificación fin de Fase 1:** `npm run type-check && npm run lint && npm test && npm run build` verde. Tests del snapshot pasan. `vercel.json` válido.

### Fase 2 — AI Ads Auditor (14–17 jul)

**Archivos a crear:**

- `src/lib/meta/ai-ads-auditor.ts` — orquestador (entrada: `eventId|adAccountId`, salida: `AIInsights[]`)
- `src/lib/meta/llm-client.ts` — wrapper que decide provider (DeepSeek Flash default, Anthropic Sonnet fallback)
- `src/lib/meta/prompt-builder.ts` — construye payload anónimo + system prompt
- `src/lib/meta/heuristics.ts` — reglas deterministas (frecuencia > 2.5, CPL > X, etc.) que el LLM recibe como contexto, no como decisión final
- `src/lib/meta/insights-cache.ts` — escribe/lee `meta_ai_insights` con TTL=6h
- `src/lib/meta/insights-schemas.ts` — zod para validar respuesta del LLM (alucinaciones = red flag)

**Migración nueva:**

```sql
CREATE TABLE meta_ai_insights (
  id              bigserial PRIMARY KEY,
  scope           text NOT NULL,                -- 'event:<uuid>' | 'campaign:<id>' | 'account'
  insight_type    text NOT NULL,                -- 'creative_fatigue' | 'budget_bleed' | 'scale_winner' | 'auction_warning' | 'general'
  severity        text NOT NULL,                -- 'info' | 'warning' | 'critical'
  title           text NOT NULL,
  body            text NOT NULL,                -- markdown
  campaign_id     text REFERENCES meta_campaigns(campaign_id),
  metric_snapshot jsonb NOT NULL,               -- snapshot numérico que produjo el insight
  model_name      text NOT NULL,                -- 'deepseek-flash' / 'claude-sonnet-4-6'
  generated_at    timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL          -- TTL: 6h por defecto
);

CREATE INDEX meta_ai_insights_scope_expires_idx
  ON meta_ai_insights (scope, expires_at DESC);
```

**Estructura del payload analítico (lo que va al LLM, ZERO PII):**

```jsonc
{
  "scope": "event:7a3x-uuid",
  "periodo": "last_7d",
  "campaigns": [
    {
      "id": "cmp_001",
      "name": "Conferencia Taller de Funnels — Tráfico",
      "status": "ACTIVE",
      "metrics": {
        "spend_mxn": 14820.50,
        "impressions": 184200,
        "clicks": 6120,
        "ctr_pct": 3.32,
        "cpc_mxn": 2.42,
        "cpm_mxn": 80.45,
        "frequency": 2.87,
        "trend_7d": { "ctr_delta": -0.41, "cpc_delta": 0.18 }
      },
      "crm_agregado": {
        "leads_total": 142,
        "leads_con_consent_comercial": 67,
        "leads_asistieron_evento": 31,
        "leads_compraron_curso": 4,
        "cpl_total_mxn": 104.37,
        "cpl_calificado_mxn": 221.20,
        "roas_estimado": 1.68
      }
    }
  ],
  "alertas_deterministas": [
    "cmp_002: frequency=3.4 (>2.5) + ctr trending down (-0.41 últimas 7d)"
  ]
}
```

**System prompt del "AI Media Buyer":**

```
Eres un media buyer senior con 10 años optimizando campañas de tráfico
frío en LATAM, especializado en eventos de marketing digital en México.
...

REGLAS DURAS:
1. SOLO recomienda acciones que un humano debe aprobar antes de ejecutar.
   NUNCA recomiendes pausar, editar o modificar campañas por escrito.
   Tu rol es DIAGNOSTICAR, no EJECUTAR.
2. Basa cada conclusión en los datos numéricos del payload. Si un dato
   falta, di "no concluyente".
3. PRIORIZA severidad (critical > warning > info).
4. Devuelve EXCLUSIVAMENTE JSON válido con el schema:
   { "insights": [{"type": "...", "severity": "...", "title": "...",
                    "body": "...", "evidence_keys": ["..."] }] }
5. NO incluyas PII (nombres, teléfonos, emails) en ninguna respuesta.
   Tampoco lo pidas en las preguntas.
6. Habla español (México). Tono ejecutivo, no alarmista.
```

**Ejemplo de respuesta esperada:**

> 🚨 **Fatiga de creativo detectada en "Masterclass Pixel Meta — Engagement"** · `severity: warning`
>
> **Causa probable:** Frecuencia acumulada 3.4 (>2.5) con CTR cayendo −0.41pp en los últimos 7 días. Las impresiones se mantienen (970/impresiones-día) pero el costo por lead subió 18%.
>
> **Recomendación operativa (para que Paul aplique en Meta Ads Manager manualmente):**
> 1. Rotar el creativo publicitario (probar 1–2 variantes nuevas).
> 2. Si en 48h no mejora, considerar pausar este AdSet.
> 3. NO pausar a ciegas — la frecuencia alta también puede ser audiences quemadas, no solo creativo.
>
> **Evidencia numérica:** `cmp_002.frequency=3.4`, `cmp_002.ctr_delta=-0.41`, `cmp_002.cpc_delta=0.18`.

> 🔥 **Oportunidad de escala en "Conferencia Taller de Funnels — Tráfico"** · `severity: info`
>
> **Causa:** CPL calificado $221 MXN (más bajo del portafolio) con 31/142 leads asistentes y 4 conversiones a curso. ROAS estimado 1.68.
>
> **Recomendación operativa:** considerar subir presupuesto daily +15–20% durante 3 días como test. Si CTR se mantiene y CPL no sube >10%, mantener el nuevo piso y repetir la subida.

**Tests de Fase 2:**

- `tests/ai-ads-auditor.test.mjs` — payload sintético, mockea LLM, valida que el JSON parsea con zod.
- `tests/insights-cache.test.mjs` — TTL, dedup por `scope`, idempotencia.
- `tests/heuristics.test.mjs` — frecuencia, CPL, ROAS, tendencias.

**Verificación fin de Fase 2:** con `META_ACCESS_TOKEN` real, primer run end-to-end sobre data real de Paul. Documentar en `data/PROJECT-LOG.md`.

### Fase 3 — UI Hub (18–22 jul)

**Archivos nuevos:**

- `src/app/admin/eventos/[id]/_components/AdsHubTab.tsx` — reemplaza el actual `CampaignsTab` con tabs internas: "Overview" (insights IA) + "Detalle" (tabla) + "Exportar"
- `src/app/admin/eventos/[id]/_components/AiInsightCard.tsx` — card individual de alerta
- `src/app/admin/eventos/[id]/_components/CampaignTableRow.tsx` — fila con badges CRM
- `src/app/admin/eventos/[id]/_components/export-executive-summary.ts` — server action que genera texto formateado para WhatsApp

**Sin tocar:**

- `src/lib/whatsapp/bot-engine.ts` (sagrado).
- `src/app/admin/eventos/[id]/page.tsx` solo recibe un link extra a `?tab=ads_hub`.

**Badges CRM por fila de campaña:**

| Columna | Lógica |
|---|---|
| `% Asistencia` | `event_attendees.count WHERE checked_in_at IS NOT NULL AND lead.source=facebook_ads AND lead.utm_campaign = X` ÷ `leads WHERE utm_campaign = X` |
| `CPL Calificado` | `spend_mxn` ÷ `leads WHERE utm_campaign=X AND score >= 40 AND consent_to_contact=true` |
| `ROAS estimado` | `SUM(payments.amount_mxn WHERE lead.utm_campaign=X)` ÷ `spend_mxn` |
| `Calidad` | badge 🔥 si CPL calif < 250 MXN, ⚠️ si >400 MXN, neutral intermedio |

**Exportador ejecutivo (botón 1-clic):**

```
📊 *Resumen semanal — Paul Velázquez*
Periodo: 2026-07-01 a 2026-07-07

GASTO TOTAL: $52,840 MXN en 5 campañas activas

TOP 3 POR ROAS:
1. Conferencia Taller de Funnels — $X MXN, ROAS 1.68 (escala +15%)
2. Webinar Embudos Lookalike — $X MXN, ROAS 1.12 (mantener)
3. Masterclass Pixel Meta — $X MXN, ROAS 0.79 (atención)

⚠️ ALERTAS:
• cmp_002: frecuencia 3.4 — refrescar creativo
• cmp_003: CTR cayó 0.41pp — revisar copy

ACCIONES RECOMENDADAS (para que tú decidas):
1. ...
```

### Fase 4 — MCP server `qlick-ads-mcp` (23–28 jul)

**Tipo:** NO es un MCP para Mavis (esa infra es solo para tools globales como `higgsfield`). Es un **servidor MCP standalone** que David puede invocar desde Claude Desktop, desde terminal con `claude mcp add`, o desde IDE con el adapter de MCP. Lee **directamente de Supabase** vía service-role.

**Stack:** TypeScript + `@modelcontextprotocol/sdk` (oficial). Modo `stdio` para empezar (más simple que HTTP).

**3 tools mínimas (después se suman más):**

```ts
// tool 1: get_meta_campaign_performance
{
  name: "get_meta_campaign_performance",
  description: "Devuelve gasto, CTR, CPC, CPM, frecuencia y trend 7d de una campaña Meta desde el snapshot de Supabase (cache, sin llamar a Meta).",
  inputSchema: {
    type: "object",
    properties: {
      campaign_id: { type: "string" },
      period: { type: "string", enum: ["last_7d","last_30d","this_month"] }
    }
  }
}

// tool 2: get_crm_campaign_roi
{
  name: "get_crm_campaign_roi",
  description: "Cruza una campaña Meta con leads, asistencia, ventas y CPL/ROAS en el CRM de Qlick.",
  inputSchema: {
    type: "object",
    properties: {
      campaign_id: { type: "string" },
      event_id: { type: "string" }  // opcional, filtra por evento
    }
  }
}

// tool 3: simulate_budget_scaling
{
  name: "simulate_budget_scaling",
  description: "Proyecta CPL y ROAS si se aumenta o baja presupuesto X% en una campaña. Usa promedios móviles y saturación logarítmica (no mágico).",
  inputSchema: {
    type: "object",
    properties: {
      campaign_id: { type: "string" },
      budget_multiplier: { type: "number", minimum: 0.1, maximum: 5.0 }
    }
  }
}
```

**Cómo lo instala David (en sesión futura):**

```bash
cd ~/qlick-ads-mcp
npm install
claude mcp add qlick-ads node ~/qlick-ads-mcp/dist/index.js \
  --env SUPABASE_URL=$env:SUPABASE_URL \
  --env SUPABASE_SERVICE_ROLE_KEY=$(node --env-file=.env.local -e "console.log(process.env.SUPABASE_SERVICE_ROLE_KEY)")
```

O se expone como HTTP en un Vercel Function (`/api/mcp` con auth de admin) para uso desde IDE.

### Fase 5 — Hardening & docs (28+ jul)

- Tests E2E de Playwright (`tests/playwright/ads-hub.spec.ts`) cubriendo las 5 rutas críticas.
- Entrada en `docs/STATUS.md` (snapshot vivo).
- Entrada en `docs/ROADMAP.md` marcando Fase completada.
- `docs/HANDOFF_v1.x.AI_ADS_HUB.md` con todo lo construido, riesgos conocidos, y planes siguientes.
- `data/PROJECT-LOG.md` actualizado.
- Seguridad: ejecutar `security-review` skill sobre los nuevos archivos antes de merge.

---

## 4. Riesgos conocidos & verificaciones críticas pre/post deploy

| # | Riesgo | Mitigación |
|---|---|---|
| 1 | **Cuenta publicitaria de Paul bloqueada por Meta** (rate limit 429 o suspensión) | Cron diario (no sub-diario), retry con backoff 2 intentos, scope `ads_read` exclusivo, App Empresarial interna. Si Meta bans, degradamos a modo demo con banner amarillo. |
| 2 | **Cron Hobby de Vercel** admite múltiples pero TODOS diarios. Sub-diario = NO se puede desde Vercel. | Cron daily `0 6 * * *`. Si en futuro queremos cada 6h, migrar a Supabase `pg_cron`. |
| 3 | **PII filtrada al LLM** (nombres, emails de leads) | Auditor de código: el payload solo contiene agregados numéricos. El esquema zod del LLM rechaza cualquier string que parezca email/teléfono. Test explícito verifica esto. |
| 4 | **Frecuencia alta falsa alarma** (audiencia pequeña real, no fatiga) | El LLM recibe `crm_agregado.leads_calificados` junto con la frecuencia. Si leads calificados crecen a la par de la frecuencia, NO es fatiga — es lo contrario. El prompt lo instruye explícitamente. |
| 5 | **Atribución UTM rota** si los formularios públicos no pasan UTM al backend | Auditoría pre-Fase 2: verificar que `/contacto`, `/eventos/[slug]/registro`, etc. propagan UTM. Si no, agregarlos en handler (sin tocar el bot). |
| 6 | **Costo del LLM** (DeepSeek Flash ≈ $0.0001–0.0003 por llamada; Claude Sonnet ≈ 30× más) | Cache 6h vía `meta_ai_insights.expires_at`. Default DeepSeek Flash, fallback solo si falla el schema validation 2 veces seguidas. |
| 7 | **Re-deploy post-evento podría romper scripts en vuelo** | El branch de Ads Hub se crea DESPUÉS del evento, no se toca main. Si el 11-jul la rama activa tiene cambios sin mergear a main, se prioriza cierre de fase antes de ads. |

---

## 5. Decisiones que te toca tomar a vos (recomendaciones incluidas)

- **Pregunta 1 — IA provider para el auditor:** Te recomiendo **DeepSeek Flash como default** con **Anthropic Sonnet 4.6 como fallback** (cuando el schema zod falla 2 veces seguidas). Razón: David ya usa DeepSeek Flash en otros lados (cost-effective en $), pero para diagnostics críticos donde la calidad importa más (ej: alerta "fatigue" que mueve dinero real), fallback a Claude. ¿OK? *Si preferís Claude-first, aumentamos costo pero baja riesgo de falsos negativos.*
- **Pregunta 2 — Frecuencia del cron:** te recomiendo **diario a las 06:00 hora CDMX** (justo después del corte nocturno de Meta cuando ya consolidó métricas del día anterior). Razón: 1/día es el techo seguro en Vercel Hobby. Si necesitás más fino, lo migramos a Supabase `pg_cron` en Fase 5. ¿OK?
- **Pregunta 3 — Branch target:** cuando arranquemos Fase 1 el 11-jul, ¿trabajamos sobre `feat/fase-N-ai-ads-hub` y mergeamos a main cuando cierres fase? ¿O querés que sea rama aislada hasta tener todo verde? *Recomiendo lo primero: merges chicos, rollback barato.*

> Si contestás esas 3 cosas (o decís "procede con esos defaults"), arrancamos Fase 1 el 11-jul sin pérdidas de tiempo.

---

## 6. Guía de 3 minutos para Paul — System User Token de Meta Ads

> *Esto es para que se la mandes a Paul por WhatsApp cuando esté listo. NO se hace antes del evento.*

**Lo que necesita Paul dentro de Meta Business Manager:**

1. Entrar a **business.facebook.com** con la cuenta de Paul.
2. **Settings → Business Integrations → System Users** (o ir directo a `business.facebook.com/settings/system-users`).
3. Clic en **Add** → nombre: `qlick_ads_reader` → rol: **Employee** → **Create**.
4. En el system user recién creado, clic en **Assign Assets** → seleccionar el ad account (`act_xxxxxxxx`) → rol: **View** (solo lectura).
5. Clic en **Generate New Token** → app: la misma app "Qlick Bot" (que ya existe para WhatsApp, NO crear nueva) → scope: **SOLO marcar `ads_read`** → expiración: **Never** → **Generate Token**.
6. Meta muestra el token UNA sola vez. **Copiar y mandármelo por canal seguro** (NO WhatsApp, idealmente 1Password o me lo dictás por llamada y lo borro del log).
7. Ad Account ID: en la URL del Ads Manager, `act_xxxxxxxxxxxx` o en **Business Settings → Ad Accounts** copiar el ID numérico.

**Variables de entorno resultantes** (yo las seteo en Vercel y `.env.local`):

```
META_ACCESS_TOKEN=EAAxxxxxxxxxxxxxxxxxxxx
META_AD_ACCOUNT_ID=act_123456789012345
```

**Lo que NO debe hacer:**

- No usar un token personal de Facebook — solo el del System User.
- No marcar `ads_management`, `business_management`, ni `ads_management` adicional — solo `ads_read`.
- No compartir el token por WhatsApp o email plano — canal seguro o llamada.

**Tiempo estimado para Paul:** 3 minutos si la app ya está creada (ya está). Si no, 10 minutos totales (1 de crear app nuevo + 3 de system user + 5 de cargar tarjeta del BM si hace falta, pero NO hace falta tarjeta para `ads_read` puro, solo para gastar).

---

## 7. Próximo paso concreto

**Esta rama es solo de planeación.** Cuando el evento del 10-jul termine y David dé luz verde:

1. Crear rama `feat/fase-1-ai-ads-hub` desde `main` actualizado.
2. Aplicar las 2 migraciones SQL (`meta_ads_snapshot_tables`, `leads_utm_columns`).
3. Implementar `snapshot-service.ts` + `/api/cron/meta-sync` + `tests/meta-sync.test.mjs`.
4. Auditar que los formularios públicos (`/contacto`, `/eventos/[slug]/registro`) propagan UTM antes de Fase 2.
5. Validar `npm run type-check && npm run lint && npm test && npm run build` verde.
6. Pedirle a Paul el System User Token (`META_ACCESS_TOKEN` + `META_AD_ACCOUNT_ID`) vía canal seguro.
7. Hacer primer sync real end-to-end. Documentar en `data/PROJECT-LOG.md`.
8. Si todo verde → merge a `main` y arrancar Fase 2.

---

## 8. Changelog del documento

- **2026-07-09 10:06 MST** — Documento creado en rama `docs/fase-A-ads-hub-plan` desde `main` limpio. Reconstruido tras reparación de sesión Mavis `mvs_56c0dd2dfeaa42f695393b08bb781ebd`. Stash previo preservado en `stash@{0}: stripe-fase2-audit-2026-07-08-preserved-before-ads-hub`.