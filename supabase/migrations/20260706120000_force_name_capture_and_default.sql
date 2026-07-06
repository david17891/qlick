-- ============================================================
-- Forzar captura de nombre — defaults + check constraint
-- ============================================================
-- Sesion 2026-07-06 (post fresh-test): David decidio que TODO lead
-- y TODO attendee debe tener un nombre real. El flag `requires_name`
-- en events debe estar en true por default (no mas opcion de skip).
-- Ademas, leads.name debe tener una longitud valida (>=2, <=100) para
-- evitar nombres como "x", "Por", "Asistente".
--
-- Esta migration es ADITIVA:
--   1. Cambia el default de events.requires_name a true.
--   2. Backfillea requires_name=true en eventos existentes que
--      quedaron en false (e.g. los del fresh-test post-cleanup).
--   3. Agrega check constraint en leads.name para evitar nombres
--      invalidos en INSERT/UPDATE futuros.
--
-- NO aplica NOT NULL en leads.name (hay rows legacy con name=NULL
-- y eso no es bloqueante — solo queremos evitar NUEVOS nombres
-- invalidos, no romper data historica).
--
-- El bot-engine.ts valida placeholder names ANTES de persistir
-- (ver handler `provide_name`); el check constraint es la red de
-- seguridad a nivel DB.
-- ============================================================

-- 1. Default de events.requires_name = true
alter table public.events
  alter column requires_name set default true;

-- 2. Backfill: cualquier evento existente que este en false -> true
update public.events
  set requires_name = true
  where requires_name = false;

-- 3. Check constraint en leads.name: longitud valida (2-100 chars)
--    Aplica solo a valores no-NULL (legacy rows con NULL se permiten).
--    "x", "Por", "ab" son rechazados. "Asistente" (8 chars) pasa la
--    longitud pero el bot-engine.ts filtra placeholders antes de
--    persistir.
alter table public.leads
  drop constraint if exists leads_name_length_check;
alter table public.leads
  add constraint leads_name_length_check
  check (name IS NULL OR (char_length(trim(name)) >= 2 AND char_length(trim(name)) <= 100));

-- 4. Comentario documental
comment on column public.events.requires_name is
  'Si true, el bot pide nombre completo antes del email durante el flow de inscripcion. Default: true (sesion 2026-07-06, no se permite saltar el paso del nombre).';