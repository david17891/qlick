-- ============================================================
-- Sprint event-payment-progress v3 (2026-07-24, correccion #4 v3).
--
-- Proteccion contra cargos duplicados por concurrencia en
-- /api/payments/create-checkout.
--
-- ANTES: si dos requests POST /api/payments/create-checkout llegan
-- casi al mismo tiempo con el mismo confirmationId+paymentOption,
-- antes de que el webhook de Stripe haya creado un row "approved"
-- en event_payments, ambos pasan la verificacion de ledger
-- (collected=0) y crean dos Checkout Sessions diferentes en
-- Stripe. El cliente termina pagando dos veces.
--
-- AHORA: antes de crear el checkout, insertamos un row "intent"
-- en event_payments con:
--   - status = 'pending'
--   - idempotency_key = `checkout:${confirmationId}:${paymentOption}:${balanceVersion}`
--   - balanceVersion = floor(total_cents - collected_cents) en MXN
--     (un cambio en el saldo invalida intents previos).
--   - metadata con la timestamp y la request_ip para auditoria.
--
-- Si dos requests llegan a la vez, el segundo falla por unique
-- constraint y devolvemos 409. El cliente reintenta con el mismo
-- balance version (o un nuevo si ya paso mas tiempo) y todo bien.
--
-- Esta migration:
--   1. Anade el unique index event_payments_intent_idempotency_unique
--      sobre (confirmation_id, idempotency_key) WHERE idempotency_key
--      LIKE 'checkout:%' (solo intents, no pagos manuales que ya
--      tienen su propio index).
--   2. Pre-flight: verifica que no haya duplicados en la tabla
--      antes de crear el index. Si los hay, los lista y aborta
--      (no aplica el index sin limpieza manual).
--
-- IMPORTANTE: NO APLICAR A PRODUCCION todavia. Es entregable para
-- auditoria de Codex (correccion #4 v3). Se aplicara despues de
-- la re-auditoria y del OK de David.
-- ============================================================

-- 1. Pre-flight: verificar que no haya duplicados que rompan el
--    unique index. Si los hay, listarlos y abortar.
do $$
declare
  dup_count integer;
begin
  select count(*) into dup_count
  from (
    select confirmation_id, idempotency_key
    from public.event_payments
    where idempotency_key is not null
      and idempotency_key like 'checkout:%'
    group by confirmation_id, idempotency_key
    having count(*) > 1
  ) dups;
  if dup_count > 0 then
    raise exception 'event_payments_intent_idempotency: hay % pares (confirmation_id, idempotency_key) duplicados con prefijo "checkout:". Limpia manualmente antes de aplicar este index. Ver: select * from public.event_payments where idempotency_key like ''checkout:%'' group by confirmation_id, idempotency_key having count(*) > 1;', dup_count;
  end if;
end $$;

-- 2. Unique index para intents de checkout. Solo aplica a rows
--    con idempotency_key que arranca con 'checkout:' (los pagos
--    manuales usan 'manual_admin:' y tienen su propio index).
create unique index if not exists event_payments_intent_idempotency_unique
  on public.event_payments (confirmation_id, idempotency_key)
  where idempotency_key is not null
    and idempotency_key like 'checkout:%';

comment on index public.event_payments_intent_idempotency_unique is
  'Proteccion contra cargos duplicados por concurrencia (sprint 2026-07-24 v3). Un intent de checkout por (confirmation_id, balance_version). Pago manual NO entra aca (otro prefijo).';
