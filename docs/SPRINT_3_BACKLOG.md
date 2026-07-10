# Sprint 3 — Backlog

## Deuda del Sprint 2 v2 hotfix (David, 2026-07-10)

### Notas del cross-review de `a4db9a5` (event-reminders-v2)

Origen: cross-review del agent paralelo (`mvs_cf4604591a114b5381c11ca2f239160b`)
el 2026-07-10 a las 5:09 Phoenix. APROBADO con 4 notas menores; ninguna
bloquea el merge. Todas son para Sprint 3.

#### 1. Drift de Vercel Cron (perf/logging)
- **Síntoma**: el cron `*/30 * * * *` puede tener drift de 1-3 min en
  horarios pico de Vercel. La ventana de 1h del recordatorio 24h/2h/1h
  absorbe este drift en teoría, pero queremos medirlo.
- **Acción Sprint 3**: agregar log de `cron_event_reminders_actual_run_utc`
  vs `cron_event_reminders_scheduled_utc` para diagnosticar drift real.
  Si drift > 5 min consistente, abrir ticket a Vercel Pro support.

#### 2. Query global `findEventsInWindows` (perf)
- **Síntoma**: la query `SELECT ... FROM events WHERE status = 'published'
  AND starts_at BETWEEN ...` cubre TODOS los eventos con starts_at en
  la ventana. Si hay 100+ eventos publicados, la query es lenta.
- **Acción Sprint 3**: agregar `AND starts_at > now()` para descartar
  eventos pasados (sanity check), y considerar índice compuesto en
  `(status, starts_at)`.

#### 3. Documentar edge case del UNIQUE COALESCE sentinel
- **Síntoma**: el `UNIQUE` constraint en `event_reminder_log_v2` usa
  `coalesce(event_qr_token_id, '00000000-...'::uuid)` porque PostgreSQL
  no permite NULLs en columnas UNIQUE. Si en el futuro alguien
  normaliza las FKs y permite NULL en `event_qr_token_id`, el sentinel
  colisiona y rompe la idempotencia.
- **Acción Sprint 3**: agregar un comment explícito en la migration
  sobre la limitación del sentinel + por qué se eligió ese UUID.

#### 4. Tests (OK tal cual)
- 982/982 verde. Sin acción.

### Deuda del fix `provide_name` (otro agent, sprint 2 hotfix)
- Bug: `bot-engine.ts` líneas 4471-4498 acepta frases tipo
  "quiero registrarme" o "!hola! david" como nombre del lead.
  `firstName = lead.name.split(' ')[0]` devuelve "Quiero" o "!hola!".
- Fix: validar que el input sea SOLO un nombre humano (2-4 palabras,
  alfabético, sin signos de exclamación, sin palabras de intención).
- PR del otro agent: pendiente. Se mergea después del de reminders.

## Pendiente del sprint 2 v2 reminders que NO se hizo

### UI admin: indicador visual + override manual
- Paso 2 del plan original NO implementado.
- Endpoint `POST /api/admin/events/[id]/trigger-reminder?kind=24h`
  YA existe en `a4db9a5`. Falta el botón en el panel admin.
- Estimación: 15 min.

### Templates Meta 8am/10am
- David los crea en Meta dashboard cuando tenga el link del evento.
- Aprobación Meta: 24-48h.
- Mientras tanto, el helper usa texto libre con copy del sprint 2 v2.

## Pendiente operacional

### Para el evento del 11 julio 11:00 hrs Phoenix
- Cron 24h se dispara hoy 11 AM Phoenix (automático).
- Cron 8am y 10am se disparan mañana 8 AM y 10 AM Phoenix (automático).
- Si Meta no aprueba templates 8am/10am a tiempo, fallback texto libre.

### Para el sprint 2 v2 reminders en general
- Merge `feat/event-reminders-v2` → `main` cuando David apruebe.
- Correr SQL migration (YA CORRIDO — "Success. No rows returned").
