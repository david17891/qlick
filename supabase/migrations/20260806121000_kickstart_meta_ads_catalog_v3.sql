-- ============================================================
-- 2026-08-06 — Catálogo canónico inicial de Kickstart Meta Ads (v3)
--
-- 1. Actualiza el precio base de default_price_mxn en public.services a $3,500 MXN.
-- 2. Define/actualiza las 3 variantes activas (Básico, Recomendado, Premium)
--    con sus días de entrega min/max, incluidores en JSONB y aviso explícito
--    de que el presupuesto de Meta Ads es independiente del costo del servicio.
-- ============================================================

-- Asegurar que el servicio principal kickstart-meta-ads existe y tiene precio base $3,500 MXN
update public.services
   set default_price_mxn = 3500,
       updated_at = now()
 where slug = 'kickstart-meta-ads';

-- 1. Paquete Básico: Arranque con IA ($3,500 MXN, 5-7 días)
insert into public.service_variants (
  service_id, slug, label, description, includes, price_mxn,
  delivery_days_min, delivery_days_max, is_active, display_order
)
select
  s.id,
  'basico',
  'Básico (Arranque IA)',
  '+ Ads (presupuesto del cliente)',
  '[
    "Hasta 3 imágenes publicitarias",
    "2 videos cortos generados con IA (10-20 segundos)",
    "Configuración de campaña inicial en Meta",
    "Lanzamiento de anuncios",
    "Reporte inicial de resultados"
  ]'::jsonb,
  3500,
  5,
  7,
  true,
  1
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

-- Si existía la variante legacy 'videoia', desactivarla de forma segura
update public.service_variants
   set is_active = false,
       updated_at = now()
 where service_id = (select id from public.services where slug = 'kickstart-meta-ads')
   and slug = 'videoia';

-- 2. Paquete Recomendado: Videos comerciales ($12,000 MXN, 7-14 días)
insert into public.service_variants (
  service_id, slug, label, description, includes, price_mxn,
  delivery_days_min, delivery_days_max, is_active, display_order
)
select
  s.id,
  'recomendado',
  'Recomendado (Videos Comerciales)',
  '+ Ads (presupuesto del cliente)',
  '[
    "Estrategia comercial y de contenido",
    "Producción de videos comerciales",
    "Piezas gráficas para anuncios",
    "Lanzamiento de campaña inicial",
    "30 días de optimización recomendada con revisión semanal"
  ]'::jsonb,
  12000,
  7,
  14,
  true,
  2
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

-- 3. Paquete Premium: Contenido y crecimiento 360° ($18,000 MXN, 7-14 días)
insert into public.service_variants (
  service_id, slug, label, description, includes, price_mxn,
  delivery_days_min, delivery_days_max, is_active, display_order
)
select
  s.id,
  'premium',
  'Premium (Contenido y Crecimiento)',
  '+ Ads (presupuesto del cliente)',
  '[
    "8 a 10 videos comerciales",
    "Sesión de fotos profesional",
    "Landing page de conversión",
    "Capacitación de equipo ventas",
    "Auditoría interna de procesos",
    "Reunión mensual de revisión",
    "30 días de optimización de campañas"
  ]'::jsonb,
  18000,
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
