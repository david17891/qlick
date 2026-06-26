-- ============================================================
-- v1.0.2 — Aplicar rename + replace CHECK de payments (FIX sin DO blocks)
--
-- CONTEXTO: v1.0.1 falló parcialmente porque Supabase SQL Editor no
-- aplicó los DO blocks (los ALTER TABLE directos sí funcionaron).
-- Estado actual verificado:
--   - provider_payment_id SÍ existe
--   - external_reference NO existe
--   - 1 fila con provider='simulated', status='pending'
--
-- Esta migración:
-- 1. RENAME COLUMN (no idempotente — solo correr UNA vez)
-- 2. ALTER TABLE directos (idempotentes con IF EXISTS / IF NOT EXISTS)
--
-- NOTA: si v1.0.2 falla por "column already exists", el rename ya se
-- hizo y podés skipepear el paso 1 y correr solo el resto.
-- ============================================================

-- 1. Rename (NO idempotente, asume que provider_payment_id existe)
alter table public.payments rename column provider_payment_id to external_reference;

-- 2. Drop CHECKs viejos (idempotente)
alter table public.payments drop constraint if exists payments_provider_check;
alter table public.payments drop constraint if exists payments_status_check;

-- 3. Migrar valores existentes a convención legacy
update public.payments set provider = 'mock' where provider = 'simulated';
update public.payments set status = 'approved' where status = 'paid';
update public.payments set status = 'rejected' where status in ('failed', 'cancelled');

-- 4. Add nuevos CHECKs
alter table public.payments
  add constraint payments_provider_check
  check (provider in ('mock', 'mercadopago', 'stripe', 'conekta'));

alter table public.payments
  add constraint payments_status_check
  check (status in ('pending', 'approved', 'rejected', 'expired', 'refunded'));

-- 5. Set default
alter table public.payments
  alter column provider set default 'mock';

-- 6. Comment
comment on column public.payments.external_reference is
  'Referencia externa del proveedor (MOCK-xxx, Stripe pi_xxx, etc.). Null en pagos pendientes sin external_ref.';
