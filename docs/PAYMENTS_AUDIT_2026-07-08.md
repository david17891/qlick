# Auditoría Stripe Payments — FASE 2 (cierre 2026-07-08 04:35)

Cierre del hardening definitivo tras la aprobación de Fase 1 (commit
`135be8e`). Los 4 vectores críticos resueltos, tests añadidos, build
limpio. Listos para flip a `sk_live_*` cuando David lo autorice.

## Resumen ejecutivo

| Severidad | # originales | # reparados | # nuevos | # pendientes |
|---|---|---|---|---|
| 🔴 CRITICAL | 2 | 2 | 0 | 0 |
| 🟠 HIGH     | 4 | 4 | 1 | 1 (parcial) |
| 🟡 MEDIUM   | 4 | 4 | 1 | 1 |
| 🟢 LOW      | 3 | 1 | 0 | 2 |
| **TOTAL**   | **13** | **11** | **2** | **4** |

**Estado:** los 4 vectores críticos del auditor SRE están reparados.
Pendientes son hardening adicional o features fuera del scope de Fase 2.

---

## 🛡️ Los 4 vectores críticos de Fase 2 — REPARADOS

### V1. 💸 Validación de monto exacto en webhook (Anti-Fraude)
**Archivo:** `src/app/api/webhooks/stripe/route.ts` (handleCheckoutCompleted)
**Commit:** incluido en este cierre.
**Implementación:**
```ts
const expectedCentavos = Math.round(productRef.priceMXN * 100);
if (amountTotalCentavos !== expectedCentavos) {
  // log error crítico con expected_mxn / received_mxn / diff_mxn
  // insert payment con status='suspicious_amount_discrepancy'
  // NO grant course_access
  return { status: 200, mode: "suspicious_amount_discrepancy" };
}
```
Si difieren (cupón no aplicado, sesión manipulada, error humano en
Stripe Dashboard), el curso NO se otorga. Retornamos 200 para que
Stripe no reintente — el manejo del fraude es interno.

**Tests:** `tests/payments-fase2-hardening.test.mjs` §1 (3 tests:
monto exacto OK, monto bajo suspicious, monto alto suspicious).

### V2. ⚡ RPC `get_user_id_by_email` (elimina bomba listUsers)
**Migración:** `supabase/migrations/20260708040000_get_user_id_by_email.sql`
**Aplicada:** vía Supabase Management API el 2026-07-08 04:30.
**Función:**
```sql
CREATE OR REPLACE FUNCTION public.get_user_id_by_email(p_email text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = '' AS $$
  SELECT id FROM auth.users WHERE email = lower(p_email) LIMIT 1;
$$;
GRANT EXECUTE TO service_role;
```
Resuelve en fracciones de milisegundo (índice único en auth.users.email).
Reemplaza `auth.admin.listUsers({ perPage: 500 })` que timeout-eaba
en Vercel con >500 usuarios (justo el evento del 11 de julio).

**Usado en:**
- `src/app/api/webhooks/stripe/route.ts` (resolveOrCreateUserId)
- `src/app/api/payments/create-checkout/route.ts` (grantScholarshipInline)
- `src/app/pagar/[courseSlug]/page.tsx` (detección de compra)

**Tests:** `tests/payments-fase2-hardening.test.mjs` §5 (sanity check
contra DB real, formato UUID).

### V3. 🎯 Becas del 100% (cupones con monto $0)
**Archivo:** `src/app/api/payments/create-checkout/route.ts`
**Implementación:**
```ts
if ((course.priceMXN ?? 0) === 0) {
  return await grantScholarshipInline({...});
}
```
`grantScholarshipInline`:
1. Resuelve user via RPC (o crea guest)
2. Idempotencia: si ya tiene access, devuelve alreadyPaid
3. Inserta payment con `provider='scholarship_free'`, `status='approved'`
4. Grant course_access directo (sin pasar por Stripe)
5. Retorna `flow='inline'` con `redirectUrl` a `/exito`

Si Stripe recibiera amount=0, devolvería `400 Invalid amount`. La
beca intercepta ANTES y evita el error.

**Tests:** `tests/payments-fase2-hardening.test.mjs` §2 (2 tests:
precio 0 → scholarship_free, precio > 0 → Stripe normal).

### V4. 🛡️ Rate limiting en `resendGuestAccessLink` (anti email bombing)
**Archivo:** `src/app/pagar/[courseSlug]/exito/actions.ts`
**Implementación:**
```ts
const rateKey = `resend:${ip}:${email.toLowerCase()}`;
const decision = recordAndCheckRateLimit(rateKey, {
  windowMs: 60 * 60 * 1000, // 1 hora
  maxCalls: 3,
});
if (!decision.allowed) {
  return {
    ok: false,
    error: `Demasiados reenvíos. Probá de nuevo en ${Math.ceil(retryAfterSec / 60)} minutos.`,
    retryAfterSec,
  };
}
```
Limite: **3 calls/hora por combinación IP+email**. Previene que un bot
agote la cuota de Brevo y que Gmail catalogue a `qlick.digital`
como SPAM.

Reutiliza `src/lib/api/rate-limit.ts` (sliding-window in-memory).

**Tests:** `tests/payments-fase2-hardening.test.mjs` §3 (3 tests:
3 OK + 4to rejected, keys independientes, formato de key).

---

## Cambios aplicados (commit atómico de cierre)

### Migración
- `supabase/migrations/20260708040000_get_user_id_by_email.sql` (nueva RPC)

### Código
- `src/app/api/webhooks/stripe/route.ts`
  - replay tolerance explícito (300s)
  - RPC `get_user_id_by_email` reemplaza listUsers paginado
  - amount validation (`suspicious_amount_discrepancy`)
- `src/app/api/payments/create-checkout/route.ts`
  - sesión opcional (guest checkout completo)
  - scholarship flow ($0 → `scholarship_free`)
- `src/lib/payments/payment-provider.ts`
  - `CreateCheckoutInput.userId: string | null`
  - `PaymentQueryResult.customerEmail?: string | null`
- `src/lib/payments/stripe-provider.ts`
  - `getStatus` retorna `customerEmail`
  - metadata.user_id: string vacío si guest
  - `customer_email` omitido si vacío (Stripe recolecta)
- `src/app/pagar/[courseSlug]/page.tsx`
  - sesión opcional (guest)
  - "ya compraste" detection via RPC + cookie
  - "Procesando tu pago" UI (race condition)
- `src/app/pagar/[courseSlug]/exito/page.tsx`
  - sesión opcional
  - flujo guest con `Reenviar link de acceso` (rate limited)
- `src/app/pagar/[courseSlug]/exito/actions.ts` (nuevo)
  - `markRecentPurchase(email)`: setea cookie httpOnly (validación regex)
  - `resendGuestAccessLink(sessionId)`: rate limited 3/hora
- `src/app/pagar/[courseSlug]/exito/MarkRecentPurchase.tsx` (nuevo)
  - Client Component que setea cookie al cargar /exito

### Tests
- `tests/payments-fase2-hardening.test.mjs` (nuevo, 12 tests)
- Total suite: **618 tests passing** (606 originales + 12 nuevos)

---

## ✅ Checklist final para el Flip a Producción (`sk_live_*`)

Cuando David lo autorice, los pasos exactos son:

### Paso 1 — Stripe Dashboard
1. https://dashboard.stripe.com/apikeys → clic **"Create restricted key"** (o usar la live existente)
   - Copiar `sk_live_...` (secret)
   - Copiar `pk_live_...` (publishable, con menos permisos)
2. https://dashboard.stripe.com/webhooks → clic **"Add endpoint"** en producción
   - URL: `https://www.qlick.digital/api/webhooks/stripe`
   - Eventos: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`
   - Copiar `whsec_...` (signing secret)

### Paso 2 — Vercel (producción)
```powershell
# Estas 4 variables se rotan en production:
vercel env rm STRIPE_SECRET_KEY production      # confirma con "y"
vercel env add STRIPE_SECRET_KEY production       # pega sk_live_...
vercel env rm STRIPE_WEBHOOK_SECRET production
vercel env add STRIPE_WEBHOOK_SECRET production   # pega whsec_...
vercel env rm NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY production
vercel env add NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY production  # pega pk_live_...
# NEXT_PUBLIC_PAYMENT_PROVIDER ya está en 'stripe', no cambia.
```

### Paso 3 — Disparar redeploy de producción
Cualquier push a `main` dispara redeploy automático. O forzar:
```powershell
vercel redeploy qlick-6qnop4z4m-david17891-9351s-projects.vercel.app --target production
```

### Paso 4 — Smoke test con tarjeta real
1. https://www.qlick.digital/cursos/masterclass-marketing-ia
2. "Comprar curso · $200 MXN" → "Pagar ahora"
3. Tarjeta REAL del banco (NO 4242 4242 4242 4242)
4. Verificar que aparece el cargo en https://dashboard.stripe.com/payments
5. Verificar que Supabase tiene `payment` con `provider='stripe', status='approved', amount_mxn=200`
6. Revertir el cargo de prueba desde Stripe Dashboard (o dejarlo como donación 😅)

### Paso 5 — Limpieza post-live
1. Stripe Dashboard → Webhooks → borrar destination "Qlick production" (test mode) — ya no se necesita
2. Stripe Dashboard → Webhooks → borrar destination "qlick feat/payments-stripe preview" (test mode) — de la sesión anterior
3. Stripe Dashboard → API keys → rotar las test keys (sk_test_... y pk_test_...) por seguridad
4. Documentar en `docs/PAYMENTS_LIVE_CHECKLIST.md` los pasos para el siguiente curso que se quiera vender

### Paso 6 — Monitoreo post-live (primeras 24h)
- Revisar Vercel logs cada 1-2 horas
- Si aparece `suspicious_amount_discrepancy` en logs → revisar manualmente
- Si el rate limit de resend se dispara mucho → revisar si hay un bot
- Si emails de Brevo rebotan → revisar MX records

---

## Validación

- ✅ `npm run type-check` — sin errores
- ✅ `npm run lint` — sin warnings
- ✅ `npm test` — 618/618 tests passing (606 + 12 nuevos)
- ✅ `npm run build` — OK (rutas `/pagar/[slug]`, `/pagar/[slug]/exito`, `/api/payments/create-checkout`, `/api/webhooks/stripe`, `/api/auth/guest-magic-link` todas presentes)

## Garantía final de integridad

1. ✅ Firma del webhook validada (Stripe SDK + tolerance 300s anti-replay)
2. ✅ Idempotencia via `idempotency_key = stripe_evt:{event_id}` + UNIQUE
3. ✅ Amount validation anti-fraude (no otorga acceso si monto ≠ esperado)
4. ✅ RPC O(1) para lookup user-by-email (no más listUsers paginado)
5. ✅ Scholarship flow para monto $0 (no rompe Stripe con Invalid amount)
6. ✅ Rate limit 3/hora anti email bombing
7. ✅ Sesión opcional en /pagar y /exito (guest checkout completo)
8. ✅ "Ya compraste" / "Procesando" UI robusta (race condition cubierta)

---

**LISTO PARA GO-LIVE** cuando David confirme. 🛌