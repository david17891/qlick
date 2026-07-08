-- ============================================================
-- event_certificates — Registro de certificados emitidos (eventos)
--
-- Sprint Certificados Concept C (sesion David 2026-07-08).
--
-- Por que tabla separada:
--   - attendees es el dato "asistio" (check-in por QR).
--   - event_certificates es el dato "se emitio el certificado"
--     (puede regenerarse sin perder el registro).
--   - Idempotencia: UNIQUE(event_id, attendee_id) garantiza que re-pedir
--     el cert del mismo asistente devuelve el mismo folio.
--   - Folio estable: aunque se regenere el PDF, el folio NO cambia.
--
-- Por que folio UNIQUE con regex enforced:
--   - Identidad del certificado para auditoria.
--   - Formato canonical: QLK-YYYY-XXXXX (4 anio + 5 random crypto-seguro).
--   - El regex en DB rechaza inserts invalidos (CHECK constraint).
--
-- Por que RLS admin-only (NO publico):
--   - El QR del cert apunta a /filosofia (landing de marca), NO a
--     /verify/{folio}. Por tanto el cert NO es verificable por folio.
--   - No hay endpoint publico SELECT — admin panel lo lee desde el
--     service role client.
--   - patron canónico del repo: auth.jwt() ->> 'app_role' (NO is_admin(),
--     que NO existe como helper en este repo).
-- ============================================================

create table if not exists public.event_certificates (
  id uuid primary key default gen_random_uuid(),

  -- Folio formato QLK-YYYY-XXXXX (regex enforced abajo).
  folio text not null,

  -- FK al evento. on delete cascade: si el evento se borra, sus certs se van
  -- (esto es coherente con el resto del modelo — borrar evento borra cascade).
  event_id uuid not null references public.events(id) on delete cascade,

  -- FK al asistente. on delete cascade: si el attendee se borra, su cert se va.
  attendee_id uuid not null references public.event_attendees(id) on delete cascade,

  -- Admin que emitio el cert (auditoria). Nullable para emisiones automaticas
  -- (futuro webhook de asistencia). ON DELETE SET NULL preserva el cert si
  -- el user admin se borra.
  issued_by_admin_id uuid references auth.users(id) on delete set null,

  -- Timestamp de emision (UTC timestamptz).
  issued_at timestamptz not null default now(),

  -- Variante de template. Por ahora solo 'concept-c'. CHECK permite escalar
  -- a 'concept-a' o 'concept-b' sin reescribir el CHECK.
  template_variant text not null default 'concept-c' check (
    template_variant in ('concept-a', 'concept-b', 'concept-c')
  ),

  -- Metadata extra para reconstruir el cert sin re-JOIN:
  -- { instructorName, instructorTitle, eventDateLong, eventTime,
  --   durationMinutes, location, courseLabel, ... }
  -- Esto permite regenerar el PDF sin re-querir attendee si la tabla
  -- event_attendees se actualiza (ej. cambio de nombre).
  metadata jsonb,

  -- Folio format check (Postgres regex). ^QLK-\d{4}-\d{5}$
  constraint event_certificates_folio_format_chk
    check (folio ~ '^QLK-[0-9]{4}-[0-9]{5}$')
);

-- UNIQUE folio (identidad del cert para auditoria y busqueda).
create unique index if not exists event_certificates_folio_unique
  on public.event_certificates (folio);

-- UNIQUE (event_id, attendee_id) — 1 cert por attendee por evento (idempotencia).
create unique index if not exists event_certificates_event_attendee_unique
  on public.event_certificates (event_id, attendee_id);

-- Indices secundarios para queries del admin (listar certs por evento, etc).
create index if not exists event_certificates_event_idx
  on public.event_certificates (event_id);
create index if not exists event_certificates_attendee_idx
  on public.event_certificates (attendee_id);
create index if not exists event_certificates_issued_at_idx
  on public.event_certificates (issued_at desc);

-- ============================================================
-- RLS
-- ============================================================
alter table public.event_certificates enable row level security;

-- DROP + CREATE para idempotencia (re-aplicar la migration no debe romper).
drop policy if exists event_certificates_admin_select on public.event_certificates;
create policy event_certificates_admin_select on public.event_certificates
  for select using (
    (auth.jwt() ->> 'app_role') in ('admin', 'instructor')
  );

-- INSERT/UPDATE/DELETE: no hay policy para usuario regular. Solo el admin
-- client (service role) puede escribir, y eso bypasea RLS implicitamente.
-- Si en el futuro queremos permitir insert desde admin panel via session
-- del admin, agregar policies equivalentes.

-- ============================================================
-- Trigger updated_at (re-uso del helper generico si existe)
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_proc where proname = 'set_updated_at'
  ) then
    create function public.set_updated_at() returns trigger as $body$
    begin
      new.updated_at = now();
      return new;
    end;
    $body$ language plpgsql;
  end if;
end$$;

-- Esta tabla NO tiene updated_at (es inmutable una vez emitida).
-- Si en el futuro permitimos regenerar, agregar columna + trigger.

-- ============================================================
-- Comentarios de tabla (documentacion viva)
-- ============================================================
comment on table public.event_certificates is
  'Registro de certificados de asistencia emitidos para eventos. Idempotente: 1 cert por (event, attendee). El QR del certificado apunta a /filosofia (landing de marca) — NO es verificable por folio. Sprint Concept C 2026-07-08.';

comment on column public.event_certificates.folio is
  'Identidad del cert formato QLK-YYYY-XXXXX (regex enforced). Estable para el mismo attendee: re-emitir conserva el folio.';

comment on column public.event_certificates.metadata is
  'Snapshot de los datos del cert (instructor, duracion, location) al momento de emision. Permite regenerar el PDF sin re-JOIN a event_attendees.';
