-- 20260708010000_leads_bot_paused.sql
--
-- FIX 2026-07-08 (sesión madrugada David "poder apagar y encender el bot
-- por momentos, por conversación"): el admin debe poder pausar el bot
-- para un lead específico (típicamente cuando David toma el control de
-- la conversación manualmente). El bot sigue funcionando para el resto
-- de los leads; solo este queda en silencio.
--
-- Esta migration agrega 3 columnas a leads:
--   - bot_paused: boolean DEFAULT false (pausa activa)
--   - bot_paused_at: timestamptz (cuando se activó)
--   - bot_paused_by_email: text (audit: qué admin lo pausó)
--
-- Safe default: false. No rompe queries existentes que seleccionan leads
-- (todas las columnas son opcionales o tienen default).
--
-- El check del bot vive en bot-engine.ts:processInboundMessage
-- (línea ~3526, después de findOrCreateLead). Si bot_paused=true:
--   - persiste el inbound con metadata bot_paused_skip=true
--   - NO procesa el intent ni envía respuesta
--   - devuelve BotProcessResult con note="bot_paused_for_lead"
--
-- El admin toggle desde LeadDetailDrawer (CRM) vía
-- PATCH /api/admin/leads/[id]/bot-pause.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS bot_paused boolean NOT NULL DEFAULT false;

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS bot_paused_at timestamptz;

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS bot_paused_by_email text;

COMMENT ON COLUMN leads.bot_paused IS
  'FIX 2026-07-08: si true, el bot NO procesa nuevos mensajes de este lead. '
  'El admin (David) lo activa cuando toma el control de la conversación. '
  'El inbound se persiste igual con metadata bot_paused_skip=true para visibilidad.';

COMMENT ON COLUMN leads.bot_paused_at IS
  'FIX 2026-07-08: timestamp del último toggle a true.';

COMMENT ON COLUMN leads.bot_paused_by_email IS
  'FIX 2026-07-08: email del admin que pausó (audit log básico).';

-- Index para queries de admin: "muéstrame los leads pausados".
-- Lightweight: solo cuando el admin quiere ver la lista.
CREATE INDEX IF NOT EXISTS leads_bot_paused_idx
  ON leads (bot_paused)
  WHERE bot_paused = true;