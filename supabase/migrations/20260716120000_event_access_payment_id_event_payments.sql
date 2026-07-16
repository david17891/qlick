-- FIX sprint 2026-07-16 (auditoria cobrar-en-puerta + pago-real test):
-- event_access.payment_id apuntaba a public.payments (tabla de cursos LMS)
-- pero el mark-paid endpoint y el flujo correcto insertan en
-- public.event_payments (tabla de eventos, migration 20260715120000).
-- Resultado: el INSERT en event_access.payment_id con un
-- event_payments.id tiraba 23503 (FK violation) silenciosamente,
-- y el access se creaba sin link al payment.
--
-- Este sprint:
-- 1) Mueve el FK de event_access.payment_id de public.payments a
--    public.event_payments (la tabla correcta para eventos).
-- 2) Actualiza el webhook handler de Stripe para insertar el payment
--    de eventos en event_payments (no en payments con course_id=null).
-- 3) Mantiene event_payments como la fuente de verdad del pago del
--    evento. event_access.payment_id la linkea.
--
-- Backward compat: event_access.payment_id queda NULL cuando no hay
-- link (legacy rows de antes de este fix, o grants sin payment).
-- ON DELETE SET NULL para no romper si el payment se borra.
--
-- Idempotente: usa DO block + pg_constraint checks.

do $$
declare
  current_target regclass;
  expected_target regclass := 'public.event_payments'::regclass;
  constraint_name text := 'event_access_payment_id_fkey';
begin
  -- 1) Identificar el FK actual de event_access.payment_id.
  select c.confrelid into current_target
  from pg_constraint c
  join pg_class t on c.conrelid = t.oid
  join pg_attribute a on a.attrelid = t.oid and a.attnum = c.conkey[1]
  where t.relname = 'event_access'
    and a.attname = 'payment_id'
    and c.contype = 'f';

  -- 2) Si el FK no existe, crearlo apuntando a event_payments.
  if current_target is null then
    if not exists (
      select 1 from pg_constraint c
      join pg_class t on c.conrelid = t.oid
      where t.relname = 'event_access' and c.conname = constraint_name
    ) then
      alter table public.event_access
        add constraint event_access_payment_id_fkey
        foreign key (payment_id) references public.event_payments(id)
        on delete set null;
    end if;
  -- 3) Si el FK existe pero apunta a la tabla incorrecta (public.payments),
  --    dropearlo y recrearlo apuntando a event_payments.
  elsif current_target != expected_target then
    alter table public.event_access drop constraint event_access_payment_id_fkey;
    alter table public.event_access
      add constraint event_access_payment_id_fkey
      foreign key (payment_id) references public.event_payments(id)
      on delete set null;
  end if;
  -- 4) Si ya apunta a event_payments, no hacer nada.
end $$;

-- Comentario del constraint para que el typegen regenerado lo refleje.
comment on constraint event_access_payment_id_fkey on public.event_access is
  'FK a event_payments.id (tabla de pagos de eventos). ON DELETE SET NULL: si el payment se borra, el access queda pero sin link al pago. Reemplaza el FK anterior a public.payments (que era de cursos).';
