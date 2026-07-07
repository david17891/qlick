-- ============================================================
-- payments.course_id → NULLABLE
--
-- Contexto: el schema original de `payments` requería `course_id` NOT NULL
-- (legacy v1.0.0 cuando solo había pagos de cursos). Esto bloquea el flujo
-- de pagos de eventos y masterclass que estamos abriendo con Stripe.
--
-- Cambios en este PR (Fase 1 Stripe):
--   - ALTER COLUMN course_id DROP NOT NULL.
--   - Cuando el payment es de un evento/masterclass, `course_id` queda
--     NULL y el `event_access.payment_id` referencia esta fila.
--
-- Migración FUTURA (Fase 2, out of scope ahora): para simplificar el
-- modelo se puede consolidar `payments` en una sola tabla polimórfica
-- con columnas `product_kind` + `product_id`. Por ahora, hacemos el
-- cambio aditivo mínimo (DROP NOT NULL) para no romper callers
-- existentes que asumen `course_id` no nulo.
--
-- Compatibilidad: las filas existentes tienen course_id != null. La
-- migración no las toca. Nuevas filas pueden tener course_id = null.
-- ============================================================

alter table public.payments
  alter column course_id drop not null;

comment on column public.payments.course_id is
  'Curso pagado. NULL para pagos de eventos o masterclass (ver event_access.payment_id).';
