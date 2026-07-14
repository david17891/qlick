-- ============================================================================
-- Sprint v0.9.x PR #3: simulador modo Real con personas sintéticas.
--
-- Agrega 2 columnas a `leads` para soportar el modo "Real" del simulador:
--   - simulation_source: discrimina leads creados por el laboratorio del admin
--     ('admin_lab') vs leads reales de WhatsApp/CRM (NULL).
--   - simulation_metadata: jsonb con info de auditoría (createdBy, createdAt,
--     sessionId del simulador, etc.).
--
-- Por qué:
--   El simulador modo Real ejecuta el bot-engine completo contra personas
--   sintéticas. Esas personas se persisten en `leads` (igual que un lead real)
--   pero necesitamos distinguirlas para:
--     1. No contaminar stats (filter en queries de analytics).
--     2. Permitir limpieza masiva desde la UI del simulador.
--     3. Audit trail: quién creó cada persona sintética y cuándo.
--
-- Las columnas son NULLABLE para NO romper los ~50K leads existentes en prod.
-- Solo se populan cuando se crea un lead vía el helper `createSyntheticLead`.
--
-- Backward compatible: 100%. Cero impacto en queries existentes (todas las
-- columnas nuevas son NULLABLE y NO tienen DEFAULT restrictivo).
-- ============================================================================

-- 1) Columna simulation_source (text, NULL por default para leads reales).
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS simulation_source text;

-- 2) Columna simulation_metadata (jsonb, NULL por default).
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS simulation_metadata jsonb;

-- 3) CHECK constraint: solo aceptamos 'admin_lab' por ahora. Si en el futuro
--    agregamos otro origen (ej: 'csv_import' o 'seed_demo'), actualizamos
--    este CHECK. Mantener el set cerrado evita basura accidental.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'leads_simulation_source_check'
  ) THEN
    ALTER TABLE leads
      ADD CONSTRAINT leads_simulation_source_check
      CHECK (simulation_source IS NULL OR simulation_source = 'admin_lab');
  END IF;
END $$;

-- 4) Índice parcial: solo leads con simulation_source IS NOT NULL. Acelera
--    queries de stats (excluir sintéticos) y de limpieza masiva.
CREATE INDEX IF NOT EXISTS idx_leads_simulation_source
  ON leads (simulation_source)
  WHERE simulation_source IS NOT NULL;

-- 5) Comentarios para que el ORM y los devs entiendan el shape.
COMMENT ON COLUMN leads.simulation_source IS
  'Sprint v0.9.x PR #3: marca leads creados por el simulador modo Real. NULL = lead real de WhatsApp/CRM. ''admin_lab'' = persona sintética del laboratorio del admin.';

COMMENT ON COLUMN leads.simulation_metadata IS
  'Sprint v0.9.x PR #3: jsonb con auditoría del lead sintético (createdBy, createdAt, sessionId del simulador, etc.).';

-- 6) Recargar schema de PostgREST para que las columnas nuevas sean visibles
--    inmediatamente (sin esperar el cache TTL).
NOTIFY pgrst, 'reload schema';
