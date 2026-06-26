-- ============================================================
-- v0.7.0 — LMS Real Foundation
--
-- Tablas nuevas (5):
--   - public.courses           → catálogo público de cursos de pago
--   - public.modules           → módulos/secciones dentro de un curso
--   - public.lessons           → lecciones (video) dentro de un módulo
--   - public.enrollments       → inscripción de un usuario a un curso
--   - public.lesson_progress   → avance por lección de cada usuario
--
-- Decisiones de diseño (alineadas con D-018):
-- - `status` y `level` se modelan con CHECK constraints (no enums) para
--   mantener flexibilidad y alinear con los valores documentados en el
--   spec (los enums están reservados para entidades más estables como
--   leads / masterclasses).
-- - Todo el contenido público (courses / modules / lessons) sigue el
--   patrón "lectura pública SOLO si publicado". La escritura queda
--   restringida a service role (RLS default-deny).
-- - `enrollments` y `lesson_progress` son por-USUARIO: solo el dueño
--   (auth.uid() = user_id) puede SELECT/INSERT/UPDATE. Sin service role
--   para CRUD normal; admin CRM usa service role server-side.
--
-- Idempotente:
-- - `if not exists` en tablas / índices / triggers
-- - `drop trigger if exists` antes de recrear
-- - `drop policy if exists` antes de crear
-- ============================================================

-- ===========================================================
-- Tabla `public.courses` — catálogo público de cursos
-- ===========================================================
create table if not exists public.courses (
  id               uuid primary key default gen_random_uuid(),
  slug             text unique not null,
  title            text not null,
  subtitle         text,
  description      text,
  cover_image_url  text,
  status           text not null default 'draft',         -- 'draft' | 'published' | 'archived'
  level            text not null default 'beginner',      -- 'beginner' | 'intermediate' | 'advanced'
  category         text,
  duration_minutes integer,
  instructor_name  text,
  price_mxn        numeric(10,2),
  is_featured      boolean not null default false,
  display_order    integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint courses_status_check check (status in ('draft', 'published', 'archived')),
  constraint courses_level_check  check (level  in ('beginner', 'intermediate', 'advanced'))
);

create index if not exists courses_status_idx on public.courses (status);
create index if not exists courses_slug_idx   on public.courses (slug);

comment on table public.courses is
  'Catálogo de cursos de pago (LMS). Lectura pública solo para publicados (RLS). Escritura solo vía service role (admin).';

alter table public.courses enable row level security;

-- Lectura pública SOLO para cursos publicados.
drop policy if exists "courses_public_read_published" on public.courses;
create policy "courses_public_read_published"
  on public.courses for select
  to anon, authenticated
  using (status = 'published');

-- ===========================================================
-- Tabla `public.modules` — secciones dentro de un curso
-- ===========================================================
create table if not exists public.modules (
  id            uuid primary key default gen_random_uuid(),
  course_id     uuid not null references public.courses(id) on delete cascade,
  title         text not null,
  description   text,
  display_order integer not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists modules_course_id_idx        on public.modules (course_id);
create index if not exists modules_course_id_order_idx  on public.modules (course_id, display_order);

comment on table public.modules is
  'Módulos/secciones de un curso. Lectura pública solo si el course padre está published (RLS). Escritura solo service role.';

alter table public.modules enable row level security;

-- Lectura pública SOLO si el course padre está publicado.
drop policy if exists "modules_public_read_via_course" on public.modules;
create policy "modules_public_read_via_course"
  on public.modules for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.courses c
      where c.id = modules.course_id
        and c.status = 'published'
    )
  );

-- ===========================================================
-- Tabla `public.lessons` — lecciones dentro de un módulo
-- ===========================================================
create table if not exists public.lessons (
  id              uuid primary key default gen_random_uuid(),
  module_id       uuid not null references public.modules(id) on delete cascade,
  title           text not null,
  description     text,
  video_provider  text,                                   -- 'youtube' | 'cloudflare_stream' | 'mux' | 'local'
  video_id        text,                                   -- id externo (URL YouTube, UID Cloudflare, etc.)
  video_url       text,                                   -- alternativa: URL completa directa
  duration_minutes integer,
  display_order   integer not null default 0,
  is_free_preview boolean not null default false,
  created_at      timestamptz not null default now(),
  constraint lessons_video_provider_check check (
    video_provider is null
    or video_provider in ('youtube', 'cloudflare_stream', 'mux', 'local')
  )
);

create index if not exists lessons_module_id_idx       on public.lessons (module_id);
create index if not exists lessons_module_id_order_idx on public.lessons (module_id, display_order);

comment on table public.lessons is
  'Lecciones (video) dentro de un módulo. Lectura pública solo si el module → course está published (RLS). Escritura solo service role.';

alter table public.lessons enable row level security;

-- Lectura pública SOLO si el módulo → course padre está publicado.
drop policy if exists "lessons_public_read_via_module" on public.lessons;
create policy "lessons_public_read_via_module"
  on public.lessons for select
  to anon, authenticated
  using (
    exists (
      select 1
        from public.modules m
        join public.courses c on c.id = m.course_id
       where m.id = lessons.module_id
         and c.status = 'published'
    )
  );

-- ===========================================================
-- Tabla `public.enrollments` — inscripción user ↔ course
-- ===========================================================
create table if not exists public.enrollments (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  course_id        uuid not null references public.courses(id) on delete cascade,
  status           text not null default 'active',        -- 'active' | 'completed' | 'cancelled'
  progress_percent integer not null default 0,
  enrolled_at      timestamptz not null default now(),
  completed_at     timestamptz,
  constraint enrollments_status_check check (status in ('active', 'completed', 'cancelled')),
  constraint enrollments_unique_user_course unique (user_id, course_id)
);

create index if not exists enrollments_user_id_idx         on public.enrollments (user_id);
create index if not exists enrollments_course_id_idx       on public.enrollments (course_id);
create index if not exists enrollments_user_id_status_idx  on public.enrollments (user_id, status);

comment on table public.enrollments is
  'Inscripción de un usuario a un curso (LMS). Solo el dueño (auth.uid() = user_id) puede SELECT/INSERT/UPDATE. Admin CRM opera vía service role.';

alter table public.enrollments enable row level security;

-- SELECT / INSERT / UPDATE solo para el dueño.
drop policy if exists "enrollments_owner_select" on public.enrollments;
create policy "enrollments_owner_select"
  on public.enrollments for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "enrollments_owner_insert" on public.enrollments;
create policy "enrollments_owner_insert"
  on public.enrollments for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "enrollments_owner_update" on public.enrollments;
create policy "enrollments_owner_update"
  on public.enrollments for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ===========================================================
-- Tabla `public.lesson_progress` — avance por lección
-- ===========================================================
create table if not exists public.lesson_progress (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  lesson_id    uuid not null references public.lessons(id) on delete cascade,
  completed    boolean not null default false,
  completed_at timestamptz,
  watch_seconds integer not null default 0,
  updated_at   timestamptz not null default now(),
  constraint lesson_progress_unique_user_lesson unique (user_id, lesson_id)
);

create index if not exists lesson_progress_user_id_idx   on public.lesson_progress (user_id);
create index if not exists lesson_progress_lesson_id_idx on public.lesson_progress (lesson_id);

comment on table public.lesson_progress is
  'Progreso por lección de cada usuario (LMS). Solo el dueño (auth.uid() = user_id) puede SELECT/INSERT/UPDATE.';

alter table public.lesson_progress enable row level security;

-- SELECT / INSERT / UPDATE solo para el dueño.
drop policy if exists "lesson_progress_owner_select" on public.lesson_progress;
create policy "lesson_progress_owner_select"
  on public.lesson_progress for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "lesson_progress_owner_insert" on public.lesson_progress;
create policy "lesson_progress_owner_insert"
  on public.lesson_progress for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "lesson_progress_owner_update" on public.lesson_progress;
create policy "lesson_progress_owner_update"
  on public.lesson_progress for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ===========================================================
-- Trigger updated_at sobre `public.courses`
-- (re-usa public.set_updated_at() creada en 20260623000001_init_leads.sql)
-- ===========================================================
drop trigger if exists courses_set_updated_at on public.courses;
create trigger courses_set_updated_at
  before update on public.courses
  for each row
  execute function public.set_updated_at();

drop trigger if exists lesson_progress_set_updated_at on public.lesson_progress;
create trigger lesson_progress_set_updated_at
  before update on public.lesson_progress
  for each row
  execute function public.set_updated_at();
