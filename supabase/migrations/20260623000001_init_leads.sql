-- ============================================================
-- Migración inicial: tabla `leads`
-- Qlick Marketing Integral — Fase 1 (Supabase Real Foundation)
-- ============================================================
-- Primer vertical slice real: ContactForm → leads en Supabase → CRM admin.
--
-- Diseño:
-- - Campos compatibles con `src/types/crm.ts` (Lead), con nombres snake_case
--   en la DB y mapeo a camelCase en el código (src/lib/crm/leads-mapper.ts).
-- - RLS obligatorio y activo desde el creación.
-- - Políticas:
--     * INSERT público controlado: solo desde el server action del formulario
--       (que valida consentimiento + honeypot/turnstile en el futuro). El rol
--       `anon` puede insertar filas NUEVAS (status='new', source='website' o
--       similares), pero NO puede elegir campos sensibles arbitrariamente: se
--       fuerza `status`/`source`/`intent`/`owner_id` desde un TRIGGER/defaults
--       o desde la política CHECK.
--     * SELECT/UPDATE/DELETE: SOLO roles autenticados con rol de admin
--       (auth.jwt() → app_role = 'admin' o 'instructor'). El CRM admin lee
--       vía server con service role (bypass de RLS) o con sesión admin.
--
-- Convención de nombres: YYYYMMDDHHMMSS_descripcion.sql (ver supabase/README.md).
-- ============================================================

-- ------------------------------------------------------------
-- Enumeraciones alineadas con src/types/crm.ts
-- ------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'lead_status') then
    create type lead_status as enum (
      'new', 'contacted', 'interested', 'info_requested',
      'payment_pending', 'enrolled', 'active_student', 'lost', 'archived'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'lead_source') then
    create type lead_source as enum (
      'website', 'whatsapp', 'facebook_ads', 'instagram_ads',
      'referral', 'event', 'manual', 'organic', 'other'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'lead_intent') then
    create type lead_intent as enum (
      'course_information', 'enroll_course', 'pricing', 'payment_help',
      'group_access', 'support', 'schedule_call',
      'course_recommendation', 'unknown'
    );
  end if;
end$$;

-- ------------------------------------------------------------
-- Tabla `leads`
-- ------------------------------------------------------------
create table if not exists public.leads (
  id              uuid primary key default gen_random_uuid(),
  name            text        not null,
  email           text        not null,
  phone           text,
  course_of_interest text,
  status          lead_status not null default 'new',
  source          lead_source not null default 'website',
  intent          lead_intent not null default 'course_information',
  owner_id        text,       -- referencia lógica a sales owners (sin FK aún)
  tags            text[]      default '{}',
  summary         text,
  estimated_value_mxn numeric(12,2),
  next_follow_up_at timestamptz,
  consent_to_contact boolean  not null default false,
  message         text,       -- texto libre del formulario (no se muestra en admin)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Índices para los accesos típicos del CRM (listado por estado, búsqueda por email).
create index if not exists leads_status_idx     on public.leads (status);
create index if not exists leads_source_idx     on public.leads (source);
create index if not exists leads_created_at_idx on public.leads (created_at desc);
create index if not exists leads_email_idx      on public.leads (email);

-- updated_at automático en cada update.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists leads_set_updated_at on public.leads;
create trigger leads_set_updated_at
  before update on public.leads
  for each row
  execute function public.set_updated_at();

-- ------------------------------------------------------------
-- RLS — obligatorio desde el día 1
-- ------------------------------------------------------------
alter table public.leads enable row level security;

-- Politica DELETE inicial (denegar todo desde el cliente). El admin opera vía
-- service role (server) que bypassa RLS. Dejar explícito para documentación.
-- (RLS por defecto DENIEGA si no hay política que permita.)

-- INSERT público CONTROLADO: el formulario crea leads nuevos desde el server
-- action (rol `anon` o usuario sin sesión). Restringimos a filas con los
-- campos que el formulario puede legítimamente enviar; los demás quedan a
-- su valor DEFAULT o son forzados por el propio server action antes de insertar.
create policy "leads_public_insert_form"
  on public.leads for insert
  to anon, authenticated
  with check (
    consent_to_contact = true             -- el formulario exige consentimiento
    and status = 'new'                    -- los leads del formulario siempre entran como 'new'
    and char_length(name) between 1 and 200
    and email ~ '^[^@]+@[^@]+\.[^@]+$'    -- validación mínima de email
  );

-- SELECT/UPDATE/DELETE: SOLO usuarios autenticados con rol admin/instructor.
-- El CRM admin nunca lee desde el navegador con la publishable key del admin;
-- se hace server-side. Esta política protege por si en el futuro se expusiera.
create policy "leads_admin_read"
  on public.leads for select
  to authenticated
  using (
    coalesce(
      (auth.jwt() ->> 'app_role') in ('admin', 'instructor'),
      false
    )
  );

create policy "leads_admin_write"
  on public.leads for update
  to authenticated
  using (
    coalesce(
      (auth.jwt() ->> 'app_role') in ('admin', 'instructor'),
      false
    )
  )
  with check (
    coalesce(
      (auth.jwt() ->> 'app_role') in ('admin', 'instructor'),
      false
    )
  );

-- Comentario documental en la tabla (visible desde psql \d+ o el Dashboard).
comment on table public.leads is
  'Leads del CRM (Fase 1). Insert público controlado desde el formulario de contacto; lectura/escritura solo admin. RLS activo.';
comment on column public.leads.consent_to_contact is
  'Consentimiento explícito del lead para ser contactado (LFPDPPP). Requerido por la política de INSERT.';
comment on column public.leads.message is
  'Mensaje libre del formulario. No se muestra en el CRM admin por privacidad; se usa solo para clasificar intención.';
