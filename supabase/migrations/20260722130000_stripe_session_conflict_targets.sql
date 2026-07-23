-- Stripe Checkout: las rutas de webhook usan
-- `upsert(..., { onConflict: "stripe_session_id" })`.
--
-- Un índice único parcial no puede ser inferido por PostgreSQL para ese
-- `ON CONFLICT` sin una cláusula WHERE equivalente. Los campos admiten NULL
-- y un índice único normal sigue permitiendo múltiples NULL, por lo que es
-- seguro usar un índice completo y mantiene la idempotencia por sesión.

drop index if exists public.payments_stripe_session_unique;
create unique index if not exists payments_stripe_session_unique
  on public.payments (stripe_session_id);

drop index if exists public.event_payments_stripe_session_unique;
create unique index if not exists event_payments_stripe_session_unique
  on public.event_payments (stripe_session_id);

drop index if exists public.service_orders_stripe_session_unique;
create unique index if not exists service_orders_stripe_session_unique
  on public.service_orders (stripe_session_id);

