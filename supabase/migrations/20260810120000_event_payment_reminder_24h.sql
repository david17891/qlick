-- Recordatorio suave de pago para nuevas inscripciones de eventos de pago.
-- Solo se marca al crear una confirmación desde el formulario público o el
-- bot de WhatsApp; los registros históricos quedan fuera del flujo.

alter table public.event_confirmations
  add column if not exists payment_reminder_eligible_at timestamptz;

create index if not exists event_confirmations_payment_reminder_idx
  on public.event_confirmations (payment_reminder_eligible_at)
  where payment_reminder_eligible_at is not null
    and payment_status = 'pending';

create table if not exists public.event_payment_reminder_log (
  id              uuid primary key default gen_random_uuid(),
  confirmation_id uuid not null references public.event_confirmations(id) on delete cascade,
  reminder_kind   text not null default 'payment_24h',
  status          text not null default 'sending',
  sent_at         timestamptz,
  external_id     text,
  error           text,
  created_at      timestamptz not null default now(),
  constraint event_payment_reminder_log_kind_check
    check (reminder_kind = 'payment_24h'),
  constraint event_payment_reminder_log_status_check
    check (status in ('sending', 'sent', 'failed', 'skipped')),
  constraint event_payment_reminder_log_unique
    unique (confirmation_id, reminder_kind)
);

create index if not exists event_payment_reminder_log_status_idx
  on public.event_payment_reminder_log (status, created_at desc);

alter table public.event_payment_reminder_log enable row level security;
revoke all on table public.event_payment_reminder_log from anon, authenticated;
grant all on table public.event_payment_reminder_log to service_role;

comment on column public.event_confirmations.payment_reminder_eligible_at is
  'Marca el momento de alta de nuevas inscripciones de WhatsApp/formulario que pueden recibir un recordatorio suave de pago a las 24h. NULL excluye registros históricos/importados.';

comment on table public.event_payment_reminder_log is
  'Tracking idempotente del recordatorio suave de pago de inscripción. Un envío máximo por confirmation.';
