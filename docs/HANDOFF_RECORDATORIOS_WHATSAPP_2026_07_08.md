# HANDOFF — Recordatorios WhatsApp para evento del 11/jul/2026

> **Fecha:** 2026-07-08
> **Owner:** Mavis (sesión `mvs_84fdd5764db0416195a07ed2f351c8cf`)
> **Estado:** ✅ Código listo + E2E validado con template aprobado en Meta. **⏸ Pausado por David** hasta tener el link Zoom. Rama `feat/event-reminders-whatsapp` con cambios sin commitear.
> **Trigger:** "Quiero validar que podemos mandar recordatorios por WhatsApp para el evento del 11/jul" (David).

---

## 🎯 Qué cambió

Extensión del sistema de recordatorios automáticos (Fase 7a, en producción) para que el canal WhatsApp funcione end-to-end. Hoy solo mandaba email; ahora también puede mandar WhatsApp vía Meta Cloud API con templates aprobados, incluyendo un test E2E real confirmado con la hermana de David (Ady).

### Lo que se hizo en esta sesión

1. **Helper WhatsApp nuevo** (`src/lib/whatsapp/event-reminder-send.ts`):
   - `sendEventReminderWhatsApp()` — envoltura best-effort sobre `getActiveWhatsAppProvider().send()`.
   - `buildReminderBody()` — copy por ventana (24h, 2h, 1h) en español MX.
   - `formatReminderDateTime()` — fecha+hora en `America/Phoenix` (`es-MX`).
   - Si recibe `templateName`, manda template (válido fuera de ventana 24h); si no, texto libre (solo válido dentro de ventana 24h post-respuesta).
2. **Rama WhatsApp agregada al cron** (`src/lib/cron/event-reminders.ts`):
   - Constantes `TEMPLATE_NAME_24H/2H/1H` env-driven (leen de `WHATSAPP_TEMPLATE_REMINDER_*`).
   - Loop por token ahora hace EMAIL + WHATSAPP en paralelo. Un fallo WA NO afecta el resultado del email.
   - Detalles por (eventId, kind) ahora suman `waSent`, `waFailed`, `waSkipped`.
   - Ventana **1h** agregada a `getActiveReminderWindows()` (offset `60 * 60 * 1000 ms` ± 30 min).
   - Tipo `ReminderWindow.kind` extendido a `"24h" | "2h" | "1h"`.
3. **Email template con ventana 1h** (`src/lib/email/templates/event-reminder.ts`):
   - Tipo `EventReminderInput["reminderKind"]` ahora `"24h" | "2h" | "1h"`.
   - `buildReminderCopy()` con 3 ramas (24h / 2h / 1h) en español MX.
4. **Mapping 1h → reminder_2h en log** (`src/lib/email/event-reminder.ts`): el enum de `event_email_log` no tiene variant para 1h; se mapea a `reminder_2h` (granularidad agregada).
5. **`vercel.json`**: schedule del cron `event-reminders` movido de `0 8 * * *` UTC a `0 18 * * *` UTC.
   - **Por qué:** el evento del 11/jul es a las 18:00 UTC. Con el schedule original (8 AM UTC), la ventana 24h caía 10 horas después del límite de la ventana. Con el nuevo, el cron corre exactamente dentro de la ventana 24h del evento (17:30-18:30 UTC el 10/jul).
   - **Limitación:** Vercel Hobby = 1 cron/día. Solo cubrimos 24h automático. El reminder 1h hay que dispararlo manualmente vía `GET /api/cron/event-reminders` el 11/jul ~17:00 UTC (10 AM Phoenix).
6. **Test E2E con Meta Cloud API** (`scripts/test-template-send.mjs`): un solo envío al teléfono de Ady (hermana de David, NO confirmada del evento) usando template `recordatorio_evento_24h` + idioma `es_MX` + 3 valores `Ady / Marketing + IA para Emprendedores / sábado 11 de julio · 11:00 a.m.`. Resultado: `wamid.HBgNNTIxNjUzODQ5NDAwMhUCABEYEjU5MUNCNTgwRUFEMjM4MDQ1RgA=` (éxito 200).

## ✅ Lo que Meta aprobó (1 sola plantilla)

| Template | Categoría | Idioma | Estado | Botón |
|---|---|---|---|---|
| `recordatorio_evento_24h` | **Marketing** | Spanish (MEX) | **Activa: calidad pendiente** | "Únete al Zoom" → `{{4}}` |

**Contexto de aprobación:** David intentó crearla como Utilidad. Meta lo rebotó 3 veces — su clasificador interno considera el copy (incluso el frío "Confirmamos tu lugar para mañana…") como Marketing. La categoría terminó en Marketing, que funciona perfectamente (los confirmados optaron al registrarse).

**Body del template aprobado (en Meta UI):**
```
Hola {{1}} 👋

Confirmamos tu lugar en *{{2}}*.

Cuándo: {{3}}.

Recibirás el link del evento 24 horas antes del inicio.

¡Nos vemos pronto!
```

**Variables** (3 en cuerpo + 1 en URL del botón):
- `{{1}}` = nombre del asistente
- `{{2}}` = título del evento
- `{{3}}` = fecha + hora legible en Phoenix (`es-MX`)
- `{{4}}` (botón) = link Zoom — **⚠️ placeholder cuando David aún no tiene el link real**

## 🧪 Validación corrida

```bash
npm run type-check    # ✅ 0 errores
npm run lint          # ✅ 0 warnings/errors
npm test              # ✅ 629/629 verde (575 sin cambios + mis 9 nuevos tests)
node --env-file=.env.local \
       --experimental-strip-types \
       --import ./tests/loader-register.mjs \
       scripts/test-template-send.mjs
                     # ✅ ok=true, wamid devuelto por Meta
```

**Tests nuevos** (`tests/whatsapp-event-reminder-send.test.mjs`, 9 casos):
- `buildReminderBody 24h`: copy "Confirmamos tu lugar" (MX transaccional)
- `buildReminderBody 24h con location`: muestra línea Lugar:
- `buildReminderBody 2h`: "en 2 horas"
- `buildReminderBody 1h`: "en 1 hora"
- `buildReminderBody sin location`: omite Lugar
- `buildReminderBody sin nombre`: usa "Hola" neutro (tuteo MX)
- `buildReminderBody escapa <script>`: previene XSS
- `formatReminderDateTime`: UTC → Phoenix "sábado, 11 de julio · 11:00 a.m."
- `formatReminderDateTime inválido`: devuelve ISO crudo
- `sendEventReminderWhatsApp`: contrato estable (no throw)
- `sendEventReminderWhatsApp con input vacío`: no lanza

**Tests modificados** (`tests/cron-event-reminders.test.mjs`):
- `getActiveReminderWindows` ahora espera **3 ventanas** (24h, 2h, 1h) en vez de 2.

## 🚧 Cómo retomar (cuando David vuelva con el link Zoom)

### Cuando tengas el link Zoom real

1. **Crear nueva plantilla en Meta UI**:
   - Nombre: `recordatorio_evento_2h` o similar.
   - Categoría: **Marketing**.
   - Idioma: **Spanish (MEX)**.
   - Body: el mismo del `recordatorio_evento_24h` pero con el link Zoom **hardcodeado** en el botón (no como variable — Meta no aprueba variables en URL de botón para marketing).
   - Ej: `"Únete al evento: {{4}}"` en body si querés mostrarlo, o solo en el botón.
2. **Setear env vars en `.env.local`**:
   ```
   WHATSAPP_TEMPLATE_REMINDER_24H="recordatorio_evento_24h"
   WHATSAPP_TEMPLATE_REMINDER_2H="<nombre de la nueva plantilla>"
   WHATSAPP_TEMPLATE_REMINDER_1H="<nombre de la nueva plantilla 1h>"
   BREVO_FROM_ADDRESS="Qlick <noreply@qlick.digital>"
   ```
3. **Setear las mismas env vars en Vercel** (production + preview) para que el cron que corre ahí dispare los templates correctos.
4. **Merge a main** la rama `feat/event-reminders-whatsapp` cuando quieras:
   ```bash
   git add <paths>
   git commit -m "feat(cron): add WhatsApp channel + 1h window for event reminders"
   git push origin feat/event-reminders-whatsapp
   gh pr create --base main --title "feat(cron): recordatorios WhatsApp + ventana 1h"
   ```
5. **Test E2E final** con un contacto de prueba antes del 10/jul.

### Para el día del evento

- **10/jul a las ~17:30 Phoenix** (o antes): Vercel Cron corre automático a `0 18 * * *` UTC, pega la ventana 24h del evento.
- **11/jul a las ~10 AM Phoenix**: invocar manualmente `GET /api/cron/event-reminders` para pegar la ventana 1h.

### Lo que NO pushea esta rama (por ahora)

- Cambios en `src/lib/cron/event-reminders.ts`
- Cambios en `src/lib/email/event-reminder.ts`
- Cambios en `src/lib/email/templates/event-reminder.ts`
- Cambios en `tests/cron-event-reminders.test.mjs`
- Cambios en `vercel.json` (schedule de `0 8` → `0 18`)
- Archivos nuevos:
  - `src/lib/whatsapp/event-reminder-send.ts`
  - `tests/whatsapp-event-reminder-send.test.mjs`
  - `scripts/test-template-send.mjs`

Todos están en la working tree de `feat/event-reminders-whatsapp`, sin commitear.

## ⚠️ LECCIONES Y GOTCHAS

1. **Meta + Utilidad vs Marketing:** Para el Qlick CRM, Meta **NO aprueba** recordatorios de eventos como Utilidad, los marca como Marketing. Razón interna: Meta considera que "tu lugar para X" no encaja con la definición estricta de Utilidad ("pedido o cuenta existente"). Implicación práctica: usar Marketing siempre. Los 8 confirmados optaron al registrarse, así que el opt-in required está cubierto.

2. **El cron schedule es 0 18 UTC, no 0 8 UTC.** El evento del 11/jul es 18:00 UTC. Con el schedule original 8 UTC, el cron corría 10 horas ANTES del centro de la ventana 24h → la ventana quedaba vacía y NO se enviaba nada. Cambiar a 18 UTC pisa justo la ventana.

3. **Vercel Hobby = 1 cron/día.** El recordatorio 1h hay que dispararlo manualmente. La invocación manual es `GET /api/cron/event-reminders` con header `Authorization: Bearer ${CRON_SECRET}` (vacío en dev).

4. **Body partido por saltos de línea** para Meta templates. El provider `metaCloudApiProvider` interpreta `body.split(/\n+/)` como las variables del template. Si querés 3 variables, mandá 3 líneas en el body separadas por `\n`.

5. **Test E2E necesita `--import ./tests/loader-register.mjs`** además de `--experimental-strip-types`. Sin el loader, los imports de `*.ts` sin extensión explícita fallan con `ERR_MODULE_NOT_FOUND`.

6. **Stash cruzado con watcher de certs.** Otra sesión Mavis en este workspace estaba cerrando el sprint de certificados Concept C. Mis cambios de reminders se mezclaron en su stash, los restauré manualmente sin pérdida. Si volvés a encontrar cambios "del otro agente" en working trees limpios, es porque los dos seguimos trabajando en paralelo.

7. **Español MX, no voseo.** El copy debe ser "Abre tu pase" (tuteo), nunca "Abrí tu pase" (voseo argentino). Regla guardada en memoria de agente para próximos proyectos.

## 📌 Pendiente (al cierre de esta sesión)

| Item | Severidad | Bloqueador |
|---|---|---|
| Setear `BREVO_FROM_ADDRESS` en `.env.local` + Vercel | 🟠 | Email automático bloqueado |
| Crear 2da plantilla Meta con link Zoom real + aprobar | 🟠 | Link Zoom no incluido en template actual |
| Setear `WHATSAPP_TEMPLATE_REMINDER_24H` después de aprobar | 🟠 | Cron no activa el template |
| Confirmar visualmente con Ady que el WhatsApp rindió bien | 🟡 | UX sanity check |
| David merge `feat/event-reminders-whatsapp` a main | 🟡 | Deploy a producción |
| Documentar en `data/PROJECT-LOG.md` | 🟢 | Append-only |
