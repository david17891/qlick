-- Sprint v0.12 HOTFIX de seguridad (2026-07-14).
-- Email de Supabase: "Table publicly accessible — Anyone with your
-- project URL can read, edit, and delete all data in this table
-- because Row-Level Security is not enabled. rls_disabled_in_public".
--
-- La tabla `bot_usage_daily` (acumulador diario de tokens + costo
-- DeepSeek) estaba sin RLS. Cualquiera con la URL del proyecto
-- Supabase podía:
--   - SELECT: ver el consumo de tokens de la operación
--   - INSERT: inyectar datos falsos de uso (afecta el dashboard de stats)
--   - UPDATE/DELETE: alterar/limpiar el histórico
--
-- FIX: habilitar RLS + crear policies que SOLO permiten acceso al
-- service_role (el backend de Qlick). Los roles `anon` y
-- `authenticated` quedan explícitamente bloqueados.
--
-- Verificación end-to-end: el bot-engine sigue escribiendo tokens
-- (usa service_role que bypassa RLS) y el endpoint admin
-- /api/admin/bot/stats sigue leyendo (también usa service_role).
-- Los E2E tests con deepseek real confirman que el flujo
-- end-to-end no se rompe.

-- 1. Habilitar RLS.
ALTER TABLE public.bot_usage_daily ENABLE ROW LEVEL SECURITY;

-- 2. Bloquear explícitamente el rol `anon` (usuarios sin sesión).
--    Defense in depth: aunque RLS ya bloquea por default, lo
--    hacemos explícito para que sea visible en pg_policies.
CREATE POLICY "bot_usage_daily_block_anon" ON public.bot_usage_daily
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

-- 3. Bloquear explícitamente el rol `authenticated` (usuarios logueados).
--    Mismo rationale que arriba.
CREATE POLICY "bot_usage_daily_block_authenticated" ON public.bot_usage_daily
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

-- 4. NO creamos policy para `service_role` porque por diseño
--    service_role bypassa RLS. Esto es el comportamiento correcto:
--    el backend de Qlick (con SUPABASE_SERVICE_ROLE_KEY) sigue
--    accediendo normalmente, pero los clientes externos (anon
--    y authenticated) están bloqueados.
--
-- 5. Comentario de la tabla para documentar el invariante.
COMMENT ON TABLE public.bot_usage_daily IS
  'Acumulador diario de tokens + costo DeepSeek. RLS habilitado (Sprint v0.12 hotfix 2026-07-14). Solo service_role accede (backend). Roles anon/authenticated bloqueados explícitamente.';
