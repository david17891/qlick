-- ------------------------------------------------------------
-- public.handoff_requests — log de handoffs a humano (Fase 7a.3)
-- ------------------------------------------------------------
-- Cuando un lead clickea "Hablar con humano" en el welcome del bot,
-- se persiste un row acá con: nombre, teléfono, email, contexto, status.
-- David (o quien sea admin) lo ve en el dashboard o via SQL.
--
-- Status flow:
--   pending   → recién creado, esperando que un humano responda
--   contacted → humano ya respondió por WhatsApp directo
--   closed    → conversación cerrada (resuelta o descartada)
--
-- 1 fila por click en "Hablar con humano". Si el mismo lead clickea
-- varias veces (spam, retry), se acumulan rows.
-- ------------------------------------------------------------
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

-- Trigger updated_at por consistencia con el resto del schema.
create or replace function public.handoff_requests_touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- No agregamos trigger: la tabla no tiene updated_at propio.
-- Si en el futuro agregamos, usar la misma estructura que lead_profile.

-- ------------------------------------------------------------
-- RLS: solo admin/service_role pueden leer; service_role escribe
-- ------------------------------------------------------------
alter table public.handoff_requests enable row level security;

-- Policy permisiva (cualquier authenticated puede leer).
-- El bot engine usa service_role (bypasea RLS) para escribir.
drop policy if exists handoff_requests_authenticated_read on public.handoff_requests;
create policy handoff_requests_authenticated_read on public.handoff_requests
  for select to authenticated
  using (true);

drop policy if exists handoff_requests_service_role_write on public.handoff_requests;
create policy handoff_requests_service_role_write on public.handoff_requests
  for all to service_role
  using (true)
  with check (true);

-- ------------------------------------------------------------
-- Helper: query rápida de los handoffs pendientes
-- ------------------------------------------------------------
-- SELECT * FROM public.handoff_requests
-- WHERE status = 'pending'
-- ORDER BY created_at DESC
-- LIMIT 10;
