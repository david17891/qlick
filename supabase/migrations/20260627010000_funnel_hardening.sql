-- ============================================================
-- Hardening del funnel de eventos (Fase 3)
--
-- Cierra los hallazgos del auditor externo (2026-06-27):
--  - [HIGH] lead_event_links_unique permitía que un mismo record de
--    evento (survey/confirmation/attendee) se vinculara a múltiples
--    leads. Fix: cambiar la constraint a (link_type, link_id).
--  - [MED]  event_survey_unmatched.survey_id no era UNIQUE, así que
--    el upsert de markSurveyUnmatched no funcionaba. Fix: índice único.
--  - [HIGH] leads no tenía UNIQUE sobre email/phone_normalized, así
--    que promoteSurveyToLead era check-then-act y podía duplicar
--    leads en paralelo. Fix: índices únicos parciales (WHERE NOT NULL).
--
-- Migración segura de aplicar: solo cambia constraints y crea índices.
-- No toca datos. Si una fila viola la nueva constraint (ej. un evento
-- importado antes del fix tiene una survey vinculada a 2 leads), el
-- ALTER falla. Ver nota "DATA INTEGRITY CHECK" abajo.
-- ============================================================

-- ------------------------------------------------------------
-- 1. lead_event_links_unique: (link_type, link_id)
--
-- Semántica nueva: cada record de evento (ej. una survey respondida
-- por una persona) se vincula a UN solo lead. La survey fue respondida
-- por UNA persona, no varias. Si se reintenta la promoción de la misma
-- survey, la constraint lo bloquea (y el código hace SELECT del
-- existente, en vez de duplicar).
-- ------------------------------------------------------------
alter table public.lead_event_links
  drop constraint if exists lead_event_links_unique;

alter table public.lead_event_links
  add constraint lead_event_links_unique
  unique (link_type, link_id);

-- DATA INTEGRITY CHECK: si había datos que violan la nueva constraint
-- (ej. 1 survey vinculada a 2 leads por la race previa), el ALTER
-- anterior falla. En ese caso, el operador debe decidir: deduplicar
-- los links manualmente, o descartar la migración.
--
-- Query para detectar violaciones pre-existentes:
--   SELECT link_type, link_id, COUNT(*)
--   FROM public.lead_event_links
--   GROUP BY link_type, link_id
--   HAVING COUNT(*) > 1;

-- ------------------------------------------------------------
-- 2. event_survey_unmatched.survey_id UNIQUE
--
-- El código hace upsert(... onConflict: "survey_id") pero la tabla
-- no tenía UNIQUE. El upsert funcionaba como INSERT ciego o fallaba
-- según la versión de Postgres. Con este índice, el upsert realmente
-- detecta el conflict y no duplica.
-- ------------------------------------------------------------
create unique index if not exists event_survey_unmatched_survey_id_key
  on public.event_survey_unmatched (survey_id);

-- ------------------------------------------------------------
-- 3. leads.email UNIQUE + agregar phone_normalized UNIQUE
--
-- Cierra la race de promoteSurveyToLead. El código ahora puede usar
-- upsert con onConflict: "email" (o "phone_normalized") y saber que
-- 2 inserts paralelos del mismo prospecto NO generan duplicados.
--
-- IMPORTANTE: la tabla leads NO tenía la columna phone_normalized
-- (solo la tienen las tablas de eventos de Fase 3). La agregamos
-- acá con default NULL y le creamos un índice único parcial. Los
-- leads existentes quedan con phone_normalized=NULL (no viola la
-- constraint parcial). El código que crea/actualiza leads DEBE
-- popular phone_normalized con el valor canónico (usar normalizePhone
-- de src/lib/crm/phone-utils.ts).
--
-- "Parcial" (WHERE NOT NULL) porque muchos leads pueden no tener
-- email o phone, y no queremos bloquear esos NULLs.
-- ------------------------------------------------------------

-- 3a. UNIQUE sobre email (la columna YA existe en leads).
create unique index if not exists leads_email_unique
  on public.leads (email)
  where email is not null;

-- 3b. Agregar la columna phone_normalized a leads (no existía).
-- Nullable: leads viejos quedan NULL. Nuevos inserts la popularán.
alter table public.leads
  add column if not exists phone_normalized text;

-- 3c. UNIQUE sobre phone_normalized (la nueva columna).
create unique index if not exists leads_phone_normalized_unique
  on public.leads (phone_normalized)
  where phone_normalized is not null;

-- ------------------------------------------------------------
-- Comentarios documentales.
-- ------------------------------------------------------------
comment on constraint lead_event_links_unique on public.lead_event_links is
  'Cada record de evento (survey/confirmation/attendee) se vincula a UN solo lead. Cierra race de duplicación (auditor 2026-06-27).';

comment on index event_survey_unmatched_survey_id_key is
  'Habilita upsert(... onConflict: "survey_id") en markSurveyUnmatched. Cierra duplicación de unmatched (auditor 2026-06-27).';

comment on index leads_email_unique is
  'Habilita upsert por email en promoteSurveyToLead, cerrando la race de check-then-act (auditor 2026-06-27).';

comment on index leads_phone_normalized_unique is
  'Habilita upsert por phone_normalized en promoteSurveyToLead, cerrando la race de check-then-act cuando no hay email (auditor 2026-06-27). Columna phone_normalized agregada por la misma migration (no existía antes).';

comment on column public.leads.phone_normalized is
  'Teléfono canónico E.164 (ej. +52XXXXXXXXXX). Nullable: leads existentes quedan NULL. Nuevos inserts DEBEN popularlo via normalizePhone(). Agregado en migration 20260627010000.';
