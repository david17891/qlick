-- ============================================================
-- Stripe live hardening — pagos, eventos y servicios
--
-- Objetivo: conservar referencias Stripe estables entre
-- Checkout Session -> PaymentIntent -> Charge -> Refund/Dispute,
-- separar el estado de pago del estado CRM de service_orders y
-- registrar recibos de webhook para idempotencia operacional.
--
-- No contiene secretos ni activa el modo live. Aplicar primero en
-- staging y verificar con `scripts/apply-migration-management.mjs`.
-- ============================================================

alter table public.payments
  add column if not exists stripe_session_id text,
  add column if not exists stripe_payment_intent_id text,
  add column if not exists stripe_charge_id text,
  add column if not exists stripe_mode text not null default 'test';

alter table public.payments
  drop constraint if exists payments_status_check;
alter table public.payments
  add constraint payments_status_check
  check (status in (
    'pending', 'approved', 'rejected', 'expired', 'refunded',
    'failed', 'disputed', 'suspicious_amount_discrepancy'
  ));

alter table public.payments
  drop constraint if exists payments_stripe_mode_check;
alter table public.payments
  add constraint payments_stripe_mode_check
  check (stripe_mode in ('test', 'live'));

create index if not exists payments_stripe_payment_intent_idx
  on public.payments (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;
create index if not exists payments_stripe_charge_idx
  on public.payments (stripe_charge_id)
  where stripe_charge_id is not null;
create unique index if not exists payments_stripe_session_unique
  on public.payments (stripe_session_id)
  where stripe_session_id is not null;

comment on column public.payments.stripe_session_id is
  'Checkout Session ID (cs_test_* o cs_live_*). Referencia primaria del checkout de cursos.';
comment on column public.payments.stripe_payment_intent_id is
  'PaymentIntent ID asociado al Checkout Session; permite correlacionar refunds/disputes.';
comment on column public.payments.stripe_charge_id is
  'Charge ID asociado al PaymentIntent; se llena cuando Stripe lo entrega.';
comment on column public.payments.stripe_mode is
  'Modo Stripe de la operación: test o live. No se infiere del entorno al leer historiales.';

alter table public.event_payments
  add column if not exists stripe_session_id text,
  add column if not exists stripe_payment_intent_id text,
  add column if not exists stripe_charge_id text,
  add column if not exists stripe_mode text not null default 'test';

alter table public.event_payments
  drop constraint if exists event_payments_status_check;
alter table public.event_payments
  add constraint event_payments_status_check
  check (status in (
    'pending', 'approved', 'failed', 'refunded', 'cancelled',
    'paid_manual', 'disputed'
  ));

alter table public.event_payments
  drop constraint if exists event_payments_stripe_mode_check;
alter table public.event_payments
  add constraint event_payments_stripe_mode_check
  check (stripe_mode in ('test', 'live'));

create index if not exists event_payments_stripe_payment_intent_idx
  on public.event_payments (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;
create index if not exists event_payments_stripe_charge_idx
  on public.event_payments (stripe_charge_id)
  where stripe_charge_id is not null;
create unique index if not exists event_payments_stripe_session_unique
  on public.event_payments (stripe_session_id)
  where stripe_session_id is not null;

comment on column public.event_payments.stripe_session_id is
  'Checkout Session ID. Único por cobro online del evento.';
comment on column public.event_payments.stripe_payment_intent_id is
  'PaymentIntent ID para reconciliación automática de refunds/disputes.';
comment on column public.event_payments.stripe_charge_id is
  'Charge ID del cobro confirmado, cuando está disponible.';
comment on column public.event_payments.stripe_mode is
  'Modo Stripe de la operación: test o live.';

alter table public.service_orders
  add column if not exists payment_status text not null default 'pending',
  add column if not exists paid_at timestamptz,
  add column if not exists stripe_session_id text,
  add column if not exists stripe_payment_intent_id text,
  add column if not exists stripe_charge_id text;

alter table public.service_orders
  drop constraint if exists service_orders_payment_status_check;
alter table public.service_orders
  add constraint service_orders_payment_status_check
  check (payment_status in (
    'pending', 'processing', 'paid', 'failed', 'refunded', 'disputed'
  ));

create index if not exists service_orders_payment_status_idx
  on public.service_orders (payment_status);
create unique index if not exists service_orders_stripe_session_unique
  on public.service_orders (stripe_session_id)
  where stripe_session_id is not null;
create index if not exists service_orders_stripe_payment_intent_idx
  on public.service_orders (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

comment on column public.service_orders.payment_status is
  'Estado del cobro, separado de status (workflow CRM). El webhook Stripe solo modifica este campo y registra payment_received.';

create table if not exists public.stripe_webhook_receipts (
  event_id       text primary key,
  event_type     text not null,
  stripe_mode    text not null default 'test',
  status         text not null default 'received',
  received_at    timestamptz not null default now(),
  processed_at   timestamptz,
  error_message  text,
  metadata       jsonb not null default '{}'::jsonb,
  constraint stripe_webhook_receipts_mode_check
    check (stripe_mode in ('test', 'live')),
  constraint stripe_webhook_receipts_status_check
    check (status in ('received', 'processed', 'failed', 'ignored'))
);

create index if not exists stripe_webhook_receipts_type_idx
  on public.stripe_webhook_receipts (event_type, received_at desc);
create index if not exists stripe_webhook_receipts_failed_idx
  on public.stripe_webhook_receipts (received_at desc)
  where status = 'failed';

alter table public.stripe_webhook_receipts enable row level security;
drop policy if exists stripe_webhook_receipts_service_read on public.stripe_webhook_receipts;
create policy stripe_webhook_receipts_service_read on public.stripe_webhook_receipts
  for select to service_role using (true);
drop policy if exists stripe_webhook_receipts_service_write on public.stripe_webhook_receipts;
create policy stripe_webhook_receipts_service_write on public.stripe_webhook_receipts
  for insert to service_role with check (true);
drop policy if exists stripe_webhook_receipts_service_update on public.stripe_webhook_receipts;
create policy stripe_webhook_receipts_service_update on public.stripe_webhook_receipts
  for update to service_role using (true) with check (true);

comment on table public.stripe_webhook_receipts is
  'Ledger técnico de eventos Stripe verificados. No contiene PII; sirve para idempotencia, retries y auditoría operativa.';
