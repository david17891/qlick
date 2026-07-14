-- ============================================================================
-- Sprint v0.9.x — Auditoría PR #6: agregar 'synthetic_lab' al enum lead_source
--
-- Auditoría detectó que `src/lib/whatsapp/synthetic-leads.ts:104` setea
-- `source: "synthetic_lab"` al crear un lead sintético del simulador
-- modo Real. PERO el enum `lead_source` (creado en migration
-- `20260623000001_init_leads.sql`) NO incluye ese valor, solo:
--   website, whatsapp, facebook_ads, instagram_ads, referral,
--   event, manual, organic, other
--
-- El INSERT fallaba con `invalid input value for enum lead_source:
-- "synthetic_lab"`, dejando el simulador modo Real NO funcional.
--
-- Fix: agregar el valor al enum via ALTER TYPE ... ADD VALUE.
-- Es idempotente (`IF NOT EXISTS` es soportado desde PG 9.6).
--
-- Forward-compatible: no afecta leads existentes.
-- Backward-compatible: el valor anterior "website" sigue siendo el
-- default de la columna, no se cambia nada retroactivamente.
-- ============================================================================

ALTER TYPE lead_source ADD VALUE IF NOT EXISTS 'synthetic_lab';

-- Comentario en la tabla para que devs futuros entiendan el nuevo valor.
COMMENT ON TYPE lead_source IS
  'Origen del lead. Valores: website, whatsapp, facebook_ads, instagram_ads, referral, event, manual, organic, other, synthetic_lab (v0.9.x — agregado 2026-07-14 para el simulador modo Real del laboratorio del admin).';

-- Recargar schema de PostgREST para que el nuevo valor sea visible
-- inmediatamente (sin esperar el cache TTL).
NOTIFY pgrst, 'reload schema';
