-- ============================================================================
-- Sprint 2 sub-sprint 2.1: tabla system_settings (Kill Switch dinámico)
-- ============================================================================
-- Requisito de David: el flag del Motor IA Socrático v2
-- (`DEEPSEEK_TOOLS_ENABLED`) debe poder togglarse desde el panel admin sin
-- redeploys ni esperar el rolling restart de Vercel (~10-30s). Por eso
-- agregamos una fila configurable en `system_settings` que el provider
-- consulta con caché de 30-60s.
--
-- Decisiones de diseño:
-- - `key` PK text → una sola fila por flag (lectura O(1) por PK).
-- - `value` jsonb → flexibilidad para flags distintos en el futuro
--   (no solo booleanos: strings, números, json complejo).
-- - `updated_at` timestamptz → trigger auto-update.
-- - `updated_by` text → email del admin que hizo el cambio (audit).
-- - `description` text → para documentar el flag en la DB misma.
-- - RLS: service_role bypassa RLS. Para `authenticated` con email en
--   ADMIN_EMAIL_ALLOWLIST, política de SELECT/UPDATE. anon y roles
--   externos sin allowlist → DENY.
-- - Seed: insertamos `deepseek_tools_enabled = false` para que el
--   provider arranque idéntico al comportamiento Sprint 1. El admin
--   lo enciende después desde el panel.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.system_settings (
  key          text PRIMARY KEY,
  value        jsonb NOT NULL,
  description  text,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   text
);

-- Auto-update del timestamp en cada UPDATE.
CREATE OR REPLACE FUNCTION public.system_settings_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_system_settings_updated_at ON public.system_settings;
CREATE TRIGGER trg_system_settings_updated_at
  BEFORE UPDATE ON public.system_settings
  FOR EACH ROW EXECUTE FUNCTION public.system_settings_set_updated_at();

COMMENT ON TABLE public.system_settings IS
  'Configuración global mutable desde el panel admin. ' ||
  'Flags en formato jsonb. Service_role usa PK para lookup O(1). ' ||
  'Lectura esperada: alta frecuencia durante runtime (cacheada en proceso).';

-- =============================================================================
-- Row-Level Security: defense in depth.
-- =============================================================================
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- service_role bypasea RLS automáticamente (es service role), así que
-- tanto el provider como las server actions del admin usan el client
-- service_role sin necesidad de políticas explícitas.

-- Para authenticated admins (defense in depth, en caso de que alguien
-- use el client normal en vez del service role):
DROP POLICY IF EXISTS p_system_settings_admin_select ON public.system_settings;
CREATE POLICY p_system_settings_admin_select ON public.system_settings
  FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() ->> 'email') IS NOT NULL
    AND (auth.jwt() ->> 'email') = ANY (
      string_to_array(current_setting('app.admin_email_allowlist', true), ',')
    )
  );

DROP POLICY IF EXISTS p_system_settings_admin_update ON public.system_settings;
CREATE POLICY p_system_settings_admin_update ON public.system_settings
  FOR UPDATE
  TO authenticated
  USING (
    (auth.jwt() ->> 'email') IS NOT NULL
    AND (auth.jwt() ->> 'email') = ANY (
      string_to_array(current_setting('app.admin_email_allowlist', true), ',')
    )
  )
  WITH CHECK (
    (auth.jwt() ->> 'email') IS NOT NULL
    AND (auth.jwt() ->> 'email') = ANY (
      string_to_array(current_setting('app.admin_email_allowlist', true), ',')
    )
  );

-- anon y roles sin allowlist: no tienen acceso (deny implícito).

-- =============================================================================
-- Seed del flag default.
-- =============================================================================
INSERT INTO public.system_settings (key, value, description, updated_by)
VALUES (
  'deepseek_tools_enabled',
  'false'::jsonb,
  'Motor IA Socrático y Captura de Leads v2 (tool-calling). ' ||
  'Si true: runWithToolLoop activo en el provider DeepSeek. ' ||
  'Si false o no seteado: comportamiento Sprint 1 (single-shot).',
  'migration'
)
ON CONFLICT (key) DO NOTHING;

-- Índices.
-- PK ya crea índice único en `key`. No agregamos más índices (tabla
-- pequeña, lecturas O(1) por PK).
