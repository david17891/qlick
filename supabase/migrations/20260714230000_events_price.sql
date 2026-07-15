-- ============================================================
-- events: precio en MXN + currency (Fase 1 de pagos para eventos)
--
-- Contexto:
--   Hasta hoy, la tabla `events` no tenia columna de precio. El
--   sistema de pagos (Stripe test mode + mock provider) ya estaba
--   cableado para cobrar eventos via `ProductRefEvent.priceMXN`
--   (ver src/lib/payments/payment-provider.ts) y el webhook de
--   Stripe ya hace grant de acceso al evento (kind='event' en
--   src/app/api/webhooks/stripe/route.ts). Pero la pieza que
--   conectaba el admin con la DB faltaba: el admin no podia
--   asignarle precio a un evento al crearlo.
--
-- Operacion (2026-07-14, sesion David - "prueba desde cero"):
--   David queria probar el flow end-to-end de cobrar una entrada
--   desde el admin. El gap estaba en 4 lugares:
--     1) tabla `events` sin columna de precio (este migration)
--     2) tipo `Event` y `EventFormInput` sin priceMXN
--     3) `EventDrawer.tsx` sin campo "Precio (MXN)"
--     4) ruta `/pagar/[eventSlug]` no existia (solo /pagar/[courseSlug])
--   Este migration cierra el #1. El resto se hace en codigo.
--
-- Decisiones de diseno:
--   1. `price_mxn numeric(10,2) NOT NULL DEFAULT 0`
--      - 0 = evento gratuito (no muestra checkout, va directo a
--        inscripcion / form de confirmacion).
--      - numeric(10,2) cubre hasta 99,999,999.99 MXN (mas que
--        suficiente para eventos Qlick, que van de $0 a $5,000 tipico).
--      - NOT NULL + DEFAULT evita nullability: el caller siempre
--        envia 0, no necesita pensar en "es null o es 0".
--   2. `currency text NOT NULL DEFAULT 'MXN'`
--      - Default MXN porque el 100% de eventos Qlick son en Mexico.
--      - text y no enum por flexibilidad (futuro: USD para eventos
--        online internacionales, sin necesidad de nueva migration).
--   3. Backfill implicito via DEFAULT: todos los eventos existentes
--      quedan en price_mxn=0, currency='MXN'. Cero perdida de datos.
--   4. NO agregamos CHECK constraint positivo: dejamos que el admin
--      meta valores negativos por error y los server validamos. El
--      numero siempre llega validado del form (>=0) y del API
--      (clamp a 0 si viene negativo).
--
-- Out of scope (para sprints futuros):
--   - Precios escalonados (early bird, grupal, etc).
--   - Multi-moneda con conversion automatica.
--   - Cupones por evento (ya existe `applyCoupon` en payment-provider,
--     pero el modelo asume cupon global, no por evento).
--
-- No rompemos ninguna fila existente (solo agregamos columnas con
-- defaults). No tocamos RLS, no tocamos event_attendees, no tocamos
-- el webhook de Stripe.
-- ============================================================

alter table public.events
  add column if not exists price_mxn numeric(10,2) not null default 0;

alter table public.events
  add column if not exists currency text not null default 'MXN';

-- Indice: el admin filtra eventos "con cobro" en la lista.
-- partial index: solo cuando price_mxn > 0, ahorra espacio.
create index if not exists events_paid_idx
  on public.events (price_mxn)
  where price_mxn > 0;

-- Comentarios para el typegen / inspectores futuros.
comment on column public.events.price_mxn is
  'Precio de la entrada en MXN. Default 0 = evento gratuito (no muestra checkout, va directo a confirmacion). El admin UI muestra el campo "Precio (MXN)" y envia 0 si lo deja vacio. Formato numeric(10,2): hasta 99,999,999.99 MXN. Para eventos cobrados, el checkout flow usa ProductRefEvent.priceMXN (ver src/lib/payments/payment-provider.ts).';

comment on column public.events.currency is
  'Codigo de moneda ISO-4217 (default MXN). Qlick opera 100% en Mexico, pero el campo es text libre para soportar USD u otros en sprints futuros. El provider de pago usa este campo en el Checkout Session de Stripe.';

-- Forzamos reload del schema cache de PostgREST para que las
-- columnas nuevas sean visibles inmediatamente desde el cliente
-- Supabase (js client) sin esperar al auto-reload.
notify pgrst, 'reload schema';
