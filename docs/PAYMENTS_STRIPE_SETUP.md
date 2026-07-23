# Guía de setup — Stripe Checkout para Qlick

> **Propósito:** pasos exactos para activar Stripe Checkout en Qlick LMS
> como proveedor de pagos (Fase 1). Cubre cuenta, env vars, webhook
> endpoint, tests con cards de prueba y go-live.
>
> **Audiencia:** David y el operador del proyecto cuando tome el relevo.
> **Stack:** Next.js 14 + Supabase + Stripe SDK v22 (`stripe` server) +
> `@stripe/stripe-js` v9 (client; fase 2 con Stripe Elements).
>
> **Última revisión:** 2026-07-07 03:00 MST.

---

## 1. Decisión de cuenta: ¿quién crea la Stripe account?

Una sola Stripe account por dueño (`account` ≠ `user` interno de Stripe).
Test mode (`sk_test_*`) y live mode (`sk_live_*`) son **environments dentro de la misma cuenta**, no cuentas separadas. El toggle está en `Dashboard → Developers → Test mode` (esquina superior derecha en la versión 2025+).

### 1.1 Cuenta del socio (recomendado)

Si el socio es quien va a recibir el dinero real:

- **(a) El socio ya tiene cuenta Stripe** (ej. por otro negocio): nos
  agrega como **team member** con rol **Admin**. Las claves API se
  generan en `Dashboard → Developers → API keys`. Team members no son
  owners pero pueden ver/crear keys y recibir pagos.
- **(b) El socio no tiene cuenta**: se crea en
  [dashboard.stripe.com/register](https://dashboard.stripe.com/register)
  usando **el email del socio** como owner. Modo `Test mode` desde el
  inicio (es la opción default al signup). El toggle a `Live` se hace
  DESPUÉS de cargar KYC y datos bancarios (CLABE MX para payouts).

> **Por qué:** la cuenta que procesa dinero real debe estar a nombre
> del beneficiario fiscal. Cambiar de owner después es un proceso
> formal de "transfer ownership" con soporte Stripe (~2-3 semanas).

### 1.2 Cuenta de David (alternativa temporal)

Si urge arrancar el dev antes de que el socio confirme, David puede
crear la suya con `david17891@gmail.com` y migrar después. El proceso
de migración de owner es:

1. Agregar al socio como team member desde la cuenta de David.
2. El socio abre ticket con Stripe Support para transferir ownership.
3. Stripe verifica identidad del nuevo owner y mueve la account.

**Riesgo:** durante la migración, la cuenta queda en limbo legal.
Mientras no haya pagos live, no es problema.

**Cuando NO se necesita migrar:** si la cuenta solo se usa para Qlick
y el dev sigue viviendo ahí como team member, no hay obligación de
transferir. Los pagos van al owner (socio) aunque David opere la cuenta.

---

## 2. Variables de entorno (modelo dual test/live)

| Key | Tipo | Origen | Notas |
|---|---|---|---|
| `STRIPE_SECRET_KEY` | sensitive | `Dashboard → Developers → API keys → Reveal` (test mode) | `sk_test_...`; se conserva en paralelo y nunca se reemplaza durante el flip. |
| `STRIPE_SECRET_KEY_LIVE` | sensitive | API keys con el toggle Live | `sk_live_...`; solo se usa para eventos con `event_rules.payment_mode=live`. |
| `STRIPE_SERVICE_PAYMENT_MODE` | server-only | Vercel Production | `test` por defecto; usar `live` sólo para habilitar links de pago de servicios después de un pedido controlado. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | public | mismo lugar | `pk_test_...` para el frontend actual (Checkout hosted). |
| `STRIPE_WEBHOOK_SECRET` / `_LIVE` | sensitive | un endpoint por modo (ver §4) | `whsec_...`; cada endpoint usa su propio secret. |

### 2.1 En local — `.env.local`

```bash
# .env.local (gitignored)
STRIPE_SECRET_KEY=sk_test_51Hxxx...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_51Hxxx...
STRIPE_WEBHOOK_SECRET=whsec_xxx...
STRIPE_SECRET_KEY_LIVE=sk_live_51Hxxx...
STRIPE_WEBHOOK_SECRET_LIVE=whsec_live_xxx...
```

> **Importante:** `vercel env pull` sobreescribe `.env.local` y para
> vars sensitive devuelve vacío aunque la var EXISTA en Vercel.
> **Solución:** verificar con `vercel env ls` (muestra presencia) o
> hacer un test runtime del handler. NO confiar en el contenido del
> pull para sensitive.

### 2.2 En Vercel — production + preview

```powershell
vercel env add STRIPE_SECRET_KEY production
vercel env add STRIPE_SECRET_KEY_LIVE production
vercel env add NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY production
vercel env add STRIPE_WEBHOOK_SECRET production
vercel env add STRIPE_WEBHOOK_SECRET_LIVE production
```

Repetir para `preview` si quieres testear en branches con Stripe live.

> **NEXT_PUBLIC_*** es la única excepción que se puede commitear sin
> problema, pero de todos modos la manejamos via env var para que el
> switch test ↔ live sea un cambio de env, no de código.

---

## 3. Activar este provider en el código

```bash
NEXT_PUBLIC_PAYMENT_PROVIDER=stripe  # en .env.local y Vercel
```

Default es `mock` (el SimulatorForm sigue funcionando para dev). Cuando
`=stripe`, el UI de `/pagar/[courseSlug]` redirige al Checkout hosted.

> NO confundir con `STRIPE_*_KEY` que son credenciales; este es solo
> un switch de qué provider se carga.

---

## 4. Webhook endpoint — punto CRÍTICO

Stripe **no** notifica al backend por polling. Cuando un usuario paga
(o falla), Stripe hace POST al endpoint que registres en el dashboard.
Sin ese endpoint, el `grantAccess()` nunca corre y los pagos se
quedan en limbo.

### 4.1 URL del endpoint

```
POST https://<tu-dominio>/api/webhooks/stripe
```

- Test mode: registrar con la URL de **preview** o de un tunnel local
  (ngrok / Stripe CLI — ver §4.3).
- Live mode: URL de production.

### 4.2 Registrar en Dashboard

1. `Dashboard → Developers → Webhooks → Add endpoint`.
2. URL: la de arriba.
3. **Events to send** (los mínimos para Qlick):
   ```
   checkout.session.completed
   checkout.session.async_payment_succeeded
   checkout.session.async_payment_failed
   checkout.session.expired
   charge.refunded
   ```
4. Click **Add endpoint**. En el detalle del endpoint click
   **Reveal** en "Signing secret" — ese es `STRIPE_WEBHOOK_SECRET`.

> Cada endpoint tiene su propio secret. Si registras el mismo endpoint
> en test y live, son 2 secrets distintos.

### 4.3 Dev local con Stripe CLI

Para que `localhost:3000` reciba webhooks de Stripe en tiempo real:

```bash
# 1. Instalar Stripe CLI: https://stripe.com/docs/stripe-cli
brew install stripe/stripe-cli/stripe    # macOS
scoop install stripe                     # Windows

# 2. Login (one-time)
stripe login

# 3. Forward eventos al webhook local
stripe listen --forward-to localhost:3000/api/webhooks/stripe
# Output: el `whsec_...` para tu terminal local. Copialo a STRIPE_WEBHOOK_SECRET en .env.local
```

`stripe listen` no toca tu dashboard — es un tunnel efímero. Cada
restart genera un nuevo `whsec_` temporal.

### 4.4 Verificación end-to-end

```bash
# Disparar un evento fake:
stripe trigger checkout.session.completed

# O usar el CLI para escuchar + mandar uno:
stripe events resend evt_xxx
```

Si el handler responde 200 y ves grants en DB, funciona. Si responde
401, la firma está mal (revisa `STRIPE_WEBHOOK_SECRET`).

### 4.5 Seguridad — qué valida el handler

El handler (`src/app/api/webhooks/stripe/route.ts`) usa
`stripe.webhooks.constructEvent(rawBody, signature, secret)` que:

- **Lee el body crudo** (sin JSON.parse previo — Next.js lo entrega con
  `req.text()`).
- **Compara HMAC-SHA256** de la firma `stripe-signature` contra el
  secret.
- **400** si falta la firma, **401** si no valida.

**IMPORTANTE:** nunca loggear el payload crudo del webhook (contiene
datos del cliente y potencialmente el `customer_email`).

---

## 5. Aplicar las 2 migrations a Supabase

Esta tabla y migration **NO están aplicadas aún en producción**.
Hay que aplicarlas vía SQL Editor de Supabase (las credenciales Mavis
están drift; David prefiere hacerlo manual desde su consola):

1. Abrir https://supabase.com/dashboard/project/ugpejblymtbwtsoiykyj/sql
2. Pegar el contenido de:
   - `supabase/migrations/20260707100000_event_access.sql` (tabla nueva + RLS + trigger)
   - `supabase/migrations/20260707110000_payments_course_id_nullable.sql` (ALTER)
3. Click **Run** en cada una.
4. Verificar:
   ```sql
   -- Debe devolver 1 fila
   SELECT table_name FROM information_schema.tables
   WHERE table_schema='public' AND table_name='event_access';

   -- Debe devolver 'YES' para course_id
   SELECT is_nullable FROM information_schema.columns
   WHERE table_name='payments' AND column_name='course_id';
   ```

### 5.1 Regenerar typegen (limpia los `@ts-ignore`)

Después de aplicar las migrations, regenerar tipos de Supabase:

```powershell
# Requiere supabase CLI + login (one-time)
npx supabase login
npx supabase gen types typescript --project-id ugpejblymtbwtsoiykyj > src/types/supabase.ts
```

Tras esto, los casts `// @ts-ignore — typegen aún sin event_access` en
`src/lib/lms/event-entitlements.ts` y `src/app/api/webhooks/stripe/route.ts`
quedan obsoletos. Remover con search & replace y correr suite de
nuevo.

---

## 6. Test cards (solo test mode)

Stripe simula distintos escenarios con tarjetas de prueba:

| Card | Escenario |
|---|---|
| `4242 4242 4242 4242` | Aprobada (default) |
| `4000 0025 0000 3155` | Requiere 3D Secure |
| `4000 0000 0000 9995` | Rechazada (generic_decline) |
| `4000 0000 0000 0069` | Rechazada (insufficient_funds) |
| `4000 0000 0000 0127` | Rechazada (incorrect_cvc) |

Para OXXO y SPEI (MX), los vouchers se aprueban manualmente desde el
Dashboard en test mode (`Payments → Click en el payment → Mark as paid`)
porque no hay un sandbox real del voucher.

Cualquier expiry futuro, cualquier CVC, cualquier ZIP.

---

## 7. UI mínima (lo que falta para cerrar Fase 1)

El provider ya está implementado en server. Falta el UI:

### 7.1 API endpoint `/api/payments/create-checkout`

```ts
// POST /api/payments/create-checkout
// Auth: student logged in
// Body: { productRef: { kind, id, slug } }
// Resp: { redirectUrl, paymentId }
```

Voy a crearlo en próxima sesión.

### 7.2 UI `/pagar/[courseSlug]`

```tsx
// Detectar provider y redirigir o mostrar SimulatorForm
const provider = process.env.NEXT_PUBLIC_PAYMENT_PROVIDER ?? "mock";
if (provider === "stripe") {
  // POST a /api/payments/create-checkout → window.location.href = redirectUrl
} else {
  // Mostrar <SimulatorForm />
}
```

### 7.3 Success page `/pagar/[slug]/exito?session_id=X`

Stripe redirige con `session_id` para que el frontend pueda consultar
el estado del pago. Mostrar "Pago confirmado, redirigiendo al
dashboard" + countdown de 3s → `router.push("/dashboard?paid=ok")`.

### 7.4 Página de error `/pagar/[slug]?cancelled=1`

Stripe redirige aquí si el usuario cancela. Mostrar mensaje + CTA
"Reintentar" que vuelve a `/pagar/[slug]`.

---

## 8. Go-live checklist (Fase 4)

Antes de activar `NEXT_PUBLIC_PAYMENT_PROVIDER=stripe` en production:

- [ ] Las migrations de payments/events live hardening aplicadas en prod DB.
- [ ] Typegen regenerado y `@ts-ignore` quitados.
- [ ] Cuenta del socio creada en Stripe (no la de David).
- [ ] KYC + datos bancarios del socio cargados (CLABE MX).
- [ ] `STRIPE_SECRET_KEY` (test) y `STRIPE_SECRET_KEY_LIVE` (live) configurados en Vercel.
- [ ] `STRIPE_SERVICE_PAYMENT_MODE` permanece en `test` hasta validar el primer pedido de servicio; cambiar a `live` sólo con aprobación operativa.
- [ ] `STRIPE_WEBHOOK_SECRET` y `STRIPE_WEBHOOK_SECRET_LIVE` corresponden a sus endpoints.
- [ ] Webhook endpoint registrado en Dashboard con la URL de production.
- [ ] Suite verde en CI (`type-check && lint && test && build`).
- [ ] Probado en Vercel preview con test cards (no se cargan fondos reales).
- [ ] Email de comprobante al cliente (Brevo) wired.
- [ ] Email de notificación al admin (Brevo) wired.
- [ ] Refund endpoint probado (cargar refund → acceso se revoca).
- [ ] Sentry / monitoring de errores activo.

---

## 9. Troubleshooting

| Síntoma | Diagnóstico | Fix |
|---|---|---|
| Webhook devuelve 401 | Firma no válida | Verificar que `STRIPE_WEBHOOK_SECRET` coincide con el del Dashboard **y** que no se hace `JSON.parse` antes del constructEvent (raw body requerido). |
| Webhook devuelve 400 | Falta header `stripe-signature` | Verificar que se envía desde Dashboard. Si dev con Stripe CLI, que el tunnel esté activo. |
| Payment queda `pending` después de pagar | Webhook no se está disparando | Revisar `Dashboard → Webhooks → Logs` para ver si Stripe está reintentando con error. Logs Vercel para ver si llega. |
| UI no redirige a Stripe | `NEXT_PUBLIC_PAYMENT_PROVIDER` no es `stripe` | Check `.env.local` y rebuild. La env var es `NEXT_PUBLIC_*` lo que significa que se bundle en cliente al build. |
| `STRIPE_SECRET_KEY not defined` en runtime | Env var no se cargó | `vercel env ls` y re-add. Si local, restart dev server. |
| Idempotency 23505 en log | Stripe repitió el evento (retry). Ya procesado. OK. | None. Log esperado, no es error. |
| Currency mismatch | El producto tiene `priceMXN` pero la account está en USD | Forzar `currency: 'mxn'` en `createCheckout` (ya está). Si aún falla, verificar setting de la account. |
| OXXO voucher nunca se marca `paid` | En test mode, NO se cobra real | Ir al Dashboard → Payments → marcarlo manualmente. En live mode, sí se cobra cuando el cliente paga en OXXO. |

---

## 10. Próximos pasos operativos

1. Aplicar las migrations versionadas con `scripts/apply-migration-management.mjs` en staging y luego producción.
2. Regenerar typegen y ejecutar `npm run type-check`, `npm run lint`, `npm test` y `npm run build`.
3. Configurar las variables duales test/live en `.env.local` y Vercel.
4. Registrar un endpoint Stripe por modo con los eventos manejados.
5. Ejecutar el E2E de tarjeta, OXXO/SPEI, refund/dispute, evento y servicio.
6. Ejecutar `scripts/verify-stripe-go-live.mjs`; solo después activar `payment_mode=live` en un evento controlado.

**Fase 2 (post-MVP):** post-pago glue — email Brevo, CRM `paid_customer`
tag, bot WhatsApp opcional con texto libre ventana 24h.

**Fase 3:** extender a eventos/masterclass — UI admin, Stripe Products
sync via API al crear evento.

**Fase 4:** refunds + disputes + go-live rotation a live keys.

---

## Apéndice A — Comparativa rápida

```
Mock (default dev):
  ✓ Gratis
  ✓ No setup
  ✓ SimulatorForm 3 botones
  ✗ No cobro real
  ✗ No se puede demostrar a socios

Stripe Checkout (este doc):
  ✓ MXN + OXXO + SPEI + tarjeta
  ✓ Cero PCI scope
  ✓ Setup en 1h
  ✓ Webhooks idempotentes
  ✓ Dashboard de pruebas completo
  ✗ Comisión ~3.6% + $3 MXN por cargo tarjeta
  ✗ Comisión OXXO/SPEI diferente (ver dashboard)

MercadoPago (futuro):
  ✓ Más popular en MX
  ✓ Cuotas más bajas para OXXO
  ✗ SDK separado
  ✗ IPN/webhooks con menos DX

Conekta (futuro):
  ✓ CFDI facturacion nativa MX
  ✓ Mas métodos locales
  ✗ Requiere cuenta mexicana con antifraud manual
```

**Decisión:** Stripe para Fase 1. MercadoPago y Conekta quedan como
stubs que se pueden activar cambiando `NEXT_PUBLIC_PAYMENT_PROVIDER`
cuando convenga.
