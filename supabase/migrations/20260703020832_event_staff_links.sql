-- ============================================================================
-- event_staff_links: links temporales para scanner del staff (Commit B, 2026-07-03)
--
-- El admin (David) genera un link firmado que el staff usa para escanear
-- QRs en puerta, sin necesidad de login. El staff puede ser una persona
-- externa (institución que cede el espacio), a veces va solo, a veces no.
--
-- Flujo:
--   1. Admin abre /admin/eventos/[id]?tab=checkin → "Generar link de staff"
--   2. Sistema crea row con token random (192 bits) y valid_until
--   3. Admin copia el link (URL con token) y se lo manda al staff por
--      WhatsApp/SMS/email
--   4. Staff abre el link en su celular → aterriza en /admin/eventos/[id]/staff/scan
--   5. Sistema valida el token (no expirado, no revocado) y le da acceso
--      a la UI del scanner
--   6. Cada check-in se registra con actor={kind:'staff'} en audit log
--
-- Diseño:
--   - token: 32 chars base64url = 192 bits entropia (mismo patron que
--     event_qr_tokens)
--   - valid_from/valid_until: ventana de uso. Default valid_until =
--     starts_at + 4h (configurable por el admin al crear)
--   - last_used_at + use_count: métrica operacional. Si el admin ve que
--     un link se uso 200 veces en 10 minutos, probablemente hay algo
--     raro (o fue un evento grande, ok).
--   - revoked_at/revoked_by/revoke_reason: por si el link se filtra
--     (WhatsApp screenshot, etc). El admin puede revocarlo manualmente.
--
-- RLS: default-deny. Service role para CRUD. El endpoint publico
-- /api/staff/scan/[token] valida server-side con service role.
--
-- Idempotente: create table if not exists + indices if not exists.
-- ============================================================================

create table if not exists public.event_staff_links (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references public.events(id) on delete cascade,
  token           text not null unique,  -- crypto random URL-safe 32 chars
  -- Ventana de validez (configurable por el admin).
  valid_from      timestamptz not null default now(),
  valid_until     timestamptz not null,
  -- Metadata.
  created_by      text not null,  -- email del admin que lo generó
  created_at      timestamptz not null default now(),
  label           text,  -- opcional: "Staff entrada principal", "Staff A", etc.
  -- Métrica operacional.
  last_used_at    timestamptz,
  use_count       integer not null default 0,
  -- Revocación (por si se filtra).
  revoked_at      timestamptz,
  revoked_by      text,
  revoke_reason   text,
  -- Constraint: valid_until > valid_from (sanity check).
  constraint event_staff_links_valid_range
    check (valid_until > valid_from)
);

create unique index if not exists event_staff_links_token_idx
  on public.event_staff_links (token);

create index if not exists event_staff_links_event_idx
  on public.event_staff_links (event_id, created_at desc);

create index if not exists event_staff_links_active_idx
  on public.event_staff_links (event_id, valid_until)
  where revoked_at is null;

alter table public.event_staff_links enable row level security;
-- Default-deny: sin policies. Solo service role (admin actions + staff endpoints).

comment on table public.event_staff_links is
  'Links temporales firmados para scanner del staff en puerta. El admin '
  'los genera, el staff los abre sin login. Vencen (valid_until) y se '
  'pueden revocar (revoked_at). Service role only.';

comment on column public.event_staff_links.token is
  'URL-safe 32 chars (192 bits entropia). Va en la URL publica del scanner.';

comment on column public.event_staff_links.label is
  'Etiqueta opcional para identificar el link en la UI admin: '
  '"Entrada principal", "Staff A", etc. NULL = sin etiqueta.';

comment on column public.event_staff_links.use_count is
  'Cuantos check-ins se hicieron con este link. Métrica operacional: '
  'si se dispara en poco tiempo, probablemente hay algo raro.';

comment on column public.event_staff_links.revoked_at is
  'Si NO es NULL, el link está revocado y el endpoint publico retorna 410.';