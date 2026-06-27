-- ============================================================
-- v0.7.0 — Events Funnel Foundation
--
-- Tablas nuevas:
-- - public.events                    → catálogo de eventos (lectura pública si published)
-- - public.event_confirmations       → personas que confirmaron asistencia
-- - public.event_attendees           → quienes realmente asistieron
-- - public.event_surveys             → respuestas de encuesta (gatilla el consent)
-- - public.event_survey_unmatched    → prospectos con interés comercial sin consent
--                                       (visibilidad para el admin, NO se promueven a lead)
-- - public.lead_event_links          → tabla de join lead ↔ event record
--                                       (cierra el H2 de Fase 2: race en tags)
--
-- Modelo de seguridad (alineado con D-018, masterclass funnel y Fase 2 CRM):
-- - events: SELECT público SOLO si status='published' (anon, authenticated).
--           INSERT/UPDATE/DELETE: solo service role.
-- - event_confirmations / event_attendees / event_surveys /
--   event_survey_unmatched / lead_event_links:
--   SIN políticas públicas. RLS default-deny para anon y authenticated.
--   El importador y los server libs usan service role (bypass RLS).
-- - Privacy: nunca se exponen al cliente. Datos personales solo server-side.
--
-- Idempotente: sentencias con `if not exists` / `or replace`. Enums protegidos.
-- Decisión de producto (no marketing → no lead): D-2 del EVENTS_FUNNEL_CONCEPT
-- — "asistió sin confirmar" NO se promueve. Solo encuesta con consent.
-- ============================================================

-- ------------------------------------------------------------
-- Enums
-- ------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'event_status') then
    create type public.event_status as enum ('draft', 'published', 'archived');
  end if;
  if not exists (select 1 from pg_type where typname = 'event_confirmation_source') then
    create type public.event_confirmation_source as enum
      ('imported_excel', 'public_form', 'manual');
  end if;
  if not exists (select 1 from pg_type where typname = 'event_attendee_source') then
    create type public.event_attendee_source as enum
      ('check_in', 'imported_excel', 'zoom_export', 'manual');
  end if;
  if not exists (select 1 from pg_type where typname = 'lead_event_link_type') then
    create type public.lead_event_link_type as enum
      ('confirmation', 'attendee', 'survey');
  end if;
end$$;

-- ------------------------------------------------------------
-- public.events — catálogo de eventos
-- ------------------------------------------------------------
create table if not exists public.events (
  id               uuid primary key default gen_random_uuid(),
  slug             text unique not null,
  title            text not null,
  description      text,
  starts_at        timestamptz not null,
  ends_at          timestamptz,
  location         text,
  cover_image_url  text,
  status           public.event_status not null default 'draft',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists events_status_idx     on public.events (status);
create index if not exists events_starts_at_idx  on public.events (starts_at desc);
create index if not exists events_slug_idx       on public.events (slug);

alter table public.events enable row level security;

-- Lectura pública SOLO para eventos publicados.
create policy "events_public_read_published"
  on public.events for select
  to anon, authenticated
  using (status = 'published');

-- Default-deny para INSERT/UPDATE/DELETE (sin policy → bloqueado para anon/authenticated).
-- Service role (server-side) bypasea RLS para escritura admin.

-- Trigger updated_at (reusamos set_updated_at de Fase 1 si existe).
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- public.event_confirmations
-- ------------------------------------------------------------
-- Personas que confirmaron asistencia. No son leads todavía.
-- Importadas del Excel o del form público futuro.
-- ------------------------------------------------------------
create table if not exists public.event_confirmations (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null references public.events(id) on delete cascade,
  name             text not null,
  email            text,
  phone_raw        text,
  phone_normalized text,
  source           public.event_confirmation_source not null default 'imported_excel',
  confirmed_at     timestamptz not null default now(),
  import_batch_id  uuid,
  -- Evita duplicados del mismo import (mismo email O mismo phone por evento).
  constraint event_confirmations_email_unique
    unique (event_id, email),
  constraint event_confirmations_phone_unique
    unique (event_id, phone_normalized)
);

create index if not exists event_confirmations_event_idx  on public.event_confirmations (event_id);
create index if not exists event_confirmations_email_idx  on public.event_confirmations (email);
create index if not exists event_confirmations_phone_idx  on public.event_confirmations (phone_normalized);
create index if not exists event_confirmations_batch_idx  on public.event_confirmations (import_batch_id);

alter table public.event_confirmations enable row level security;
-- Default-deny: sin policies públicas. Solo service role.

-- ------------------------------------------------------------
-- public.event_attendees
-- ------------------------------------------------------------
-- Quien realmente asistió. Check-in manual, lista de Zoom, o import Excel.
-- Puede NO matchear con confirmation (asistió sin confirmar antes).
-- ------------------------------------------------------------
create table if not exists public.event_attendees (
  id                uuid primary key default gen_random_uuid(),
  event_id          uuid not null references public.events(id) on delete cascade,
  confirmation_id   uuid references public.event_confirmations(id) on delete set null,
  name              text,
  email             text,
  phone_normalized  text,
  checked_in_at     timestamptz not null default now(),
  checked_in_by     text,
  source            public.event_attendee_source not null default 'check_in',
  import_batch_id   uuid,
  -- Un attendee por (event, email) — evita duplicados del mismo import.
  -- email puede ser NULL si el check-in no lo trae; el constraint aplica solo
  -- si email está presente.
  constraint event_attendees_email_unique
    unique (event_id, email)
);

create index if not exists event_attendees_event_idx          on public.event_attendees (event_id);
create index if not exists event_attendees_confirmation_idx   on public.event_attendees (confirmation_id);
create index if not exists event_attendees_phone_idx          on public.event_attendees (phone_normalized);
create index if not exists event_attendees_batch_idx          on public.event_attendees (import_batch_id);

alter table public.event_attendees enable row level security;
-- Default-deny.

-- ------------------------------------------------------------
-- public.event_surveys
-- ------------------------------------------------------------
-- Respuestas de encuesta post-evento. Esta es la tabla que gatilla
-- el consent_to_contact y por ende la promoción a lead.
-- ------------------------------------------------------------
create table if not exists public.event_surveys (
  id                    uuid primary key default gen_random_uuid(),
  event_id              uuid not null references public.events(id) on delete cascade,
  confirmation_id       uuid references public.event_confirmations(id) on delete set null,
  attendee_id           uuid references public.event_attendees(id) on delete set null,
  respondent_email      text,
  respondent_phone      text,
  phone_normalized      text,
  responses             jsonb not null default '{}'::jsonb,
  -- El campo clave: sin esto, NO se promueve a lead (D-1 del concept).
  consent_to_contact    boolean not null,
  commercial_interest   text,
  submitted_at          timestamptz not null default now(),
  import_batch_id       uuid,
  promoted_to_lead_id   uuid references public.leads(id) on delete set null,
  promoted_at           timestamptz
);

create index if not exists event_surveys_event_idx          on public.event_surveys (event_id);
create index if not exists event_surveys_phone_idx          on public.event_surveys (phone_normalized);
create index if not exists event_surveys_consent_idx        on public.event_surveys (consent_to_contact);
create index if not exists event_surveys_promoted_idx       on public.event_surveys (promoted_to_lead_id);
create index if not exists event_surveys_batch_idx          on public.event_surveys (import_batch_id);
-- GIN para queries dentro del jsonb `responses`.
create index if not exists event_surveys_responses_gin      on public.event_surveys using gin (responses);

alter table public.event_surveys enable row level security;
-- Default-deny.

-- ------------------------------------------------------------
-- public.event_survey_unmatched
-- ------------------------------------------------------------
-- Visibilidad para el admin: prospectos con interés comercial que NO
-- dieron consentimiento. Se guardan para que el admin los vea (sin
-- promoverlos a lead, por la regla inquebrantable de consent).
-- El admin puede usar esta tabla para reportar "tuviste X respuestas
-- con interés pero sin consentimiento" — útil para feedback al cliente.
-- ------------------------------------------------------------
create table if not exists public.event_survey_unmatched (
  id                    uuid primary key default gen_random_uuid(),
  survey_id             uuid not null references public.event_surveys(id) on delete cascade,
  reason                text not null,  -- 'no_consent' | 'no_email_no_phone' | 'no_interest'
  created_at            timestamptz not null default now()
);

create index if not exists event_survey_unmatched_survey_idx on public.event_survey_unmatched (survey_id);
create index if not exists event_survey_unmatched_reason_idx on public.event_survey_unmatched (reason);

alter table public.event_survey_unmatched enable row level security;
-- Default-deny.

-- ------------------------------------------------------------
-- public.lead_event_links
-- ------------------------------------------------------------
-- Tabla de join lead ↔ event record. Reemplaza el STUB tag-based de
-- Fase 2 (`linkLeadToEventRecord`). Cierra el H2 del QA round 1
-- (race condition en tags) por construcción: INSERT-only, no UPDATE.
-- ------------------------------------------------------------
create table if not exists public.lead_event_links (
  id           uuid primary key default gen_random_uuid(),
  lead_id      uuid not null references public.leads(id) on delete cascade,
  event_id     uuid not null references public.events(id) on delete cascade,
  link_type    public.lead_event_link_type not null,
  link_id      uuid not null,  -- FK lógica (no enforced) a confirmation/attendee/survey
  created_at   timestamptz not null default now(),
  -- Un lead solo se vincula UNA VEZ al mismo record de evento.
  -- Si entra otra encuesta del mismo survey_id para el mismo lead,
  -- el ON CONFLICT lo ignora (idempotente).
  constraint lead_event_links_unique
    unique (lead_id, link_type, link_id)
);

create index if not exists lead_event_links_lead_idx       on public.lead_event_links (lead_id);
create index if not exists lead_event_links_event_idx      on public.lead_event_links (event_id);
create index if not exists lead_event_links_link_idx       on public.lead_event_links (link_type, link_id);

alter table public.lead_event_links enable row level security;
-- Default-deny.

-- ------------------------------------------------------------
-- Comentarios documentales (visibles desde \d+ o Supabase Dashboard).
-- ------------------------------------------------------------
comment on table public.events is
  'Eventos/conferencias (v0.7.0). Lectura pública si status=published. Escritura solo service role.';
comment on column public.events.slug is
  'URL-safe identifier único. Base de la URL pública del evento.';

comment on table public.event_confirmations is
  'Personas que confirmaron asistencia a un evento. No son leads todavía (D-2 del concept). Solo service role.';
comment on column public.event_confirmations.phone_normalized is
  'Formato canónico E.164 MX (+52XXXXXXXXXX). Lo usa el cross-check con leads.';
comment on column public.event_confirmations.import_batch_id is
  'Agrupa filas del mismo import del Excel. Permite rollback por batch.';

comment on table public.event_attendees is
  'Quién realmente asistió al evento. Puede NO matchear con confirmation (asistió sin confirmar antes). Solo service role.';
comment on column public.event_attendees.confirmation_id is
  'Link opcional a event_confirmations. NULL si la persona asistió sin haber confirmado antes.';

comment on table public.event_surveys is
  'Respuestas de encuesta post-evento. Esta tabla gatilla el consent_to_contact y la promoción a lead. Solo service role.';
comment on column public.event_surveys.consent_to_contact is
  'Campo clave: sin true, NO se promueve a lead (regla inquebrantable de consent).';
comment on column public.event_surveys.promoted_to_lead_id is
  'FK al lead creado (cuando consent=true y se cumplen las reglas de promoción). NULL si no se promovió.';

comment on table public.event_survey_unmatched is
  'Visibilidad admin: prospectos con interés comercial que NO cumplieron las reglas de promoción (D-1 del concept).';
comment on column public.event_survey_unmatched.reason is
  'Por qué no se promovió: no_consent | no_email_no_phone | no_interest.';

comment on table public.lead_event_links is
  'Join lead ↔ event record. Cierra el H2 del QA Fase 2 (race en tags) por construcción: INSERT-only. Solo service role.';
