-- ============================================================================
-- event_qr_tokens: UNIQUE constraint para evitar duplicados (auditoría 2026-07-01)
--
-- Bug: `generateQrToken()` en `bot-engine.ts:320` no tiene protección contra
-- race conditions. Si Meta reentrega el mismo webhook (o si el lead manda
-- email 2 veces muy rápido), se insertan 2 rows en event_qr_tokens para el
-- mismo (event_id, attendee_phone_normalized). Resultado: el lead recibe
-- 2 links de check-in distintos, el staff ve duplicados en el admin.
--
-- Fix: UNIQUE constraint en (event_id, attendee_phone_normalized) donde
-- phone IS NOT NULL. Para tokens con phone NULL (edge case: lead sin phone,
-- creado manualmente), permitimos duplicados.
--
-- Idempotencia: la constraint es segura de aplicar en DB con datos
-- existentes — si hay duplicados, el ALTER falla con error. El bot
-- ya tiene UNIQUE implícito en el `token` (random 32 chars) por lo que
-- el riesgo de duplicados pre-existentes es bajo. Si falla, primero
-- borrar duplicados manualmente.
--
-- Después: actualizar el helper de generación para usar `ON CONFLICT DO
-- NOTHING` y devolver el token existente si ya hay uno.
-- ============================================================================

-- Primero limpiamos duplicados pre-existentes (si los hay) para que el
-- ALTER no falle. Conservamos el más antiguo.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'event_qr_tokens'
  ) then
    -- Borrar duplicados dejando el de menor id (más antiguo).
    delete from public.event_qr_tokens t1
    using public.event_qr_tokens t2
    where t1.event_id = t2.event_id
      and t1.attendee_phone_normalized is not null
      and t2.attendee_phone_normalized is not null
      and t1.attendee_phone_normalized = t2.attendee_phone_normalized
      and t1.id > t2.id;
  end if;
end$$;

-- Ahora sí la constraint.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'event_qr_tokens_event_phone_unique'
  ) then
    alter table public.event_qr_tokens
      add constraint event_qr_tokens_event_phone_unique
      unique (event_id, attendee_phone_normalized);
  end if;
end$$;

comment on constraint event_qr_tokens_event_phone_unique on public.event_qr_tokens is
  'Idempotencia: un mismo (evento, phone) solo puede tener UN token QR activo. '
  'Previene duplicados cuando Meta reentrega webhooks o el bot procesa el mismo '
  'email 2 veces. Para attendees sin phone (NULL), se permiten duplicados.';