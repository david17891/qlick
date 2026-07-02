-- ============================================================================
-- lead_status: agregar valor 'event_attended' (Fase 7a, Bloque 2)
--
-- Trigger: cuando un asistente hace check-in en un evento (escaneo del QR
-- en puerta), el endpoint POST /api/check-in/[token] promueve su lead de
-- 'new'/'contacted'/etc. a 'event_attended'. Esto cierra el ciclo de vida
-- del lead en el funnel del evento:
--
--   new → contacted → ... → event_attended → (post-encuesta) interested / payment_pending → enrolled
--
-- Antes: el check-in solo actualizaba event_qr_tokens + event_attendees,
-- pero el lead se quedaba en 'new' (gap que mencionó David en la sesión
-- 2026-07-01).
--
-- Notas técnicas:
-- - ALTER TYPE ... ADD VALUE no puede correr dentro de la misma transacción
--   que usa el nuevo valor, así que va solo en este archivo.
-- - PG exige que el valor sea único dentro del enum; lo insertamos antes
--   de 'lost' para mantener el orden lógico del funnel (pre-venta → evento
--   → post-venta/cerrado).
-- - Si la migración se aplica a una DB que ya tiene rows, no hay riesgo:
--   el nuevo valor solo se setea desde código (endpoint check-in).
-- ============================================================================

alter type lead_status add value if not exists 'event_attended';

comment on type lead_status is
  'Etapas del lead en el pipeline comercial. event_attended (Fase 7a) se '
  'setea cuando el asistente hace check-in físico en el evento (escaneo '
  'del QR en puerta). No es lo mismo que enrolled (que requiere pago de '
  'curso). Después del evento, la encuesta con consentimiento puede '
  'promoverlo a interested o payment_pending.';