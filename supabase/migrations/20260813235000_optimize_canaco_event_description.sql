-- Mantiene una descripción factual y compacta para el evento publicado.
-- La promoción de dos personas vive en /promo y no se mezcla con el contexto
-- del bot ni con el checkout normal de una persona.
UPDATE public.events
SET
  description = $description$
Curso presencial para atraer y convertir más clientes con publicidad, Facebook Ads, inteligencia artificial y seguimiento de prospectos.

Aprenderás:
1. Creación y edición de publicidad para tus productos o servicios.
2. Publicidad pagada con Facebook Ads para crear y configurar campañas.
3. Inteligencia artificial aplicada al negocio para generar textos, respuestas e ideas.
4. Seguimiento de clientes y prospectos para convertir consultas en ventas.

Fecha: 20 de agosto de 2026
Horario: 4:00 p. m. a 8:00 p. m. (hora Pacífico)
Duración: 4 horas
Lugar: CANACO, Av. Álvaro Obregón 14-15, San Luis Río Colorado, Sonora
Inversión total: $1,000 MXN
Apartado: $500 MXN y liquida los $500 MXN restantes el día del evento.

Beneficio por pago completo anticipado: recibe una sesión de Zoom 1 a 1 de una hora después del curso.
Incluye constancia de participación.
$description$,
  updated_at = now()
WHERE slug = 'desarrollo-estructura-curso-canaco'
  AND title = 'Los 4 Pilares de un Negocio que Vende'
  AND status = 'published';
