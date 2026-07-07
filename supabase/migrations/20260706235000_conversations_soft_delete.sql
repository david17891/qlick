-- ------------------------------------------------------------
-- 2026-07-06 ~23:50 — Soft-delete para conversaciones del CRM
--
-- FIX 2026-07-06 (conversaciones v2): David pidió poder eliminar
-- conversaciones desde el panel admin. Hard-delete choca con
-- compliance LGPD / LFPDPPP (los rows son evidencia legal de qué
-- se conversó). Soft-delete:
--   1. Preserva el row (mantiene el audit del bot + la trazabilidad).
--   2. Lo oculta de la UI (deleted_at IS NULL en queries de lectura).
--   3. Registra quién lo borró + razón opcional.
--
-- Aplica a TODOS los mensajes de un lead (soft-delete-all de la
-- conversación completa). El admin puede registrar mensajes nuevos
-- después (re-abre la conversación naturalmente al insertar).
-- ------------------------------------------------------------

ALTER TABLE public.lead_whatsapp_conversations
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS deleted_by_email TEXT NULL,
  ADD COLUMN IF NOT EXISTS delete_reason TEXT NULL;

-- Índice parcial: las queries que filtran `deleted_at IS NULL` son
-- las de lectura caliente (cada vez que el admin abre el cajón
-- del lead). Con índice completo el planner tendría que escanear
-- toda la tabla; con índice parcial, trae solo los vivos.
CREATE INDEX IF NOT EXISTS idx_lead_whatsapp_conv_alive
  ON public.lead_whatsapp_conversations (lead_id, created_at DESC)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN public.lead_whatsapp_conversations.deleted_at IS
  'Soft-delete timestamp. NULL = mensaje activo en el CRM. Si está set, el mensaje se oculta de la UI del CRM pero el row se preserva (compliance LGPD: el audit del bot queda intacto).';
COMMENT ON COLUMN public.lead_whatsapp_conversations.deleted_by_email IS
  'Email del admin que ejecutó el soft-delete (para audit log).';
COMMENT ON COLUMN public.lead_whatsapp_conversations.delete_reason IS
  'Razón opcional del soft-delete (free text, ej. "mensaje duplicado", "PII expuesta").';

-- No es necesario migrar el CHECK constraint de message_type:
-- los mensajes registrados manualmente desde el UI usan
-- `message_type='text'` + `metadata.manual=true`, sin tocar el enum.
