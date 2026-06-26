-- ============================================================
-- v1.0.0 — Entitlements + Pagos Simulados
--
-- Capa de acceso comercial del LMS. Diferencia cursos gratis / de pago
-- / freemium y deja el sistema listo para reemplazar el simulador por
-- Stripe / MercadoPago / Conekta sin reescribir la lógica de acceso.
--
-- Decisiones (docs/ENTITLEMENTS_PLAN.md):
-- - courses.access_type: 'free' | 'paid' | 'freemium'
-- - course_access: tabla separada de enrollments, modela "¿tiene derecho?"
-- - payments: tabla de pagos, arranca con provider='simulated'
-- - source attribution: access_source desde el inicio (free_course |
--   simulated_payment | manual_admin | stripe | mercadopago | conekta | coupon)
--
-- Por qué separar enrollments de course_access:
-- - enrollments = "¿está apuntado?" (status: active | pending_payment |
--   cancelled | expired)
-- - course_access = "¿tiene derecho a ver?" (status: active | pending |
--   expired | revoked)
-- - Un alumno puede estar inscrito sin pagar (pending_payment). Un admin
--   puede dar acceso sin enrollment (manual_admin). Mezclarlo obliga a
--   migraciones cuando se agrega Stripe real.
--
-- Idempotente:
-- - if not exists en tablas / columnas / constraints
-- - drop policy if exists antes de crear
-- ============================================================

-- ===========================================================
-- 1. courses: agregar access_type
-- ===========================================================
alter table public.courses
  add column if not exists access_type text not null default 'free';

-- CHECK constraint: idempotente via DO block
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'courses_access_type_check'
  ) then
    alter table public.courses
      add constraint courses_access_type_check
      check (access_type in ('free', 'paid', 'freemium'));
  end if;
end $$;

comment on column public.courses.access_type is
  'Modelo de acceso del curso. "free" = público con login. "paid" = requiere course_access activo. "freemium" = gratis con contenido premium (fase futura, schema ya lo soporta).';

-- ===========================================================
-- 2. course_access: derechos de acceso por (user, course)
-- ===========================================================
create table if not exists public.course_access (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  course_id       uuid not null references public.courses(id) on delete cascade,
  access_status   text not null default 'pending',
  access_source   text not null,
  payment_id      uuid,  -- FK a payments se agrega después de crear payments
  starts_at       timestamptz not null default now(),
  expires_at      timestamptz,  -- NULL = permanente
  granted_reason  text,  -- audit trail: 'paid_via_sim_2026-06-25', etc.
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- CHECK constraints via DO block (idempotent)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'course_access_status_check') then
    alter table public.course_access
      add constraint course_access_status_check
      check (access_status in ('active', 'pending', 'expired', 'revoked'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'course_access_source_check') then
    alter table public.course_access
      add constraint course_access_source_check
      check (access_source in (
        'free_course', 'simulated_payment', 'manual_admin',
        'stripe', 'mercadopago', 'conekta', 'coupon'
      ));
  end if;
end $$;

comment on table public.course_access is
  'Derechos de acceso de un usuario a un curso. Independiente de enrollments: modela "¿tiene derecho a ver?" no "¿está apuntado?".';
comment on column public.course_access.access_status is
  'Estado del derecho. active = puede ver. pending = creado pero no activado. expired = venció. revoked = revocado manualmente (ej. refund).';
comment on column public.course_access.access_source is
  'Origen del acceso. Free_course = grant por enrollment gratis. Simulated_payment = pago via simulador (dev). Manual_admin = admin lo dio. Stripe/Mercadopago/Conekta = proveedores reales (futuro). Coupon = código promocional.';
comment on column public.course_access.granted_reason is
  'Audit trail. Texto libre con la razón del grant/revoke (ej: paid_via_sim_2026-06-25, refunded_2026-06-26).';

-- Índices
create index if not exists idx_course_access_user_active
  on public.course_access(user_id) where access_status = 'active';
create index if not exists idx_course_access_course_active
  on public.course_access(course_id) where access_status = 'active';
create index if not exists idx_course_access_payment
  on public.course_access(payment_id) where payment_id is not null;

-- ===========================================================
-- 3. payments: registro de pagos (arranca con provider='simulated')
-- ===========================================================
create table if not exists public.payments (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  course_id            uuid not null references public.courses(id) on delete cascade,
  provider             text not null default 'simulated',
  provider_payment_id  text,  -- null para simulated; null también en pending
  amount_mxn           integer not null,
  currency             text not null default 'MXN',
  status               text not null default 'pending',
  idempotency_key      text not null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- CHECK constraints via DO block
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'payments_provider_check') then
    alter table public.payments
      add constraint payments_provider_check
      check (provider in ('simulated', 'stripe', 'mercadopago', 'conekta'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'payments_status_check') then
    alter table public.payments
      add constraint payments_status_check
      check (status in ('pending', 'paid', 'failed', 'refunded', 'cancelled'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'payments_amount_check') then
    alter table public.payments
      add constraint payments_amount_check
      check (amount_mxn >= 0);
  end if;
end $$;

-- Idempotencia: UNIQUE (user, course, idempotency_key)
create unique index if not exists payments_idempotency_unique
  on public.payments(user_id, course_id, idempotency_key);

comment on table public.payments is
  'Registro de pagos. Arranca con provider=simulated. Cuando se integre Stripe/MercadoPago/Conekta, el simulador se reemplaza por el webhook del proveedor real manteniendo la misma estructura.';
comment on column public.payments.idempotency_key is
  'Key único por intento de pago. Evita duplicados si el simulador (o webhook real) corre 2 veces. Convención: hash(user_id + course_id + timestamp_5min_bucket).';

-- Índices
create index if not exists idx_payments_user on public.payments(user_id);
create index if not exists idx_payments_course on public.payments(course_id);
create index if not exists idx_payments_active
  on public.payments(status) where status in ('pending', 'paid');

-- ===========================================================
-- 4. FK de course_access.payment_id → payments.id (ahora que payments existe)
-- ===========================================================
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'course_access_payment_id_fkey'
  ) then
    alter table public.course_access
      add constraint course_access_payment_id_fkey
      foreign key (payment_id) references public.payments(id) on delete set null;
  end if;
end $$;

-- ===========================================================
-- 5. RLS: course_access y payments
-- ===========================================================

-- course_access: lectura solo del dueño. Escrituras solo via service role (sin policy INSERT/UPDATE).
alter table public.course_access enable row level security;

drop policy if exists "Users read own course_access" on public.course_access;
create policy "Users read own course_access"
  on public.course_access
  for select
  using (auth.uid() = user_id);

-- payments: lectura solo del dueño. Escrituras solo via service role.
alter table public.payments enable row level security;

drop policy if exists "Users read own payments" on public.payments;
create policy "Users read own payments"
  on public.payments
  for select
  using (auth.uid() = user_id);

-- ===========================================================
-- 6. Trigger updated_at (consistente con courses, enrollments, etc.)
-- ===========================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_course_access_updated_at on public.course_access;
create trigger trg_course_access_updated_at
  before update on public.course_access
  for each row execute function public.set_updated_at();

drop trigger if exists trg_payments_updated_at on public.payments;
create trigger trg_payments_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();