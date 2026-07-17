-- ============================================================
-- event_qr_tokens — agregar FK confirmation_id (nullable)
--
-- FIX 2026-07-17 (sprint event-payments manual flow, David feedback):
-- El bot-engine creaba QR tokens sin FK a event_confirmations. Eso
-- permitia que un QR "huerfano" (sin confirmation) existiera en BD.
-- El path `already_registered` del bot leia el QR token directo y decia
-- "ya estas registrado" sin validar que la confirmation existiera.
-- Resultado: el bot miente sobre el estado del registration y no puede
-- mostrar el payment_status.
--
-- Fix:
--   1. Agregar columna confirmation_id (nullable) a event_qr_tokens
--      con FK a event_confirmations(id) ON DELETE SET NULL.
--   2. Migrar QR tokens existentes: asociarlos a la confirmation
--      correcta via (event_id, attendee_phone_normalized) cuando
--      exista, NULL si no (QR huerfanos que el cleanup no agarro).
--   3. El bot-engine (sendQrPassForConfirmation) ya pasa confirmation_id
--      indirectamente: crea el QR con los datos de la confirmation.
--      Solo falta que el path use el confirmation_id directo en lugar
--      de duplicar datos.
--
-- Por que SET NULL y no CASCADE:
--   - Si borramos una confirmation (rollback, admin cleanup), el QR
--     se queda como evidencia del pase que existio. El path
--     `already_registered` del bot valida que la confirmation
--     exista antes de decir "ya estas registrado".
-- ============================================================

-- 1. Agregar columna nullable.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'event_qr_tokens'
      and column_name = 'confirmation_id'
  ) then
    alter table public.event_qr_tokens
      add column confirmation_id uuid;
  end if;
end $$;

-- 2. Backfill: asociar QR tokens existentes a su confirmation via
--    (event_id, attendee_phone_normalized) cuando exista, NULL si no.
update public.event_qr_tokens t
set confirmation_id = c.id
from public.event_confirmations c
where c.event_id = t.event_id
  and c.phone_normalized = t.attendee_phone_normalized
  and t.confirmation_id is null
  and t.attendee_phone_normalized is not null
  and t.attendee_phone_normalized not like '+1manual%';

-- 3. Para los sentinels '+1manual...' (sin phone real), intentar match
--    via email si existe.
update public.event_qr_tokens t
set confirmation_id = c.id
from public.event_confirmations c
where c.event_id = t.event_id
  and c.email = t.attendee_email
  and t.confirmation_id is null
  and t.attendee_email is not null;

-- 4. Agregar FK con ON DELETE SET NULL (idempotente).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'event_qr_tokens_confirmation_id_fkey'
  ) then
    alter table public.event_qr_tokens
      add constraint event_qr_tokens_confirmation_id_fkey
      foreign key (confirmation_id)
      references public.event_confirmations(id)
      on delete set null;
  end if;
end $$;

-- 5. Indice para queries por confirmation_id.
create index if not exists idx_event_qr_tokens_confirmation_id
  on public.event_qr_tokens(confirmation_id)
  where confirmation_id is not null;
