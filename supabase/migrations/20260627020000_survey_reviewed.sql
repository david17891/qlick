-- ============================================================
-- Capa 4 de Fase 4: "Marcar como revisada" en encuestas
--
-- Agrega las columnas para que el admin pueda marcar una encuesta
-- como revisada (post-evento). Sin esto, el admin no tiene forma
-- de saber cuáles encuestas ya miró y cuáles no.
--
-- Privacidad: reviewed_by guarda el email del admin (NO PII de
-- leads, solo del admin que revisa). Es metadata interna.
-- ============================================================

alter table public.event_surveys
  add column if not exists reviewed_at timestamptz null;

alter table public.event_surveys
  add column if not exists reviewed_by text null;

-- Indice para queries tipo "dame las encuestas SIN revisar" (las que
-- el admin todavía no ha mirado). Sera util para el filtro de
-- "pendientes" en futuras features.
create index if not exists event_surveys_reviewed_at_idx
  on public.event_surveys (reviewed_at)
  where reviewed_at is null;

comment on column public.event_surveys.reviewed_at is
  'Timestamp de cuando el admin marco la encuesta como revisada. NULL = pendiente.';

comment on column public.event_surveys.reviewed_by is
  'Email del admin que reviso. Metadata interna, no PII de leads.';
