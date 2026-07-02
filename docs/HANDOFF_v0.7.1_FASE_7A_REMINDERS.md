# HANDOFF — Fase 7a: Pase digital + Funnel Promotion + Cron Reminders

> **Versión:** v0.7.1
> **Fecha:** 2026-07-01
> **Owner:** Mavis (sesión `mvs_9831e64ee9d4477d8632f5b78d4bf951`)
> **Estado:** ✅ Código listo + validado. Pendiente: David corre migración SQL + push.

## 🎯 Qué cambió

3 bloques en un solo commit `feat(eventos):` sobre la rama `feat/fase-6-waba-setup`. Cierra el ciclo de vida del lead en el evento:

```
[Bot WhatsApp] ─► [registro] ─► [QR por correo] ─► [reminder 24h] ─► [reminder 2h] ─► [check-in] ─► [event_attended]
```

## 📁 Archivos del cambio

### Nuevos (10 archivos)

| Path | Propósito |
|---|---|
| `src/lib/email/templates/event-qr-pass.ts` | Template HTML del pase digital (QR embebido inline). |
| `src/lib/email/event-qr-pass.ts` | Helper `sendEventQrPassEmail` (render + Resend). |
| `src/lib/email/templates/event-reminder.ts` | Template recordatorio 24h/2h. |
| `src/lib/email/event-reminder.ts` | Helper `sendEventReminderEmail`. |
| `src/lib/cron/event-reminders.ts` | Lógica job: ventanas 24h/2h, busca tokens, manda emails, loggea en `event_reminder_log`. Idempotente. |
| `src/app/api/cron/event-reminders/route.ts` | Endpoint `GET/POST /api/cron/event-reminders` (auth opcional con `CRON_SECRET`). |
| `supabase/migrations/20260701170000_lead_event_attended_status.sql` | `ALTER TYPE lead_status ADD VALUE 'event_attended'`. |
| `supabase/migrations/20260701180000_event_reminder_log.sql` | Tabla tracking de recordatorios enviados. |
| `tests/email-event-qr-pass-template.test.mjs` | 7 tests: PII en subject, escape HTML, QR embebido, location condicional, CTA, footer, degradación segura. |
| `tests/email-event-reminder-template.test.mjs` | 10 tests: diferencia 24h vs 2h, copy, escape, CTA, degradación. |
| `tests/cron-event-reminders.test.mjs` | 9 tests: ventanas, eventos en ventana, bordes, modo demo sin Supabase. |
| `vercel.json` | `*/30 * * * *` → `/api/cron/event-reminders`. |

### Modificados (6 archivos)

| Path | Cambio |
|---|---|
| `src/lib/whatsapp/bot-engine.ts` | Después de `generateQrToken` → genera QR data URL + manda email con pase. Import de `sendEventQrPassEmail`, `generateQrDataUrl`, `appBaseUrl`. |
| `src/lib/utils.ts` | `appBaseUrl()` ahora exportado (antes era helper local en `bot-engine.ts`). |
| `src/lib/crm/lead-utils.ts` | `leadStatusLabel` + `statusTone` agregan `event_attended: "Asistió al evento" / "success"`. |
| `src/types/crm.ts` | `LeadStatus` union agrega `"event_attended"`. |
| `src/types/supabase.ts` | Enum `lead_status` (union + array) agrega `"event_attended"`. |
| `src/app/api/check-in/[token]/route.ts` | Después de `event_qr_tokens` + `event_attendees` update → busca lead por phone → `UPDATE leads SET status='event_attended', tags=[..., 'event:<slug>:attended']`. Idempotente + respeta `lost/archived`. |

## 🧪 Validación corrida

```bash
npm run type-check    # ✅ 0 errores
npm run lint          # ✅ 0 warnings/errors
npm test              # ✅ 181/181 (eran 151, +30 nuevos)
npm run build         # ✅ Compila, /api/cron/event-reminders registrada
```

## 🚨 Pendiente pre-deploy (David)

### 1. Correr migración SQL

```bash
# Desde el directorio del repo:
supabase db push
# o equivalente desde el panel de Supabase SQL editor
```

Esto aplica las 2 migraciones nuevas:
- `20260701170000_lead_event_attended_status.sql` — agrega `event_attended` al enum.
- `20260701180000_event_reminder_log.sql` — crea tabla tracking.

### 2. Verificar env vars en Vercel (production)

| Key | Default | Requerida para |
|---|---|---|
| `RESEND_API_KEY` | (vacío) | **CRÍTICO** — sin esto no salen los recordatorios. |
| `RESEND_FROM_ADDRESS` | `notificaciones@qlick.marketing` | Required. Dominio debe estar validado en Resend (SPF/DKIM). |
| `RESEND_REPLY_TO` | `david17891@gmail.com` | Opcional (reply-to del email). |
| `CRON_SECRET` | (vacío) | **Opcional** pero recomendado. Si vacío, el endpoint acepta cualquier GET (dev-friendly, no prod-safe). |

**Verificación rápida:** en Vercel dashboard → Settings → Environment Variables, confirmar que están las 4 (o aceptar defaults razonables).

### 3. Push

```bash
# Yo (Mavis) NO tengo gh auth. David empuja desde su terminal:
git push origin feat/fase-6-waba-setup
```

Vercel detecta el push y deploya automáticamente. El primer cron corre ~30 min después del deploy, y así sucesivamente cada 30 min.

### 4. (Opcional) Setear `CRON_SECRET` en Vercel

```bash
vercel env add CRON_SECRET production
# Pegar un secret cualquiera (32+ chars random)
# Después en Vercel Cron: configurar el header Authorization: Bearer <secret>
```

Si lo hacés, el endpoint `/api/cron/event-reminders` rechaza requests sin auth.

## 🎬 Test del flow completo (después del deploy)

### Bloque 1 — Pase digital por correo
1. WhatsApp nuevo al bot.
2. Click "Inscribirme".
3. Manda `tu@email.com` por chat.
4. **Esperado:** bot responde "Listo Por, tu pase: [link]". En tu correo llega **email con QR visual** embebido + botón "Ver mi pase online".

### Bloque 2 — Funnel promotion
1. Con el link del paso 4 anterior, abrí en el navegador.
2. Click "Confirmar asistencia".
3. **Esperado:** respuesta "¡Listo, Por! Que disfrutes la conferencia."
4. En el admin CRM, el lead Por ahora tiene `status: "Asistió al evento"` + tag `event:uabc-km43-marketing-ia:attended`.

### Bloque 3 — Cron reminder
1. Esperá 24h antes de un evento (o generá un evento demo con `starts_at` 24h±30min de ahora).
2. **Esperado:** email recordatorio "Mañana: X" a todos los confirmados con QR token activo.
3. Esperá 2h antes.
4. **Esperado:** email "En 2 horas: X".
5. Verificá en Supabase `SELECT * FROM event_reminder_log ORDER BY sent_at DESC LIMIT 10`.

## ⚠️ Limitaciones documentadas

1. **WhatsApp templates NO implementadas.** Recordatorios salen solo por email. Para Fase 7+ (post 6 jul), si querés recordatorios por WhatsApp, se necesitan templates aprobadas en Meta Business Manager (`event_reminder_24h`, `event_reminder_2h`). Proceso de aprobación Meta: 24-48h. Mientras tanto, los emails son la única vía outbound automatizada.

2. **`/check-in/[token]` no muestra QR visual.** El asistente que abre el link solo ve el botón "Confirmar asistencia". El QR visual está en el email. Si querés también en la página, hay que agregar `<img src={qrDataUrl}>` — es un fix de 5 min, pero queda fuera de scope de esta entrega para no expandir.

3. **Vercel Cron free tier:** ejecuta hasta 2 crons en plan Hobby. Si tenés más crons en el futuro, hay que migrar a `vercel.json` con un set o a Vercel Pro.

## 🐛 Si algo falla

| Síntoma | Diagnóstico | Fix |
|---|---|---|
| Email no llega | `RESEND_API_KEY` vacío en Vercel | Setea y redeploy |
| Email rebota | `RESEND_FROM_ADDRESS` no validado en Resend | Configura SPF/DKIM en dominio |
| Cron no corre | `vercel.json` no deployado | Verificá en Vercel dashboard → Crons |
| Cron corre pero `event_reminder_log` vacío | Ventana del evento no matchea (±30 min) | Generá evento con `starts_at` 24h/2h exacto de ahora |
| Typegen falla en `LeadStatus` | DB sin migrar | Corré `supabase db push` |
| `event_attended` no aparece en CRM | Falta migración SQL | Corré `supabase db push` |

## 📚 Referencias

- `docs/STATUS.md` — sección "Fase 7a" con snapshot al 2026-07-01 ~17:45.
- `data/PROJECT-LOG.md` — entrada "2026-07-01 ~17:45".
- `docs/FASE2_FUNNEL_AUTOMATIZADO.md` — plan original de los 4 cron jobs (3 implementados, falta el #4 de "post-conferencia" — feedback post-evento, fuera de scope de esta entrega).
- `docs/SMTP_SETUP.md` — setup de Resend + dominio (si necesitás re-validar).

---

**TL;DR para David:** (1) `supabase db push`, (2) verificar Resend en Vercel, (3) `git push`. Test con un WhatsApp nuevo al bot.
