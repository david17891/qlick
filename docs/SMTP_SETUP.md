> **📌 Snapshot histórico (sprint housekeeping 2026-07-12):** Este doc es un snapshot del estado del proyecto a la fecha de su creación (ver frontmatter o el commit al inicio del doc). El proyecto ha evolucionado — para el estado actual, ver [docs/STATUS.md](STATUS.md) y [docs/OPEN_ITEMS.md](OPEN_ITEMS.md) (resumen ejecutivo al inicio). Las menciones a Resend o qlick.marketing son del contexto histórico; el email transaccional actual usa **Brevo** (
oreply@qlick.digital).

# SMTP Setup — Resend

> **Guía paso a paso** para configurar Resend como proveedor de emails transaccionales.
> Después de seguirla, David debería recibir emails cuando entren surveys con `consent_to_contact = true` en eventos reales.
>
> **Tiempo estimado:** 30 min.
> **Última revisión:** 2026-06-28 (Fase 5 Bloque 1).
> **Audiencia:** David (admin principal), futuros devs.

---

## ¿Por qué Resend?

- **Free tier generoso:** 100 emails/día, 3,000/mes. Más que suficiente para el volumen esperado.
- **SDK Node oficial:** `resend` en npm, tipado, mantenido.
- **Setup rápido:** dashboard limpio, no requiere tarjeta de crédito para empezar.
- **DNS records automáticos:** SPF/DKIM/DMARC se generan con un click (vs SendGrid que es más manual).
- **React Email templates** si en el futuro querés migrar a templates JSX.

**Cuándo migrar a otro proveedor:** si el volumen crece más allá de 3k/mes → plan Pro de Resend ($20/mes, 50k emails). Si llegás a 50k/mes → evaluar SendGrid Pro o AWS SES (más barato por email).

---

## Setup paso a paso

### 1. Crear cuenta en Resend

1. Ir a https://resend.com
2. Click "Get Started" o "Sign Up"
3. **Signup con GitHub** (recomendado — más rápido, menos fricción)
4. Verificar email si pide

### 2. Verificar el dominio `qlick.marketing`

> ⚠️ **Bloqueante.** Sin esto no podés enviar emails desde `@qlick.marketing`.

1. En el dashboard de Resend → menú **Domains** → click "Add Domain"
2. Escribir `qlick.marketing`
3. Resend te muestra los DNS records que tenés que agregar. Son **3 records** (formato exacto depende del registrar DNS donde David tiene `qlick.marketing`):

   | Type | Name | Value | Purpose |
   |---|---|---|---|
   | TXT | `@` (o el root) | `resend-site-verification=...` | Verifica que sos dueño del dominio |
   | TXT | `resend._domainkey` (subdomain) | `p=MIIBIjANBgkqhkiG9...` (largo, ~500 chars) | DKIM (firma digital) |
   | TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:...` | DMARC (política de fallo) |

4. **Ir a tu proveedor DNS** (Cloudflare, Namecheap, GoDaddy, Google Domains, etc.) y agregar esos records EXACTAMENTE como Resend los muestra.
5. **Volver a Resend** y click "Verify". La propagación DNS puede tardar **hasta 48 horas** (típicamente 5-30 min).
6. Cuando diga "Verified" → podés enviar emails desde `@qlick.marketing`.

**Tip:** si David tiene prisa, podemos usar temporalmente `onboarding@resend.dev` (el subdominio default de Resend) mientras se propaga el DNS real. Solo cambia `RESEND_FROM_ADDRESS` en `.env.local`.

### 3. Crear API key (restricted scope)

1. En Resend dashboard → menú **API Keys** → click "Create API Key"
2. **Name:** `qlick-marketing-prod` (o similar)
3. **Permission:** "Sending access" (NO "Full access" — principio de mínimo privilegio)
4. **Domain:** restringir a `qlick.marketing` si la opción está disponible
5. Click "Add" → **copiá la key inmediatamente** (empieza con `re_xxx`, no se vuelve a mostrar)

### 4. Configurar `.env.local`

En el archivo `.env.local` del proyecto (`C:\Users\User\Documents\Click\.env.local`), agregar (o verificar que ya estén):

```bash
# Email transaccional (Resend, Fase 5)
RESEND_API_KEY="re_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
RESEND_FROM_ADDRESS="notificaciones@qlick.marketing"
RESEND_REPLY_TO="david17891@gmail.com"

# Lista de admins que reciben notificaciones de leads nuevos
ADMIN_NOTIFICATION_EMAILS="david17891@gmail.com"
```

⚠️ **Nunca commitear `.env.local`** — ya está en `.gitignore`. Solo se commitea `.env.example` (plantilla sin valores reales).

### 5. Test desde el dashboard

Antes de tocar código, mandá un email de prueba desde el dashboard de Resend para verificar que el dominio está bien configurado:

1. Resend → **Emails** → "Send Test Email"
2. From: `notificaciones@qlick.marketing`
3. To: tu email personal
4. Subject: "Test Resend"
5. Body: "Si leés esto, Resend funciona."
6. Click "Send"

**Esperado:** el email llega en 5-30 segundos, **NO cae en spam** (verificar la carpeta spam también la primera vez). Si cae en spam → revisar SPF/DKIM/DMARC.

### 6. Test desde el código

Con `.env.local` configurado y el dev server corriendo (`npm run dev`):

1. Asegurate de que `NODE_ENV` NO sea `production` (en local siempre es `development`).
2. **Si NO configuraste Resend todavía** (no tenés `RESEND_API_KEY` en `.env.local`):
   - Los emails se **loggean en consola** en lugar de enviarse.
   - Verás líneas como: `[email/dev] subject="..." to=...`
   - Esta es la **red de seguridad** — funciona sin Resend configurado.
3. **Si configuraste Resend:**
   - Los emails se envían vía API.
   - Verás en consola: `[email/prod] subject="..."` solo si hay error.
   - Para verificar que se enviaron: Resend dashboard → **Emails** → ves el email con status "delivered".

### 7. Disparar el trigger end-to-end

Para testear el flujo completo (no solo el wrapper):

1. **Crear una survey con consent=true** en un evento real o seed. Opciones:
   - **Opción A** — manual desde Supabase Dashboard:
     ```sql
     INSERT INTO event_surveys (event_id, respondent_email, consent_to_contact, responses, submitted_at)
     VALUES ('<UUID_EVENTO>', 'test@qlick.mx', true, '{"interes":"info de curso"}', now());
     ```
   - **Opción B** — desde el wizard de import: subí un Excel con consent="Sí" en la columna Consent.
2. **Ir al admin** (`/admin/eventos/[id]`) → tab Encuestas → click "Promover a lead" en la survey de test.
3. **Verificar que David recibió el email:**
   - Bandeja de entrada (y spam por si acaso)
   - Resend dashboard → Emails → ves el envío con status "delivered"
   - Click en el link del email → debe abrir `/admin?tab=crm&leadId=<UUID>` con el drawer del lead abierto

---

## Troubleshooting

### "El email no llega"

1. **Revisar spam** la primera vez (normal que caiga hasta que el dominio se "warmup").
2. **Resend dashboard → Logs**: ver el status. Si dice "delivered" → Gmail lo aceptó pero puede estar en spam. Si dice "bounced" → la dirección del receptor no existe.
3. **SPF/DKIM/DMARC no configurados** → Resend marca el email con warning. Verificar con https://mxtoolbox.com/spf.aspx y https://dkimvalidator.com/.
4. **From address no verificado** → el email sale pero como `onboarding@resend.dev` (default). Configurar `RESEND_FROM_ADDRESS` con `@qlick.marketing`.

### "El link del email me lleva a localhost:3000"

El template usa `NEXT_PUBLIC_APP_URL` para construir el link. Si no está configurado en producción, default a `http://localhost:3000`. Solución: agregar `NEXT_PUBLIC_APP_URL="https://qlick.marketing"` en `.env.production` (o el equivalente en Vercel/Railway).

### "Los emails se loggean pero no se envían (incluso en prod)"

`RESEND_API_KEY` está vacía o mal configurada. Revisar `.env.local`. Si el dev server ya estaba corriendo, restart después de cambiar env vars (Next.js hot-reload no recarga env vars en server-side code por default).

### "Error de Resend: 'You can only send from verified domains'"

El `RESEND_FROM_ADDRESS` no coincide con un dominio verificado. O el dominio no está verificado (paso 2), o el from address tiene typo.

### "El email llega pero el HTML se ve mal"

Probable: el cliente de email (Gmail, Outlook) tiene reglas de sanitización agresivas. El template está hecho con HTML inline + tablas (técnica antigua pero compatible con todos los clientes). Si algo se rompe, testear en https://www.htmlemailcheck.com/ o https://litmus.com/.

---

## Variables de entorno (referencia rápida)

| Variable | Required | Default | Notas |
|---|---|---|---|
| `RESEND_API_KEY` | Prod only | (vacía → dev mode) | API key con scope "Sending access" |
| `RESEND_FROM_ADDRESS` | Prod only | (vacía → error) | Email verificado en Resend, ej `notificaciones@qlick.marketing` |
| `RESEND_REPLY_TO` | Opcional | (no se setea) | Reply-to del email. Si se omite, el cliente responde al from |
| `ADMIN_NOTIFICATION_EMAILS` | Opcional | (vacío → log warning, no envía) | CSV de admins. Si se omite, NO se mandan emails (pero la app sigue funcionando) |
| `NEXT_PUBLIC_APP_URL` | Opcional | `http://localhost:3000` | URL base para construir links en el email |

---

## Costos esperados

| Volumen | Plan Resend | Costo mensual |
|---|---|---|
| <100 emails/día, <3k/mes | Free | $0 |
| 100-500/día, 3k-15k/mes | Pro | $20/mes |
| 500-5000/día, 15k-100k/mes | Pro + overages | $20 + variable |
| >5000/día, >100k/mes | Custom | Contactar Resend |

**Expectativa Qlick:** ~10-50 emails/día en operación normal (1 evento/semana × 5-50 leads por evento). **Free tier sobra.**

---

## Anti-spam practices (built-in)

- ✅ SPF + DKIM + DMARC via Resend (automático cuando agregás el dominio)
- ✅ From address es `notificaciones@qlick.marketing` (no @gmail)
- ✅ Reply-to es email de David (legítimo)
- ✅ Subject NO incluye PII (verificado en test del template)
- ✅ Body NO tiene keywords de spam ("GRATIS", "OFERTA", etc.)
- ✅ HTML inline (compatible con todos los clientes)
- ✅ Footer con disclaimer de consentimiento (compliance)

---

## Próximos pasos cuando el setup esté completo

1. David commitea `.env.local` NO (ya está en gitignore). Solo verifica que está bien.
2. Yo puedo testear el flujo completo end-to-end con un seed event + survey de prueba.
3. Cuando esté OK, marcamos Bloque 1 de Fase 5 como ✅ cerrado.
4. Empezamos Bloque 2 (audit log).

---

**Aprobado por David cuando:**

```
[ ] Cuenta Resend creada
[ ] Dominio qlick.marketing verificado
[ ] API key con scope "Sending access" creada
[ ] .env.local con RESEND_API_KEY configurado
[ ] Email de prueba desde el dashboard llega (no spam)
[ ] Email de prueba desde código llega (o se loggea en dev)

Fecha: ___________
Notas: ___________
```