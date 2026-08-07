-- ============================================================
-- 2026-08-06 — Tabla de intereses de servicios B2B, email nullable y relación en crm_tasks
-- ============================================================

-- 1. Crear enum service_interest_status si no existe
do $$
begin
  if not exists (select 1 from pg_type where typname = 'service_interest_status') then
    create type public.service_interest_status as enum (
      'detected',
      'contacted',
      'qualified',
      'won',
      'lost'
    );
  end if;
end
$$;

-- 2. Crear tabla public.lead_service_interests
create table if not exists public.lead_service_interests (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,
  service_slug text not null,
  variant_id uuid references public.service_variants(id) on delete set null,
  variant_slug text,
  category text not null,
  need_summary text not null default '',
  preferred_contact_time text,
  source text not null default 'whatsapp',
  campaign_key text,
  consent_basis text not null default 'inbound_service_request',
  status public.service_interest_status not null default 'detected',
  source_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Índices optimizados
create index if not exists idx_lead_service_interests_lead_status
  on public.lead_service_interests (lead_id, status);

create index if not exists idx_lead_service_interests_service_slug
  on public.lead_service_interests (service_slug);

create index if not exists idx_lead_service_interests_source
  on public.lead_service_interests (source);

create unique index if not exists idx_lead_service_interests_source_msg_id_unique
  on public.lead_service_interests (source_message_id)
  where source_message_id is not null;

-- RLS habilitado sin políticas públicas (solo accesible via service-role / backend)
alter table public.lead_service_interests enable row level security;

-- 3. Permitir email NULL en public.leads para captación directa de servicios desde WhatsApp
alter table public.leads alter column email drop not null;

-- 4. Agregar service_interest_id opcional a public.crm_tasks
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'crm_tasks' and column_name = 'service_interest_id'
  ) then
    alter table public.crm_tasks
      add column service_interest_id uuid references public.lead_service_interests(id) on delete set null;

    create index if not exists idx_crm_tasks_service_interest_id
      on public.crm_tasks (service_interest_id);
  end if;
end
$$;
