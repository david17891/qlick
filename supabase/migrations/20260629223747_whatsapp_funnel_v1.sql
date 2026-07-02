-- ============================================================
-- WhatsApp funnel v1 — QR check-in, conversation log & consent audit
--
-- IMPORTANTE — historial de aplicacion retroactivo (2026-06-30):
-- Esta migration fue marcada como `applied` en el ledger via
-- `supabase migration repair --status applied 20260629223747` durante
-- el setup inicial del Hito C, ANTES de que el SQL se ejecutara
-- realmente contra la DB remota. Cuando se intento aplicar el 2026-06-30
-- (`db push`), fallo por CREATE POLICY no-idempotente en migrations
-- anteriores y el efecto real de ESTA migration nunca corrio.
--
-- Fix aplicado el 2026-06-30:
--   1. `supabase migration repair --status reverted 20260629223747`
--      (la saco del ledger)
--   2. `supabase db push` la volvio a correr desde cero con exito
--      (Finished supabase db push, 3 tablas creadas con RLS activa)
--
-- Estado actual (verificado via SQL Editor 2026-06-30 12:23):
--   event_qr_tokens              RLS=true, 10 cols
--   lead_consent_log             RLS=true, 10 cols
--   lead_whatsapp_conversations  RLS=true, 10 cols
-- ============================================================
-- Cierra el Sub-bloque D del WhatsApp manual workflow (Bloque 2 de Fase 4)
-- y la pieza de conferencias presenciales del funnel.
--
-- Tres tablas nuevas, todas con RLS default-deny (anon y authenticated
-- sin acceso; solo service role via server libs):
--
--   1. public.event_qr_tokens
--      Tokens únicos por asistente para check-in QR en puerta de
--      conferencias presenciales. El asistente recibe el link/token en
--      su WhatsApp de confirmación, lo escanea en puerta y el staff
--      marca checked_in_at + checked_in_by.
--
--   2. public.lead_whatsapp_conversations
--      Historial completo de mensajes WhatsApp por lead (inbound +
--      outbound). Idempotencia via whatsapp_message_id (wamid de Meta).
--      phone_normalized es NOT NULL para permitir joins pre-lead
--      (captura anónima antes de promover a leads).
--
--   3. public.lead_consent_log
--      Audit trail LFPDPPP de consentimientos para ser contactado
--      comercialmente. Append-only: cada grant o revoke queda
--      registrado con el texto exacto del disclosure mostrado, IP y
--      user agent cuando estén disponibles.
--
-- Modelo de seguridad (alineado con D-018, masterclass funnel, eventos
-- funnel y lead_whatsapp_log previo):
-- - Sin policies públicas. RLS default-deny para anon y authenticated.
-- - El QR scanner, el bot de WhatsApp y los server actions usan service
--   role (bypass RLS) para escribir/leer.
-- - Privacy: datos personales solo server-side. Ningún cliente Supabase
--   del navegador debe tocar estas tablas.
-- - Idempotente: create table if not exists + create index if not exists.
-- ============================================================

-- ------------------------------------------------------------
-- 1. public.event_qr_tokens — check-in QR en puerta
-- ------------------------------------------------------------

create table if not exists public.event_qr_tokens (
  id                      uuid primary key default gen_random_uuid(),
  event_id                uuid not null references public.events(id) on delete cascade,
  attendee_phone_normalized text not null,  -- formato +52XXXXXXXXXX
  attendee_name           text not null,
  attendee_email          text,
  token                   text not null unique,  -- crypto random URL-safe, 32 chars
  checked_in_at           timestamptz,
  checked_in_by           text,  -- email del staff que escaneó
  expires_at              timestamptz not null,  -- event end + 6h
  created_at              timestamptz not null default now()
);

create index if not exists idx_event_qr_tokens_token
  on public.event_qr_tokens (token);
create index if not exists idx_event_qr_tokens_event_id
  on public.event_qr_tokens (event_id);
create index if not exists idx_event_qr_tokens_phone
  on public.event_qr_tokens (attendee_phone_normalized);

alter table public.event_qr_tokens enable row level security;
-- Default-deny: sin policies públicas. Solo service role (server-side)
-- lee/escribe (QR scanner + WhatsApp sender).

comment on table public.event_qr_tokens is
  'Tokens únicos por asistente para check-in QR en puerta de conferencias presenciales. RLS default-deny, solo service role.';
comment on column public.event_qr_tokens.token is
  'Token URL-safe de 32 chars generado server-side (crypto.randomBytes). UNIQUE — usado en el link del WhatsApp.';
comment on column public.event_qr_tokens.checked_in_by is
  'Email del staff que escaneó el QR (audit de quién hizo el check-in).';
comment on column public.event_qr_tokens.expires_at is
  'Ventana de validez del QR (event end + 6h por default). Después de eso el scanner rechaza.';

-- ------------------------------------------------------------
-- 2. public.lead_whatsapp_conversations — historial de mensajes
-- ------------------------------------------------------------

create table if not exists public.lead_whatsapp_conversations (
  id                  uuid primary key default gen_random_uuid(),
  lead_id             uuid references public.leads(id) on delete cascade,  -- nullable: pre-lead
  phone_normalized    text not null,  -- para joins antes de tener lead_id
  direction           text not null check (direction in ('inbound', 'outbound')),
  message_type        text not null check (message_type in ('text', 'template', 'image', 'document', 'audio', 'interactive')),
  body                text,
  whatsapp_message_id text unique,  -- wamid de Meta, idempotencia de webhook
  metadata            jsonb not null default '{}'::jsonb,
  related_event_id    uuid references public.events(id) on delete set null,
  created_at          timestamptz not null default now()
);

create index if not exists idx_lead_whatsapp_conv_phone
  on public.lead_whatsapp_conversations (phone_normalized);
create index if not exists idx_lead_whatsapp_conv_lead_id
  on public.lead_whatsapp_conversations (lead_id);
create index if not exists idx_lead_whatsapp_conv_event_id
  on public.lead_whatsapp_conversations (related_event_id);
create index if not exists idx_lead_whatsapp_conv_wamid
  on public.lead_whatsapp_conversations (whatsapp_message_id);
create index if not exists idx_lead_whatsapp_conv_created_at
  on public.lead_whatsapp_conversations (created_at desc);

alter table public.lead_whatsapp_conversations enable row level security;
-- Default-deny: sin policies públicas. Solo service role (bot de
-- WhatsApp + webhook receiver + admin viewer server-side).

comment on table public.lead_whatsapp_conversations is
  'Historial completo de mensajes WhatsApp por lead (inbound + outbound). Append-only. RLS default-deny, solo service role.';
comment on column public.lead_whatsapp_conversations.lead_id is
  'FK a leads. NULLABLE para capturar mensajes de prospectos pre-lead (sin consentimiento aún).';
comment on column public.lead_whatsapp_conversations.phone_normalized is
  '+52XXXXXXXXXX. NOT NULL siempre, incluso cuando lead_id es NULL — permite joins y lookups pre-lead.';
comment on column public.lead_whatsapp_conversations.whatsapp_message_id is
  'wamid de Meta. UNIQUE para idempotencia del webhook (re-entregas no duplican filas).';

-- ------------------------------------------------------------
-- 3. public.lead_consent_log — audit LFPDPPP
-- ------------------------------------------------------------

create table if not exists public.lead_consent_log (
  id              uuid primary key default gen_random_uuid(),
  lead_id         uuid references public.leads(id) on delete cascade,
  phone_normalized text,  -- para consent pre-lead (sin lead_id aún)
  consent_granted boolean not null,
  consent_source  text not null check (consent_source in ('whatsapp_bot', 'event_form', 'contact_form', 'manual', 'opt_out')),
  consent_text    text not null,  -- texto exacto del disclosure que se le mostró
  ip_address      inet,
  user_agent      text,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists idx_lead_consent_log_lead_id
  on public.lead_consent_log (lead_id);
create index if not exists idx_lead_consent_log_phone
  on public.lead_consent_log (phone_normalized);
create index if not exists idx_lead_consent_log_created_at
  on public.lead_consent_log (created_at desc);

alter table public.lead_consent_log enable row level security;
-- Default-deny: sin policies públicas. Solo service role (formularios
-- server-side + bot + admin viewer server-side).

comment on table public.lead_consent_log is
  'Audit trail LFPDPPP de consentimientos para ser contactado comercialmente. Append-only. RLS default-deny, solo service role.';
comment on column public.lead_consent_log.consent_text is
  'Texto EXACTO del disclosure que se le mostró al usuario al momento del grant/revoke. Evidencia legal.';
comment on column public.lead_consent_log.consent_source is
  'Origen del consentimiento: whatsapp_bot (bot conversacional) | event_form (formulario público de evento) | contact_form (formulario de contacto) | manual (admin lo cargó a mano) | opt_out (revocación explícita).';