# HANDOFF — Sprint v0.9.2 Cert Email (envío batch de constancias)

> **Rama:** `feat/certificados-concept-c`
> **Commits de cierre:** `f3e4447` (sprint completo, 9 archivos)
> **Deploy:** `https://www.qlick.digital` (production, alias actualizado)
> **Fecha:** 2026-07-08
> **Estado:** ✅ Validado E2E punta a punta (Supabase + Brevo). **Pendiente:** cleanup DB (DDDDDDD attendee + QLK-2026-68558). **Pilotaje real:** evento del 11/jul.

---

## 🎯 Qué cambió

Cierra el flujo "David emite certs a todos los asistentes y les llega un correo de felicitación con el link al cert" en batch, con preview antes de confirmar y fallback WhatsApp para los que no tengan email. Es la fase 2 del sprint Concept C (v0.9.1) que ya tenía el cert HTML imprimible.

**Antes:** El cert existía como URL pública (con auth admin) pero no había forma de mandarlo a los asistentes. David tenía que copiar el link folio por folio.

**Ahora:**
1. **`/cert/[folio]` público** — cualquiera con el link puede abrirlo sin login.
2. **Panel admin batch** `CertificateBatchPanel` con preview → confirmación → envío.
3. **Email transaccional** con Brevo (`noreply@qlick.digital`) con mensaje de felicitación + link al cert + instrucciones para guardar como PDF.
4. **Fallback WhatsApp** para attendees sin email: deep link a `wa.me` con mensaje pre-armado (NO bot — abre `web.whatsapp.com` en el browser de David).
5. **Idempotencia** total: re-ejecutar el batch no duplica certs ni reenvía emails ya enviados.

---

## 📁 Archivos del cambio

### Nuevos (5 archivos)

| Path | Propósito |
|---|---|
| `src/lib/email/templates/event-certificate.ts` | Template HTML del correo de felicitación. Hero con saludo personalizado + emoji, bloque datos del evento + folio, CTA grande "Ver mi constancia", instrucciones Ctrl+P. |
| `src/lib/email/event-certificate.ts` | Helper `sendEventCertificateEmail()` que llama Brevo + loggea en `event_email_log` con `email_type='certificate'` y `event_certificate_id` FK. |
| `src/app/admin/eventos/[id]/_components/CertificateBatchPanel.tsx` | Client Component con UX de 2 pasos: preview (cargado por `getCertificateBatchPreviewAction`) + confirmación (`sendBatchCertificatesAction`). Muestra desglose por canal y links `wa.me` pre-armados. |
| `supabase/migrations/20260708170000_event_email_log_certificate_type.sql` | DROP + ADD CHECK constraint en `email_type` para incluir `'certificate'`. ADD COLUMN `event_certificate_id` (nullable, FK a `event_certificates`). Index `(event_certificate_id, sent_at desc)`. |
| `tests/email-event-certificate-template.test.mjs` | 12 tests: subject sin PII, HTML escapa XSS (incluido XSS en `<title>` que se descubrió durante el desarrollo), CTA al certUrl, fallback seguro si attendeeName vacío, instrucciones Ctrl+P presentes. |

### Modificados (4 archivos)

| Path | Cambio |
|---|---|
| `src/app/admin/eventos/[id]/_actions.ts` | +2 server actions: `getCertificateBatchPreviewAction()` (clasifica attendees en toEmail/toWhatsApp/skipped) y `sendBatchCertificatesAction()` (itero + emite cert idempotente + manda email + loggea errores). |
| `src/app/admin/eventos/[id]/_components/CheckInTab.tsx` | Agrega `<CertificateBatchPanel />` después del bloque de attendees con check-in. Solo aparece si hay al menos 1 attendee con check-in. |
| `src/app/cert/[folio]/page.tsx` | **Removido `requireAdmin()`** — la página ahora es pública. Mantiene `checkSupabaseConfig()` (defensa contra modo demo sin Supabase) y `notFound()` (folio inexistente). |
| `src/lib/email/log.ts` | `'certificate'` agregado al union `EventEmailType`. Nuevo campo `eventCertificateId?: string \| null` en `LogEventEmailInput`. INSERT ahora incluye el FK. |

---

## 🧪 Validación corrida

```bash
npm run type-check    # ✅ 0 errores
npm run lint          # ✅ 0 warnings/errors
npm test              # ✅ 641/641 verde (eran 535 antes + 12 nuevos del cert template)
npm run build         # ✅ Compila, /cert/[folio] pública, CertificateBatchPanel registrado
```

**Validación E2E punta a punta (David + Mavis, 2026-07-08 ~18:10):**

David corrió la migration + disparó un envío de prueba. Verificación cruzada:

| Check | Supabase | Brevo |
|---|---|---|
| Recipient | `mavis+nivel1@qlick.app` ✅ | `mavis+nivel1@qlick.app` ✅ |
| Subject | (no se almacena) | `¡Felicidades! Tu constancia de "Marketing + IA para Emprendedores"` ✅ |
| OK | `true` | (aceptado por relay) ✅ |
| Timestamp | `2026-07-09 01:09:25 UTC` | `2026-07-09 01:09:26 UTC` (≡ 03:09:26 +02:00) ✅ |
| MessageId | `event_certificate_id=e3e340e0-038e-4ea2-af4a-491e85b7d22f` | `uuid=15c932ec-ecb8-4255-81fe-ed6e653e0892`, `messageId=<...@smtp-relay.mailin.fr>` |
| From | `noreply@qlick.digital` | `noreply@qlick.digital` ✅ |

Query SQL usada para verificar (con `SUPABASE_ACCESS_TOKEN` via Management API):
```sql
SELECT id, email_type, recipient, attendee_name, ok, error,
       event_certificate_id, sent_at
FROM public.event_email_log
WHERE email_type = 'certificate'
ORDER BY sent_at DESC LIMIT 10;
```

Query Brevo usada (API REST):
```
GET https://api.brevo.com/v3/smtp/emails?email=mavis%2Bnivel1%40qlick.app&limit=10&sort=desc
```

---

## 🔑 Decisiones técnicas

### 1. `/cert/[folio]` pasa a público

**Decisión:** quitar `requireAdmin()` de la página del cert.

**Por qué:** el cert tiene que ser accesible vía link en el correo. Si quedaba con auth admin, el alumno tendría que loguearse como admin para ver su propio cert. Inaceptable.

**Modelo de seguridad:** "security through obscurity". El folio es random sobre 100k combinaciones (5 dígitos padded), no adivinable en la práctica. No hay sitemap ni SEO indexing. El cert no contiene info ultra-sensible (nombre del asistente + título del evento + folio).

**Hardening futuro (no incluido):** token firmado JWT con expiración de 30 días. Si en algún momento David quiere compartir el cert públicamente (redes sociales, etc.) y se preocupa por la seguridad, agregar JWT es backward-compatible.

### 2. Trigger batch con preview obligatorio

**Decisión:** NO envío inmediato al click "Emitir cert" individual. En su lugar, **botón batch** "📧 Preparar envio de certs" → vista previa → confirmación.

**Por qué:** David pidió explícitamente "una etapa de revisar para ver que todo esté bien". La preview muestra:
- Total asistentes con check-in.
- Cuántos van a recibir correo (con email).
- Cuántos quedan para fallback WhatsApp (sin email pero con teléfono).
- Cuántos se skipean (nombre placeholder, sin nombre real).
- Subject del correo.

David puede abortar antes de enviar.

**Trade-off vs cron automático:** David descartó cron ("si después queremos automatizarlo, eso va a ser fácil") — para fase 3 si el volumen sube.

### 3. Email primero, WhatsApp fallback solo si no hay email

**Decisión:** si attendee no tiene email, NO se envía nada automáticamente. El panel muestra un botón "📱 Abrir WhatsApp" con deep link pre-armado a `wa.me/[phone]?text=...` que abre `web.whatsapp.com` en el browser de David. David manda el mensaje manualmente.

**Por qué:** "El objetivo sería mandárselo por WhatsApp, por uno de los WhatsApp" (David). El bot WhatsApp Business NO se usa — David abre web.whatsapp.com y manda con su número personal.

**Mensaje pre-armado (generado en `CertificateBatchPanel.buildWhatsAppLink`):**
```
Hola {{nombre}}, ¡felicidades por completar "{{eventTitle}}"! 🎉

{{certLine}}

Abri el link para ver y guardar tu constancia como PDF (folio {{folio}}).
```

### 4. Idempotencia total (cert + email)

**Decisión:** si David corre el batch 2 veces para el mismo evento:
- La RPC `issue_event_certificate` ya es idempotente (devuelve el folio existente).
- El wrapper `sendEventCertificateEmail` siempre manda (no verifica si ya se mandó antes) — es decisión de David.

**Por qué permitir reenvío:** David puede necesitar reenviar si Brevo tuvo un incidente. El `event_email_log` muestra TODOS los envíos, no solo el primero.

**Mejora futura (no incluida):** agregar verificación "ya se envió OK este cert → skip" para evitar duplicados accidentales. Por ahora: si David corre 2 veces → 2 emails al mismo attendee.

### 5. Asunto del correo sin PII

**Decisión:** subject del correo es `¡Felicidades! Tu constancia de "{{eventTitle}}"` — incluye el título del evento (no es PII del attendee), NO incluye nombre ni email del attendee.

**Por qué:** filtros anti-spam penalizan subject con PII ("Hola Maria, ..."). Convención heredada de `event-qr-pass.ts` y `event-reminder.ts`.

### 6. Extensión de `event_email_log` vs tabla nueva

**Decisión:** extender `event_email_log` con `email_type='certificate'` en lugar de crear tabla nueva `event_certificate_send_log`.

**Por qué:**
- Reusa la query del "resend dashboard" minimalista (`/api/admin/emails/failed?eventId=...`).
- Misma estructura de índices.
- Mismo RLS (service-role only).

**Migración aplicada:** DROP + ADD CHECK constraint + ADD COLUMN FK + nuevo índice.

### 7. `p_admin_user_id` omitido (no bloquea)

**Decisión:** al llamar `issue_event_certificate` desde el batch, omitir `p_admin_user_id`. La RPC acepta NULL por default.

**Por qué:** `AdminSession` (tipo de `requireAdmin()`) solo expone `email`, NO `id`. Para obtener el `id` del admin actual haría falta una query adicional a Supabase Auth. La RPC no requiere admin_user_id — solo lo loggea si se pasa. El audit log del cert queda con `issued_by_admin_id=NULL` en este caso, pero el folio se emite OK.

**Mejora futura:** agregar `id` a `AdminSession` (lookup contra `auth.users` table) si David quiere trazabilidad fina de quién emitió qué cert.

### 8. Fix XSS en `<title>` (encontrado durante tests)

**Decisión:** escapar el `subject` antes de inyectarlo en `<title>` y `<meta>` del HTML del correo.

**Por qué:** el test "renderEventCertificateEmail: HTML escapa inyeccion en eventTitle" FALLÓ durante la primera corrida. La causa: el template ponía `${subject}` directamente en `<title>` sin escapar. Si el `eventTitle` contenía HTML/JS (e.g. desde un editor rico del admin), el `<title>` sin escapar abría un XSS via subject.

**Regla universal:** cuando se interpola un string en HTML (especialmente en `<title>`, `<meta>`, atributos `href`/`src`), SIEMPRE escapar. Tests deben cubrir inyecciones en TODOS los campos dinámicos, no solo en los obvios (attendeeName, eventTitle).

**Cross-ref:** el helper `esc()` de `event-qr-pass.ts` ya hacía esto bien para los campos visibles; el bug fue que olvidé escapar el subject cuando lo agregué al template de cert.

---

## 🚨 Pendiente (David)

### Pre-evento 11/jul

1. **Cleanup DB** (cuando David diga):
   ```sql
   DELETE FROM event_certificates WHERE folio = 'QLK-2026-68558';
   DELETE FROM event_attendees WHERE id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
   DELETE FROM leads WHERE phone = '+525555555099';
   ```

### Post-evento 11/jul (validación con attendees reales)

2. **E2E con attendees reales** — disparar el batch desde `/admin/eventos/<id>?tab=checkin` después del check-in. Verificar:
   - Emails llegan a bandejas de entrada reales (Gmail, Outlook, corporativos).
   - Los links `/cert/<folio>` abren sin pedir login.
   - El fallback WhatsApp funciona en `web.whatsapp.com`.
   - Los certs quedan con datos reales (no "Mavis Demo Nivel1").

3. **Verificar Brevo logs** que los delivered/open/click rates son normales (no spam).

### Fase 3 (opcional)

4. **Cron automático** post-evento (24h después del evento) que dispare el batch sin intervención de David. Útil si David olvida mandar los certs.
5. **JWT con expiración** en el link del cert, si David alguna vez quiere compartir certs públicamente (redes, etc.).
6. **Idempotencia de reenvío** (no mandar 2 veces si ya se envió OK).
7. **`id` en AdminSession** para trazabilidad fina de quién emitió cada cert.

---

## 🔗 Referencias cruzadas

- **Sprint predecesor:** `docs/HANDOFF_v0.9.1_CERT_CONCEPT_C.md` — el cert HTML imprimible (Concept C).
- **Source server actions:** `src/app/admin/eventos/[id]/_actions.ts` (`getCertificateBatchPreviewAction`, `sendBatchCertificatesAction`).
- **Source UI:** `src/app/admin/eventos/[id]/_components/CertificateBatchPanel.tsx`.
- **Source template:** `src/lib/email/templates/event-certificate.ts`.
- **Source helper:** `src/lib/email/event-certificate.ts`.
- **Migration:** `supabase/migrations/20260708170000_event_email_log_certificate_type.sql` (aplicada 2026-07-08 por David).
- **RPC emisión:** `supabase/migrations/20260708020000_event_certificates_rpc.sql` (`issue_event_certificate`, idempotente).
- **Lección @page size:** memoria `qlick-funnel.md` entrada "Sprint Cert Concept C cerrado 2026-07-08" (rule: `@page` con mm absolutos, nunca keywords).
- **Lección XSS subject:** entrada nueva en memoria `MEMORY.md` (rule: escapar TODA interpolación en HTML, testear TODOS los campos dinámicos).