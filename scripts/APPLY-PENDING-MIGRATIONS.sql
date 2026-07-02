-- ============================================================
-- Qlick LMS — Migraciones pendientes (bot_context_overrides + lead_profile)
-- ============================================================
-- APLICAR EN: https://supabase.com/dashboard/project/ugpejblymtbwtsoiykyj/sql/new
--
-- INSTRUCCIONES:
-- 1. Abrir el link de arriba (sesión logged-in en Supabase)
-- 2. Click en "New query" (si no está ya en el editor)
-- 3. Pegar TODO este bloque
-- 4. Click "Run" (o Ctrl+Enter)
-- 5. Esperar "Success. No rows returned"
--
-- ES IDEMPOTENTE: lo podés correr 2+ veces sin romper nada. Si ya están
-- aplicadas, simplemente devuelve "table already exists" y sigue.
--
-- SI ALGO FALLA: NO entres en pánico. Pegame el error y lo arreglamos.
-- ============================================================


-- ============================================================
-- MIGRATION 1: bot_context_overrides (override manual del operador)
-- ============================================================
create table if not exists public.bot_context_overrides (
  id              uuid primary key default gen_random_uuid(),
  bot_name        text not null default 'qlick-bot',
  context_key     text not null,
  context_value   text not null,
  priority        int  not null default 100,
  enabled         boolean not null default true,
  expires_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  updated_by      text,
  constraint bot_context_overrides_unique
    unique (bot_name, context_key)
);

create index if not exists bot_context_overrides_bot_idx
  on public.bot_context_overrides (bot_name);
create index if not exists bot_context_overrides_enabled_idx
  on public.bot_context_overrides (bot_name, enabled);

comment on table public.bot_context_overrides is
  'Contexto manual editable por bot. Sobreescribe defaults del prompt.';

drop trigger if exists bot_context_overrides_set_updated_at on public.bot_context_overrides;
create trigger bot_context_overrides_set_updated_at
  before update on public.bot_context_overrides
  for each row execute function public.set_updated_at();

alter table public.bot_context_overrides enable row level security;

create or replace function public.get_active_bot_overrides(p_bot_name text)
returns table (
  context_key text,
  context_value text,
  priority int
)
language sql
stable
as $$
  select context_key, context_value, priority
  from public.bot_context_overrides
  where bot_name = p_bot_name
    and enabled = true
    and (expires_at is null or expires_at > now())
  order by priority asc, updated_at desc;
$$;


-- ============================================================
-- MIGRATION 2: lead_profile (memoria larga persistente por lead)
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

drop policy if exists lead_profile_admin_select on public.lead_profile;
create policy lead_profile_admin_select on public.lead_profile
  for select to authenticated
  using (
    exists (select 1 from public.admin_users au where au.user_id = auth.uid())
  );

drop policy if exists lead_profile_admin_write on public.lead_profile;
create policy lead_profile_admin_write on public.lead_profile
  for all to authenticated
  using (
    exists (select 1 from public.admin_users au where au.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.admin_users au where au.user_id = auth.uid())
  );


-- ============================================================
-- VERIFICACIÓN (corre al final, te confirma que se aplicó bien)
-- ============================================================
-- Deberías ver 2 filas: bot_context_overrides (10 cols) y lead_profile (6 cols)
select
  table_name,
  (select count(*) from information_schema.columns c
   where c.table_name = t.table_name and c.table_schema = 'public') as columnas
from information_schema.tables t
where table_schema = 'public'
  and table_name in ('bot_context_overrides', 'lead_profile')
order by table_name;
