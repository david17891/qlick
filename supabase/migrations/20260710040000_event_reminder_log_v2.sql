-- Migration: 20260710040000_event_reminder_log_v2.sql
-- Generalizar el sistema de recordatorios para soportar:
--   - 3 ventanas: '24h' | '8am' (Phoenix) | '10am' (Phoenix)
--   - 2 canales: 'whatsapp' | 'email'
--   - Tracking de status por (attendee, ventana, canal)
--   - Idempotencia vía UNIQUE constraint
--   - external_id (Meta messageId o Brevo messageId)
--
-- Aplica al evento del 11 julio 2026 11:00 hrs Phoenix:
--   - 24h: 10 julio 11:00 hrs Phoenix (ya pasó, dispara manual)
--   - 8am: 11 julio 8:00 hrs Phoenix (3h antes)
--   - 10am: 11 julio 10:00 hrs Phoenix (1h antes)
--
-- David corre este script en su SQL Editor (Vercel env pull miente
-- para SUPABASE_SECRET_KEY; por eso David lo hace manual).

-- 1. Tabla nueva (no se rompe FK de la v1 existente).
create table if not exists public.event_reminder_log_v2 (
  id uuid primary key default gen_random_uuid(),

  -- Relación al evento (siempre requerida).
  event_id uuid not null references public.events(id) on delete cascade,

  -- Attendee: puede ser event_qr_token o lead (uno de los dos, no ambos).
  event_qr_token_id uuid references public.event_qr_tokens(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,

  -- Canal y ventana.
  channel text not null check (channel in ('whatsapp', 'email')),
  reminder_window text not null check (reminder_window in ('24h', '8am', '10am', '2h', '1h')),

  -- Tracking temporal.
  scheduled_at_utc timestamptz not null,  -- cuándo se debió enviar.
  sent_at_utc timestamptz,                -- cuándo se envió (null si pending/failed/skipped).

  -- Estado final.
  status text not null check (status in ('pending', 'sent', 'failed', 'skipped')) default 'pending',
  error text,                              -- mensaje de error si failed/skipped.
  external_id text,                        -- Meta messageId o Brevo messageId.

  -- Auditoría.
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Sanity: al menos uno de los attendees es no-null.
  constraint event_reminder_log_v2_attendee_xor check (
    (event_qr_token_id is not null)::int + (lead_id is not null)::int = 1
  )
);

-- 2. UNIQUE constraint para idempotencia (re-correr el cron no duplica).
-- Usamos COALESCE porque la constraint no permite NULL en columnas
-- UNIQUE; el truco estándar es coalesce a un sentinel uuid.
create unique index if not exists event_reminder_log_v2_uniq
  on public.event_reminder_log_v2 (
    coalesce(event_qr_token_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(lead_id,          '00000000-0000-0000-0000-000000000000'::uuid),
    reminder_window,
    channel
  );

-- 3. Index para queries del admin (status por evento).
create index if not exists event_reminder_log_v2_event_status_idx
  on public.event_reminder_log_v2 (event_id, status);

-- 4. Index para queries por scheduled_at (cron escanea "cuáles se deben enviar").
create index if not exists event_reminder_log_v2_scheduled_idx
  on public.event_reminder_log_v2 (scheduled_at_utc, status)
  where status in ('pending', 'failed');

-- 5. RLS: solo admin (vía service role) puede escribir. Lectura abierta
--    al rol authenticated para que el admin UI la pueda leer.
alter table public.event_reminder_log_v2 enable row level security;

drop policy if exists event_reminder_log_v2_read on public.event_reminder_log_v2;
create policy event_reminder_log_v2_read
  on public.event_reminder_log_v2
  for select
  to authenticated
  using (true);

-- Writes se hacen vía service role (bypasea RLS).

-- 6. Trigger para mantener updated_at.
create or replace function public.set_updated_at_v2()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists event_reminder_log_v2_updated_at on public.event_reminder_log_v2;
create trigger event_reminder_log_v2_updated_at
  before update on public.event_reminder_log_v2
  for each row execute function public.set_updated_at_v2();

-- 7. Comentarios.
-- FIX 2026-07-10 (David reporto ERROR 42601 syntax error en ||):
-- `comment on table/column ... is 'string'` NO soporta concatenacion con ||.
-- Hay que escribir un solo string literal. Dividimos en lineas con concatenacion
-- solo DENTRO del string con chr(10) o con varios statements, NO con ||.
comment on table public.event_reminder_log_v2 is
  'Tracking de recordatorios automaticos de eventos (Fase 7a v2). Soporta 3 ventanas (24h, 8am Phoenix, 10am Phoenix) y 2 canales (whatsapp, email). Idempotente via UNIQUE constraint sobre (attendee, ventana, canal).';

comment on column public.event_reminder_log_v2.reminder_window is
  'Ventana del recordatorio: 24h (24h antes), 8am (8 AM Phoenix del dia), 10am (10 AM Phoenix del dia), 2h, 1h.';

comment on column public.event_reminder_log_v2.channel is
  'Canal: whatsapp (Meta template o texto libre) o email (Brevo).';

comment on column public.event_reminder_log_v2.scheduled_at_utc is
  'Momento en UTC en que se debio enviar el recordatorio. Para 24h: starts_at - 24h. Para 8am Phoenix: 15:00 UTC del dia del evento. Para 10am Phoenix: 17:00 UTC del dia del evento.';

comment on column public.event_reminder_log_v2.status is
  'pending: aun no se envia. sent: enviado OK. failed: error al enviar (ver error). skipped: no se pudo enviar (sin telefono/email, lead bloqueado, etc).';
