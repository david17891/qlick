-- ============================================================================
-- FASE 2 (HARDENING): get_user_id_by_email RPC
--
-- Reemplaza el costoso listUsers({ page, perPage }) que el webhook y
-- /pagar/[slug] usan para resolver un user_id a partir del email del
-- customer. La paginaci├│n falla al pasar de 1,000 users (justo en el
-- evento del 11 de julio), causando Timeout 10s en Vercel y dejando sin
-- curso a clientes que pagaron.
--
-- Esta funci├│n consulta auth.users directamente (├¡ndice ├║nico en email)
-- en fracciones de milisegundo.
--
-- SECURITY:
--   - STABLE: no muta estado, se puede cachear dentro de la misma tx.
--   - SECURITY DEFINER: ejecuta con permisos del owner de la funci├│n
--     (postgres), permitiendo leer auth.users. El owner es la ├║nica
--     identidad con acceso al schema auth.
--   - GRANT EXECUTE solo a service_role: el cliente (anon, authenticated)
--     nunca puede llamarla directamente ΓÇö solo el server con service_role
--     key (que es server-side, no user-facing).
--
-- Rollback: DROP FUNCTION public.get_user_id_by_email(text);
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_user_id_by_email(p_email text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id
  FROM auth.users
  WHERE email = lower(p_email)
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_user_id_by_email(text) IS
  'Lookup O(1) de user_id por email. Solo service_role. Usado por webhook Stripe y /pagar/[slug] guest detection.';

GRANT EXECUTE ON FUNCTION public.get_user_id_by_email(text) TO service_role;
