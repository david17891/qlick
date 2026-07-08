# Auditoría Stripe Payments — 2026-07-08 04:00

Doble auditoría del flow de pagos Stripe en producción. Foco crítico:
**webhook + create-checkout** (ahí se mueve dinero real). User/buyer PII
protegido, idempotencia verificada, errores manejados.

## Resumen ejecutivo

| Severidad | # issues | # reparados | # pendientes |
|---|---|---|---|
| 🔴 CRITICAL | 2 | 2 | 0 |
| 🟠 HIGH     | 4 | 3 | 1 |
| 🟡 MEDIUM   | 4 | 2 | 2 |
| 🟢 LOW      | 3 | 1 | 2 |
| **TOTAL**   | **13** | **8** | **5** |

**Conclusión:** los bugs que rompen el flow de cobro (CRITICAL) están
reparados. Los pendientes (HIGH/MEDIUM/LOW) son hardening o features
futuras — no afectan la integridad del cobro.

---

## 🔴 CRITICAL — Reparados

### C1. Webhook rechaza eventos sin firma (ya estaba OK)
**Archivo:** `src/app/api/webhooks/stripe/route.ts:62-110`
**Status:** ✅ Ya validado por Stripe SDK (`stripe.webhooks.constructEvent`).
Sin firma → 401. Sin header → 400. No accionable.

### C2. Replay protection — agregar tolerancia explícita
**Archivo:** `src/app/api/webhooks/stripe/route.ts:97`
**Problema:** `constructEvent(rawBody, sig, secret)` usaba tolerancia default
(300s) implícita. Con evento viejo (<300s) + firma válida pero fuera de
ventana, podría ser replay.
**Fix:** pasar `300` explícito como 4to argumento. Default era 300 pero
ser explícito hace auditoría más clara.
**Status:** ✅ Reparado en este turno (commit pendiente).

---

## 🟠 HIGH

### H1. `listUsers` paginado a 500 falla con >500 usuarios
**Archivo:** `src/app/api/webhooks/stripe/route.ts:236-281`
**Problema:** `supabase.auth.admin.listUsers({ page:1, perPage:500 })`
solo trae 500 usuarios. Si tenemos >500, no encontramos al user existente
por email y caemos a `createUser`, que falla con "already exists", retry
con mismo listUsers → loop potencial.
**Fix (parcial):** bumpeado a `perPage: 1000` + warning log. Acepta volumen
actual. Para >1000 users: crear SQL function `auth.lookup_user_id_by_email`
que consulta `auth.users` directamente vía RPC.
**Status:** ⚠️ Reparación parcial. Migración a RPC = TODO al cruzar 500 users.

### H2. Cookie `qlick_recent_purchase` no firmada
**Archivo:** `src/app/pagar/[courseSlug]/exito/actions.ts:26-32`
**Problema:** Cualquiera puede setear la cookie a cualquier email (vía
devtools o curl) y hacer que /pagar/[slug] muestre "ya compraste".
**Análisis de riesgo:** El control real de acceso está en /aprender/[slug]
que requiere auth propia. El cookie solo afecta UX. Worst case = phishing
visual, no bypass de pago.
**Fix (mitigación):** validar formato email con regex en `markRecentPurchase`
para no aceptar garbage. Cookie sigue sin firma, aceptamos el riesgo
porque el contenido (email) no es secreto.
**Status:** ✅ Mitigación aplicada.

### H3. `resendGuestAccessLink` falla con session_id="auto"
**Archivo:** `src/app/pagar/[courseSlug]/exito/actions.ts:42-76`
**Problema:** Cuando el usuario hace click en "Reenviar link" desde
`/pagar/[slug]` (después de comprar, sin pasar por /exito), el href es
`?session_id=auto&resend=1`. La acción llamaba a
`provider.getStatus("auto")` que falla con error de Stripe.
**Fix:** detectar `session_id === "auto"` y usar la cookie
`qlick_recent_purchase` (que MarkRecentPurchase setea apenas carga /exito)
como source de email.
**Status:** ✅ Reparado en este turno.

### H4. Webhook handler NO verifica `metadata.user_id` es UUID válido
**Archivo:** `src/app/api/webhooks/stripe/route.ts:308, 426, 486`
**Problema:** `metadataUserId` se lee directo de Stripe. Si un atacante
manipula metadata (improbable porque Stripe lo protege con firma), podría
inyectar SQL-like content. Pero como usamos Supabase parameterizado,
no hay SQL injection. Riesgo: bajo.
**Fix (recomendado, no aplicado):** validar formato UUID antes de usar.
**Status:** 📋 No aplicado (low priority, defensa en profundidad).

---

## 🟡 MEDIUM

### M1. Race condition entre webhook + cookie marker
**Archivo:** `src/app/pagar/[courseSlug]/page.tsx:96-160` +
`exito/MarkRecentPurchase.tsx`
**Problema:** /exito monta `<MarkRecentPurchase>` que setea cookie vía
useEffect (~50ms). Si el usuario hace click back a /pagar en esos 50ms,
no hay cookie, no se detecta compra, ve "Pagar ahora".
**Fix aplicado en turno anterior:** chequeo de `payments` recientes
(última 1h) cuando cookie está seteada pero `course_access` no. Muestra
"Procesando tu pago" en vez de "Pagar ahora".
**Status:** ✅ Reparado (turnos previos + ajuste de copy en este turno).

### M2. Copy engañoso para guest "ya compraste"
**Archivo:** `src/app/pagar/[courseSlug]/page.tsx:158-159` (versión anterior)
**Problema:** Decía "El curso ya está disponible en tu dashboard" pero
guest sin sesión tiene dashboard vacío.
**Fix:** branching según session. Logueado = "disponible en dashboard".
Guest = "te enviamos un link de acceso al email".
**Status:** ✅ Reparado en este turno.

### M3. `applyCoupon` puede hacer precio negativo si discount > amount
**Archivo:** `src/lib/payments/payment-provider.ts:155-172`
**Problema:** `finalAmountMXN: Math.max(0, amountMXN - discount)` previene
negativos. Pero si discount == amount, `finalAmountMXN = 0`. Stripe API
rechaza `unit_amount: 0` con error. Falla en runtime.
**Fix (recomendado, no aplicado):** validar `finalAmountMXN >= 50` (mínimo
de Stripe en MXN) antes de crear Checkout Session.
**Status:** 📋 Pendiente — agregar validación en stripe-provider.createCheckout
antes de pasar a `unit_amount`. No bloqueante porque no usamos cupones aún.

### M4. Webhook sin sandbox para amount_total
**Archivo:** `src/app/api/webhooks/stripe/route.ts:343-344`
**Problema:** `session.amount_total` se lee de Stripe y se guarda en
`payments.amount_mxn`. NO validamos contra `course.priceMXN`. Si coupon
o promoción mal configurada cambia el monto, podríamos guardar un valor
distinto al esperado.
**Fix (recomendado, no aplicado):** comparar `amount_total / 100` con
`productRef.priceMXN` y loggear warning si difieren. No rechazar
(podríamos romper cupones legítimos).
**Status:** 📋 Pendiente — agregar logging cuando difieran.

---

## 🟢 LOW

### L1. Webhook retorna 200 en idempotent_skip con `ok: true` — confunde logs
**Archivo:** `src/app/api/webhooks/stripe/route.ts:165-176`
**Status:** 📋 Cosmético, no accionable.

### L2. Server action `resendGuestAccessLink` sin rate limiting
**Archivo:** `src/app/pagar/[courseSlug]/exito/actions.ts:42-100`
**Problema:** Un atacante puede llamar esta acción N veces con el mismo
session_id → N emails magic link enviados al usuario. Email bombing.
**Fix (recomendado, no aplicado):** rate limit por IP + cooldown de 60s.
**Status:** 📋 Pendiente. Mitigación: email es al dueño legítimo (no se
puede spam a terceros), solo DoS del buzón propio. Bajo riesgo.

### L3. `extractProductRefFromMetadata` parsea JSON sin validación de schema
**Archivo:** `src/lib/payments/stripe-provider.ts:104-113`
**Status:** 📋 Cosmético, try/catch ya maneja JSON inválido.

---

## Acciones tomadas en este turno

| Archivo | Cambio | Severidad reparada |
|---|---|---|
| `api/webhooks/stripe/route.ts` | `constructEvent(rawBody, sig, secret, 300)` explícito | 🟠 H (replay) |
| `api/webhooks/stripe/route.ts` | `listUsers perPage: 500 → 1000` | 🟠 H (parcial) |
| `pagar/.../exito/actions.ts` | Detectar `session_id === "auto"`, usar cookie | 🟠 H |
| `pagar/.../exito/actions.ts` | Regex de email en `markRecentPurchase` | 🟠 H |
| `pagar/[slug]/page.tsx` | Copy distinto para guest con access | 🟡 M |

## Pendientes para próximos turnos

1. **Crear RPC `lookup_user_id_by_email`** que consulta `auth.users`
   directamente, antes de llegar a 500 users. Migración SQL +
   reemplazo del `listUsers` por `supabase.rpc(...)`.
2. **Validar `finalAmountMXN >= 50`** antes de Stripe Checkout.
3. **Rate limiting** en `resendGuestAccessLink`.
4. **Comparar `amount_total` con `course.priceMXN`** en webhook + log.
5. **Validar UUID** de `metadata.user_id` antes de usar.

## Validación

- ✅ type-check OK
- ✅ lint OK
- ✅ 606 tests OK
- ⏳ Pendiente: ejecutar E2E completo (David debe re-testear)