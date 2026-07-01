-- ------------------------------------------------------------
-- public.bot_context_overrides — contexto manual editable por bot
-- ------------------------------------------------------------
-- Permite a un operador humano override-iar partes del contexto que el bot
-- usa para responder. Por ejemplo:
--   - "El evento se mueve al 8 de julio por lluvia" → key: 'event_override_date'
--   - "Hoy el tono debe ser ultra formal"            → key: 'tone_override'
--   - "Agregar nota sobre el coffee break"           → key: 'extra_notes'
--   - "Resaltar que es solo para mayores de 18"      → key: 'compliance_notes'
--
-- El bot consulta esta tabla antes de generar cada respuesta y mezcla los
-- overrides con el contexto automático (evento activo de `events`, ventana
-- de conversación, etc.).
--
-- Es 1 fila por (bot_name, context_key). El "bot_name" default es 'qlick-bot'.
-- Cuando agreguemos más bots, simplemente usamos otro bot_name.
-- ------------------------------------------------------------
create table if not exists public.bot_context_overrides (
  id              uuid primary key default gen_random_uuid(),
  bot_name        text not null default 'qlick-bot',
  context_key     text not null,
  context_value   text not null,
  priority        int  not null default 100,
  enabled         boolean not null default true,
  expires_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  updated_by      text,
  constraint bot_context_overrides_unique
    unique (bot_name, context_key)
);

create index if not exists bot_context_overrides_bot_idx
  on public.bot_context_overrides (bot_name);
create index if not exists bot_context_overrides_enabled_idx
  on public.bot_context_overrides (bot_name, enabled);

comment on table public.bot_context_overrides is
  'Contexto manual editable por bot. Sobreescribe defaults del prompt.';

comment on column public.bot_context_overrides.context_key is
  'Llave semántica del override (ej. event_override_date, tone_override, extra_notes).';

comment on column public.bot_context_overrides.priority is
  'Menor = más prioritario. Default 100. Útil cuando hay varios overrides activos.';

comment on column public.bot_context_overrides.expires_at is
  'Si está seteado, el override se ignora después de esta fecha. Útil para notas temporales.';

-- Trigger updated_at (reusa función si existe).
drop trigger if exists bot_context_overrides_set_updated_at on public.bot_context_overrides;
create trigger bot_context_overrides_set_updated_at
  before update on public.bot_context_overrides
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- Seed inicial: contexto vacío para 'qlick-bot'
-- ------------------------------------------------------------
-- (sin filas; los operadores agregan overrides según necesidad)

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
alter table public.bot_context_overrides enable row level security;

-- Lectura SOLO para service role (server-side).
-- Default-deny para anon/authenticated.
-- El dashboard admin (futuro) usa service role server-side.

-- ------------------------------------------------------------
-- Función helper para que el bot engine cargue overrides activos
-- ------------------------------------------------------------
create or replace function public.get_active_bot_overrides(p_bot_name text)
returns table (
  context_key text,
  context_value text,
  priority int
)
language sql
stable
as $$
  select context_key, context_value, priority
  from public.bot_context_overrides
  where bot_name = p_bot_name
    and enabled = true
    and (expires_at is null or expires_at > now())
  order by priority asc, updated_at desc;
$$;

comment on function public.get_active_bot_overrides(text) is
  'Devuelve los overrides activos (enabled=true, no expirados) de un bot, orden por prioridad.';