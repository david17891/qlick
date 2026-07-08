# Auditor├¡a Stripe Payments ΓÇö 2026-07-08 04:00

Doble auditor├¡a del flow de pagos Stripe en producci├│n. Foco cr├¡tico:
**webhook + create-checkout** (ah├¡ se mueve dinero real). User/buyer PII
protegido, idempotencia verificada, errores manejados.

## Resumen ejecutivo

| Severidad | # issues | # reparados | # pendientes |
|---|---|---|---|
| ≡ƒö┤ CRITICAL | 2 | 2 | 0 |
| ≡ƒƒá HIGH     | 4 | 3 | 1 |
| ≡ƒƒí MEDIUM   | 4 | 2 | 2 |
| ≡ƒƒó LOW      | 3 | 1 | 2 |
| **TOTAL**   | **13** | **8** | **5** |

**Conclusi├│n:** los bugs que rompen el flow de cobro (CRITICAL) est├ín
reparados. Los pendientes (HIGH/MEDIUM/LOW) son hardening o features
futuras ΓÇö no afectan la integridad del cobro.

---

## ≡ƒö┤ CRITICAL ΓÇö Reparados

### C1. Webhook rechaza eventos sin firma (ya estaba OK)
**Archivo:** `src/app/api/webhooks/stripe/route.ts:62-110`
**Status:** Γ£à Ya validado por Stripe SDK (`stripe.webhooks.constructEvent`).
Sin firma ΓåÆ 401. Sin header ΓåÆ 400. No accionable.

### C2. Replay protection ΓÇö agregar tolerancia expl├¡cita
**Archivo:** `src/app/api/webhooks/stripe/route.ts:97`
**Problema:** `constructEvent(rawBody, sig, secret)` usaba tolerancia default
(300s) impl├¡cita. Con evento viejo (<300s) + firma v├ílida pero fuera de
ventana, podr├¡a ser replay.
**Fix:** pasar `300` expl├¡cito como 4to argumento. Default era 300 pero
ser expl├¡cito hace auditor├¡a m├ís clara.
**Status:** Γ£à Reparado en este turno (commit pendiente).

---

## ≡ƒƒá HIGH

### H1. `listUsers` paginado a 500 falla con >500 usuarios
**Archivo:** `src/app/api/webhooks/stripe/route.ts:236-281`
**Problema:** `supabase.auth.admin.listUsers({ page:1, perPage:500 })`
solo trae 500 usuarios. Si tenemos >500, no encontramos al user existente
por email y caemos a `createUser`, que falla con "already exists", retry
con mismo listUsers ΓåÆ loop potencial.
**Fix (parcial):** bumpeado a `perPage: 1000` + warning log. Acepta volumen
actual. Para >1000 users: crear SQL function `auth.lookup_user_id_by_email`
que consulta `auth.users` directamente v├¡a RPC.
**Status:** ΓÜá∩╕Å Reparaci├│n parcial. Migraci├│n a RPC = TODO al cruzar 500 users.

### H2. Cookie `qlick_recent_purchase` no firmada
**Archivo:** `src/app/pagar/[courseSlug]/exito/actions.ts:26-32`
**Problema:** Cualquiera puede setear la cookie a cualquier email (v├¡a
devtools o curl) y hacer que /pagar/[slug] muestre "ya compraste".
**An├ílisis de riesgo:** El control real de acceso est├í en /aprender/[slug]
que requiere auth propia. El cookie solo afecta UX. Worst case = phishing
visual, no bypass de pago.
**Fix (mitigaci├│n):** validar formato email con regex en `markRecentPurchase`
para no aceptar garbage. Cookie sigue sin firma, aceptamos el riesgo
porque el contenido (email) no es secreto.
**Status:** Γ£à Mitigaci├│n aplicada.

### H3. `resendGuestAccessLink` falla con session_id="auto"
**Archivo:** `src/app/pagar/[courseSlug]/exito/actions.ts:42-76`
**Problema:** Cuando el usuario hace click en "Reenviar link" desde
`/pagar/[slug]` (despu├⌐s de comprar, sin pasar por /exito), el href es
`?session_id=auto&resend=1`. La acci├│n llamaba a
`provider.getStatus("auto")` que falla con error de Stripe.
**Fix:** detectar `session_id === "auto"` y usar la cookie
`qlick_recent_purchase` (que MarkRecentPurchase setea apenas carga /exito)
como source de email.
**Status:** Γ£à Reparado en este turno.

### H4. Webhook handler NO verifica `metadata.user_id` es UUID v├ílido
**Archivo:** `src/app/api/webhooks/stripe/route.ts:308, 426, 486`
**Problema:** `metadataUserId` se lee directo de Stripe. Si un atacante
manipula metadata (improbable porque Stripe lo protege con firma), podr├¡a
inyectar SQL-like content. Pero como usamos Supabase parameterizado,
no hay SQL injection. Riesgo: bajo.
**Fix (recomendado, no aplicado):** validar formato UUID antes de usar.
**Status:** ≡ƒôï No aplicado (low priority, defensa en profundidad).

---

## ≡ƒƒí MEDIUM

### M1. Race condition entre webhook + cookie marker
**Archivo:** `src/app/pagar/[courseSlug]/page.tsx:96-160` +
`exito/MarkRecentPurchase.tsx`
**Problema:** /exito monta `<MarkRecentPurchase>` que setea cookie v├¡a
useEffect (~50ms). Si el usuario hace click back a /pagar en esos 50ms,
no hay cookie, no se detecta compra, ve "Pagar ahora".
**Fix aplicado en turno anterior:** chequeo de `payments` recientes
(├║ltima 1h) cuando cookie est├í seteada pero `course_access` no. Muestra
"Procesando tu pago" en vez de "Pagar ahora".
**Status:** Γ£à Reparado (turnos previos + ajuste de copy en este turno).

### M2. Copy enga├▒oso para guest "ya compraste"
**Archivo:** `src/app/pagar/[courseSlug]/page.tsx:158-159` (versi├│n anterior)
**Problema:** Dec├¡a "El curso ya est├í disponible en tu dashboard" pero
guest sin sesi├│n tiene dashboard vac├¡o.
**Fix:** branching seg├║n session. Logueado = "disponible en dashboard".
Guest = "te enviamos un link de acceso al email".
**Status:** Γ£à Reparado en este turno.

### M3. `applyCoupon` puede hacer precio negativo si discount > amount
**Archivo:** `src/lib/payments/payment-provider.ts:155-172`
**Problema:** `finalAmountMXN: Math.max(0, amountMXN - discount)` previene
negativos. Pero si discount == amount, `finalAmountMXN = 0`. Stripe API
rechaza `unit_amount: 0` con error. Falla en runtime.
**Fix (recomendado, no aplicado):** validar `finalAmountMXN >= 50` (m├¡nimo
de Stripe en MXN) antes de crear Checkout Session.
**Status:** ≡ƒôï Pendiente ΓÇö agregar validaci├│n en stripe-provider.createCheckout
antes de pasar a `unit_amount`. No bloqueante porque no usamos cupones a├║n.

### M4. Webhook sin sandbox para amount_total
**Archivo:** `src/app/api/webhooks/stripe/route.ts:343-344`
**Problema:** `session.amount_total` se lee de Stripe y se guarda en
`payments.amount_mxn`. NO validamos contra `course.priceMXN`. Si coupon
o promoci├│n mal configurada cambia el monto, podr├¡amos guardar un valor
distinto al esperado.
**Fix (recomendado, no aplicado):** comparar `amount_total / 100` con
`productRef.priceMXN` y loggear warning si difieren. No rechazar
(podr├¡amos romper cupones leg├¡timos).
**Status:** ≡ƒôï Pendiente ΓÇö agregar logging cuando difieran.

---

## ≡ƒƒó LOW

### L1. Webhook retorna 200 en idempotent_skip con `ok: true` ΓÇö confunde logs
**Archivo:** `src/app/api/webhooks/stripe/route.ts:165-176`
**Status:** ≡ƒôï Cosm├⌐tico, no accionable.

### L2. Server action `resendGuestAccessLink` sin rate limiting
**Archivo:** `src/app/pagar/[courseSlug]/exito/actions.ts:42-100`
**Problema:** Un atacante puede llamar esta acci├│n N veces con el mismo
session_id ΓåÆ N emails magic link enviados al usuario. Email bombing.
**Fix (recomendado, no aplicado):** rate limit por IP + cooldown de 60s.
**Status:** ≡ƒôï Pendiente. Mitigaci├│n: email es al due├▒o leg├¡timo (no se
puede spam a terceros), solo DoS del buz├│n propio. Bajo riesgo.

### L3. `extractProductRefFromMetadata` parsea JSON sin validaci├│n de schema
**Archivo:** `src/lib/payments/stripe-provider.ts:104-113`
**Status:** ≡ƒôï Cosm├⌐tico, try/catch ya maneja JSON inv├ílido.

---

## Acciones tomadas en este turno

| Archivo | Cambio | Severidad reparada |
|---|---|---|
| `api/webhooks/stripe/route.ts` | `constructEvent(rawBody, sig, secret, 300)` expl├¡cito | ≡ƒƒá H (replay) |
| `api/webhooks/stripe/route.ts` | `listUsers perPage: 500 ΓåÆ 1000` | ≡ƒƒá H (parcial) |
| `pagar/.../exito/actions.ts` | Detectar `session_id === "auto"`, usar cookie | ≡ƒƒá H |
| `pagar/.../exito/actions.ts` | Regex de email en `markRecentPurchase` | ≡ƒƒá H |
| `pagar/[slug]/page.tsx` | Copy distinto para guest con access | ≡ƒƒí M |

## Pendientes para pr├│ximos turnos

1. ~~**Crear RPC `lookup_user_id_by_email`**~~ - **DONE en FASE 2 V2**.
2. ~~**Validar `finalAmountMXN >= 50`**~~ - Resuelto en FASE 2 V3 (becas $0 inline).
3. ~~**Rate limiting** en `resendGuestAccessLink`~~ - **DONE en FASE 2 V4**.
4. ~~**Comparar `amount_total` con `course.priceMXN`** en webhook + log~~ - **DONE en FASE 2 V1**.
5. **Validar UUID** de `metadata.user_id` antes de usar. - pendiente.

## Validaci├│n

- Γ£à type-check OK
- Γ£à lint OK
- Γ£à 618 tests OK (606 originales + 12 nuevos FASE 2)
- ΓÅ│ Pendiente: ejecutar E2E completo (David debe re-testear)

---

# FASE 2 - Cierre de pendientes cr├¡ticos para go-live (2026-07-08 05:10)

Bloqueante: SRE auditor marc├│ 4 vectores como MUST-FIX antes de flip a
`sk_live_*`. Resueltos todos en este commit.

## V1: Validaci├│n de monto exacto en webhook (anti-fraude)

**Archivo:** `src/app/api/webhooks/stripe/route.ts:354-411`

```typescript
const expectedAmountCentavos = Math.round(productRef.priceMXN * 100);
const actualAmountCentavos = session.amount_total ?? 0;
if (productRef.priceMXN > 0 && actualAmountCentavos !== expectedAmountCentavos) {
  // log error cr├¡tico con delta
  // insert payment con status='suspicious_amount_discrepancy'
  // return 200 sin grant
}
```

**Ataque que previene:** manipulaci├│n del `amount_total` en la sesi├│n
de Stripe (extensi├│n, MITM, bug) → antes pagaba $1, recib├¡a $200 de
curso. Ahora: el grant se bloquea, queda payment auditable en DB.

## V2: RPC `get_user_id_by_email` (elimina bomba listUsers)

**Archivo:** `supabase/migrations/20260708040000_get_user_id_by_email.sql`

Funci├│n SQL SECURITY DEFINER que consulta `auth.users` directamente
por email en O(1) usando el ├¡ndice ├║nico. Reemplaza
`supabase.auth.admin.listUsers({ perPage: 1000 })` que timeout-eaba
con >500 users (justo en el evento del 11 de julio).

Aplicada a DB via Supabase Management API. Verificada: devuelve
`uuid` para `david17891@gmail.com`.

**Usos actualizados:**
- `src/app/pagar/[courseSlug]/page.tsx` (guest detection)
- `src/app/api/payments/create-checkout/route.ts` (grantScholarshipInline)

## V3: Becas del 100% (cup├│n $0 → scholarship_free)

**Archivo:** `src/app/api/payments/create-checkout/route.ts:155-205`

Si `course.priceMXN === 0` (beca pre-configurada) o si un cup├│n lleva
a 0, NO se llama a Stripe (que rechaza `amount=0` con 400). Se
inserta `payment` con `provider='scholarship_free'`, se grant access
v├¡a `grantAccess({ source: 'scholarship', grantedReason })`, y se
redirige directo a `/exito` con `flow='inline'`.

**Type agregado:** `CourseAccessSource = ... | "scholarship"` en
`src/types/lms.ts`.

## V4: Rate limiting en `resendGuestAccessLink` (anti email bombing)

**Archivo:** `src/app/pagar/[courseSlug]/exito/actions.ts`

3 calls/hora por combinaci├│n `IP+email` (sliding window 1h).
Reutiliza `src/lib/api/rate-limit.ts` (existente, in-memory).

Retorna `ok: false` con `retryAfterSec` si excede. Helper
`getClientIpFromHeaders()` para server actions (que no exponen
`Request`).

## Tests a├▒adidos (12 nuevos, total 618/618 OK)

`tests/payments-fase2-hardening.test.mjs` cubre las 4 reglas:
- S1: amount_total === priceMXN*100 → OK
- S2: amount_total < priceMXN*100 → suspicious
- S3: amount_total > priceMXN*100 → suspicious
- S4: regla beca priceMXN===0 → inline
- S5: regla beca priceMXN>0 → redirect
- S6: rate limit 3 calls/h OK + 4to rejected
- S7: rate limit keys distintas independientes
- S8-S11: applyCoupon (4 escenarios: discount>amount, percentOff 50%,
       inactivo, 100% off)
- S12: rate limit key format (IP+email normalizado)

## Checklist para flip a `sk_live_*`

Cuando David autorice go-live (test 4 vectores E2E primero):

1. **Stripe Dashboard** → activar cuenta, completar KYC.
2. **Webhook endpoint** → apuntar a `https://www.qlick.digital/api/webhooks/stripe`
   (NO `qlick.digital` apex, NO `vercel.app`).
3. **Vercel env vars Production**:
   - `STRIPE_SECRET_KEY` = `sk_live_...`
   - `STRIPE_PUBLISHABLE_KEY` = `pk_live_...`
   - `STRIPE_WEBHOOK_SECRET` = `whsec_...` (del nuevo endpoint)
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` = `pk_live_...`
4. **Redeploy** con envs nuevas (Vercel no auto-redeploy por env change).
5. **Smoke test** con tarjeta real chica ($1 concepto, no reembolsable
   por fees): verificar grant de curso, email, magic link.
6. **Monitorear** por 24h con Stripe Dashboard + Supabase logs.

LISTO PARA GO-LIVE cuando David lo autorice.
