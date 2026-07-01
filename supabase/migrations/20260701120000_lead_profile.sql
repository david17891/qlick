-- ------------------------------------------------------------
-- public.lead_profile — memoria larga persistente por lead
-- ------------------------------------------------------------
-- Permite al bot recordar el contexto cumulativo de cada lead
-- entre sesiones. A diferencia de `conversation_window` (memoria
-- corta, últimos N mensajes), este perfil persiste indefinidamente
-- y se regenera a partir de la conversación con un LLM.
--
-- Diseñado para Fase 1 del bot conversacional: el bot inyecta el
-- `summary` en el system prompt antes de armar cada respuesta.
--
-- Estructura:
--   - summary:          resumen cumulativo 1-2 frases (regenerado cada N mensajes)
--   - messages_since_summary: counter incremental; cuando llega a SUMMARY_EVERY,
--                             el bot-engine dispara regenerateSummary en background.
--   - last_summary_at:  timestamp del último regenerate
--
-- Evolucion planeada (fases siguientes):
--   - interests:     array de intereses detectados (jsonb)
--   - objections:    array de objeciones conocidas (jsonb)
--   - next_action:   text sugerido por el bot (ej. "send event invite")
--   - lead_score:    int (0-100) de temperatura del lead
--
-- Es 1 fila por lead. El bot-engine hace upsert cuando necesita bumpear
-- el counter o guardar un nuevo summary.
-- ------------------------------------------------------------
create table if not exists public.lead_profile (
  lead_id                uuid primary key references public.leads(id) on delete cascade,
  summary                text not null default '',
  messages_since_summary int  not null default 0,
  last_summary_at        timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists lead_profile_last_summary_idx
  on public.lead_profile (last_summary_at desc);

comment on table public.lead_profile is
  'Memoria larga persistente por lead. El bot regenera el summary cada N mensajes para mantener contexto entre sesiones.';
comment on column public.lead_profile.summary is
  'Resumen cumulativo 1-2 frases del lead, regenerado por el bot-engine cada SUMMARY_EVERY mensajes.';
comment on column public.lead_profile.messages_since_summary is
  'Counter incremental de mensajes desde el último regenerate. Cuando llega a SUMMARY_EVERY, el bot-engine dispara regenerateSummary.';
comment on column public.lead_profile.last_summary_at is
  'Timestamp del último regenerate. Usado para evitar regeneraciones duplicadas en bursts.';

-- ------------------------------------------------------------
-- Trigger: bump updated_at en cada UPDATE
-- ------------------------------------------------------------
create or replace function public.lead_profile_touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists lead_profile_touch_updated_at on public.lead_profile;
create trigger lead_profile_touch_updated_at
  before update on public.lead_profile
  for each row execute function public.lead_profile_touch_updated_at();

-- ------------------------------------------------------------
-- RLS: solo authenticated puede leer/escribir (policy permisiva)
-- ------------------------------------------------------------
-- El bot engine usa service_role (bypasea RLS automáticamente), así
-- que esta policy NO afecta al bot. Solo aplica si en el futuro
-- el panel admin quiere leer/escribir como authenticated user.
--
-- Decisión 2026-07-01: NO referenciamos `public.admin_users` porque
-- en dev no existe. Cuando exista (en prod) ajustamos la policy a:
--   using (exists (select 1 from public.admin_users au where au.user_id = auth.uid()))
-- Por ahora cualquier authenticated puede pasar.
-- ------------------------------------------------------------
alter table public.lead_profile enable row level security;

drop policy if exists lead_profile_authenticated_all on public.lead_profile;
create policy lead_profile_authenticated_all on public.lead_profile
  for all to authenticated
  using (true)
  with check (true);

-- ------------------------------------------------------------
-- Service role bypass (server-side bot engine con service_role)
-- ------------------------------------------------------------
-- No necesitamos policy explicita para service_role porque bypasea
-- RLS por defecto. El bot engine usa createSupabaseAdminClient()
-- (service_role) para leer/escribir esta tabla.
