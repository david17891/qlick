-- FIX sprint 2026-07-15f (auditoria): event_access.access_source CHECK
-- no incluye 'event_pay_at_door'.
--
-- Bug encontrado durante la auditoria del sprint pago-en-puerta:
-- - El bot-engine de WhatsApp (commit c9d620d) llama
--   grantEventAccess({ source: 'event_pay_at_door', ... }) cuando
--   confirma la inscripcion de un lead (50-80% de los casos).
-- - La CHECK constraint original (migration 20260707100000_event_access.sql)
--   solo permite: 'event_purchase', 'simulated_event_payment',
--   'manual_event_admin', 'coupon', 'free_rsvp'.
-- - El INSERT revienta silenciosamente con error 23514 (check_violation).
-- - El try/catch del bot-engine loguea "no fatal" pero el event_access
--   no se crea, asi que el QR del lead queda sin derecho a entrar
--   (checkEventAccess revisa event_access.active).
-- - En la DB de prod: event_access count = 0 (ningun access del sprint).
--
-- Fix: extender el CHECK para incluir los valores del sprint pago mixto.
-- Tambien: relajar el UNIQUE INDEX para que NULLs (user_id nullable)
-- no sean todos iguales. Reemplazamos por un unique index que
-- considera (event_id, COALESCE(user_id, ...)) cuando access_status=active.
-- Pero como user_id puede ser NULL, mantenemos la logica original
-- (unique solo cuando user_id IS NOT NULL) y agregamos
-- un indice secundario por confirmation_id (que SI sera NOT NULL
-- para los nuevos flows).

do $$
begin
  -- 1) Drop + recreate access_source CHECK.
  if exists (
    select 1 from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    where t.relname = 'event_access' and c.conname = 'event_access_access_source_check'
  ) then
    alter table public.event_access
      drop constraint event_access_access_source_check;
  end if;
  if not exists (
    select 1 from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    where t.relname = 'event_access' and c.conname = 'event_access_access_source_check'
  ) then
    alter table public.event_access
      add constraint event_access_access_source_check
      check (access_source in (
        'event_purchase',         -- Stripe / MercadoPago / Conekta (futuro)
        'simulated_event_payment',-- simulator-webhook dev-only
        'manual_event_admin',     -- admin manual (ej. comp amigos)
        'coupon',                 -- 100% off
        'free_rsvp',              -- evento free, acceso sin pago
        'event_pay_at_door'       -- bot confirma inscripcion, staff cobra en puerta
      ));
  end if;
end $$;

comment on constraint event_access_access_source_check on public.event_access is
  'Origen del grant. event_purchase = Stripe online. event_pay_at_door = bot confirmo inscripcion, staff cobra en puerta. free_rsvp = evento free. manual_event_admin = admin manual. simulated_event_payment = dev only.';

-- 2) Agregar confirmation_id (nullable para grants viejos sin confirmation,
--    NOT NULL para nuevos flows del sprint pago mixto).
alter table public.event_access
  add column if not exists confirmation_id uuid
    references public.event_confirmations(id) on delete cascade;

-- 3) Indice secundario para queries "dame el access de esta confirmation".
create index if not exists event_access_confirmation_idx
  on public.event_access (confirmation_id)
  where confirmation_id is not null;

-- 4) Trigger updated_at (la tabla ya lo tiene via set_updated_at(),
--    pero lo registramos explicitamente para event_access).
-- (Ya creado en la migration 20260707100000_event_access.sql).
