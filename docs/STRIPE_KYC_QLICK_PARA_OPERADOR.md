# Cómo activar Stripe para Qlick Marketing Digital — Guía paso a paso

> **Para:** la persona que va a llenar el formulario de verificación de Stripe
> en nombre de Qlick Marketing Digital.
>
> **Por qué este doc:** David creó la cuenta de Stripe pero necesita que
> alguien del equipo de operaciones complete el proceso de verificación
> (KYC) que requiere datos fiscales y bancarios de México.
>
> **Tiempo estimado:** 30–45 minutos si ya tenés todos los datos a mano.
> 1–2 horas si tenés que ir a buscarlos al SAT o al banco.
>
> **Cuándo me necesitás:** si te trabás en un paso o si Stripe te rechaza
> algún documento — David te puede ayudar, pero NO tiene acceso al dashboard
> de Stripe en este momento. Si el problema es con datos que no coinciden
> con el SAT, ahí sí o sí hay que esperar.

---

## 📋 Antes de empezar — juntá estos datos

Necesitás tener esta info lista antes de sentarte a llenar el formulario.
Si te falta algo, **no arranques** — te vas a frustrar a la mitad.

### Bloque 1 — Datos de la empresa Qlick Marketing Digital

| # | Dato | Dónde sacarlo | Tips |
|---|---|---|---|
| 1 | **Tipo jurídico exacto de Qlick** | Acta constitutiva / preguntar a David / contador | Opciones: S.A. de C.V., S. de R.L. de C.V., o Persona Física con Actividad Empresarial. **Preguntale a David cuál es — no es cambiable después en Stripe.** |
| 2 | **RFC de la empresa** (12 caracteres) | Constancia de Situación Fiscal del SAT (CSF) | Solo si Qlick es S.A. o S.R.L. Si es Persona Física Empresarial, NO tenés este campo. |
| 3 | **Razón social completa** | CSF del SAT | Debe escribirse **carácter por carácter** como aparece en el CSF. "S. de R.L." vs "S de RL" causa rechazo. |
| 4 | **Domicilio fiscal completo** | CSF del SAT | Calle + número + colonia + CP + municipio + estado. Sin abreviaturas. |
| 5 | **Fecha de constitución** (si es empresa) | Acta constitutiva | dd/mm/aaaa |

### Bloque 2 — Datos del representante legal (vos o quien David designe)

| # | Dato | Tips |
|---|---|---|
| 6 | **Tu nombre legal completo** | Exactamente como aparece en tu INE. Carácter por carácter. |
| 7 | **Tu RFC personal** (13 caracteres) | Lo pide sí o sí como representante. NO es el RFC de la empresa. |
| 8 | **Tu fecha de nacimiento** | dd/mm/aaaa |
| 9 | **Tu dirección personal** | Puede ser igual a la fiscal si operás desde casa. Calle + número + colonia + CP + municipio + estado. |
| 10 | **Tu CURP** (si te la piden) | Opcional, ayuda a Stripe a validar tu identidad |

### Bloque 3 — Datos bancarios

| # | Dato | Tips |
|---|---|---|
| 11 | **CLABE interbancaria** (18 dígitos) | La sacás de la app de tu banco, sección "datos para transferencia" o "CLABE". **NO es tu número de tarjeta** (esos son 16 dígitos y NO sirven). Empieza con el código del banco (012=BBVA, 072=Banorte, 014=Santander, 021=HSBC, etc). |
| 12 | **Titular de la cuenta bancaria** | El nombre tal como aparece en el banco. Tiene que coincidir o ser la misma persona que el RFC que estás declarando. |
| 13 | **Nombre del banco** | BBVA, Banorte, Santander, HSBC, Scotiabank, Banregio, etc. NO uses neobanks (Nu, HeyBanco, Mercado Pago, Spin) — algunos no funcionan con Stripe payouts todavía. |

### Bloque 4 — Datos del negocio

| # | Dato | Sugerencia |
|---|---|---|
| 14 | **Categoría del negocio** | "Education & Training" o "Online Education" |
| 15 | **Descripción del negocio** | Texto libre de 100-300 palabras. Ejemplo: "Plataforma mexicana de educación online en marketing digital. Ofrecemos cursos grabados, workshops en vivo y material descargable para emprendedores y profesionales que quieren aprender marketing digital, publicidad en Meta y Google, email marketing y automatización. Atendemos clientes en México y Latinoamérica hispanohablante. Sitio web: qlick.digital." |
| 16 | **Statement descriptor** | El texto que aparece en el estado de cuenta del cliente cuando le cobrás. 5 a 22 caracteres. Sugerencia: **`QLICK.DIGITAL`** o **`QLICK CURSOS`** |
| 17 | **URL del sitio web** | `https://qlick.digital` |
| 18 | **Email de soporte** | `hola@qlick.digital` (o lo que David te diga) |
| 19 | **Teléfono de soporte** | El número que David designe (aparece en los recibos que Stripe le manda al cliente) |

### Bloque 5 — Documentos que pueden pedirte

Stripe a veces pide verificación adicional. Si te pide, tené estos listos:

| Documento | Para qué lo pide | Dónde tenerlo |
|---|---|---|
| INE vigente (frente y vuelta, foto) | Verificar identidad del representante | Foto desde tu celular |
| Comprobante de domicilio < 3 meses | Verificar dirección del representante | Estado de cuenta bancario, recibo CFE/Telmex |
| Constancia de Situación Fiscal (CSF) del SAT | Verificar datos de empresa | Descargala de https://www.sat.gob.mx si no la tenés |
| Estado de cuenta bancaria | Verificar CLABE | Solicitar a tu banco si no la tenés |

---

## 🚶 Empezamos — paso a paso

### Paso 1 — Abrir el dashboard de Stripe

**URL:** https://dashboard.stripe.com/account/onboarding

Antes de hacer login, fijate arriba a la derecha que estés en modo **"Live data"** (toggle). Si dice "Test data", cambialo — necesitamos trabajar en producción real.

Una vez en modo Live, te aparece un botón **"Add information to start accepting live payments"**. Click ahí.

### Paso 2 — Tipo de cuenta

Te pregunta qué tipo de cuenta vas a configurar:

- Elegí **"I'm setting up a business"** (empresa, no individual)

Esto es importante: si elegís "individual", después te pide datos diferentes y tenés que reiniciar.

### Paso 3 — País y tipo jurídico

- País: **Mexico**
- Tipo jurídico: elegí el que David te confirmó (Bloque 1, dato #1)

> ⚠️ **Gotcha:** una vez que elijas el país Y empieces a tipear el nombre legal, ese dato queda bloqueado. Si elegís mal, tenés que contactar a soporte de Stripe para cambiarlo.

### Paso 4 — Datos de la empresa

Llená el formulario "Business details" con el Bloque 1.

| Campo del formulario | Lo que va |
|---|---|
| Legal entity type | El tipo jurídico (#1) |
| Legal name | Razón social (#3) carácter por carácter |
| Tax ID (RFC) | RFC de la empresa (#2). Si es Persona Física Empresarial, este campo NO existe. |
| Date of formation / incorporation | Fecha de constitución (#5) |
| Registered address | Domicilio fiscal (#4) |

> 💡 Si te aparece un campo que pide SSN o ITIN — **NO es para México**. Cerrá la ventana, esperá 5 minutos, y volvé a abrir. A veces Stripe mete ese campo por bug del wizard.

### Paso 5 — Datos del representante

Te pregunta quién va a operar la cuenta. Esto sos vos o quien David designe.

| Campo | Lo que va |
|---|---|
| First name | Tu nombre (#6) |
| Last name | Tu apellido (#6) |
| Email | El mismo email con el que David creó la cuenta de Stripe |
| Phone | Tu teléfono personal |
| Date of birth | Tu fecha de nacimiento (#8) |
| Personal RFC | Tu RFC personal (#7), 13 caracteres |
| Personal address | Tu dirección personal (#9) |
| Job title | "Director" / "CEO" / "Representante legal" |

> 📌 Si Qlick tiene **otros dueños con >15% de participación** (S.R.L.) o **>25%** (S.A.), te va a preguntar si querés agregar owners adicionales. Persona Física Empresarial NO aplica. Si te pide y no aplica, elegí "No other owners".

### Paso 6 — Cuenta bancaria

Stripe te pide dónde quiere depositar tu dinero cuando un cliente pague.

| Campo | Lo que va |
|---|---|
| Country | Mexico |
| Currency | MXN |
| Account number | Tu CLABE (#11), 18 dígitos |
| Account holder name | Titular de la cuenta (#12) |

> ⚠️ **Gotcha crítico:** NO confundas CLABE con número de tarjeta. La CLABE son 18 dígitos que empezás a tipear con el código de banco (012=BBVA, 072=Banorte). El número de tarjeta son 16 dígitos y NO sirve para esto. Si metés el número equivocado, Stripe te rechaza.

> ⚠️ **Otro gotcha:** si tu cuenta bancaria está en un banco 100% digital (Nu, HeyBanco, Spin, Mercado Pago wallet), algunos no funcionan con Stripe payouts todavía. Si Stripe te lo rechaza, abrí una cuenta BBVA o Banorte tradicional.

Después de agregar la cuenta, Stripe hace **dos microdepósitos pequeños (entre $1 y $5 MXN)** a tu cuenta para verificar que es tuya. Tarda **1 a 3 días hábiles**. **No sigas sin verificar** — el proceso queda pausado hasta que confirmes los montos.

Cuando lleguen, volvé a https://dashboard.stripe.com/account/payouts y ahí te aparece para confirmarlos.

### Paso 7 — Statement descriptor + info pública

**URL después:** https://dashboard.stripe.com/settings/public

Acá configurás lo que el cliente ve:

| Campo | Lo que va |
|---|---|
| Statement descriptor (short) | `QLICK.DIGITAL` o `QLICK CURSOS` (#16) |
| Statement descriptor (long, opcional) | Puede ser más descriptivo: "QLICK MARKETING DIGITAL" |
| Business name (public) | "Qlick Marketing Digital" — lo que el cliente ve en el checkout |
| Support email | hola@qlick.digital (#18) |
| Support phone | (número) |
| Support site URL | https://qlick.digital |
| Business address | Tu domicilio fiscal (#4) |

### Paso 8 — Métodos de pago a habilitar

**URL:** https://dashboard.stripe.com/settings/payment_methods

Marcá:

- ✅ **Cards** (obligatorio)
- ✅ **OXXO** (opcional pero recomendado — le permite al cliente pagar en tiendas OXXO con efectivo, sin tarjeta)
- ✅ **Customer balance / SPEI** (opcional — transferencia bancaria)
- ❌ Subscriptions / Recurring (NO todavía, Qlick vende cursos one-time)

> 💡 Activar OXXO y SPEI no te cobra extra a vos, solo le da opciones al cliente.

### Paso 9 — Verificación de identidad

Si Stripe te pide verificación adicional (a veces la pide automáticamente, a veces no):

**Si te pide subir documento:**
- Te aparece una sección con botones "Upload".
- Para representante: foto de tu INE frente y vuelta, color, legible.
- Para empresa: PDF o foto de la Constancia de Situación Fiscal del SAT.
- Para CLABE: estado de cuenta bancario.

**Subí lo más legible posible.** Si la foto sale movida o cortada, Stripe la rechaza y tenés que subirla de nuevo. Tomala con buena luz, el documento plano sobre mesa.

**Si NO te pide nada:** significa que Stripe validó automáticamente. Pasá al paso 10.

### Paso 10 — Esperar activación

**URL:** https://dashboard.stripe.com/account (sección "Account status")

Acá ves un círculo de estado:

- 🟡 **Restricted** (amarillo): te falta algo. Scroll abajo te dice qué.
- 🟢 **Complete** (verde): está listo.

**Cuando esté en verde**, podés generar las keys de producción. **Avisale a David** que ya está listo el KYC.

---

## 🆘 Si algo falla — a quién llamar

| Problema | Solución |
|---|---|
| Stripe no me deja avanzar en un paso | Le pegás un screenshot del error a David. Él puede identificar si es bug de Stripe o falta un dato. |
| Stripe me pide un documento que no entiendo | Le avisás a David antes de subir nada que no estés segura. No subas cosas por subir. |
| Stripe rechaza tu CLABE | Verificá con tu banco que la cuenta esté a tu nombre (no de un tercero) y que sea MXN. |
| El estado queda en "restricted" más de 5 días hábiles | Contactar a Stripe support directo: https://support.stripe.com/ |
| Te pide cambiar el tipo jurídico después de haber elegido | NO se puede. Tendrías que contactar a soporte de Stripe con prueba de que el tipo está mal declarado. |
| No sabés si un dato "va en mayúsculas o no" | Como aparece en el documento oficial (CSF o INE). Carácter por carácter, sin espacios de más. |

---

## ✅ Checklist al terminar

Cuando el KYC esté en verde, le confirmás a David:

- [ ] Tipo jurídico elegido: __________
- [ ] Razón social completa registrada: __________
- [ ] RFC empresa registrado: __________ (si aplica)
- [ ] RFC representante registrado: __________
- [ ] CLABE bancaria agregada: __________ (últimos 4 dígitos)
- [ ] Microdepósitos confirmados: __________ (sí / no / pendiente)
- [ ] Statement descriptor configurado: __________
- [ ] Email de soporte: __________
- [ ] Teléfono de soporte: __________
- [ ] URL del sitio: __________
- [ ] Estado de la cuenta: __________ (verde / amarillo / rojo)

---

## 📞 Después del KYC — qué le aviso a David

Una vez que el estado esté 🟢 **Complete**, le pasás a David:

1. **Screenshot del estado verde** en https://dashboard.stripe.com/account
2. **Confirmación de que ya podés generar las keys** en https://dashboard.stripe.com/apikeys (toggle "Live data")
3. **Confirmación de que el webhook endpoint está listo** para que David lo registre (URL: `https://www.qlick.digital/api/webhooks/stripe`)

David va a correr el script `scripts/verify-stripe-go-live.mjs` antes de hacer cualquier cambio en producción.

---

## 📚 Glosario rápido (por si Stripe usa términos raros)

| Término | Qué significa |
|---|---|
| **KYC** | "Know Your Customer" — proceso de verificar identidad. Es obligatorio por ley. |
| **RFC** | Registro Federal de Contribuyentes. Tu número de identificación fiscal en México. Personas físicas tienen 13 caracteres, empresas 12. |
| **CLABE** | Clave Bancaria Estandarizada. Son 18 dígitos que identifican tu cuenta bancaria para transferencias. La necesitás para que Stripe te deposite dinero. |
| **Statement descriptor** | Texto corto que aparece en el estado de cuenta del cliente cuando le cobrás. |
| **CSF** | Constancia de Situación Fiscal del SAT. Documento "oficial" que tiene tu RFC, razón social, domicilio fiscal, régimen fiscal — con QR criptográfico. |
| **Payout** | Cuando Stripe te transfiere el dinero de las ventas a tu cuenta bancaria. |
| **Microdepósito** | Transferencia pequeña ($1-$5 MXN) que Stripe hace a tu cuenta para verificar que es tuya. |

---

## 📂 Archivos relacionados (NO necesitás abrirlos, son para David)

- `docs/STRIPE_KYC_QLICK_MX.md` — versión técnica (con más detalle sobre qué hace cada cosa por dentro)
- `docs/PAYMENTS_AUDIT_2026-07-08.md` — historia del código de pagos
- `scripts/verify-stripe-go-live.mjs` — script que David corre antes del flip final

---

**Última actualización:** 2026-07-09
**Mantenedor:** David (te puede agregar info si te trabás)
**Contacto principal:** David vía el chat que te pasó este doc
