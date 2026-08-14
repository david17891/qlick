-- Promotion pair orders for the CANACO event.
--
-- This migration is additive. It does not change the normal event checkout,
-- existing confirmations, payments, certificates or QR tokens. A promo order
-- owns one Stripe checkout for two seats and keeps participant identity
-- separate from the financial ledger so the second seat may remain unnamed.

create table if not exists public.event_promo_orders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  primary_confirmation_id uuid not null references public.event_confirmations(id) on delete restrict,
  status text not null default 'pending'
    check (status in ('pending', 'partial', 'paid', 'failed', 'cancelled', 'refunded', 'disputed')),
  total_amount_mxn numeric(10,2) not null default 1500,
  deposit_amount_mxn numeric(10,2) not null default 200,
  amount_paid_mxn numeric(10,2) not null default 0,
  currency text not null default 'MXN',
  payment_option text not null default 'reservation'
    check (payment_option in ('reservation', 'full')),
  stripe_session_id text,
  stripe_payment_intent_id text,
  stripe_mode text check (stripe_mode in ('test', 'live')),
  idempotency_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.event_promo_order_participants (
  id uuid primary key default gen_random_uuid(),
  promo_order_id uuid not null references public.event_promo_orders(id) on delete cascade,
  slot_number smallint not null check (slot_number in (1, 2)),
  confirmation_id uuid references public.event_confirmations(id) on delete set null,
  name text,
  email text,
  phone_raw text,
  phone_normalized text,
  identity_status text not null default 'identity_pending'
    check (identity_status in ('named', 'identity_pending')),
  certificate_status text not null default 'pending'
    check (certificate_status in ('pending', 'eligible', 'issued')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_promo_order_participants_slot_unique unique (promo_order_id, slot_number),
  constraint event_promo_order_participants_confirmation_unique unique (promo_order_id, confirmation_id)
);

-- One shared QR is attached to the order, not to a fictitious second person.
-- Existing per-person tokens remain untouched.
alter table public.event_qr_tokens
  add column if not exists promo_order_id uuid references public.event_promo_orders(id) on delete set null,
  add column if not exists is_shared_qr boolean not null default false,
  add column if not exists max_check_ins integer not null default 1,
  add column if not exists check_in_count integer not null default 0;

alter table public.event_payments
  add column if not exists promo_order_id uuid references public.event_promo_orders(id) on delete set null;

create unique index if not exists event_promo_orders_stripe_session_unique
  on public.event_promo_orders(stripe_session_id)
  where stripe_session_id is not null;
create unique index if not exists event_promo_orders_active_primary_unique
  on public.event_promo_orders(event_id, primary_confirmation_id)
  where status in ('pending', 'partial');
create unique index if not exists event_promo_qr_order_unique
  on public.event_qr_tokens(promo_order_id)
  where promo_order_id is not null;
create index if not exists event_promo_orders_event_status_idx
  on public.event_promo_orders(event_id, status, created_at desc);
create index if not exists event_promo_order_participants_order_idx
  on public.event_promo_order_participants(promo_order_id, slot_number);
create index if not exists event_payments_promo_order_idx
  on public.event_payments(promo_order_id)
  where promo_order_id is not null;

alter table public.event_promo_orders enable row level security;
alter table public.event_promo_order_participants enable row level security;
revoke all on table public.event_promo_orders from anon, authenticated;
revoke all on table public.event_promo_order_participants from anon, authenticated;
grant all on table public.event_promo_orders to service_role;
grant all on table public.event_promo_order_participants to service_role;

drop policy if exists event_promo_orders_service_all on public.event_promo_orders;
create policy event_promo_orders_service_all on public.event_promo_orders
  for all to service_role using (true) with check (true);
drop policy if exists event_promo_order_participants_service_all on public.event_promo_order_participants;
create policy event_promo_order_participants_service_all on public.event_promo_order_participants
  for all to service_role using (true) with check (true);

-- Atomic claim for a shared QR. The caller still validates payment/order state
-- before invoking it. A third concurrent scan cannot exceed the two-seat cap.
create or replace function public.claim_event_promo_qr_checkin(p_token text)
returns table (
  promo_order_id uuid,
  event_id uuid,
  check_in_number integer
)
language sql
security definer
set search_path = public
as $$
  update public.event_qr_tokens
  set check_in_count = check_in_count + 1
  where token = p_token
    and is_shared_qr = true
    and revoked_at is null
    and expires_at > now()
    and check_in_count < max_check_ins
  returning promo_order_id, event_id, check_in_count;
$$;

revoke all on function public.claim_event_promo_qr_checkin(text) from public, anon, authenticated;
grant execute on function public.claim_event_promo_qr_checkin(text) to service_role;

comment on table public.event_promo_orders is
  'Orden promocional de dos accesos. Un solo ledger de pago; no sustituye el checkout normal.';
comment on table public.event_promo_order_participants is
  'Hasta dos participantes por orden. El segundo puede quedar identity_pending sin crear una persona ficticia.';
comment on column public.event_qr_tokens.promo_order_id is
  'Enlace opcional a una orden promocional para un QR compartido.';
comment on column public.event_qr_tokens.is_shared_qr is
  'true cuando el token representa el grupo promocional y no a una sola persona.';
comment on column public.event_qr_tokens.max_check_ins is
  'Límite de accesos que puede consumir un QR compartido.';
comment on column public.event_qr_tokens.check_in_count is
  'Contador atómico de accesos consumidos por un QR compartido.';

notify pgrst, 'reload schema';
