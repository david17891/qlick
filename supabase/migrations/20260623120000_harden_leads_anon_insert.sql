-- ============================================================
-- Hardening: eliminar INSERT público anónimo sobre `leads`
-- Qlick Marketing Integral — Fase 1 (pre-release v0.4.0)
-- ============================================================
-- Contexto:
--   La migración 20260623000001_init_leads.sql creó la política
--   `leads_public_insert_form` que permitía a `anon` y `authenticated`
--   insertar filas nuevas en `public.leads` siempre que cumplieran
--   ciertas CHECK (consent, status='new', email con formato, etc.).
--
--   Auditoría de seguridad (docs/SUPABASE_REAL_FOUNDATION.md §8) marcó
--   esto como un finding no bloqueante: la escritura pública directa
--   abre la tabla a inserts desde cualquier cliente con la publishable
--   key, aunque el flujo productivo real nunca la usa (el insert va
--   server-side con service role, que bypassa RLS).
--
-- Acción:
--   Drop de la política pública de INSERT. NO se crea una política de
--   reemplazo: el único insert permitido queda server-side vía
--   `createSupabaseAdminClient()` (service role, bypass de RLS).
--
--   Si en el futuro se quiere reabrir el insert directo desde el
--   navegador, debe ser con un patrón explícito y revisado
--   (p.ej. RPC autenticada, Turnstile/honeypot + CHECK estrictas),
--   y registrarlo como migración aparte.
--
-- No destructivo:
--   - No toca la tabla, índices, enums, trigger ni datos.
--   - No desactiva RLS (sigue activa).
--   - Solo elimina la política de INSERT para anon/authenticated.
--
-- Convención de nombres: YYYYMMDDHHMMSS_descripcion.sql (ver supabase/README.md).
-- ============================================================

-- ------------------------------------------------------------
-- Eliminar la política pública de INSERT.
-- IF EXISTS: idempotente (no falla si ya fue dropeada).
-- Solo afecta a INSERT; las políticas de SELECT/UPDATE para admin
-- (`leads_admin_read`, `leads_admin_write`) se conservan intactas.
-- ------------------------------------------------------------
drop policy if exists "leads_public_insert_form" on public.leads;

-- Comentario actualizado para reflejar el nuevo estado: el insert
-- público directo queda deshabilitado por diseño hasta que se decida
-- un patrón explícito.
comment on table public.leads is
  'Leads del CRM (Fase 1). Insert público directo DESHABILITADO (hardening pre-release): el único insert permitido es server-side vía service role. Lectura/escritura admin solo con rol admin/instructor. RLS activo.';
