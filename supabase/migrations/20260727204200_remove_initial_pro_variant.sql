-- ============================================================
-- 2026-07-27 — Desactivación del paquete Pro inicial de Meta Ads
--
-- Requerimiento del usuario: "el pro inicial se quita"
-- Desactivar variant "video-personas" de Kickstart Meta Ads
-- y reordenar display_order para los 3 paquetes vigentes:
-- 1. Básico ($3,500 MXN)
-- 2. Recomendado ($12,000 MXN)
-- 3. Premium ($18,000 MXN)
-- ============================================================

-- Desactivar el variant "video-personas" (Pro inicial)
update public.service_variants
   set is_active = false,
       updated_at = now()
 where service_id = (select id from public.services where slug = 'kickstart-meta-ads')
   and slug = 'video-personas';

-- Reordenar display_order de los paquetes activos
update public.service_variants
   set display_order = 1,
       updated_at = now()
 where service_id = (select id from public.services where slug = 'kickstart-meta-ads')
   and slug = 'videoia';

update public.service_variants
   set display_order = 2,
       updated_at = now()
 where service_id = (select id from public.services where slug = 'kickstart-meta-ads')
   and slug = 'recomendado';

update public.service_variants
   set display_order = 3,
       updated_at = now()
 where service_id = (select id from public.services where slug = 'kickstart-meta-ads')
   and slug = 'premium';
