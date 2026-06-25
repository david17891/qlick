-- ============================================================
-- v0.5.0 — Tablas de operaciones CRM: notes, tasks, interactions, audit.
--
-- Modelo de acceso (D-018): SOLO service role (bypass de RLS) accede a estas
-- tablas desde el backend. RLS ENABLE + sin políticas públicas = default-deny
-- para anon y authenticated. El admin se autentica vía Supabase Auth + allowlist
-- server-side, pero las operaciones usan createSupabaseAdminClient() (igual que
-- el INSERT de leads hoy).
--
-- Idempotente: todas las sentencias usan `if not exists` / `or replace`.
-- ============================================================

-- ------------------------------------------------------------
-- crm_notes — notas internas de un lead (no visibles para el lead)
-- ------------------------------------------------------------
create table if not exists public.crm_notes (
  id               uuid primary key default gen_random_uuid(),
  lead_id          uuid not null references public.leads(id) on delete cascade,
  body             text not null,
  created_by_email text not null,
  created_at       timestamptz not null default now()
);

create index if not exists crm_notes_lead_id_idx on public.crm_notes (lead_id);
create index if not exists crm_notes_created_at_idx on public.crm_notes (created_at desc);

alter table public.crm_notes enable row level security;
-- Sin políticas: default-deny. Solo service role (bypass RLS) accede.
comment on table public.crm_notes is
  'Notas internas del CRM sobre un lead. Acceso solo vía service role (RLS default-deny).';

-- ------------------------------------------------------------
-- crm_tasks — tareas de seguimiento de un lead
-- ------------------------------------------------------------
do $$ begin
  create type public.crm_task_status as enum ('pending', 'completed', 'cancelled');
exception when duplicate_object then null; end $$;

create table if not exists public.crm_tasks (
  id               uuid primary key default gen_random_uuid(),
  lead_id          uuid not null references public.leads(id) on delete cascade,
  title            text not null,
  description      text,
  status           public.crm_task_status not null default 'pending',
  due_at           timestamptz,
  created_by_email text not null,
  created_at       timestamptz not null default now(),
  completed_at     timestamptz
);

create index if not exists crm_tasks_lead_id_idx on public.crm_tasks (lead_id);
create index if not exists crm_tasks_status_idx on public.crm_tasks (status);
create index if not exists crm_tasks_due_at_idx on public.crm_tasks (due_at);

alter table public.crm_tasks enable row level security;
comment on table public.crm_tasks is
  'Tareas de seguimiento del CRM por lead. Acceso solo vía service role (RLS default-deny).';

-- ------------------------------------------------------------
-- lead_interactions — historial de interacciones con un lead
-- ------------------------------------------------------------
do $$ begin
  create type public.interaction_channel as enum ('whatsapp', 'email', 'phone', 'form', 'system');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.interaction_direction as enum ('inbound', 'outbound', 'system');
exception when duplicate_object then null; end $$;

create table if not exists public.lead_interactions (
  id               uuid primary key default gen_random_uuid(),
  lead_id          uuid not null references public.leads(id) on delete cascade,
  channel          public.interaction_channel not null default 'system',
  direction        public.interaction_direction not null default 'system',
  summary          text not null,
  metadata         jsonb default '{}'::jsonb,
  created_by_email text not null,
  created_at       timestamptz not null default now()
);

create index if not exists lead_interactions_lead_id_idx on public.lead_interactions (lead_id);
create index if not exists lead_interactions_created_at_idx on public.lead_interactions (created_at desc);

alter table public.lead_interactions enable row level security;
comment on table public.lead_interactions is
  'Historial de interacciones con un lead. Acceso solo vía service role (RLS default-deny).';

-- ------------------------------------------------------------
-- admin_audit_log — registro de acciones admin (quién hizo qué)
-- ------------------------------------------------------------
create table if not exists public.admin_audit_log (
  id               uuid primary key default gen_random_uuid(),
  actor_email      text not null,
  action           text not null,
  entity_type      text not null,
  entity_id        text,
  metadata         jsonb default '{}'::jsonb,
  created_at       timestamptz not null default now()
);

create index if not exists admin_audit_log_actor_idx on public.admin_audit_log (actor_email);
create index if not exists admin_audit_log_created_at_idx on public.admin_audit_log (created_at desc);
create index if not exists admin_audit_log_entity_idx on public.admin_audit_log (entity_type, entity_id);

alter table public.admin_audit_log enable row level security;
comment on table public.admin_audit_log is
  'Log de auditoría de acciones admin. Acceso solo vía service role (RLS default-deny).';
