-- ============================================================
-- Bloque 2 de Fase 4: Estados de WhatsApp follow-up
--
-- Cierra el Sub-bloque C del WhatsApp manual workflow. El admin
-- puede cambiar el estado de un lead (no_contactado -> contactado ->
-- interested / lost) y dejar un audit log de cada contacto.
--
-- Estados (enum text):
--   - 'no_contactado'  : default, todavia no se le escribio
--   - 'contactado'     : se le mando el primer WhatsApp
--   - 'interested'     : respondio con interes comercial
--   - 'lost'           : respondio que no le interesa / no respondio
--
-- Tabla lead_whatsapp_log: cada cambio de estado o contacto se registra
-- aca (append-only). Incluye el admin que lo hizo, el estado, un
-- mensaje opcional y metadata libre (jsonb para flexibilidad).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Columnas nuevas en `leads`
-- ------------------------------------------------------------

alter table public.leads
  add column if not exists whatsapp_status text not null default 'no_contactado';

-- CHECK: solo los 4 valores del enum. Si llega un valor invalido, falla
-- el INSERT (defense in depth: el server lib tambien valida).
alter table public.leads
  drop constraint if exists leads_whatsapp_status_check;
alter table public.leads
  add constraint leads_whatsapp_status_check
  check (whatsapp_status in ('no_contactado', 'contactado', 'interested', 'lost'));

alter table public.leads
  add column if not exists last_contacted_at timestamptz null;

-- Indice para queries tipo "dame los leads contactados en los ultimos N
-- dias" o "dame los no_contactados" (filtros del admin).
create index if not exists leads_whatsapp_status_idx
  on public.leads (whatsapp_status);
create index if not exists leads_last_contacted_at_idx
  on public.leads (last_contacted_at desc)
  where last_contacted_at is not null;

-- ------------------------------------------------------------
-- 2. Tabla de audit log `lead_whatsapp_log`
--
-- Append-only. Cada cambio de estado o contacto queda registrado.
-- privacy: 'message_preview' es los primeros N chars del mensaje
-- enviado, NO el mensaje completo (que vive en `lead_interactions`).
-- ------------------------------------------------------------

create table if not exists public.lead_whatsapp_log (
  id              uuid primary key default gen_random_uuid(),
  lead_id         uuid not null references public.leads(id) on delete cascade,
  event_id        uuid null references public.events(id) on delete set null,
  -- Estado al que se transiciona (post-cambio).
  new_status      text not null check (new_status in ('no_contactado', 'contactado', 'interested', 'lost')),
  -- Estado anterior (para el flujo de cambios).
  prev_status     text null,
  -- Email del admin que hizo el cambio (audit).
  actor_email     text,
  -- Preview del mensaje enviado (primeros 200 chars, NO PII completa).
  message_preview text,
  -- Metadata libre (jsonb): tipo de contacto, canal, etc.
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists lead_whatsapp_log_lead_idx
  on public.lead_whatsapp_log (lead_id, created_at desc);
create index if not exists lead_whatsapp_log_event_idx
  on public.lead_whatsapp_log (event_id);
create index if not exists lead_whatsapp_log_actor_idx
  on public.lead_whatsapp_log (actor_email);

alter table public.lead_whatsapp_log enable row level security;
-- Default-deny. Solo service role (admin) inserta/lee.

-- ------------------------------------------------------------
-- Comentarios documentales
-- ------------------------------------------------------------
comment on column public.leads.whatsapp_status is
  'Estado del flujo de WhatsApp manual: no_contactado (default) | contactado | interested | lost. Cerrado por check constraint.';

comment on column public.leads.last_contacted_at is
  'Timestamp del ultimo contacto por WhatsApp (cualquier tipo). NULL = nunca contactado. Actualizado por el server action markWhatsAppStatus.';

comment on table public.lead_whatsapp_log is
  'Audit log append-only de contactos WhatsApp con leads. Cierra el Sub-bloque C del WhatsApp manual workflow (Bloque 2 de Fase 4).';
