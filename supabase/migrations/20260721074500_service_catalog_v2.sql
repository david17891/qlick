-- ============================================================
-- 2026-07-21 — Catálogo de servicios v2 + Google Business Profile
--
-- David pidió (sesión 2026-07-21 07:40):
-- 1. Agregar Google Business Profile como nuevo servicio (1 solo paquete: Básico $1,500).
-- 2. Reformular descripciones de los 4 servicios con copy enfocado al cliente
--    final (sin jerga técnica innecesaria: UX, SEO On Page, Analytics,
--    Capacitación incluida, Pixel, Conversiones).
-- 3. Migrar la lista de "Incluye" de texto a bullets estructurados (JSONB).
-- 4. La arquitectura debe permitir agregar más paquetes en el futuro sin
--    modificar código (los variants ya eran 1:N; con `includes JSONB` los
--    bullets también son dinámicos).
-- 5. Toda la data queda 100% en DB — sin hardcodes en templates.
--
-- Cambios de schema:
--   - services.bullets JSONB         (features comunes del servicio, para /servicios)
--   - services.is_popular BOOLEAN    (badge "MÁS POPULAR" en la card)
--   - service_variants.includes JSONB (qué incluye este paquete específico)
--
-- Cambios de seed:
--   - 3 services existentes: copy + bullets actualizados
--   - 1 service nuevo: google-business-profile (con 1 variant)
--   - 6 variants existentes: labels + bullets (includes) + precios
--     consistentes con el nuevo spec
--   - display_order: sitio-web(10), google-business-profile(20),
--     auditoria-1a1(30), kickstart-meta-ads(40)
--
-- Idempotente: `add column if not exists`, `on conflict do update` en
-- inserts de seed. Re-correr no rompe.
-- ============================================================

-- ===========================================================
-- Schema additions
-- ===========================================================
alter table public.services
  add column if not exists bullets     jsonb   not null default '[]'::jsonb,
  add column if not exists is_popular  boolean not null default false;

alter table public.service_variants
  add column if not exists includes    jsonb   not null default '[]'::jsonb;

comment on column public.services.bullets is
  'Features comunes del servicio (lista de strings). Se muestran como bullets en la card del catálogo y resumen lo que el cliente obtiene al contratar CUALQUIER paquete del servicio.';

comment on column public.services.is_popular is
  'Si true, la card muestra el badge "MÁS POPULAR" en el header.';

comment on column public.service_variants.includes is
  'Qué incluye este paquete específico (lista de strings). Se renderiza como bullets en el variant card del detalle. Permite agregar más paquetes sin tocar código.';

-- ===========================================================
-- display_order consistente
-- ===========================================================
update public.services set display_order = 10, updated_at = now() where slug = 'sitio-web';
update public.services set display_order = 30, updated_at = now() where slug = 'auditoria-1a1';
update public.services set display_order = 40, updated_at = now() where slug = 'kickstart-meta-ads';

-- ===========================================================
-- Service 1: sitio-web — copy + bullets actualizados
--   Quitar: "UX", "SEO On Page", "Analytics", "Capacitación incluida"
-- ===========================================================
update public.services
   set short_description = 'Una página web que se ve profesional y convierte visitas en clientes.',
       long_description  = 'Tu negocio disponible en internet en pocos días. Diseñamos y publicamos tu sitio con todo lo esencial para que tus clientes te encuentren y te contacten.',
       bullets = '[
         "Sitio web autoadministrable",
         "Diseño responsive y moderno",
         "Formulario de contacto",
         "Integración con WhatsApp",
         "Optimizada para Google"
       ]'::jsonb,
       updated_at = now()
 where slug = 'sitio-web';

-- ===========================================================
-- Service 3: auditoria-1a1 — copy + bullets actualizados
-- ===========================================================
update public.services
   set short_description = 'Una llamada honesta con un estratega senior para revisar tu marketing y decirte qué arreglar primero.',
       long_description  = 'Descubre qué está frenando el crecimiento de tu negocio. Una sesión 1 a 1 con un estratega senior que analiza tu marketing y te da un plan claro de acción.',
       bullets = '[
         "Análisis de presencia digital",
         "Revisión de canales y campañas",
         "Identificación de oportunidades",
         "Prioridades claras y accionables",
         "Recomendaciones personalizadas",
         "Reporte con plan de acción"
       ]'::jsonb,
       updated_at = now()
 where slug = 'auditoria-1a1';

-- ===========================================================
-- Service 4: kickstart-meta-ads — copy + bullets actualizados
--   Quitar de variants: "Pixel", "Conversiones"
--   (en bullets del service se conserva "Configuración de píxel" porque
--    es el término que el cliente busca al investigar el servicio)
-- ===========================================================
update public.services
   set short_description = 'Lanzamos tu primera campaña en Meta con video, anuncios y audiencias.',
       long_description  = 'Consigue tus primeros clientes desde Facebook e Instagram. Armamos tu primera campaña lista para escalar desde el día uno.',
       bullets = '[
         "Estrategia y configuración",
         "Creación de audiencias",
         "Diseño de anuncios (imagen/video)",
         "Configuración de píxel",
         "Lanzamiento de campaña",
         "Reporte inicial de resultados"
       ]'::jsonb,
       updated_at = now()
 where slug = 'kickstart-meta-ads';

-- ===========================================================
-- Service 2 (NUEVO): google-business-profile
--   1 solo paquete: Básico $1,500. Arquitectura permite más paquetes
--   en el futuro via INSERT a service_variants sin tocar código.
-- ===========================================================
insert into public.services (
  slug, category, display_name, short_description, long_description,
  icon, default_currency, default_price_mxn, is_popular,
  is_active, display_order, bullets
) values (
  'google-business-profile',
  'digital',
  'Google Business Profile',
  'Haz que tus clientes te encuentren en Google.',
  'Haz que tus clientes te encuentren en Google Maps y atrae más clientes locales. Creamos y optimizamos tu perfil para que tu negocio aparezca cuando te buscan.',
  'MapPin',
  'MXN',
  1500,
  true,
  true,
  20,
  '[
    "Creación o reclamación del perfil",
    "Optimización completa del perfil",
    "Selección de categorías estratégicas",
    "Fotos, servicios y descripción optimizada",
    "Enlace a WhatsApp y sitio web",
    "Configuración de horarios",
    "Capacitación incluida"
  ]'::jsonb
)
on conflict (slug) do update set
  display_name      = excluded.display_name,
  short_description = excluded.short_description,
  long_description  = excluded.long_description,
  icon              = excluded.icon,
  default_price_mxn = excluded.default_price_mxn,
  is_popular        = excluded.is_popular,
  is_active         = true,
  display_order     = excluded.display_order,
  bullets           = excluded.bullets,
  updated_at        = now();

-- Variant: Básico $1,500
insert into public.service_variants (
  service_id, slug, label, description, includes, price_mxn,
  delivery_days_min, delivery_days_max, is_active, display_order
)
select
  s.id,
  'basico',
  'Básico',
  null,
  '[
    "Creación o reclamación del perfil",
    "Optimización completa del perfil",
    "Selección de categorías",
    "Fotografías, servicios y descripción",
    "Enlace a WhatsApp y sitio web",
    "Configuración de horarios",
    "Capacitación de 15 minutos"
  ]'::jsonb,
  1500,
  2,
  3,
  true,
  1
from public.services s
where s.slug = 'google-business-profile'
on conflict (service_id, slug) do update set
  label               = excluded.label,
  includes            = excluded.includes,
  price_mxn           = excluded.price_mxn,
  delivery_days_min   = excluded.delivery_days_min,
  delivery_days_max   = excluded.delivery_days_max,
  is_active           = true,
  display_order       = excluded.display_order,
  updated_at          = now();

-- ===========================================================
-- Variants: sitio-web esencial + profesional
--   Quitar: "SEO", "analytics", "copy persuasivo"
--   Etiquetas: "Esencial" → "Básico", "Profesional" → "Pro"
-- ===========================================================
update public.service_variants
   set label = 'Básico',
       description = null,
       includes = '[
         "Hasta 3 secciones",
         "Diseño adaptable a celular",
         "Botón de WhatsApp",
         "Formulario de contacto",
         "Optimización para aparecer en Google"
       ]'::jsonb,
       price_mxn = 2500,
       delivery_days_min = 2,
       delivery_days_max = 3,
       updated_at = now()
 where slug = 'esencial';

update public.service_variants
   set label = 'Pro',
       description = null,
       includes = '[
         "Hasta 6 secciones",
         "Diseño personalizado",
         "Blog o sección de noticias",
         "Formularios personalizados",
         "Integración con WhatsApp",
         "Optimización para aparecer en Google"
       ]'::jsonb,
       price_mxn = 5500,
       delivery_days_min = 5,
       delivery_days_max = 7,
       updated_at = now()
 where slug = 'profesional';

-- ===========================================================
-- Variants: auditoria-1a1 zoom + presencial
--   Etiquetas: "Por Zoom (1h)" → "Online (Zoom)", "Presencial (SLR/MXL)" → "Presencial"
-- ===========================================================
update public.service_variants
   set label = 'Online (Zoom)',
       description = null,
       includes = '[
         "Reunión por Zoom (60 minutos)",
         "Análisis de presencia digital",
         "Revisión de canales y campañas",
         "Identificación de oportunidades",
         "Reporte con plan de acción"
       ]'::jsonb,
       price_mxn = 1000,
       delivery_days_min = 1,
       delivery_days_max = 1,
       updated_at = now()
 where slug = 'zoom';

update public.service_variants
   set label = 'Presencial',
       description = null,
       includes = '[
         "Reunión presencial (60 minutos)",
         "Visita al negocio",
         "Análisis de presencia digital",
         "Revisión de canales y campañas",
         "Identificación de oportunidades",
         "Reporte con plan de acción"
       ]'::jsonb,
       price_mxn = 2000,
       delivery_days_min = 1,
       delivery_days_max = 1,
       updated_at = now()
 where slug = 'presencial';

-- ===========================================================
-- Variants: kickstart-meta-ads videoia + video-personas
--   Quitar: "píxel", "configuración de píxel"
--   Etiquetas: "Con Video IA" → "Básico", "Con Video Personas" → "Pro"
-- ===========================================================
update public.service_variants
   set label = 'Básico',
       description = null,
       includes = '[
         "Estrategia inicial",
         "Segmentación de clientes",
         "2 a 3 imágenes publicitarias",
         "1 video corto generado con IA",
         "Configuración de la campaña",
         "Lanzamiento de campaña",
         "Reporte inicial"
       ]'::jsonb,
       price_mxn = 2500,
       delivery_days_min = 5,
       delivery_days_max = 7,
       updated_at = now()
 where slug = 'videoia';

update public.service_variants
   set label = 'Pro',
       description = null,
       includes = '[
         "Estrategia personalizada",
         "Segmentación avanzada",
         "2 a 3 imágenes profesionales",
         "1 video corto con personas reales (producción básica)",
         "Configuración de la campaña",
         "Lanzamiento de campaña",
         "Reporte con recomendaciones"
       ]'::jsonb,
       price_mxn = 3500,
       delivery_days_min = 7,
       delivery_days_max = 10,
       updated_at = now()
 where slug = 'video-personas';
