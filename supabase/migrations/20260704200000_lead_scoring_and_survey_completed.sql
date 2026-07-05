-- ============================================================
-- Lead scoring + survey_completed status + qualification
-- ============================================================
-- Adds the columns needed to score leads from their post-event
-- survey and to track the funnel stage right after survey completion.
--
-- - leads.score: 0-100 quality score computed from survey responses
-- - leads.qualification: bucketed (cold/warm/hot/mql) derived from score
-- - leads.survey_offer_sent_at: timestamp del ultimo offer (anti-spam)
-- - lead_status enum gana 'survey_completed' (entre event_attended y interested)
--
-- PG note: ALTER TYPE ... ADD VALUE corre fuera de transaccion en
-- Supabase CLI (cada archivo = tx separada). No usamos el valor en
-- este mismo archivo para evitar "unsafe use of new enum value".
-- ============================================================

-- 1) Columnas de scoring
alter table public.leads
  add column if not exists score int
    check (score is null or (score >= 0 and score <= 100));

alter table public.leads
  add column if not exists qualification text
    check (qualification is null or qualification in ('cold','warm','hot','mql'));

alter table public.leads
  add column if not exists survey_offer_sent_at timestamptz;

create index if not exists leads_qualification_idx
  on public.leads (qualification)
  where qualification is not null;

create index if not exists leads_survey_offer_idx
  on public.leads (survey_offer_sent_at)
  where survey_offer_sent_at is not null;

comment on column public.leads.score is
  '0-100 quality score derivado de las respuestas de la encuesta post-evento. NULL hasta que se llene la encuesta.';
comment on column public.leads.qualification is
  'Bucketed score: cold<20 / warm 20-39 / hot 40-59 / mql 60+. Se setea junto con score.';
comment on column public.leads.survey_offer_sent_at is
  'Timestamp del ultimo survey offer enviado por el bot. Anti-spam: no re-ofrecer dentro de 24h.';

-- 2) Nuevo valor en lead_status enum
--    PG >= 12 soporta ADD VALUE fuera de transaccion.
alter type public.lead_status add value if not exists 'survey_completed' after 'event_attended';