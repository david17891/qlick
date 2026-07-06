-- ============================================================
-- event_surveys UNIQUE + postgREST schema reload
-- ============================================================
-- 2 fixes detectados por la auditoría de resiliencia (QA
-- funnel-simulation-tester, sesión 2026-07-06 ~01:30):
--
-- FIX #6: UNIQUE constraint faltante en event_surveys.
--   Síntoma: dos requests concurrentes a /api/submit-survey con el
--   mismo token pueden pasar la validación inicial, ambos hacen
--   createSurvey, ambos crean filas duplicadas en event_surveys.
--   Después el markSurveyTokenUsed solo afecta al primero (UPDATE
--   con .is("submitted_survey_id", null)), dejando el segundo
--   survey huérfano con score calculado, crm_tasks duplicadas,
--   audit_log duplicado, email Brevo duplicado, follow-up WhatsApp
--   duplicado al lead.
--
--   Fix: UNIQUE constraints parciales (Postgres permite múltiples
--   NULLs en UNIQUE, así que usamos WHERE para cada campo opcional).
--   - (event_id, phone_normalized) WHERE phone_normalized NOT NULL
--   - (event_id, respondent_email)  WHERE respondent_email NOT NULL
--   - (event_id, attendee_id)       WHERE attendee_id NOT NULL
--
-- FIX #7: event_survey_tokens da PGRST205 "table not found in
--   schema cache". El endpoint /api/submit-survey falla con este
--   error en producción porque PostgREST no refrescó el cache
--   después de que se aplicó la migration 20260703180000.
--
--   Fix: NOTIFY pgrst, 'reload schema' al final de la migration.
--   Esto fuerza a PostgREST a re-leer el schema inmediatamente.
--   NOTIFY requiere que la sesión esté conectada al listener de
--   pgrst — funciona desde el SQL Editor del dashboard.
--
-- Idempotente: CREATE UNIQUE INDEX IF NOT EXISTS.
-- ============================================================

-- FIX #6: UNIQUE constraints en event_surveys.
create unique index if not exists event_surveys_event_phone_unique
  on public.event_surveys (event_id, phone_normalized)
  where phone_normalized is not null;

create unique index if not exists event_surveys_event_email_unique
  on public.event_surveys (event_id, respondent_email)
  where respondent_email is not null;

create unique index if not exists event_surveys_event_attendee_unique
  on public.event_surveys (event_id, attendee_id)
  where attendee_id is not null;

comment on index public.event_surveys_event_phone_unique is
  'FIX 2026-07-06 (QA funnel-audit): previene doble-submit concurrente (race condition entre /api/submit-survey y wizard WhatsApp). 1 survey por (evento, phone).';
comment on index public.event_surveys_event_email_unique is
  'FIX 2026-07-06 (QA funnel-audit): previene doble-submit por email. 1 survey por (evento, email).';
comment on index public.event_surveys_event_attendee_unique is
  'FIX 2026-07-06 (QA funnel-audit): previene doble-submit por attendee. 1 survey por (evento, attendee).';

-- FIX #7: forzar reload de PostgREST schema cache para que la tabla
-- event_survey_tokens (creada en 20260703180000) sea visible.
-- Esto es idempotente y seguro de correr múltiples veces.
-- Aplicar via SQL Editor del dashboard (no via pg client directo,
-- porque el listener de pgrst solo escucha a sesiones conectadas
-- vía el proxy de Supabase).
NOTIFY pgrst, 'reload schema';
