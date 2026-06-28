-- ============================================================
-- admin_audit_log — agregar columnas before/after (Fase 5 Bloque 2)
--
-- La tabla admin_audit_log ya existe (creada por
-- 20260624000001_crm_operations_tables.sql). Este migration SOLO
-- agrega 2 columnas para soportar diff view en
-- /admin/system/audit-log: `before` y `after` (snapshots JSONB
-- del estado de la entidad antes/después del cambio).
--
-- Aditivo (ALTER TABLE ADD COLUMN IF NOT EXISTS) — no rompe installs
-- existentes. Las columnas son nullable, así que las entries viejas
-- quedan igual (before/after = null).
-- ============================================================

alter table public.admin_audit_log
  add column if not exists before jsonb;

alter table public.admin_audit_log
  add column if not exists after jsonb;

comment on column public.admin_audit_log.before is
  'Snapshot del estado de la entidad ANTES del cambio. null en create.';

comment on column public.admin_audit_log.after is
  'Snapshot del estado de la entidad DESPUÉS del cambio. null en delete.';

-- Índice adicional: timeline de cambios por entity (entity_type + entity_id)
-- ya existía. No hace falta duplicar.