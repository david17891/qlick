-- ============================================================================
-- Rename event_reminder_log.resend_message_id → brevo_message_id
--
-- Auditoría profunda 2026-07-02 (G-8): migramos de Resend a Brevo el
-- 2026-07-02 (commit 7b0e271) pero la columna conservó el nombre legacy.
-- El cron /api/cron/event-reminders ahora guarda el ID de Brevo en una
-- columna que se llama "resend_message_id" — confunde debugging y grep.
--
-- Rename (no destructivo, idempotente).
-- ============================================================================

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'event_reminder_log'
      and column_name = 'resend_message_id'
  ) then
    alter table public.event_reminder_log
      rename column resend_message_id to brevo_message_id;
  end if;
end $$;

comment on column public.event_reminder_log.brevo_message_id is
  'ID que devuelve Brevo al enviar. Útil para correlacionar bounces/complaints. '
  'Renombrado desde resend_message_id en la migración 2026-07-02 '
  '(migración Resend → Brevo, commit 7b0e271).';
