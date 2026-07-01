-- ============================================================
-- Qlick LMS — Migración: handoff_requests (Fase 7a.3)
-- ============================================================
-- APLICAR EN: https://supabase.com/dashboard/project/ugpejblymtbwtsoiykyj/sql/new
--
-- Crea la tabla `handoff_requests` que guarda cada vez que un lead
-- clickea "Hablar con humano" en el bot. David puede verlos en el
-- dashboard o via SQL.
--
-- Query útil para ver los pendientes:
--   SELECT id, lead_name, lead_phone, lead_email, created_at, last_messages
--   FROM public.handoff_requests
--   WHERE status = 'pending'
--   ORDER BY created_at DESC
--   LIMIT 20;
-- ============================================================

create table if not exists public.handoff_requests (
  id              uuid primary key default gen_random_uuid(),
  lead_id         uuid references public.leads(id) on delete set null,
  lead_name       text not null default '',
  lead_phone      text not null,
  lead_email      text,
  last_messages   jsonb not null default '[]'::jsonb,
  status          text not null default 'pending'
                  check (status in ('pending', 'contacted', 'closed')),
  assigned_to     text,
  created_at      timestamptz not null default now(),
  contacted_at    timestamptz,
  closed_at       timestamptz,
  notes           text
);

create index if not exists handoff_requests_status_idx
  on public.handoff_requests (status, created_at desc);
create index if not exists handoff_requests_lead_idx
  on public.handoff_requests (lead_id, created_at desc);

comment on table public.handoff_requests is
  'Log de handoffs a humano. Cada click en "Hablar con humano" crea un row.';
comment on column public.handoff_requests.last_messages is
  'JSON array con los últimos N mensajes del lead (direction + body + timestamp).';
comment on column public.handoff_requests.status is
  'pending = esperando humano, contacted = humano respondió, closed = cerrado.';

alter table public.handoff_requests enable row level security;

drop policy if exists handoff_requests_authenticated_read on public.handoff_requests;
create policy handoff_requests_authenticated_read on public.handoff_requests
  for select to authenticated
  using (true);

drop policy if exists handoff_requests_service_role_write on public.handoff_requests;
create policy handoff_requests_service_role_write on public.handoff_requests
  for all to service_role
  using (true)
  with check (true);
