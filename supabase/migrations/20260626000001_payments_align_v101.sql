-- ============================================================
-- v1.0.1 — Alineación de payments con la capa legacy
--
-- AUDITORÍA (2026-06-26): el proyecto YA TIENE una capa de pagos en
-- `src/lib/payments/` con `mockProvider`, stubs de Stripe/MercadoPago/Conekta
-- y types en `@/types` (Payment, PaymentStatus, PaymentMethod). El schema
-- de v1.0.0 estaba en paralelo y duplicaba nombres.
--
-- Esta migración alinea `payments` y `course_access` con la convención legacy:
--
-- Cambios en `public.payments`:
--   - Renombra `provider_payment_id` → `external_reference`
--   - Cambia default de `provider` de 'simulated' → 'mock'
--   - Cambia CHECK de `provider` para incluir 'mock' (legacy)
--   - Cambia CHECK de `status` a valores legacy:
--       'pending' | 'approved' | 'rejected' | 'expired' | 'refunded'
--     (antes: 'pending' | 'paid' | 'failed' | 'refunded' | 'cancelled')
--   - Agrega columnas: method, coupon_id, discount_mxn, enrollment_id
--   - Mantiene `idempotency_key` (mi adición útil para el simulador)
--
-- Idempotente: usa DO blocks para rename y para drop/add CHECK.
-- ============================================================

-- ===========================================================
-- 1. Rename column: provider_payment_id → external_reference
-- ===========================================================
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payments'
      and column_name = 'provider_payment_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payments'
      and column_name = 'external_reference'
  ) then
    alter table public.payments rename column provider_payment_id to external_reference;
  end if;
end $$;

comment on column public.payments.external_reference is
  'Referencia externa del proveedor (MOCK-xxx, Stripe pi_xxx, etc.). Null en pagos pendientes sin external_ref.';

-- ===========================================================
-- 2. Replace provider CHECK: añadir 'mock', quitar 'simulated'
-- ===========================================================
do $$
begin
  -- Drop constraint viejo si existe con la lista anterior
  if exists (select 1 from pg_constraint where conname = 'payments_provider_check') then
    alter table public.payments drop constraint payments_provider_check;
  end if;
end $$;

alter table public.payments
  add constraint payments_provider_check
  check (provider in ('mock', 'mercadopago', 'stripe', 'conekta'));

-- Cambiar default
alter table public.payments
  alter column provider set default 'mock';

-- Migrar valores 'simulated' existentes a 'mock' (idempotente, no-op si ya están bien)
update public.payments set provider = 'mock' where provider = 'simulated';

-- ===========================================================
-- 3. Replace status CHECK: usar valores legacy
-- ===========================================================
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'payments_status_check') then
    alter table public.payments drop constraint payments_status_check;
  end if;
end $$;

alter table public.payments
  add constraint payments_status_check
  check (status in ('pending', 'approved', 'rejected', 'expired', 'refunded'));

-- Migrar valores existentes al mapping legacy (idempotente):
--   'paid'      -> 'approved'
--   'failed'    -> 'rejected'
--   'cancelled' -> ya no existe, mapeamos a 'rejected' (o se borra si no aplica)
update public.payments set status = 'approved' where status = 'paid';
update public.payments set status = 'rejected' where status = 'failed' or status = 'cancelled';

-- ===========================================================
-- 4. Add columns nuevas (alinear con @/types Payment)
-- ===========================================================
alter table public.payments
  add column if not exists method text,
  add column if not exists coupon_id text,
  add column if not exists discount_mxn integer not null default 0,
  add column if not exists enrollment_id uuid;

-- CHECK de method (idempotente)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'payments_method_check') then
    alter table public.payments
      add constraint payments_method_check
      check (method is null or method in ('card', 'oxxo', 'spei', 'wallet', 'coupon', 'free'));
  end if;
end $$;

-- FK opcional a enrollments (nullable, ON DELETE SET NULL)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'payments_enrollment_id_fkey'
  ) then
    alter table public.payments
      add constraint payments_enrollment_id_fkey
      foreign key (enrollment_id) references public.enrollments(id) on delete set null;
  end if;
end $$;

comment on column public.payments.method is
  'Método de pago del usuario. null en pagos legacy (pre-v1.0.1) sin método. Coincide con PaymentMethod legacy: card | oxxo | spei | wallet | coupon | free.';
comment on column public.payments.coupon_id is
  'ID del cupón aplicado (text libre, sin FK porque coupons no tiene tabla real todavía).';
comment on column public.payments.discount_mxn is
  'Monto descontado en MXN (centavos). Default 0.';
comment on column public.payments.enrollment_id is
  'FK opcional a enrollments. Se llena cuando el pago activa una inscripción.';

-- ===========================================================
-- 5. Add CHECK de amount consistente con discount (rechaza negative totals)
-- ===========================================================
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'payments_amount_consistent_check') then
    alter table public.payments
      add constraint payments_amount_consistent_check
      check (discount_mxn <= amount_mxn);
  end if;
end $$;

-- ===========================================================
-- 6. Update course_access: alineamos el access_source con la convención
--    (no requiere cambios, pero documentamos la intención)
-- ===========================================================
comment on column public.course_access.access_source is
  'Origen del acceso. mock_provider: cuando el pago fue via mockProvider (legacy). simulated_payment (legacy v1.0.0) sigue funcionando pero se prefiere mock_provider. free_course | manual_admin | stripe | mercadopago | conekta | coupon.';
