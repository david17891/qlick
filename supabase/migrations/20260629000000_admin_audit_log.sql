-- ============================================================
-- Admin audit log (Fase 5 Bloque 2)
--
-- Tabla de auditoría de cambios hechos por admins en el panel.
-- Captura: quién (actor_email), qué (action + entity_type + entity_id),
-- antes/después (before/after JSONB), metadata extra (IP, UA), cuándo.
--
-- Uso: /admin/system/audit-log lista los cambios con filtros.
--
-- Migración idempotente: IF NOT EXISTS en la tabla e índices. Si la
-- tabla ya existe (ej. en producción), se omite la creación.
-- ============================================================

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_email text not null,
  action text not null,
  entity_type text not null,
  entity_id uuid not null,
  before jsonb,
  after jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Índices para queries comunes:
-- - por entity (timeline de cambios de un record específico)
-- - por actor (qué hizo un admin específico)
-- - por fecha (para filtros de rango y ordenamiento)
-- ------------------------------------------------------------
create index if not exists admin_audit_log_entity_idx
  on public.admin_audit_log (entity_type, entity_id);

create index if not exists admin_audit_log_actor_idx
  on public.admin_audit_log (actor_email);

create index if not exists admin_audit_log_created_idx
  on public.admin_audit_log (created_at desc);

-- ------------------------------------------------------------
-- RLS: solo admins pueden leer. El insert se hace via service role
-- (que bypasea RLS). No hay update ni delete desde el cliente.
-- ------------------------------------------------------------
alter table public.admin_audit_log enable row level security;

-- Política de lectura: autenticado + email en admin_allowlist.
-- Si admin_allowlist no existe, la policy falla silenciosamente y
-- nadie puede leer — comportamiento fail-closed (mejor que fail-open).
do $$
begin
  if exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'admin_allowlist'
  ) then
    execute $POLICY$
      create policy "admin_audit_log: admin read"
      on public.admin_audit_log
      for select
      to authenticated
      using (
        exists (
          select 1 from public.admin_allowlist
          where email = auth.jwt() ->> 'email'
        )
      );
    $POLICY$;
  end if;
end $$;

-- Nota: NO creamos policy de INSERT/UPDATE/DELETE. El código server-side
-- usa createSupabaseAdminClient() (service role, bypasea RLS) para
-- escribir. Si alguien intenta escribir desde anon/authenticated, RLS
-- lo bloquea por default (fail-closed).