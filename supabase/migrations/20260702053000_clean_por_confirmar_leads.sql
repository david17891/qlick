-- ============================================================================
-- Limpiar leads con name='Por confirmar' (placeholder viejo, sesion 2026-07-02)
--
-- El bot-engine antes usaba "Por confirmar" como fallback cuando el lead no
-- tenia nombre. Eso causaba que el welcome dijera "¡Hola Por!" porque el
-- name se persiste en DB y se usa para construir el firstName.
--
-- Fix 2026-07-02:
--   1. Bot-engine: el fallback ahora es '' (string vacio) en los 3 call sites
--   2. DB: UPDATE leads SET name = NULL WHERE name = 'Por confirmar'
--      para que los leads existentes no sigan mostrando "Por" en el welcome.
--   3. Tambien limpiamos emails placeholder wa.*@placeholder.local y
--      demo@placeholder.local que se usaron en fallback sin DB.
-- ============================================================================

update public.leads
  set name = null
  where name = 'Por confirmar';

update public.leads
  set email = null
  where email like '%@placeholder.local'
     or email = 'demo@placeholder.local';
