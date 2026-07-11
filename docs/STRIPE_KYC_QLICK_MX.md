# Stripe KYC para Qlick — Walk-through paso a paso

> **Propósito:** Esta guía deja TODO el camino crítico para activar Stripe en modo
> **live** para Qlick Marketing Digital. Está pensada para que vos la
> recorras cuando tengas 45 min–1h sin interrupciones. Cada paso tiene URL
> exacta + dato que tenés que tener listo.
>
> **Cuándo usarla:** cuando `scripts/verify-stripe-go-live.mjs` dé 6/6 GO
> y vos estés listo para producción real (no antes).

---

## 📋 Pre-flight — estos son los datos que necesitás tener a mano

Antes de sentarte a hacer el wizard, junteá:

| # | Dato | Dónde sacarlo | Notas |
|---|---|---|---|
| 1 | **Tipo jurídico de Qlick** (S.A. de C.V., S. de R.L. de C.V., etc.) | Acta constitutiva / contador | **NO cambiable después en Stripe.** Si dudás, llamá a tu contador primero. |
| 2 | **RFC de la empresa** (12 chars) | Constancia de Situación Fiscal del SAT | Si no tenés empresa formalmente, podés ir como Persona Física con Actividad Empresarial (RCF persona 13 chars en su lugar) |
| 3 | **Razón social EXACTA** | SAT CSF | Debe coincidir carácter por carácter con el RFC. "S. de R.L." vs "S de RL" causa rechazo (lección del setup WhatsApp). |
| 4 | **Domicilio fiscal** | SAT CSF | Calle + número + colonia + CP + municipio + estado |
| 5 | **Tu RFC personal** (13 chars) | SAT /INE | Lo pide como representante legal |
| 6 | **Tu nombre legal EXACTO** | INE | Idem — carácter por carácter |
| 7 | **Tu fecha de nacimiento** | INE | |
| 8 | **Tu dirección personal** | Comprobante domicilio reciente | Puede ser estado de cuenta bancario |
| 9 | **CLABE interbancaria MXN** (18 dígitos) | App de tu banco | **Bancos típicos que funcionan:** BBVA, Banorte, Santander, HSBC, Scotiabank, Banregio. **NO recomiendo:** Mercado Pago, Nu, HeyBanco, Spin (algunos no soportan Stripe payouts todavía). |
| 10 | **Constancia Situación Fiscal del SAT** (CSF) | SAT /descarga | Por si Stripe te pide verificación documental |
| 11 | **Tu INE vigente** (frente y vuelta en foto) | Tu credencial | Idem |
| 12 | **Statement descriptor** (5-22 chars) | Decisión tuya | Sugerencia: `QLICK.DIGITAL` o `QLICK CURSOS`. Aparece en estado de cuenta del cliente. |
| 13 | **Categoría de negocio** + descripción | Decisión tuya | "Educación online / cursos de marketing digital / infoproductos" |

---

## 🚶 Walk-through Stripe Dashboard

### PASO 1 — Iniciar KYC

**URL:** https://dashboard.stripe.com/account/onboarding

Te aparece un wizard. Si ya tenés cuenta de prueba creada, asegurate de estar en modo **Live** (toggle arriba a la derecha "Test data" → "Live data").

- Click **"Add information to start accepting live payments"**
- País: **Mexico**
- Tipo de cuenta: **"I'm setting up a business"** (empresa), NO individual
- Tipo jurídico: elegí el que corresponda a Qlick
- Click **Continue**

### PASO 2 — Business details (datos de Qlick)

Formulario "Business details". Llená con los datos #1–4 de la tabla de arriba.

- **Legal entity type:** coincidir con el tipo jurídico
- **Legal name (razón social):** EXACTO del SAT
- **Tax ID (RFC):** el RFC empresa (12 chars)
- **DOB / incorporation date:** fecha de constitución
- **Registered address:** domicilio fiscal del CSF

**Si te aparece "do you have an SSN/ITIN" → NO.** México no aplica. Si te lo pide es un bug del wizard; cerrá y volvé a abrir.

### PASO 3 — Representative info (tus datos como representante)

Este es el bloque que más fricción tiene. Stripe te pide:

- Tu nombre legal
- Tu RFC personal (13 chars) — NO el de la empresa
- Email (el mismo de tu cuenta Stripe)
- Phone (tu número)
- Fecha de nacimiento
- Dirección personal (puede ser la misma que la fiscal si operás desde casa)
- Job title: "Director" / "CEO" / "Representante Legal"

Si Qlick tiene **otros dueños >15% S.R.L. o >25% S.A.**, los agregás después como "additional owners". Persona Física Empresarial no aplica.

### PASO 4 — Bank account (CLABE)

Stripe pide número de cuenta bancaria para payouts.

- **Country:** Mexico
- **Currency:** MXN
- **Account number:** tu CLABE de 18 dígitos

⚠️ **Trap:** algunos bancos reportan como "número de cuenta" el # de tarjeta (16 dígitos). Esos NO son la CLABE. La CLABE está en tu app del banco, sección "datos de la cuenta" / "transferencias interbancarias". Es 18 dígitos que arrancan con el código del banco (012 para BBVA, 072 para Banorte, etc.).

Stripe hace **2 microdepósitos pequeños** (entre $1-$5 MXN) a tu cuenta para verificar ownership. Tarda 1-3 días hábiles. Si NO los ves, reclamá a Stripe soporte.

### PASO 5 — Statement descriptor + business profile

URL después del onboarding inicial: https://dashboard.stripe.com/settings/public

- **Statement descriptor:** lo que aparece en el estado de cuenta del cliente. **5-22 chars, mismo idioma de tu sitio, claro y reconocible.** Sugerencia: `QLICK.DIGITAL` o `QLICK CURSOS MX`.
- **Business name (público):** "Qlick Marketing Digital" (lo que el cliente ve en el checkout)
- **Support email:** uno con respuesta humana (ej: hola@qlick.digital)
- **Support phone:** tu número
- **Support site URL:** `https://qlick.digital`
- **Business address:** la misma que en el CSF

### PASO 6 — Métodos de pago a habilitar

URL: https://dashboard.stripe.com/settings/payment_methods

- ✅ **Cards:** activado (default, lo necesitás sí o sí)
- ✅ **OXXO:** activado si querés permitir pagos en efectivo en tiendas (cobre extra de ~$10 MXN por transacción para vos, NO para cliente). Útil para MercadoMX que no tiene tarjeta.
- ✅ **SPEI (customer balance):** activado si querés transferencias bancarias.
- ❌ **Recurring / subscriptions:** NO recomendado aún — Qlick es one-time por ahora.

### PASO 7 — Identity verification (si Stripe te pide)

Stripe revisa tu info automáticamente. Si encuentra algo que no cuadra (nombre vs RFC, dirección, etc.) te pide verificación:

**Doc-upload step** (URL aparece automáticamente si aplica):

| Requerimiento | Qué pide | Lo que necesitás |
|---|---|---|
| Identity document (representante) | Foto INE/Pasaporte frente y vuelta, color, legible | Tu INE vigente |
| Address verification (representante) | Comprobante domicilio <3 meses | Estado de cuenta / CFE / Telmex |
| Business entity proof (empresa) | Acta constitutiva o CSF del SAT | CSF (la Constancia que ya tenés) |
| Bank account ownership | Estado de cuenta donde aparezca la CLABE | Solicitar a tu banco |

⚠️ **Tarda 1-5 días hábiles** según el caso. No mandes mismo día del evento.

### PASO 8 — Wait for activation

**URL:** https://dashboard.stripe.com/account (sección "Account status")

Estado:
- 🟡 "Restricted: outstanding requirements" → te falta algo, scroll abajo te dice qué
- 🟢 "Complete" → estás listo para `sk_live_*`

Cuando esté 🟢, podés generar las keys live.

### PASO 9 — Generar las keys LIVE

URL: https://dashboard.stripe.com/apikeys (asegurá toggle en "Live data")

- Click **"Create restricted key"** (más seguro que full access)
  - Name: `qlick-prod-restricted`
  - Permissions: ✅ `card_payments:write`, ✅ `customer_balance:write`, ✅ `dispute_evidence:write`, ❌ todo lo demás OFF
  - Click Create
  - **COPIÁ** el `rk_live_...` (NO te deja verlo de nuevo)
- Click **"Create secret key"** (alternativa con full access — NO recomendado)
  - Solo si querés la `sk_live_...`
- En la sección "Standard keys" ya tenés `pk_live_...` y `sk_live_...` (publishable y secret).
  - Click "Reveal live key" para sk
  - **COPIÁ los 3**: `pk_live_...`, `sk_live_...`, y la restricted si la usás

### PASO 10 — Webhook endpoint live

URL: https://dashboard.stripe.com/webhooks (toggle Live)

- Click **"Add endpoint"**
- Endpoint URL: `https://www.qlick.digital/api/webhooks/stripe`
- API version: `2025-09-30.clover` (la misma que usa el código actual; si Stripe sugiere otra más nueva, aceptá solo si es compatible hacia atrás)
- Description: `Qlick prod — checkout events`
- Click "Select events" → seleccioná:
  - ✅ `checkout.session.completed`
  - ✅ `checkout.session.async_payment_succeeded`
  - ✅ `checkout.session.async_payment_failed`
  - ✅ `checkout.session.expired`
  - ✅ `charge.refunded`
- Click "Add endpoint"
- En la página del endpoint, click **"Reveal"** en "Signing secret" → `whsec_live_...`
- **COPIÁ** el `whsec_live_...`

---

## 🔄 Flip en Vercel (después de tener los 4 secrets nuevos)

El script `scripts/verify-stripe-go-live.mjs` chequea todo antes de este paso. Solo procedé si dio GO.

```powershell
$secrets = @{
  "STRIPE_SECRET_KEY"                 = "sk_live_..."
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY" = "pk_live_..."
  "STRIPE_WEBHOOK_SECRET"             = "whsec_live_..."
  "NEXT_PUBLIC_PAYMENT_PROVIDER"      = "stripe"  # ya estaba
}

foreach ($k in $secrets.Keys) {
  # Borra el valor viejo (production)
  vercel env rm $k production --yes
  # Pega el nuevo (te va a pedir el valor interactivamente)
  Write-Host "Pega nuevo valor para $k"
  vercel env add $k production
}

# Redeploy para que tome las nuevas env vars
vercel deploy --prod --yes
```

⚠️ **ATENCIÓN:** los comandos `vercel env rm` y `vercel env add` van a pedir confirmación. NO uses `--force` a menos que estés seguro. Si la sesión Mavis no tiene TTY, **esto lo hacés vos** desde tu terminal, no desde Mavis.

---

## ✅ Smoke test post-flip (mismo día)

1. Ir a `https://www.qlick.digital/cursos/masterclass-marketing-ia` (o el curso que quieras probar)
2. Click "Comprar" → "Pagar ahora"
3. Tarjeta **REAL** de tu banco (no test 4242) o tarjeta prepagada de bajo saldo
4. Completar checkout → debe volver a `/exito` con badge "Aprobado"
5. En Stripe Dashboard (Live) → Payments → ver el cargo real
6. En Supabase SQL Editor:
   ```sql
   SELECT id, user_id, provider, status, amount_mxn 
   FROM payments 
   WHERE created_at > now() - interval '1 hour'
   ORDER BY created_at DESC LIMIT 5;
   ```
   → 1 fila con `provider='stripe', status='approved', amount_mxn=200` (lo que sea)
7. Si todo OK → revertir el cargo desde Stripe Dashboard (Refund)
8. Comunicar al equipo que el flujo live está OK

---

## ⚠️ Riesgos y gotchas conocidos

| Riesgo | Mitigación |
|---|---|
| Banco no soporta payouts a CLABE | Verificar antes con tu banco si tenés cuenta en neobank. Si rechazo, abrir cuenta en BBVA/Banorte/Santander tradicional. |
| Statement descriptor cambia percepción de marca | Probalo con tu tarjeta real antes del primer cargo a cliente. Si no te gusta, lo cambiás en settings. |
| KYC tarda más de lo esperado (5-10 días en casos raros) | Arrancar el KYC **al menos 1 semana antes** del go-live planeado. |
| Primer payout tarda 7 días calendario | Reservar capital de trabajo para cubrir costos operativos mientras tanto. |
| Microdepósitos no llegan | Reenviar desde Stripe Dashboard → Account → Payouts → "Verify bank account" |

---

## 📂 Archivos relacionados

- `docs/STRIPE_KYC_QLICK_MX.md` — este doc
- `docs/PAYMENTS_AUDIT_2026-07-08.md` — auditoría Fase 2 + checklist inicial
- `docs/PAYMENTS_STRIPE_SETUP.md` — setup técnico (webhook handler, env vars)
- `scripts/verify-stripe-go-live.mjs` — pre-flight automatizado
- `data/PROJECT-LOG.md` — log append-only de cambios

---

**Última actualización:** 2026-07-08
**Owner:** David (ejecuta) + Mavis (prepara el camino)
