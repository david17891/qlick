-- ============================================================
-- event_confirmations.payment_status — flag de cobro del confirmado
--
-- Contexto:
--   David quiere registrar pagos manuales para eventos (efectivo, tarjeta
--   en puerta, transferencia, OXXO/SPEI reportados por el cliente). El
--   sprint cobro-de-entrada (commit 897e61c) ya cubre el flow digital
--   (Stripe Checkout), pero en México ~70% de los cobros se hacen en
--   efectivo físico, datáfono en puerta, OXXO en tienda, transferencia
--   directa al admin, etc — todos canales que NO pasan por Stripe.
--
--   Para soportar esos casos sin perder la trazabilidad de pago por
--   confirmado, agregamos `payment_status` a event_confirmations. Es la
--   fuente de verdad para "¿este confirmado pagó o no?".
--
-- Operacion (2026-07-15 01:47, sprint pagos-manuales):
--   David reporto la necesidad de registrar pagos manuales desde el
--   admin del evento. Diseno acordado en sesion:
--     - 4 valores de payment_status: not_required, pending, paid, revoked.
--     - Eventos free (price_mxn=0): siempre 'not_required'.
--     - Eventos de pago: el confirmado arranca en 'pending' al crearse,
--       pasa a 'paid' cuando el admin confirma (via Stripe webhook, via
--       registro manual con validacion de token, o via admin puro).
--     - 'revoked' = admin revoco (ej: voucher expiro, devolucion).
--
-- Decisiones de diseno:
--   1. NOT NULL con DEFAULT 'not_required' (no nullable):
--      - Backfill automatico de TODOS los rows existentes: quedan en
--        'not_required' (eventos free legacy).
--      - El caller siempre lee un valor, sin if-null en el render.
--      - El admin puede flipear el valor via server action explicito
--        (no se calcula implicitamente en el server lib).
--   2. CHECK constraint con 4 valores: previene typos y deja el schema
--      autodocumentado. Si en el futuro agregamos 'refunded' o
--      'partially_paid', va en otra migration.
--   3. Indice parcial: solo indexamos 'pending' (los que el admin tiene
--      que revisar). Los demas estados son reads por evento, ya
--      cubiertos por event_confirmations_event_idx.
--   4. Comentario explicito: el admin UI lo lee en info_schema y
--      muestra ayuda contextual ("pagado automaticamente por Stripe" vs
--      "registrado manualmente por ti").
--
-- No rompemos nada:
--   - Backfill implicito via DEFAULT. Cero perdida de datos.
--   - No tocamos event_attendees, event_surveys ni event_access.
--   - No tocamos RLS, no tocamos el webhook de Stripe.
--   - La columna es independiente de price_mxn: el admin puede cambiar
--     el precio del evento sin tocar el payment_status de confirmados
--     pre-existentes.
-- ============================================================

alter table public.event_confirmations
  add column if not exists payment_status text not null default 'not_required';

-- Si la columna ya existia con un default distinto, aseguramos el
-- default. Esto es idempotente y no afecta filas existentes.
alter table public.event_confirmations
  alter column payment_status set default 'not_required';

-- CHECK constraint (la creamos despues del ALTER por si la columna ya
-- existia con valores fuera del dominio esperado).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'event_confirmations_payment_status_check'
  ) then
    alter table public.event_confirmations
      add constraint event_confirmations_payment_status_check
      check (payment_status in ('not_required', 'pending', 'paid', 'revoked'));
  end if;
end$$;

-- Indice parcial: solo los pendientes (los que el admin tiene que
-- revisar). Los demas estados son reads por evento, ya cubiertos
-- por event_confirmations_event_idx.
create index if not exists event_confirmations_payment_status_pending_idx
  on public.event_confirmations (event_id)
  where payment_status = 'pending';

-- Comentario del campo. Lo lee el typegen y la info_schema.
comment on column public.event_confirmations.payment_status is
  'Estado de pago del confirmado. not_required = evento free (legacy, no se cobra). pending = confirmado en evento de pago, sin pago aun. paid = pago confirmado (vía Stripe webhook, vía validacion de token contra Stripe API, o vía admin puro). revoked = admin revoco (voucher expiro, devolucion, etc). El admin UI consume este flag para mostrar el badge pagado/no pagado en la tabla de confirmados y en el QR scanner del staff.';

-- Forzamos reload del schema cache de PostgREST para que la nueva
-- columna sea visible inmediatamente desde el cliente Supabase (js
-- client) sin esperar al auto-reload.
notify pgrst, 'reload schema';
