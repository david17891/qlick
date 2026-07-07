-- ============================================================
-- event_access — entitlements para eventos/masterclass pagados
--
-- Espejo de `course_access` pero para `events.id` (no courses).
-- Misma semántica: UNIQUE en (user_id, event_id) WHERE
-- access_status='active'. Idempotencia vía grantEventAccess().
--
-- Patrón idéntico al LMS:
--   enrollments/attendances = "¿está apuntado?" (puede ser pending_payment)
--   event_access              = "¿tiene derecho a participar/recibir material?"
--
-- Un asistente puede tener attendance sin access (pagó pero staff no le dio
-- acceso). Un admin puede dar access sin attendance. Mezclarlo obligaría a
-- migraciones cuando agreguemos pagos reales — por eso las 2 tablas.
--
-- Por qué tabla separada y NO polimorfismo en course_access:
--   - course_access referencia courses(id) con FK; pollmorph hace la tabla
--     entera más frágil (rls, joins, tipos).
--   - products pueden divergir (ej. event_access puede tener capacidad,
--     cupos, lista de espera; course_access no).
--   - Estricto: 1 access kind = 1 tabla. Más simple de razonar.
--
-- Stripe (Fase 1) la usa: checkout.session.completed dispara
-- grantEventAccess({ source: 'event_purchase', paymentId }) desde el
-- webhook handler. Mismo patrón que grantAccess en LMS.
--
-- En Fase 2 podemos consolidar si la rigidez pesa más que el beneficio.
-- ============================================================

create table if not exists public.event_access (
  id uuid primary key default gen_random_uuid(),

  -- Quién recibe el acceso. Nullable porque un admin puede dar acceso
  -- sin user (ej. comp de prensa); FK a auth.users con set null en delete.
  user_id uuid references auth.users(id) on delete set null,

  -- Qué evento. NOT NULL porque la tabla es de eventos.
  event_id uuid not null references public.events(id) on delete cascade,

  -- Estado de la entitlement. CHECK con valores del dominio.
  access_status text not null check (
    access_status in ('active', 'revoked', 'expired', 'pending')
  ),

  -- Origen del acceso. 'event_purchase' para Stripe (Fase 1+).
  -- Los demás valores siguen el patrón de course_access.
  access_source text not null check (
    access_source in (
      'event_purchase',         -- Stripe / MercadoPago / Conekta (futuro)
      'simulated_event_payment',-- simulator-webhook dev-only
      'manual_event_admin',     -- admin manual (ej. comp amigos)
      'coupon',                 -- 100% off
      'free_rsvp'               -- evento free, acceso sin pago
    )
  ),

  -- Si fue vía pago, referencia al payment row.
  payment_id uuid references public.payments(id) on delete set null,

  -- Vigencia. Si expires_at es null, es permanente.
  starts_at timestamptz not null default now(),
  expires_at timestamptz,

  -- Texto libre explicando por qué se otorgó (auditoría).
  granted_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- UNIQUE: solo 1 access active por (user, event). Idempotencia.
create unique index if not exists event_access_user_event_active_unique
  on public.event_access (user_id, event_id)
  where access_status = 'active';

-- Índices secundarios para queries comunes.
create index if not exists event_access_user_idx
  on public.event_access (user_id);
create index if not exists event_access_event_idx
  on public.event_access (event_id);
create index if not exists event_access_payment_idx
  on public.event_access (payment_id);

-- RLS: usuarios leen sus propios access; service role bypass implícito.
alter table public.event_access enable row level security;

drop policy if exists event_access_owner_select on public.event_access;
create policy event_access_owner_select on public.event_access
  for select using (auth.uid() = user_id);

-- Política para admin (lee todos los access). Se asume que `is_admin()`
-- ya existe como helper security-definer (creada en migrations previas
-- de admin panel). Si no existe, ajustar.
drop policy if exists event_access_admin_all on public.event_access;
create policy event_access_admin_all on public.event_access
  for all using (
    public.is_admin() = true
  );

-- Trigger updated_at. Usamos la función genérica set_updated_at() si
-- ya existe; si no, la creamos idempotentemente.
do $$
begin
  if not exists (select 1 from pg_proc where proname = 'set_updated_at') then
    create function public.set_updated_at() returns trigger as $body$
    begin
      new.updated_at = now();
      return new;
    end;
    $body$ language plpgsql;
  end if;
end$$;

drop trigger if exists event_access_set_updated_at on public.event_access;
create trigger event_access_set_updated_at
  before update on public.event_access
  for each row execute function public.set_updated_at();

-- Comentario de la tabla.
comment on table public.event_access is
  'Entitlements de eventos/masterclass pagos. Espejo de course_access pero para events. Usado por Stripe webhook en checkout.session.completed → grantEventAccess({source:event_purchase}).';
comment on column public.event_access.user_id is
  'Comprador. Nullable para admin grants sin user específico. ON DELETE SET NULL preserva la fila para auditoría si el user se borra.';
comment on column public.event_access.access_source is
  "Origen del grant. Stripe usa 'event_purchase' (Fase 1). Otros valores disponibles: simulated_event_payment (dev), manual_event_admin, coupon, free_rsvp.";
