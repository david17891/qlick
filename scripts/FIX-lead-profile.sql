-- ============================================================
-- FIX: crea la tabla lead_profile (la otra ya se aplicó OK)
-- ============================================================
-- El bloque anterior falló porque la policy RLS referenciaba
-- `public.admin_users`, que no existe en este dev DB.
--
-- Reemplazamos la policy por una permisiva (cualquier authenticated
-- puede leer/escribir). El bot engine usa `service_role` que bypasea
-- RLS de todas formas, así que esta permisividad es dev-only.
-- En producción reemplazamos por algo más estricto después.
--
-- PEGAR EN: https://supabase.com/dashboard/project/ugpejblymtbwtsoiykyj/sql/new
-- ============================================================

create table if not exists public.lead_profile (
  lead_id                uuid primary key references public.leads(id) on delete cascade,
  summary                text not null default '',
  messages_since_summary int  not null default 0,
  last_summary_at        timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists lead_profile_last_summary_idx
  on public.lead_profile (last_summary_at desc);

comment on table public.lead_profile is
  'Memoria larga persistente por lead. El bot regenera el summary cada N mensajes.';

create or replace function public.lead_profile_touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists lead_profile_touch_updated_at on public.lead_profile;
create trigger lead_profile_touch_updated_at
  before update on public.lead_profile
  for each row execute function public.lead_profile_touch_updated_at();

alter table public.lead_profile enable row level security;

-- Policy permisiva: cualquier authenticated puede leer/escribir.
-- El bot usa service_role (bypasea RLS). En prod, restringir después
-- cuando exista admin_users.
drop policy if exists lead_profile_authenticated_all on public.lead_profile;
create policy lead_profile_authenticated_all on public.lead_profile
  for all to authenticated
  using (true)
  with check (true);

-- Service role (service_role JWT) bypasea RLS automáticamente.
-- No necesitamos policy explícita para service_role.

-- ============================================================
-- VERIFICACIÓN (corre al final, te confirma que se aplicó)
-- ============================================================
-- Esperás ver 2 filas: bot_context_overrides (10 cols) y lead_profile (6 cols)
select
  table_name,
  (select count(*) from information_schema.columns c
   where c.table_name = t.table_name and c.table_schema = 'public') as columnas
from information_schema.tables t
where table_schema = 'public'
  and table_name in ('bot_context_overrides', 'lead_profile')
order by table_name;
