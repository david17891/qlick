-- Sesion 2026-07-02 (David): limpieza del catalogo + 3 eventos de prueba
-- para validar el bot multi-evento. Datos sinteticos, sin PII.
--
-- Por que:
--   1. Solo habia 1 evento published (Ads en Meta, 16 abril) y el menu del
--      bot decia "IA y Marketing Basico (6 de julio)" via env vars. Inconsistencia
--      que confunde al lead.
--   2. Necesitamos varios eventos para que el LLM aprenda a identificar
--      sobre cual le preguntan ("el de CDMX", "el del 12 de julio", "el de ads").
--   3. Datos de precio/duracion/modalidad van en `description` (el schema no
--      tiene columnas dedicadas, el event-context-loader los muestra en
--      promptBlock si los incluimos ahi).
--
-- Idempotente: usa WHERE status='published' para archivar (no falla si ya
-- no hay ninguno). Para los inserts, usa ON CONFLICT (slug) DO UPDATE para
-- que el script sea re-ejecutable en pruebas.

-- Paso 1: archivar todos los eventos actualmente published
UPDATE public.events
SET status = 'archived', updated_at = now()
WHERE status = 'published';

-- Paso 2: insertar (o actualizar) 3 eventos de prueba
INSERT INTO public.events (slug, title, description, starts_at, ends_at, location, status)
VALUES
  (
    'ia-marketing-primeros-pasos',
    'IA y Marketing: Primeros Pasos',
    'Taller introductorio de 2 horas. Costo: Gratis con registro previo. Temas: fundamentos de IA aplicada a marketing, automatizacion basica, herramientas no-code. Modalidad: presencial. Cupo limitado a 30 personas. Incluye coffee break y materiales digitales.',
    '2026-07-12 18:00:00-06',
    '2026-07-12 20:00:00-06',
    'WeWork Reforma Latino, CDMX',
    'published'
  ),
  (
    'ads-meta-estrategia-avanzada',
    'Ads en Meta: Estrategia Avanzada',
    'Workshop de 3 horas. Costo: $599 MXN. Temas: instalacion y configuracion del pixel de Meta, audiencias personalizadas, lookalikes, optimizacion de presupuesto, retargeting avanzado. Modalidad: online por Zoom. Incluye grabacion por 30 dias y material de apoyo.',
    '2026-07-19 11:00:00-06',
    '2026-07-19 14:00:00-06',
    'Online (Zoom)',
    'published'
  ),
  (
    'funnels-venta-gdl',
    'Funnels de Venta que Convierten',
    'Workshop presencial de 4 horas. Costo: $1,200 MXN. Temas: diseno de funnels de venta, copywriting para ads y email, email marketing, retargeting, metricas clave. Modalidad: presencial. Cupo limitado a 25 personas. Trae laptop.',
    '2026-07-26 17:00:00-06',
    '2026-07-26 21:00:00-06',
    'Hub de Innovacion GDL, Guadalajara',
    'published'
  )
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  starts_at = EXCLUDED.starts_at,
  ends_at = EXCLUDED.ends_at,
  location = EXCLUDED.location,
  status = 'published',
  updated_at = now();
