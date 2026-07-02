-- ============================================================================
-- event_reminder_log: tracking de recordatorios enviados (Fase 7a, Bloque 3)
--
-- El cron /api/cron/event-reminders corre cada 30 min y manda emails a los
-- confirmados de un evento:
--   - 24h antes del starts_at
--   - 2h antes del starts_at
--
-- Sin esta tabla, el cron mandaría duplicados cada vez que corra. La PK
-- compuesta (event_qr_token_id, reminder_kind) garantiza idempotencia: un
-- (token, "24h") solo se manda una vez.
--
-- Diseño:
--   - reminder_kind: '24h' | '2h' (futuro: '1h', 'post' si queremos más)
--   - sent_at: timestamp del envío (para debug + métricas)
--   - resend_message_id: ID de Resend (para tracking de bounces/complaints)
--   - error: texto si falló (loggeo, no rompe el flow)
--
-- No se modela como FK a event_qr_tokens para no bloquear deletes futuros;
-- el cron usa INNER JOIN pero un ON DELETE CASCADE podría agregarse si hace
-- falta limpieza.
-- ============================================================================

create table if not exists public.event_reminder_log (
  id                    uuid primary key default gen_random_uuid(),
  event_qr_token_id     uuid not null,
  event_id              uuid not null,
  reminder_kind         text not null
                        check (reminder_kind in ('24h', '2h')),
  attendee_email        text not null,
  attendee_name         text,
  sent_at               timestamptz not null default now(),
  resend_message_id     text,
  error                 text,

  -- Idempotencia: un (token, reminder_kind) solo se manda una vez.
  constraint event_reminder_log_unique
    unique (event_qr_token_id, reminder_kind)
);

create index if not exists event_reminder_log_event_id_idx
  on public.event_reminder_log (event_id, sent_at desc);

create index if not exists event_reminder_log_sent_at_idx
  on public.event_reminder_log (sent_at desc);

comment on table public.event_reminder_log is
  'Tracking de recordatorios automáticos por email. PK compuesta (token, kind) '
  'garantiza idempotencia. Insert IGNORE conflicts = cron puede correr 2+ '
  'veces en la misma ventana sin duplicar envíos.';

comment on column public.event_reminder_log.reminder_kind is
  '"24h" = recordatorio 24 horas antes del evento. "2h" = recordatorio 2 horas antes.';

comment on column public.event_reminder_log.resend_message_id is
  'ID que devuelve Resend al enviar. Útil para correlacionar bounces/complaints.';

-- RLS: solo service role lee/escribe (el cron usa admin client).
alter table public.event_reminder_log enable row level security;

-- Sin policies = anon y authenticated no pueden SELECT/INSERT.
-- El cron corre con service_role key via createSupabaseAdminClient().