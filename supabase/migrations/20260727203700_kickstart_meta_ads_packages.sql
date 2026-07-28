-- ============================================================
-- 2026-07-27 — Actualización de precios y nuevos paquetes de Meta Ads
--
-- Requerimiento del usuario:
-- 1. Paquete Básico de Kickstart Meta Ads pasa de $2,500 MXN a $3,500 MXN.
-- 2. Se agregan 2 paquetes adicionales a Kickstart Meta Ads:
--    - Paquete Recomendado ($12,000 MXN + Ads $5,000-$6,000)
--    - Paquete Premium ($18,000 MXN + Ads)
-- ============================================================

-- Actualizar precio base del servicio en public.services
update public.services
   set default_price_mxn = 3500,
       updated_at = now()
 where slug = 'kickstart-meta-ads';

-- 1. Actualizar variant "videoia" (Básico) de $2,500 a $3,500 MXN
update public.service_variants
   set price_mxn = 3500,
       updated_at = now()
 where service_id = (select id from public.services where slug = 'kickstart-meta-ads')
   and slug = 'videoia';

-- 2. Insertar / Actualizar variant "recomendado" ($12,000 MXN + Ads)
insert into public.service_variants (
  service_id, slug, label, description, includes, price_mxn,
  delivery_days_min, delivery_days_max, is_active, display_order
)
select
  s.id,
  'recomendado',
  'Recomendado',
  '+ Ads ($5,000–$6,000)',
  '[
    "Estrategia",
    "Producción de 4 videos",
    "8 piezas gráficas",
    "3 campañas",
    "Retargeting",
    "Scripts WhatsApp",
    "Optimización semanal",
    "Reporte semanal"
  ]'::jsonb,
  12000,
  7,
  14,
  true,
  3
from public.services s
where s.slug = 'kickstart-meta-ads'
on conflict (service_id, slug) do update set
  label               = excluded.label,
  description         = excluded.description,
  includes            = excluded.includes,
  price_mxn           = excluded.price_mxn,
  delivery_days_min   = excluded.delivery_days_min,
  delivery_days_max   = excluded.delivery_days_max,
  is_active           = true,
  display_order       = excluded.display_order,
  updated_at          = now();

-- 3. Insertar / Actualizar variant "premium" ($18,000 MXN + Ads)
insert into public.service_variants (
  service_id, slug, label, description, includes, price_mxn,
  delivery_days_min, delivery_days_max, is_active, display_order
)
select
  s.id,
  'premium',
  'Premium',
  '+ Ads',
  '[
    "Todo lo anterior",
    "8–10 videos",
    "Sesión de fotos profesional",
    "Landing page",
    "Capacitación personal",
    "Auditoría interna",
    "Reunión mensual"
  ]'::jsonb,
  18000,
  7,
  14,
  true,
  4
from public.services s
where s.slug = 'kickstart-meta-ads'
on conflict (service_id, slug) do update set
  label               = excluded.label,
  description         = excluded.description,
  includes            = excluded.includes,
  price_mxn           = excluded.price_mxn,
  delivery_days_min   = excluded.delivery_days_min,
  delivery_days_max   = excluded.delivery_days_max,
  is_active           = true,
  display_order       = excluded.display_order,
  updated_at          = now();
