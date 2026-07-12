-- ==============================================================================
-- TORRE DE CONTROL AI & AGENTE SÚPER EJECUTIVO (PLAN CANÓNICO v15 FINAL)
-- ==============================================================================
-- PR #1: Torre de Control, Base de Datos, UI y Métricas.
-- Solo siembra modos activos actuales (socratic_autopilot_v2 default,
-- socratic_no_tools_v1). El modo super_executive se siembra en PR #2.
-- Producción 100% segura: el bot continúa en socratic_autopilot_v2.
-- ==============================================================================

-- 1. Tipo ENUM canónico para razones de pausa del bot
DO $$ BEGIN
  CREATE TYPE public.bot_pause_reason AS ENUM (
    'keyword_escalation',
    'ai_semantic_escalation',
    'manual'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Añadir columna bot_paused_reason a leads + limpieza canónica de cualquier constraint previa (I-NEW-9)
-- El plan v15 omitió el ADD COLUMN; corregido in-place al aplicar (gap detectado en runtime).
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS bot_paused_reason public.bot_pause_reason;

ALTER TABLE public.leads
DROP CONSTRAINT IF EXISTS check_bot_paused_reason_consistency;

ALTER TABLE public.leads
DROP CONSTRAINT IF EXISTS check_pause_reason;

ALTER TABLE public.leads
ADD CONSTRAINT check_bot_paused_reason_consistency
CHECK (bot_paused_reason IS NULL OR bot_paused = true);

-- 3. Tabla canónica de Reglas de Oro (ai_bot_rules) con conteo y metadata tipada
CREATE TABLE IF NOT EXISTS public.ai_bot_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL DEFAULT 'global',
  instruction text NOT NULL,
  priority integer NOT NULL DEFAULT 0,
  usage_count integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  expires_at timestamptz NULL,
  created_by text NOT NULL DEFAULT 'human_operator',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT check_discount_metadata_shape CHECK (
    (metadata->>'discount_percent') IS NULL
    OR (
      (metadata->>'discount_percent')::int BETWEEN 1 AND 100
      AND (metadata->>'valid_until') IS NOT NULL
    )
  )
);

-- 4. RLS Canónico: Service Role Full Access (la autorización real ocurre en Server Actions con requireAdmin)
ALTER TABLE public.ai_bot_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on ai_bot_rules" ON public.ai_bot_rules
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 5. Índice Parcial Canónico SIN now() (Indexa solo filas permanentes; temporales van al SELECT)
CREATE INDEX IF NOT EXISTS idx_ai_bot_rules_active_priority
ON public.ai_bot_rules (scope, is_active, priority DESC, usage_count DESC)
WHERE is_active = true AND expires_at IS NULL;

-- 6. Siembra canónica segura en PR #1 (Solo modos activos actuales; Súper Ejecutivo se siembra en PR #2)
INSERT INTO public.system_settings (key, value, updated_by)
VALUES
  ('bot_global_mode', '"socratic_autopilot_v2"'::jsonb, 'system'),
  ('bot_max_active_rules', to_jsonb(8), 'system'),  -- number nativo (8::jsonb falla: int→jsonb requiere cast explícito)
  ('bot_context_blocks_config', '{"uxHook":true,"crmHistory":true,"activeEvent":true,"coursesCatalog":true,"humanRules":true,"semanticGuardrails":true}'::jsonb, 'system')
ON CONFLICT (key) DO NOTHING;
