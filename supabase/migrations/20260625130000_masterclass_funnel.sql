-- ============================================================
-- v0.6.0 — Masterclass Funnel Foundation
--
-- Tablas nuevas:
-- - public.masterclasses             → catálogo público de masterclasses
-- - public.masterclass_registrations → registro de interesados por masterclass
--
-- Modelo de seguridad (alineado con D-018):
-- - masterclasses:
--     · SELECT público SOLO para status='published' (anon y authenticated).
--     · INSERT/UPDATE/DELETE: solo service role server-side (admin).
--       Sin políticas públicas = RLS default-deny para escritura.
-- - masterclass_registrations:
--     · SIN políticas públicas (anon ni authenticated).
--     · El registro siempre pasa por un server action con service role,
--       que crea/encuentra el lead correspondiente y luego el registro.
--     · Lectura/escritura admin vía service role (bypass RLS).
--
-- Idempotente: todas las sentencias usan `if not exists` / `or replace`
-- y los enums están protegidos con `if not exists` en `pg_type`.
-- ============================================================

-- ------------------------------------------------------------
-- Enums
-- ------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'masterclass_status') then
    create type public.masterclass_status as enum ('draft', 'published', 'archived');
  end if;
  if not exists (select 1 from pg_type where typname = 'masterclass_registration_status') then
    create type public.masterclass_registration_status as enum
      ('registered', 'cancelled', 'no_show', 'attended');
  end if;
  if not exists (select 1 from pg_type where typname = 'masterclass_attendance_status') then
    create type public.masterclass_attendance_status as enum
      ('pending', 'attended', 'no_show');
  end if;
  if not exists (select 1 from pg_type where typname = 'masterclass_commercial_status') then
    create type public.masterclass_commercial_status as enum
      ('new', 'interested', 'not_interested', 'converted', 'lost');
  end if;
  if not exists (select 1 from pg_type where typname = 'masterclass_modality') then
    create type public.masterclass_modality as enum ('online', 'in_person', 'hybrid');
  end if;
end$$;

-- ------------------------------------------------------------
-- public.masterclasses — catálogo público
-- ------------------------------------------------------------
create table if not exists public.masterclasses (
  id               uuid primary key default gen_random_uuid(),
  slug             text unique not null,
  title            text not null,
  subtitle         text,
  description      text,
  instructor_name  text,
  starts_at        timestamptz,
  duration_minutes integer,
  modality         public.masterclass_modality not null default 'online',
  location         text,
  cover_image_url  text,
  status           public.masterclass_status not null default 'draft',
  cta_label        text not null default 'Registrarme',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists masterclasses_status_idx     on public.masterclasses (status);
create index if not exists masterclasses_starts_at_idx  on public.masterclasses (starts_at desc);
create index if not exists masterclasses_slug_idx       on public.masterclasses (slug);

alter table public.masterclasses enable row level security;

-- Lectura pública SOLO para masterclasses publicadas (estado terminal para
-- visitantes). Borradores y archivadas quedan restringidas a service role.
create policy "masterclasses_public_read_published"
  on public.masterclasses for select
  to anon, authenticated
  using (status = 'published');

comment on table public.masterclasses is
  'Catálogo de masterclasses (clases gratuitas). Lectura pública solo para publicadas (RLS). Escritura solo vía service role (admin).';

-- ------------------------------------------------------------
-- public.masterclass_registrations — registro de interesados
-- ------------------------------------------------------------
create table if not exists public.masterclass_registrations (
  id                  uuid primary key default gen_random_uuid(),
  masterclass_id      uuid not null references public.masterclasses(id) on delete cascade,
  lead_id             uuid references public.leads(id) on delete set null,
  name                text not null,
  email               text not null,
  phone               text,
  registration_status public.masterclass_registration_status not null default 'registered',
  attendance_status   public.masterclass_attendance_status   not null default 'pending',
  commercial_status   public.masterclass_commercial_status   not null default 'new',
  source              text not null default 'masterclass',
  utm_source          text,
  utm_campaign        text,
  consent_to_contact  boolean not null default false,
  registered_at       timestamptz not null default now(),
  attended_at         timestamptz,
  notes               text
);

create index if not exists mcr_masterclass_id_idx on public.masterclass_registrations (masterclass_id);
create index if not exists mcr_lead_id_idx        on public.masterclass_registrations (lead_id);
create index if not exists mcr_email_idx          on public.masterclass_registrations (email);
create index if not exists mcr_registered_at_idx  on public.masterclass_registrations (registered_at desc);

alter table public.masterclass_registrations enable row level security;

-- SIN políticas públicas para registrations: el registro SIEMPRE pasa por
-- un server action público que valida consentimiento + honeypot, crea/
-- reutiliza el lead (vía leads-server) y luego inserta acá con service role.
-- anon y authenticated no pueden leer ni escribir directo.

comment on table public.masterclass_registrations is
  'Registro de personas interesadas en una masterclass. Acceso SOLO vía service role (admin server-side o server action público). RLS default-deny para anon/authenticated.';

-- ------------------------------------------------------------
-- Trigger updated_at sobre masterclasses
-- (re-usa la función public.set_updated_at() creada en la migración
-- inicial de leads; si no existe, este trigger fallará al aplicarse
-- y deberá crearse antes — está garantizado por el orden de las
-- migraciones existentes.)
-- ------------------------------------------------------------
drop trigger if exists masterclasses_set_updated_at on public.masterclasses;
create trigger masterclasses_set_updated_at
  before update on public.masterclasses
  for each row
  execute function public.set_updated_at();

-- ============================================================
-- Seed inicial: masterclass "Clase gratuita de Marketing Digital"
-- (placeholder instructivo; sin datos personales reales)
-- ============================================================
insert into public.masterclasses (
  slug,
  title,
  subtitle,
  description,
  instructor_name,
  starts_at,
  duration_minutes,
  modality,
  status,
  cta_label
)
values (
  'clase-gratuita-marketing-digital',
  'Clase gratuita de Marketing Digital',
  'Aprende los fundamentos en 60 minutos',
  'En esta clase gratuita veremos los pilares del marketing digital moderno: estrategia de contenidos, embudo de conversión y medición con analytics. Ideal si estás empezando o quieres ordenar lo que ya sabes.',
  'Por confirmar',
  now() + interval '7 days',
  60,
  'online',
  'published',
  'Registrarme gratis'
)
on conflict (slug) do nothing;