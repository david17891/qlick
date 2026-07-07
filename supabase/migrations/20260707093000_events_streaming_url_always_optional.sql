-- ============================================================
-- streaming_url: opcional en TODAS las modalidades
--
-- Contexto:
--   La migration 20260707000000_event_format_and_streaming.sql creo
--   el constraint `events_streaming_url_required` que forzaba que
--   un evento virtual/hybrid tuviera streaming_url NOT NULL. Esa
--   regla era consistente con el caso "configurar evento listo
--   para publicar", pero no contemplaba el flujo real de nuestros
--   operadores: el link de YouTube Live (o Zoom) muchas veces no
--   esta disponible hasta dias antes del evento (se agenda el live
--   en YouTube Studio 1-2 dias antes, o se recibe el link del socio
--   el mismo dia).
--
-- Operacion (2026-07-07, sesion David - evento del sabado 11 jul):
--   David necesitaba crear el evento virtual ANTES de tener el link
--   (lo agrega el dia del evento desde el admin). El constraint
--   bloqueaba la creacion. Fix: relajar la regla.
--
-- Decisiones de diseno:
--   1. `streaming_url` ahora es libre (nullable en in_person, virtual
--      y hybrid). El admin UI ya no muestra required en ningun caso.
--   2. La validacion de "queres un virtual SIN link por error" la
--      cubre el ADMIN (David, socio) revisando el campo antes de
--      publicar. NO la automatizamos porque el caso legitimo de
--      "definir link despues" es frecuente y no queremos penalizarlo.
--   3. El bot y el email template manejan 3 estados:
--      a) presencial (sin link, sin gate): QR como siempre.
--      b) virtual/hybrid CON streaming_url: QR + bloque gate "SI, VOY".
--      c) virtual/hybrid SIN streaming_url: QR + nota "el link te lo
--         enviamos el dia del evento".
--   4. El gate handler ya redirige a /eventos/[slug] si no hay link
--      (defensa, no debe pasar nunca en produccion real).
--
-- No rompemos ninguna fila existente (todas tienen el campo nullable
-- desde 20260707000000; solo cambiamos la regla de validacion).
-- No tocamos RLS, no tocamos event_attendees.
-- ============================================================

-- DROP del constraint viejo.
alter table public.events drop constraint if exists events_streaming_url_required;

-- Comentario actualizado para el campo (refleja la nueva semantica).
-- COMMENT ON COLUMN no soporta concatenacion con ||, va como literal.
comment on column public.events.streaming_url is
  'Link de streaming del evento. Opcional en TODAS las modalidades. Lo normal es definirlo dias antes del evento (YouTube Live, Zoom, Facebook Live, etc). El admin UI NO lo marca required: el operador puede crear el evento sin link y agregarlo despues desde Edicion.';
