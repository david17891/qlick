# Fase 5 — Notificaciones automáticas + Admin CRUD

> **Plan operativo de Fase 5.** Lee esto, ajustalo con David, después arrancamos commits.
>
> **Branch:** `feat/fase-5-planning` (este doc) → cuando esté aprobado, se promueve a `feat/fase-5` y se mergea a `main` post-Fase 4.
>
> **Última revisión:** 2026-06-28 06:10 (sesión madrugada, cierre Bloque 4 → arranque planeación Fase 5).
> **Status:** 🟡 Planeación. Luz verde pendiente de David.

---

## Índice

1. [Resumen](#1-resumen)
2. [Out of scope (Fase 6+)](#2-out-of-scope-fase-6)
3. [Sub-bloques](#3-sub-bloques)
4. [Decisiones pendientes con David](#4-decisiones-pendientes-con-david)
5. [Dependencias / infra previa](#5-dependencias--infra-previa)
6. [Criterio de "done" para Fase 5](#6-criterio-de-done-para-fase-5)
7. [Riesgos y mitigaciones](#7-riesgos-y-mitigaciones)
8. [Plan de ejecución (orden de commits)](#8-plan-de-ejecución-orden-de-commits)
9. [Testing strategy](#9-testing-strategy)
10. [Privacidad y compliance](#10-privacidad-y-compliance)
11. [Referencias cruzadas](#11-referencias-cruzadas)

---

## 1. Resumen

**Objetivo de Fase 5:** cerrar el ciclo operativo de los eventos con **notificaciones automáticas** (que David no tenga que estar mirando el admin) y completar el **CRUD de eventos sin tocar SQL** (que cualquier admin pueda operar el ciclo completo desde la UI).

**Scope mínimo (de OPEN_ITEMS §2):**
- 🟡 Notificación por email al admin cuando entra una `event_survey` con `consent_to_contact = true`
- 🟡 CRUD admin completo de eventos desde el panel (ya hay create/edit + status change; falta audit log + bulk ops)

**Extensiones recomendadas** (marcadas como 🟢 optativo; David decide):
- 🟢 Audit log de cambios admin (quién cambió qué evento y cuándo)
- 🟢 Undo para acciones destructivas (archivar)
- 🟢 Bulk operations (archivar múltiples eventos a la vez)
- 🟢 Clonar evento (duplicar setup para evento recurrente)
- 🟢 Export CSV de confirmados/asistentes/encuestas/leads por evento

**Filosofía:** la Fase 5 es la última del MVP operativo. Después viene Fase 6+ que es backend/integraciones (WhatsApp Business API, NLP, multi-evento Excel). Esta fase es para **darle a David autonomía operativa**: que pueda correr un evento end-to-end sin depender de un dev.

---

## 2. Out of scope (Fase 6+)

Estas cosas se mencionan a veces pero NO entran en Fase 5. Van para Fase 6+:

| Feature | Fase | Razón |
|---|---|---|
| WhatsApp Business API (Meta Cloud o BSP) | Fase 6 | Requiere verificación de empresa Meta + costos recurrentes |
| Multi-evento en un solo Excel | Fase 6 | Spec ambigua — necesita decisión producto |
| Análisis de sentimiento sobre encuestas | Fase 6 | Requiere decisión LLM + costo por API call |
| SMS notifications | Backlog | No prioritario |
| Push notifications | Backlog | No prioritario |
| Slack/Discord integrations | Backlog | No prioritario |
| Auto-promoción survey → lead (sin click manual) | 🟡 considerar en Bloque 3 | Si Fase 5 da tiempo, sería un nice-to-have |

---

## 3. Sub-bloques

### 🟡 Bloque 1 — Notificaciones por email (CORE)

**Scope mínimo:**

- Trigger: cuando se inserta `event_survey` con `consent_to_contact = true` → enviar email al admin.
- Contenido del email:
  - Subject: "Nuevo lead del evento [título]"
  - Body: nombre del lead, email, teléfono, evento de origen, `commercial_interest`, link directo al drawer del lead en `/admin?tab=crm&leadId=<id>`
- PII en subject: NO incluir nombre/email (privacy + anti-spam filters).
- Rate limiting: dedup por `survey_id` (cada survey genera max 1 email). Si falla el envío, log + retry exponencial (max 3 reintentos).
- Idempotencia: si la migración de survey es un retry (re-import), no enviar email duplicado.
- From address: `notificaciones@qlick.marketing` (configurable via env).
- Reply-to: el email del admin (David) para que pueda responder directo desde Gmail.
- Idioma: español (todos los admin actuales son mexicanos).
- Modo test: en `NODE_ENV=development`, los emails se loggean en consola en lugar de enviarse (no llenamos la inbox de David con tests).

**Stack técnico recomendado:**

- **Resend** (https://resend.com) — free tier 100 emails/día, 3,000/mes. SDK Node oficial. Setup ~30 min.
- Alternativa: **SendGrid** — free tier 100 emails/día forever. Más establecido pero SDK más pesado.
- **NO usar Supabase SMTP** — es solo para auth emails, no custom templates.

**Trigger location:**

- Opción A — **DB trigger con `pg_net`**: la DB llama a un edge function cuando se inserta la survey. Pros: robusto, no se puede "olvidar" desde el código. Contras: requiere Edge Function deployada.
- Opción B — **App-level**: el endpoint `POST /api/admin/leads/[id]/surveys` o el `createLeadFromEvent` manda el email después del INSERT. Pros: simple, todo en TS. Contras: hay que recordar llamarlo en TODOS los lugares que crean surveys.
- Opción C — **Webhook desde Supabase**: configurar la DB para hacer POST a `/api/webhooks/survey-created` que manda el email. Pros: combinación de A y B. Contras: requiere configurar webhook en Supabase.

**Recomendación:** Opción B (app-level) para empezar. Es la más simple, se mueve rápido. Si se vuelve messy, migrar a A o C después.

**Archivos a tocar:**

- `src/lib/email/resend-client.ts` (nuevo) — wrapper del SDK de Resend con fallback a console.log en dev.
- `src/lib/email/templates/survey-with-consent.tsx` (nuevo) — React Email template (o HTML inline simple).
- `src/lib/crm/surveys-server.ts` — agregar llamada a `sendSurveyNotification()` después del INSERT exitoso.
- `src/app/api/dev/login/route.ts` — verificar que NO se rompa con Resend (no debería, son independientes).
- `docs/SMTP_SETUP.md` (nuevo) — guía paso a paso para configurar Resend (signup, domain verify, API key en `.env.local`).

---

### 🟡 Bloque 2 — Admin CRUD de eventos (CORE — parcial)

**Scope mínimo:**

Lo que ya está implementado (de Fase 4):
- ✅ Crear evento via `EventDrawer` (mode="create")
- ✅ Editar evento via `EventDrawer` (mode="edit")
- ✅ Cambiar status (publish / archive / reactivate) via `updateEventStatus`
- ✅ Validación inline per-field en EventDrawer

Lo que falta (scope mínimo Fase 5):
- ❌ **Audit log de cambios admin** — tabla `admin_audit_log` con `actor_email`, `action`, `entity_type`, `entity_id`, `before`, `after`, `created_at`
- ❌ Página `/admin/system/audit-log` para ver el log filtrado por admin/entity/date

**Extensiones opcionales:**
- 🟢 Bulk operations (multi-select + archivar varios a la vez)
- 🟢 Clonar evento (botón "Duplicar" en el detail → abre EventDrawer pre-llenado)
- 🟢 Export CSV (botón en cada tab → descarga `confirmados-<slug>-<fecha>.csv`)

**Schema para audit log:**

```sql
CREATE TABLE public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_email text NOT NULL,        -- admin que hizo el cambio
  action text NOT NULL,             -- 'event.create' | 'event.update' | 'event.archive' | ...
  entity_type text NOT NULL,        -- 'event' | 'lead' | 'survey' | 'interaction' | ...
  entity_id uuid NOT NULL,
  before jsonb,                     -- snapshot del estado anterior (null en create)
  after jsonb,                      -- snapshot del estado nuevo (null en delete)
  metadata jsonb DEFAULT '{}',      -- info extra (IP, user agent, etc.)
  created_at timestamptz DEFAULT now()
);

CREATE INDEX admin_audit_log_entity_idx ON admin_audit_log(entity_type, entity_id);
CREATE INDEX admin_audit_log_actor_idx ON admin_audit_log(actor_email);
CREATE INDEX admin_audit_log_created_idx ON admin_audit_log(created_at DESC);

ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read audit log" ON admin_audit_log FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_allowlist WHERE email = auth.jwt() ->> 'email'));
```

**Archivos a tocar:**

- `supabase/migrations/20260629000000_admin_audit_log.sql` (nuevo)
- `src/lib/events/events-server.ts` — agregar wrapper `withAuditLog()` que captura before/after y emite el log.
- `src/app/api/admin/events/route.ts` — wrappear POST con audit log.
- `src/app/api/admin/events/[id]/route.ts` — wrappear PATCH con audit log.
- `src/app/api/admin/events/[id]/status/route.ts` — wrappear PATCH con audit log.
- `src/app/admin/system/audit-log/page.tsx` (nuevo) — UI del log con filtros.
- `src/app/admin/system/audit-log/loading.tsx` (nuevo) — skeleton.
- `src/lib/events/audit-log.ts` (nuevo) — server lib para leer el log con filtros.

---

### 🟢 Bloque 3 — Audit log UI + filtros (optativo)

Si Bloque 2 entrega el schema + writes, Bloque 3 es la UI:

- `/admin/system/audit-log` — tabla paginada con:
  - Filtro por `actor_email` (dropdown con admins)
  - Filtro por `entity_type` (event / lead / survey / interaction)
  - Filtro por `action` (create / update / archive / etc.)
  - Filtro por rango de fecha
  - Diff view: click en una row → modal con `before` vs `after` JSON formateado
- Empty state: "Sin cambios registrados todavía. Hacé un cambio en cualquier evento para ver el log."

---

### 🟢 Bloque 4 — Undo + bulk + clone (optativo)

- **Undo archivar:** después de archivar, mostrar toast "Evento archivado [Deshacer]" por 5 segundos. Al click → revertir status. Audit log captura el undo como acción separada.
- **Bulk archive:** checkbox en cada card de la lista → action bar aparece → "Archivar 3 eventos seleccionados" → confirm modal → archive all.
- **Clone evento:** botón en detail → abre EventDrawer pre-llenado (título = "[Copia] X", slug auto-generado, fechas vacías, todo lo demás igual) → save crea evento nuevo. Audit log: action `event.clone` con metadata `source_event_id`.

---

### 🟢 Bloque 5 — Export CSV (optativo)

- Botón en tab Confirmados → descarga `confirmados-<slug>-<fecha>.csv` con todas las filas visibles (respeta filtros aplicados).
- Mismo para Asistentes, Encuestas, Leads promovidos.
- Server route `GET /api/admin/events/[id]/confirmations/export.csv` que devuelve text/csv.
- Audit log: action `event.export`, metadata con `format: csv` y `row_count`.

---

### 🟢 Bloque 6 — Polish + docs + audit (Cierre Fase 5)

Same pattern as Bloque 3 in Fase 4:

- Loading states faltantes
- Validación inline donde falte
- Mobile polish sobre nuevas pages (`/admin/system/audit-log`)
- Security audit de los nuevos endpoints
- Actualizar `EVENTS_ADMIN_GUIDE.md` con las nuevas features
- Actualizar `OPEN_ITEMS.md`, `ROADMAP.md`, `CHANGELOG.md`
- Cierre con `PRE_MERGE_CHECKLIST.md` para merge a `main`

---

## 4. Decisiones pendientes con David

### 🟠 D-1 — Proveedor SMTP: Resend vs SendGrid

**Opciones:**

- **Resend** (https://resend.com)
  - Free tier: 100 emails/día, 3,000/mes
  - SDK Node: `@react-email/components` + `resend` (oficial)
  - Setup: ~30 min (signup con GitHub, verify domain qlick.marketing, API key)
  - Pros: moderno, simple, React Email templates
  - Contras: empresa más nueva (2023), menos establecida

- **SendGrid** (https://sendgrid.com)
  - Free tier: 100 emails/día forever (con tarjeta de crédito)
  - SDK Node: `@sendgrid/mail` (más verboso)
  - Setup: ~45 min (signup, verify domain, API key)
  - Pros: establecido (Twilio), confiabilidad alta
  - Contras: SDK más viejo, requiere tarjeta de crédito para free tier

- **Supabase SMTP** — NO recomendado (solo auth emails, no custom templates, branding limitado).

**Mi recomendación: Resend.** Más moderno, mejor DX con React Email, setup más rápido. Si el volumen crece más allá de 3k/mes, el plan Pro es $20/mes (50k emails).

**Bloqueante:** luz verde de David. Necesita crear la cuenta y verificar el dominio.

### 🟠 D-2 — Email recipients: solo David o lista de admins?

**Opciones:**
- Solo David (1 email fijo via env var `ADMIN_NOTIFICATION_EMAIL`)
- Lista de admins (lee de `admin_allowlist` o variable `ADMIN_NOTIFICATION_EMAILS` separado)

**Mi recomendación: lista de admins.** Cuando David crezca el equipo o tenga sócios con acceso admin, no hay que tocar código. La lista ya existe (`ADMIN_EMAIL_ALLOWLIST`); se puede reusar.

### 🟠 D-3 — Cadencia de emails: inmediato vs digest

**Opciones:**
- Inmediato: cada survey con consent → 1 email
- Digest diario: 1 email a las 9am con el resumen de las últimas 24h
- Digest semanal: 1 email los lunes

**Mi recomendación: inmediato.** Es más accionable — David ve el lead fresco y puede responder rápido. Si el volumen se vuelve molesto, migrar a digest es trivial (cambiar el trigger de "after insert" a "cron diario").

### 🟡 D-4 — Audit log: ¿cuánto tiempo retenemos?

GDPR-friendly: 2 años. Operacionalmente útil: indefinido (es chico, ~1KB por entry).

**Mi recomendación: indefinido, archivado anual.** Después de 1 año, mover a tabla `admin_audit_log_archive` (storage tier frío). DB query siempre mira la tabla activa primero.

### 🟡 D-5 — Audit log: ¿incluir IP y user agent?

Privacy tradeoff. Útil para detectar accesos sospechosos. Pesado si hay volumen alto.

**Mi recomendación: sí, en metadata JSON.** No se muestra por default en la UI pero está disponible si David necesita investigar.

### 🟡 D-6 — ¿Bloque 3 (audit UI) entra en Fase 5?

Si David quiere verlo desde el día 1 → sí.
Si no le importa y prefiere funcionalidad core → no, va para Fase 6.

**Mi recomendación: sí, al menos la página básica sin diff view.** El diff view (modal before/after JSON) puede ser Fase 6.

### 🟡 D-7 — ¿Bloque 4 (undo/bulk/clone) entra en Fase 5?

**Mi recomendación: undo + clone sí, bulk NO.** Undo y clone son UX pura (no nueva infra). Bulk requiere checkboxes + action bar + multi-select state (más complejo). Bulk puede ser Fase 6.

### 🟢 D-8 — ¿Export CSV entra en Fase 5?

Útil para reportes a socios (David puede sacar el CSV y mandarlo por correo). Pero no es bloqueante.

**Mi recomendación: NO en Fase 5. Va para Fase 6.** Es nice-to-have, no core.

---

## 5. Dependencias / infra previa

### 🟠 Setup de Resend (bloqueante para Bloque 1)

1. David crea cuenta en https://resend.com (signup con GitHub)
2. Verifica dominio `qlick.marketing` (DNS records)
3. Crea API key (restricted a "send transactional emails")
4. Agrega a `.env.local`:
   ```
   RESEND_API_KEY="re_xxx"
   RESEND_FROM_ADDRESS="notificaciones@qlick.marketing"
   ADMIN_NOTIFICATION_EMAILS="david17891@gmail.com"
   ```
5. Test: manda un email de prueba desde el dashboard de Resend

**Tiempo estimado:** 30 min. Bloqueante — no se puede empezar Bloque 1 sin esto.

### 🟡 Setup de `admin_audit_log` table

Crear migration `20260629000000_admin_audit_log.sql` y aplicarla en Supabase. Tiempo: 5 min.

### 🟢 Setup de admin_allowlist table (si no existe)

Necesaria para la policy RLS del audit log. Verificar si ya está creada. Si no, agregarla a la misma migration.

---

## 6. Criterio de "done" para Fase 5

### Core (B1 + B2)

- [ ] David puede correr un evento end-to-end sin tocar SQL
- [ ] Cuando entra una survey con consent, David recibe email con link al lead
- [ ] Cuando David crea/edita/archiva un evento, queda registro en audit log
- [ ] Sin warnings de TypeScript ni ESLint
- [ ] Tests pasan (target: 110+/110+)
- [ ] No secrets en código
- [ ] `/admin/system/audit-log` muestra los cambios
- [ ] Documentación actualizada (EVENTS_ADMIN_GUIDE, OPEN_ITEMS, ROADMAP, CHANGELOG)

### Extensiones (B3 + B4 + B5)

- [ ] Audit log UI con diff view
- [ ] Undo archivar (5-second window)
- [ ] Clone evento
- [ ] Bulk archive (si entra en scope)

### Polish (B6)

- [ ] Loading states en pages nuevas
- [ ] Validación inline donde falte
- [ ] Mobile-friendly verificado en Playwright
- [ ] Security audit de nuevos endpoints
- [ ] PRE_MERGE_CHECKLIST.md para merge a main

---

## 7. Riesgos y mitigaciones

| Riesgo | Severidad | Mitigación |
|---|---|---|
| Resend setup tarda más de 30 min (DNS verification puede ser lento) | 🟡 medio | Empezar el setup antes de empezar Bloque 1 (background); mientras tanto, implementar la lógica sin SMTP real usando mock que loggea en consola |
| Email cae en spam | 🟠 medio | SPF + DKIM + DMARC records correctos (Resend genera automáticamente); no incluir PII en subject; warmup gradual |
| Audit log crece demasiado | 🟢 bajo | Tabla chica (~1KB por entry); con 100 cambios/día son ~36MB/año. Archivado anual si preocupa |
| Bulk operations rompen consistencia | 🟡 medio | Wrappear cada archive en transacción; audit log captura el batch como N entradas individuales (no 1 batch) |
| Clone evento duplica IDs | 🟠 medio | Clone genera UUID nuevo + slug auto-unico; nunca comparte IDs |
| Undo después de 5s no funciona | 🟢 bajo | UI clara: "Deshacer" en toast con countdown visible; al expirar, toast se cierra y la acción es permanente |
| Sin Resend configurado → app crashea | 🟠 medio | Wrappear `sendEmail()` con try/catch que loggea y NO falla el flow principal. Survey se crea igual aunque el email falle (queue para retry después) |

---

## 8. Plan de ejecución (orden de commits)

**Orden sugerido** — David puede reordenar:

### Phase A — Setup (commit 1)

1. **Setup Resend** (David-side, no es commit): crear cuenta, verificar dominio, API key.
2. **commit `chore(env): agregar RESEND_* y ADMIN_NOTIFICATION_EMAILS a .env.example`** — actualiza el template de env vars. ~10 líneas.

### Phase B — Bloque 1: Notifications (commits 2-4)

3. **commit `feat(email): Resend client wrapper + fallback a console en dev`** — `src/lib/email/resend-client.ts` con función `sendEmail({to, subject, html})` que detecta dev/prod. ~40 líneas + tests.
4. **commit `feat(email): template React para survey-with-consent`** — `src/lib/email/templates/survey-with-consent.tsx` con HTML inline. ~60 líneas.
5. **commit `feat(crm): trigger email en createSurvey cuando consent=true`** — `surveys-server.ts` extendido + test e2e. ~30 líneas.

### Phase C — Bloque 2: Audit log (commits 5-8)

6. **commit `feat(db): migration 20260629000000 admin_audit_log`** — schema + RLS + indexes. SQL.
7. **commit `feat(events): wrapper withAuditLog para create/update/archive`** — `events-server.ts` extendido. ~50 líneas.
8. **commit `feat(admin): /admin/system/audit-log con tabla + filtros`** — page.tsx + loading.tsx + server lib. ~200 líneas.
9. **commit `docs(admin): SMTP_SETUP.md — guia paso a paso Resend`** — manual de setup. ~80 líneas.

### Phase D — Extensions (commits 9-11, optativo)

10. **commit `feat(events): undo archivar via toast 5s`** — EventDrawer + UI. ~40 líneas.
11. **commit `feat(events): clone evento`** — botón en detail + EventDrawer pre-fill. ~50 líneas.
12. **commit `feat(admin): audit log diff view (modal before/after)** — modal con JSON formatter. ~80 líneas.

### Phase E — Polish + cierre (commits 12-15)

13. **commit `polish(admin): loading states + validacion inline en audit-log`** — Bloque 6 polish. ~30 líneas.
14. **commit `polish(admin): mobile verify 375x812 en /admin/system/audit-log`** — visual + screenshot. ~5 líneas (cambios menores).
15. **commit `docs: EVENTS_ADMIN_GUIDE + OPEN_ITEMS + ROADMAP + CHANGELOG actualizados`** — paperwork. ~50 líneas modificadas.
16. **commit `docs: PRE_MERGE_CHECKLIST.md Fase 5`** — gate para merge. ~150 líneas.

**Total estimado: 13-16 commits, ~700-1000 líneas de código + ~500 líneas de docs.**

---

## 9. Testing strategy

### Unit tests
- `src/lib/email/resend-client.test.mjs` — wrapper detecta dev/prod, no crashea sin API key.
- `src/lib/email/templates/survey-with-consent.test.mjs` — render del template con datos reales (sintéticos).
- `src/lib/events/audit-log.test.mjs` — wrapper captura before/after correctamente.

### Integration tests (Node, no DB)
- `tests/email-flow.test.mjs` — survey con consent → mock Resend captura el send → assert email correcto.

### E2E tests (contra Supabase dev)
- `tests/audit-log-flow.test.mjs` — create event → UPDATE audit_log tiene 1 entry con before/after correctos.
- `tests/email-flow-e2e.test.mjs` — solo correr con `RESEND_API_KEY` real configurada (skip si no).

### Manual / Playwright MCP
- `/admin/system/audit-log` muestra entries después de operaciones reales.
- Email de prueba llega a la inbox de David.
- Undo archivar funciona dentro de 5s.

### Coverage target
- Mínimo: misma cobertura que Fase 4 (~30 tests nuevos, total 128/128).
- Ideal: 50+ tests nuevos.

---

## 10. Privacidad y compliance

### LFPDPPP (México) + GDPR considerations

- **Consent comercial**: ya se captura en `event_surveys.consent_to_contact`. Si es false, NO se manda email al admin (porque no es lead).
- **Emails solo a admins**: la lista `ADMIN_NOTIFICATION_EMAILS` es de Qlick (internos). NO se manda a leads.
- **PII en emails**: incluir nombre/email/teléfono del lead es OK porque el receptor es admin (Qlick). NO se manda a terceros.
- **Right to be forgotten**: si un lead pide borrado, también borrar de `admin_audit_log` (la entry tiene su email). Esto es GDPR-compliant.
- **Retention**: indefinido para audit log (es interno, no se comparte). Si México pide retention limitada, ajustar.

### Anti-spam practices
- SPF + DKIM + DMARC configurados via Resend.
- Subject NO incluye "GRATIS", "OFERTA", etc.
- Body NO tiene imágenes pesadas.
- From address es `notificaciones@qlick.marketing` (no @gmail).
- Reply-to es el email de David (legítimo).
- Unsubscribe link en el footer del email (aunque sea a админ, por compliance).

---

## 11. Referencias cruzadas

- `docs/OPEN_ITEMS.md` §2 — Fase 5 original (mínimo scope)
- `docs/OPEN_ITEMS.md` §1 — Deuda activa que Fase 5 podría cerrar:
  - C-2 `masterclass-funnel-foundation` branch sin mergear — **NO entra en Fase 5** (es otro feature)
- `docs/ROADMAP.md` §"En curso" — status Fase 4 cerrado, arranca Fase 5
- `docs/CHANGELOG.md` — entry `[Unreleased]` se actualiza al cerrar Fase 5
- `docs/EVENTS_ADMIN_GUIDE.md` — manual a actualizar con notifications + audit log
- `docs/PRE_MERGE_CHECKLIST.md` — gate para merge Fase 5 a main
- `src/lib/events/events-server.ts` — code que se wrappea con audit log
- `src/lib/crm/surveys-server.ts` — code que se wrappea con email trigger
- `src/app/api/admin/events/` — endpoints a extender

---

## Próximos pasos (orden de ejecución)

1. **David revisa este plan** y resuelve las decisiones D-1 a D-8.
2. **David confirma luz verde** para arrancar Fase 5.
3. **Setup Resend** (David-side, 30 min background).
4. **Renombrar branch** de `feat/fase-5-planning` a `feat/fase-5` cuando arranquemos commits reales.
5. **Empezar con Phase A (commit 1)** — `.env.example` update.
6. **Phase B (commits 2-4)** — notifications.
7. **Phase C (commits 5-8)** — audit log.
8. **Phase D (commits 9-11)** — extensions optativas.
9. **Phase E (commits 12-15)** — polish + paperwork.
10. **Push + PR + merge** con `PRE_MERGE_CHECKLIST.md` como gate.

---

**Aprobación de David** (cuando esté listo):

```
[ ] Plan aprobado para arrancar Fase 5
[ ] D-1 SMTP provider:    [ ] Resend    [ ] SendGrid
[ ] D-2 Recipients:       [ ] Solo David    [ ] Lista admins
[ ] D-3 Cadencia:         [ ] Inmediato    [ ] Digest diario    [ ] Digest semanal
[ ] D-4 Audit retention:  [ ] Indefinido    [ ] 2 años    [ ] Otro: ____
[ ] D-5 IP + UA en log:   [ ] Sí    [ ] No
[ ] D-6 Audit UI:         [ ] Sí (B3)    [ ] No, va para Fase 6
[ ] D-7 Undo + clone:     [ ] Sí (B4)    [ ] No, va para Fase 6
[ ] D-8 Export CSV:       [ ] Sí (B5)    [ ] No, va para Fase 6

Fecha: ___________
Notas: ___________
```