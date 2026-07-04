-- ============================================================
-- event_survey_tokens: tokens URL-safe para invites de encuesta
--
-- FIX 2026-07-03 (sesion David G-4): el funnel post-evento no se cierra
-- para walks-in porque no existe ruta publica `/encuesta/[token]`. Esta
-- tabla guarda los tokens unicos por (event_id + email/phone) que se
-- envian en el email post-evento.
--
-- Diferencia con event_qr_tokens:
--   - QR token: expires_at = event.endsAt + 6h. Es para check-in en puerta.
--   - Survey token: expires_at = event.endsAt + 30 dias. Es para encuestas
--     post-evento, debe sobrevivir semanas (la persona tarda en responder).
--
-- Idempotencia: UNIQUE(event_id, email) permite regenerar el token sin
-- duplicar (re-genera si ya existe y no fue usado).
--
-- Uso:
--   1. Admin dispara "send post-event surveys" desde /admin/eventos/[id].
--   2. Backend crea tokens para cada attendee+confirmation del evento.
--   3. Email con link /encuesta/[token] a cada uno.
--   4. Asistente abre el link, completa form, submit.
--   5. Backend crea event_surveys row + corre promoteSurveyToLead.
--   6. Backend marca este token como usado (submitted_survey_id).
-- ============================================================

create table if not exists public.event_survey_tokens (
  id                    uuid primary key default gen_random_uuid(),
  event_id              uuid not null references public.events(id) on delete cascade,
  token                 text not null unique,  -- crypto.randomBytes(24).toString('base64url') = 32 chars
  email                 text,                  -- denormalizado para query por (event_id, email)
  phone_normalized      text,                  -- denormalizado; alternativa a email para llegar al asistente
  attendee_id           uuid references public.event_attendees(id) on delete set null,
  confirmation_id       uuid references public.event_confirmations(id) on delete set null,
  expires_at            timestamptz not null,  -- event.endsAt + 30 dias por default
  sent_at               timestamptz,           -- cuando se envio el email (null = no enviado)
  submitted_survey_id   uuid references public.event_surveys(id) on delete set null,
  created_at            timestamptz not null default now()
);

create index if not exists idx_event_survey_tokens_event_id
  on public.event_survey_tokens (event_id);

create index if not exists idx_event_survey_tokens_phone
  on public.event_survey_tokens (phone_normalized);

-- Idempotencia: 1 token activo por (event_id, email).
-- Si email es null (alguien con solo phone), se permite mas de 1 token
-- para el mismo (event_id) sin phone. Aceptable: walk-ins sin email son raros.
create unique index if not exists event_survey_tokens_event_email_unique
  on public.event_survey_tokens (event_id, email)
  where email is not null;

alter table public.event_survey_tokens enable row level security;
-- Default-deny. Solo service role.

comment on table public.event_survey_tokens is
  'Tokens URL-safe unicos para invitar a asistentes a dejar su encuesta post-evento via ruta publica /encuesta/[token]. Generados al cerrar el evento (admin trigger o cron). Distinct de event_qr_tokens que es para check-in en puerta.';

comment on column public.event_survey_tokens.token is
  '32 chars base64url (192 bits entropia). URL-safe. UNIQUE. Se incluye en el link del email.';
comment on column public.event_survey_tokens.expires_at is
  'event.endsAt + 30 dias por default. Largo plazo para que la persona pueda responder aunque tarde.';
comment on column public.event_survey_tokens.sent_at is
  'Cuando se envio el email. Null = no enviado (puede pasar si el admin no disparo el blast).';
comment on column public.event_survey_tokens.submitted_survey_id is
  'FK a event_surveys.id cuando el asistente completo la encuesta. Null = pendiente.';
