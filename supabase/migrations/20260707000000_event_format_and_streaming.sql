-- ============================================================
-- Eventos virtuales + soporte de streaming
--
-- Contexto: Qlick hasta ahora solo modelaba eventos presenciales
-- (location = texto libre, check-in por QR en puerta). Con el
-- evento del 10 jul siendo 100% virtual, necesitamos soportar:
--
--   - Modalidad configurable: presencial / virtual / híbrido
--   - Link de streaming (YouTube Live, Zoom, FB Live, etc.)
--   - Nota de acceso (ej: "el link se desbloquea 10 min antes")
--
-- Decisiones de diseño:
--   1. `format` enum (in_person | virtual | hybrid). Default
--      `in_person` para NO romper eventos existentes.
--   2. `streaming_url` opcional. Constraint: si format ≠ in_person,
--      streaming_url es requerido (no se puede configurar virtual
--      sin link).
--   3. `streaming_provider` enum para analytics futuros y para
--      que el admin UI muestre hints contextuales. NO bloquea
--      el flow si David pone un provider no listado ("other").
--   4. `streaming_access_note` es un campo de texto libre para
--      casos como "link se abre 10 min antes del inicio" o
--      "necesitas registrarte con este email para recibir el link".
--
-- Esta migration es ADITIVA. No toca filas existentes. No cambia
-- RLS. No requiere regenerar el typegen para los demás flows
-- (los casts `as unknown` en event-mapper.ts lo absorben).
--
-- Próximas fases (NO en esta migration):
--   - Survey `attendance_check` type + trigger INSERT attendee
--     cuando el usuario responde "Sí" a "¿Asististe?"
--   - Email template dual con botón gate "Sí, voy → revela link"
--   - Bot WhatsApp: link streaming en vez de QR cuando format=virtual
--   - Reutilizar `event_attendees.source = 'zoom_export'` (el enum
--     ya lo incluye) como source canónica para attendance virtual
-- ============================================================

-- ------------------------------------------------------------
-- Enums
-- ------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'event_format') then
    create type public.event_format as enum ('in_person', 'virtual', 'hybrid');
  end if;
  if not exists (select 1 from pg_type where typname = 'event_streaming_provider') then
    create type public.event_streaming_provider as enum
      ('youtube_live', 'facebook_live', 'zoom', 'other');
  end if;
end$$;

-- ------------------------------------------------------------
-- Alter public.events
-- ------------------------------------------------------------
alter table public.events
  add column if not exists format public.event_format not null default 'in_person',
  add column if not exists streaming_url text,
  add column if not exists streaming_provider public.event_streaming_provider,
  add column if not exists streaming_access_note text;

-- ------------------------------------------------------------
-- Constraint: si format ≠ in_person, streaming_url es requerido.
-- ------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'events_streaming_url_required'
  ) then
    alter table public.events
      add constraint events_streaming_url_required
      check (
        format = 'in_person'
        or (format in ('virtual', 'hybrid') and streaming_url is not null)
      );
  end if;
end$$;

-- ------------------------------------------------------------
-- Indexes (filtrado admin: "mostrame solo eventos virtuales")
-- ------------------------------------------------------------
create index if not exists events_format_idx on public.events (format);

-- ------------------------------------------------------------
-- Comentarios documentales
-- ------------------------------------------------------------
comment on column public.events.format is
  'Modalidad del evento. Default in_person (preservar eventos legacy). virtual = sin sede física, hybrid = ambos.';
comment on column public.events.streaming_url is
  'Link de streaming del evento. Requerido cuando format ≠ in_person. Genérico: YouTube Live, Zoom, FB Live, etc.';
comment on column public.events.streaming_provider is
  'Provider de streaming (analítica + hints en admin UI). `other` para providers no listados.';
comment on column public.events.streaming_access_note is
  'Nota visible para el asistente (ej: "el link se desbloquea 10 min antes").';