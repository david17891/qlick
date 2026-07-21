-- ============================================================
-- 2026-07-21 — Quitar flag is_popular de google-business-profile
--
-- David pidió quitar el badge "MÁS POPULAR" de la card del catálogo
-- (07:43 "ya que no sale bien"). El campo `is_popular` se mantiene en
-- el schema (puede volver a usarse con un diseño mejor) pero ningún
-- servicio lo tendrá activo por ahora.
-- ============================================================

update public.services
   set is_popular = false,
       updated_at = now()
 where is_popular = true;
