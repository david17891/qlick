-- supabase/migrations/20260713010000_crm_admin_rls_policies.sql
--
-- AUDIT-002 del SUPER_AUDIT_REMEDIATION_PROTOCOL.md (Ola 3).
-- Cierra el gap de deny-all implícito en 3 tablas administrativas de UI
-- (crm_notes, crm_tasks, lead_interactions) creando policies explícitas
-- por rol.
--
-- Las 3 tablas tienen `rowsecurity = true` pero 0 policies desde el
-- sprint v0.9.x, lo que las hace inaccesibles vía PostgREST para el
-- cliente (deny-all implícito = nadie accede). El admin UI actualmente
-- las consulta vía server actions / API routes con service role, lo
-- cual es funcional pero obliga a pasar por el backend.
--
-- Esta migration agrega policies admin-only (app_role IN admin/instructor)
-- para habilitar la posibilidad de consultar directamente desde el
-- cliente si David lo decide en sprints futuros, sin perder la barrera
-- de seguridad: solo admin o instructor pueden leer/escribir.
--
-- Reversible con DROP POLICY. NO toca datos.

-- ─────────────────────────────────────────────────────────────────
-- crm_notes
-- ─────────────────────────────────────────────────────────────────
CREATE POLICY crm_notes_admin_all ON crm_notes
  FOR ALL
  TO authenticated
  USING (COALESCE((auth.jwt() ->> 'app_role') = ANY(ARRAY['admin','instructor']), false))
  WITH CHECK (COALESCE((auth.jwt() ->> 'app_role') = ANY(ARRAY['admin','instructor']), false));

-- ─────────────────────────────────────────────────────────────────
-- crm_tasks
-- ─────────────────────────────────────────────────────────────────
CREATE POLICY crm_tasks_admin_all ON crm_tasks
  FOR ALL
  TO authenticated
  USING (COALESCE((auth.jwt() ->> 'app_role') = ANY(ARRAY['admin','instructor']), false))
  WITH CHECK (COALESCE((auth.jwt() ->> 'app_role') = ANY(ARRAY['admin','instructor']), false));

-- ─────────────────────────────────────────────────────────────────
-- lead_interactions
-- ─────────────────────────────────────────────────────────────────
CREATE POLICY lead_interactions_admin_all ON lead_interactions
  FOR ALL
  TO authenticated
  USING (COALESCE((auth.jwt() ->> 'app_role') = ANY(ARRAY['admin','instructor']), false))
  WITH CHECK (COALESCE((auth.jwt() ->> 'app_role') = ANY(ARRAY['admin','instructor']), false));

-- Forzar reload de PostgREST para que vea las nuevas policies.
NOTIFY pgrst, 'reload schema';
