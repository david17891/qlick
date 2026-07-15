-- FIX sprint 2026-07-15e: tabla event_payments para registrar pagos de
-- eventos (Stripe online, efectivo en puerta, transferencia, etc).
-- Diferencia con `public.payments` (que es para cursos LMS):
-- - `event_payments` no requiere `auth.users.id` (el lead puede
--   pagar sin tener user de auth).
-- - `event_payments` referencia `event_confirmations` (no `courses`).
-- - `event_payments` soporta los metodos manuales (cash, transfer,
--   card_manual) ademas de stripe.
-- - `amount_mxn` es numeric (no integer en centavos) para soportar
--   decimales en el admin de pagos manuales.
-- - `status` incluye `paid_manual` (staff marco en puerta).
--
-- Esta tabla era referenciada por el codigo nuevo del sprint
-- pagos-manuales + sprint pago-en-puerta pero la migration
-- correspondiente NO se commiteo. El endpoint
-- /api/staff/check-in/mark-paid hacia INSERT aca, pero la tabla
-- no existia en prod. Esto es la migration que faltaba.
create table if not exists public.event_payments (
  id                   uuid primary key default gen_random_uuid(),
  confirmation_id      uuid not null references public.event_confirmations(id) on delete cascade,
  -- 'stripe' = pago en linea via Stripe. 'cash' / 'card_manual' /
  -- 'transfer' / 'other' = pago manual en puerta o admin.
  method               text not null,
  -- 'pending' = creado pero no confirmado. 'approved' = confirmado.
  -- 'failed' / 'refunded' / 'cancelled' = ciclo de vida terminado.
  status               text not null default 'approved',
  amount_mxn           numeric(10,2) not null,
  currency             text not null default 'MXN',
  -- Para Stripe: el session.id. Para cash: el staff email que cobro.
  -- Para otros: lo que sea que el caller quiera.
  external_reference   text,
  -- Notas libres del staff (opcional).
  notes                text,
  -- Metadata libre para extensibilidad (auditoria, debug, etc).
  metadata             jsonb default '{}'::jsonb,
  -- Idempotency_key opcional. Si se pasa, UNIQUE (confirmation_id,
  -- idempotency_key) para evitar duplicados si el webhook corre 2x.
  idempotency_key      text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- CHECK constraints via DO block (idempotente).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'event_payments_method_check') then
    alter table public.event_payments
      add constraint event_payments_method_check
      check (method in ('stripe', 'cash', 'card_manual', 'transfer', 'other', 'simulated_event_payment'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'event_payments_status_check') then
    alter table public.event_payments
      add constraint event_payments_status_check
      check (status in ('pending', 'approved', 'failed', 'refunded', 'cancelled', 'paid_manual'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'event_payments_amount_check') then
    alter table public.event_payments
      add constraint event_payments_amount_check
      check (amount_mxn >= 0);
  end if;
end $$;

-- Idempotencia para pagos manuales (staff puede cobrar 2 veces
-- si reintenta; el segundo es no-op).
create unique index if not exists event_payments_manual_idempotency
  on public.event_payments(confirmation_id, method, idempotency_key)
  where idempotency_key is not null;

-- Indices para queries del admin de eventos.
create index if not exists idx_event_payments_confirmation
  on public.event_payments(confirmation_id);
create index if not exists idx_event_payments_method
  on public.event_payments(method);
create index if not exists idx_event_payments_status
  on public.event_payments(status) where status in ('pending', 'approved', 'paid_manual');

-- RLS: solo service-role y admins pueden ver/escribir. Los leads
-- no tienen acceso directo (usan el admin o el endpoint de pago).
alter table public.event_payments enable row level security;

-- Policy de lectura para service-role (admin via service role).
drop policy if exists event_payments_service_read on public.event_payments;
create policy event_payments_service_read on public.event_payments
  for select to service_role
  using (true);

-- Policy de inserción para service-role.
drop policy if exists event_payments_service_write on public.event_payments;
create policy event_payments_service_write on public.event_payments
  for insert to service_role
  with check (true);

-- Policy de update para service-role.
drop policy if exists event_payments_service_update on public.event_payments;
create policy event_payments_service_update on public.event_payments
  for update to service_role
  using (true)
  with check (true);

comment on table public.event_payments is
  'Registro de pagos de eventos. A diferencia de public.payments (que es para cursos LMS con auth.users), event_payments referencia event_confirmations y soporta pagos manuales (cash en puerta, transferencia) ademas de Stripe. La columna status incluye paid_manual para distinguir pagos hechos por el staff en puerta.';
comment on column public.event_payments.method is
  'Metodo de pago. stripe = online via Stripe. cash / card_manual / transfer / other = pago manual (puerta o admin). simulated_event_payment = del simulador dev.';
comment on column public.event_payments.status is
  'Estado del pago. pending = creado pero no confirmado. approved = confirmado (online o manual). paid_manual = alias de approved para distinguir pago-en-puerta vs pago-online en queries.';
