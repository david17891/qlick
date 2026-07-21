-- ============================================================
-- 2026-07-21 — service_orders: copy renames (David feedback FASE 8)
--
-- David pidió (sesión 2026-07-21):
-- 1. "Sitio Web Express" → "Diseño web" (suena barato)
-- 2. "Auditoría & Diagnóstico 1a1" → "Auditoría y diagnóstico de negocio"
-- 3. "Campaña lista para lanzar en Meta con video, copy y segmentación
--     optimizados" → sin "copy" ni "optimizada" (suena a copiado)
-- 4. "2 copies para anuncios" → "2 textos para anuncios" (en variants
--     de kickstart-meta-ads)
--
-- Esta migration SOLO cambia strings. Schema intacto. Slugs intactos
-- (las URLs siguen funcionando: /servicios/sitio-web, /servicios/auditoria-1a1,
-- /servicios/kickstart-meta-ads). Las variants mantienen sus slugs
-- (esencial, profesional, zoom, presencial, videoia, video-personas).
--
-- Lo que NO se cambia:
-- - icons (Globe, ClipboardCheck, Megaphone) — válidos para los nuevos nombres.
-- - prices, delivery_days_min/max, slugs — sin cambios.
--
-- Idempotencia: el `updated_at = now()` se aplica siempre. Si los valores
-- ya están en el nuevo formato, no hay diff (los strings no cambian,
-- solo updated_at se actualiza). No-op desde el punto de vista funcional.
-- ============================================================

-- 1. Sitio web: "Sitio Web Express" → "Diseño web"
update public.services
   set display_name = 'Diseño web',
       updated_at = now()
 where slug = 'sitio-web';

-- 2. Auditoría: "Auditoría & Diagnóstico 1a1" → "Auditoría y diagnóstico de negocio"
update public.services
   set display_name = 'Auditoría y diagnóstico de negocio',
       updated_at = now()
 where slug = 'auditoria-1a1';

-- 3. Kickstart Meta Ads: nueva short_description sin "copy" ni "optimizada"
update public.services
   set short_description = 'Lanzamos tu primera campaña en Meta con video, anuncios y audiencias.',
       updated_at = now()
 where slug = 'kickstart-meta-ads';

-- 4. Variants de kickstart: "2 copies para anuncios" → "2 textos para anuncios"
update public.service_variants
   set description = replace(description, 'copies para anuncios', 'textos para anuncios'),
       updated_at = now()
 where service_id = (select id from public.services where slug = 'kickstart-meta-ads')
   and description ilike '%copies para anuncios%';
