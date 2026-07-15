-- FIX sprint 2026-07-15e (auditoria): CHECK constraint
-- event_confirmations_payment_status_check no incluye
-- `paid_manual` ni `pending_verification`.
--
-- Contexto:
-- - Sprint pagos-manuales (5d4094c) introdujo `paid_manual` en el
--   codigo (lib/manual-payment.ts, /api/staff/check-in/mark-paid,
--   email template event-qr-pass.ts) y en src/types/events.ts
--   (EventConfirmationPaymentStatus).
-- - Sprint pago-en-puerta (2098d33, 9a128f2) usa `paid_manual` en
--   /api/staff/check-in/mark-paid (UPDATE payment_status='paid_manual').
-- - El CHECK original (creado en migration 20260715014706) solo
--   permite 'not_required', 'pending', 'paid', 'revoked' por lo que
--   cualquier intento de UPDATE a 'paid_manual' revienta con
--   error 23514 (check_violation).
--
-- Test E2E del sprint confirmo el bug: el endpoint /api/staff/check-in/mark-paid
-- respondio 200 pero el UPDATE fallo silenciosamente
-- (single update, sin transaccion, sin manejo de error 23514).
-- El lead queda en 'pending' aunque el staff hizo check-in.
--
-- Fix: extender el CHECK a la lista completa de valores
-- documentados en src/types/events.ts:
--   'not_required' (default para eventos gratuitos)
--   'pending' (registrado pero sin pago confirmado)
--   'paid' (pago online Stripe confirmado)
--   'paid_manual' (staff marco cobro en puerta o admin)
--   'pending_verification' (transferencia / SPEI sin comprobar)
--   'revoked' (rechazado por admin o lead)
--
-- El constraint es idempotente: usa DO block para dropear
-- solo si existe con la definicion vieja.

do $$
declare
  current_def text;
begin
  select pg_get_constraintdef(c.oid) into current_def
  from pg_constraint c
  join pg_class t on c.conrelid = t.oid
  where t.relname = 'event_confirmations'
    and c.conname = 'event_confirmations_payment_status_check';

  -- Solo dropear si la definicion actual NO incluye paid_manual.
  if current_def is not null and position('paid_manual' in current_def) = 0 then
    alter table public.event_confirmations
      drop constraint event_confirmations_payment_status_check;
  end if;
end $$;

-- Re-crear el CHECK con la lista completa (no-op si ya estaba bien).
do $$
begin
  if not exists (
    select 1 from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    where t.relname = 'event_confirmations'
      and c.conname = 'event_confirmations_payment_status_check'
  ) then
    alter table public.event_confirmations
      add constraint event_confirmations_payment_status_check
      check (payment_status in (
        'not_required',
        'pending',
        'paid',
        'paid_manual',
        'pending_verification',
        'revoked'
      ));
  end if;
end $$;

comment on constraint event_confirmations_payment_status_check on public.event_confirmations is
  'Estados validos de pago de la confirmation. not_required = evento gratuito. pending = registrado sin pago. paid = Stripe online confirmado. paid_manual = staff cobro en puerta. pending_verification = transferencia sin validar. revoked = rechazado.';
