-- ============================================================================
-- event_email_log: visibility de emails transaccionales de eventos (2026-07-03)
--
-- FIX P1 (auditoria pre-scanner): el wrapper de Brevo (`brevo-client.ts`)
-- solo loggea en consola. Cuando un email falla, el flow principal sigue
-- (best-effort) pero el admin no tiene forma de ver QUE falló. David testeó
-- el flujo y "no me llegó correo, mismo caso por ahora" (sesion 2026-07-03).
--
-- Esta tabla es el "resend dashboard" minimalista: cualquier email que sale
-- del sistema (QR pass + reminders automaticos) deja una fila con su estado.
-- Para el admin: SELECT en `/admin/eventos/[id]?tab=emails` o via endpoint
-- `/api/admin/emails/failed?eventId=...`.
--
-- Solo cubre emails de eventos. Emails internos (human-handoff, promotions)
-- siguen solo en consola — esos son raros y no necesitan dashboard.
--
-- Modelo:
--   - email_type: 'qr_pass' | 'reminder_24h' | 'reminder_2h'
--   - recipient: email destino (PII server-side, nunca anon-accessible)
--   - ok: TRUE si Brevo devolvió messageId, FALSE si tiró error
--   - error: texto del error de Brevo (si ok=FALSE)
--   - provider_message_id: ID que devolvió Brevo (para tracking webhooks
--     futuros: delivered, bounce, spam)
--   - sent_at: timestamp del envio
--
-- Idempotencia: NO enforced. Si el cron corre 2 veces (event_reminder_log
-- ya deduplica via PK compuesta), este log registra los 2 intentos. Esto
-- es INTENCIONAL — queremos ver si hay re-intentos fallando.
--
-- RLS: solo service role. anon/authenticated no pueden leer (es data
-- operativa sensible).
-- ============================================================================

create table if not exists public.event_email_log (
  id                    uuid primary key default gen_random_uuid(),
  email_type            text not null
                        check (email_type in ('qr_pass', 'reminder_24h', 'reminder_2h')),
  event_id              uuid references public.events(id) on delete cascade,
  event_qr_token_id     uuid,  -- nullable: qr_pass no siempre tiene token
  recipient             text not null,
  attendee_name         text,
  subject               text not null,
  ok                    boolean not null,
  error                 text,
  provider_message_id   text,
  sent_at               timestamptz not null default now()
);

create index if not exists event_email_log_event_id_idx
  on public.event_email_log (event_id, sent_at desc);

create index if not exists event_email_log_failed_idx
  on public.event_email_log (event_id, ok, sent_at desc)
  where ok = false;

create index if not exists event_email_log_recipient_idx
  on public.event_email_log (recipient, sent_at desc);

alter table public.event_email_log enable row level security;
-- Default-deny: sin policies. Solo service role (cron + bot + admin).

comment on table public.event_email_log is
  'Visibility de emails transaccionales de eventos (QR pass + reminders). '
  'Service role only. Permite al admin ver QUE emails fallaron sin tener '
  'que ir a Brevo. Para bounce/spam tracking avanzado, ver webhooks Brevo.';

comment on column public.event_email_log.email_type is
  'qr_pass = email del pase digital que manda el bot al registrarse. '
  'reminder_24h/2h = cron automatico antes del evento.';

comment on column public.event_email_log.ok is
  'TRUE = Brevo devolvio messageId (envio aceptado por Brevo). '
  'FALSE = error capturado en el wrapper (best-effort). '
  'NOTA: ok=TRUE NO garantiza entrega al inbox del usuario — solo que '
  'Brevo aceptó el send. Para delivered/bounce hay que integrar webhooks.';