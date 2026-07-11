# Qlick LMS — Roadmap

> Fuente de verdad del plan del LMS. Cualquier desvío se conversa y se actualiza acá.
> Última revisión: 2026-07-11 11:50 Phoenix — **Sprint cierre-eventos-virtuales + Audit voseo** cerrado en `main` (5 commits del feature + 2 hotfixes de copy). Validación 1066/1066 tests. Migración `20260711100000` aplicada en Supabase por David.

---

## Estado actual

- [x] **v0.9.3 — Sprint Cierre-Eventos-Virtuales (link con encuesta + UPSERT attendee + promote lead + audit voseo)** — sprint cerrado el 2026-07-11 en `main` (5 commits del feature + 2 hotfixes de copy). Validado: type-check ✓ · lint ✓ · 1066/1066 tests ✓ · build ✓. Migration `20260711100000_event_attendee_source_survey_attended.sql` aplicada.
  - Handoff: este sprint NO tiene handoff dedicado (sprint corto end-to-end); toda la info en `docs/STATUS.md` sección "Sprint cierre-eventos-virtuales (2026-07-11 10:30 — 11:50 Phoenix)" + `data/PROJECT-LOG.md` entrada `2026-07-11 ~10:40`.
  - Status vivo: `docs/STATUS.md` (snapshot 2026-07-11 11:50).
  - Commits clave en main:
    - `bd5a27d` — `feat(eventos): agregar envio de link de encuesta post-evento y lookup de respuestas` (David)
    - `1e97849` — `fix(eventos): upsert attendee + promote lead en Q0 attendance check` (Mavis)
    - `827b32b` — `fix(email): voseo -> tutéo en template survey-invite` (Mavis)
    - `d858f9c` — `fix(copy): voseo -> tutéo en todos los copy visibles al cliente (audit completo)` (Mavis)
  - **Qué incluye:**
    - **Botón "📨 Enviar link de encuesta"** en toolbar del tab Confirmados (`/admin/eventos/[id]?tab=confirmations`).
    - **Orquestador `send-survey-link.ts`**: genera tokens idempotentes, manda email con Brevo a confirmados con email, devuelve links `wa.me` pre-armados para los que solo tienen teléfono.
    - **Template email `survey-invite.ts`**: HTML inline con brand Qlick, escape XSS, CTA grande "📝 Responder encuesta (2 min)".
    - **UPSERT attendee + promote lead en Q0** (`surveys-server.ts:295-494`): cierra 2 gaps críticos. Cuando el confirmado responde Q0=Yes:
      1. UPSERT `event_attendees` con `source='survey_attended'` si no existe row, o UPDATE `checked_in_at` si existe.
      2. UPDATE `leads` con `status='event_attended'`, `tags+=[event:{slug}:attended]`, `last_contacted_at=now()`. Respeta `lost`/`archived` (no resucita).
    - **Helper puro `detectAttendanceCheck`** extraído + 10 tests unitarios (`tests/survey-attendance-check.test.mjs`).
    - **Badge "✓ Link"** en la tabla de Confirmados para los respondedores.
    - **Audit de voseo** completo: 17 voseos reales corregidos en 11 archivos (4 del email + 13 en otros). Nuevo script `scripts/_audit-voseo-templates.mjs` (212 archivos escaneados, 209 limpios).
  - **Validado en producción** (pendiente E2E con attendee real en próximo evento Zoom, ~15-30 min de pilotaje).
- [x] **v0.9.2 — Sprint Cert Email (envío batch de constancias)** — sprint cerrado el 2026-07-08 en rama `feat/certificados-concept-c` (deploy prod OK en `www.qlick.digital`, E2E validado)
  - Handoff completo: `docs/HANDOFF_v0.9.2_CERT_EMAIL.md` ← **leer primero**
  - Status vivo: `docs/STATUS.md` (snapshot del 2026-07-08 18:15)
  - Commit: `f3e4447` (sprint completo, 9 archivos)
  - **Qué incluye:**
    - **`/cert/[folio]` pasa a público** (antes requería cookie admin). El folio es el secreto: random sobre 100k combinaciones, no adivinable. Hardening futuro: JWT con expiración.
    - **Panel admin `CertificateBatchPanel`** con UX de 2 pasos: preview (cargado por `getCertificateBatchPreviewAction`) + confirmación (`sendBatchCertificatesAction`). Muestra desglose por canal (email / WhatsApp fallback / skipped).
    - **Email transaccional con Brevo** (`noreply@qlick.digital`). Template con saludo personalizado, datos del evento, folio en mono, CTA grande "Ver mi constancia", instrucciones Ctrl+P.
    - **Fallback WhatsApp**: link `wa.me/[phone]?text=...` pre-armado con mensaje + link al cert. Abre `web.whatsapp.com` en browser de David (NO bot).
    - **Idempotencia**: RPC `issue_event_certificate` ya es idempotente. El email puede re-enviarse si David corre el batch 2 veces.
    - **Migration**: extiende `event_email_log` con `email_type='certificate'` (CHECK constraint) + `event_certificate_id` (FK nullable) + índice.
    - **12 tests nuevos** para el template (incluido XSS en `<title>` descubierto durante desarrollo, ya arreglado).
  - **Validado E2E** (David + Mavis, 2026-07-08 18:10):
    - Supabase: 1 fila `event_email_log` con `email_type='certificate'`, `ok=true`, `event_certificate_id` poblado.
    - Brevo: 1 transactional email con subject correcto, recipient OK, timestamp coherente (diferencia 1s vs Supabase log).
  - **Lección XSS**: subject del correo se inyectaba sin escapar en `<title>` y `<meta>` — fix aplicado, tests blindan el comportamiento. Regla universal: escapar TODA interpolación en HTML, testear TODOS los campos dinámicos.
  - **Pendiente:** pilotaje real con attendees del evento 11/jul (no hubo asistentes para esta prueba). Cleanup DB de dev artifacts (DDDDDDD/QLK-2026-68558).
- [x] **v0.9.1 — Sprint Certificados Concept C** — sprint cerrado el 2026-07-08 en rama `feat/certificados-concept-c` (aún NO mergeada a `main`; deploy prod OK en `www.qlick.digital`)
  - Handoff completo: `docs/HANDOFF_v0.9.1_CERT_CONCEPT_C.md` ← **leer primero**
  - Status vivo: `docs/STATUS.md` (snapshot del 2026-07-08)
  - 6 commits: `8454577` (base) → `338a4f6` (admin) → `6553e6d` (cleanup) → `b0ac503` (márgenes) → `e2418a9` (margen blanco) → `511d15c` (`@page` 297mm + PrintCertButton)
  - **Qué incluye:**
    - **Cert HTML imprimible 1:1 con design Concept C aprobado** (`docs/qlick-cert-system/03-concept-c-dynamic-authority.html`).
    - **Server action `issueCertificateAction`** con auth admin (`requireAdmin()`), validaciones e idempotencia por `(event_id, attendee_id)`.
    - **Client Component `IssueCertButton`** en admin check-in tab (✨ Emitir cert) + Client Component `PrintCertButton` con `document.fonts.ready`.
    - **Fix crítico de print**: `@page { size: 297mm 210mm; margin: 0 }` (NO keyword `A4 landscape` — Chrome ambigüa el keyword con drivers Letter y produce margen blanco vertical).
    - **Assets como data URLs** (signature, isotipo, wordmark) para evitar 404 en print.
    - **12 TTF** de Plus Jakarta Sans / Inter / JetBrains Mono cargados en `public/certificates/fonts/`.
  - **Trade-off aceptado:** HTML imprimible en lugar de PDF server-side (Vercel Hobby no aguanta headless browsers; `@react-pdf/renderer` falla con binary deps en Windows). David imprime local con Ctrl+P o el botón "🖨️ Imprimir".
  - **Validado en prod:** folio `QLK-2026-68558` para attendee `dddddddd-dddd-dddd-dddd-dddddddddddd`. Print preview en A4 horizontal sin margen blanco en márgenes "Predeterminado" ni "Ninguno".
  - **Pendiente:** merge a `main` + cleanup DB de dev artifacts + decisión Paso 2 (script bulk + envío por correo).
- [x] **v0.9.0 — CRM Inteligente v2.0 (Fases 1 + 2 + 3)** — release cerrado el 2026-07-06 (HEAD `main`, commit `ec9eb55`, tag `v1.1-crm1-stable` para pre-Fase 2-3)
  - Handoff completo: `docs/HANDOFF_v0.9.0_CRM_INTELIGENTE.md` ← **leer primero**
  - Status vivo: `docs/STATUS.md` (snapshot del release)
  - Log de cierre: `data/PROJECT-LOG.md` (entradas `~17:00` Fase 1 + `~18:30` Fases 2-3)
  - **Qué incluye (Fase 1 — Compliance + Operatividad, commit `d150d9d`):**
    - **Soft delete obligatorio**: `archiveLead` con `status='archived'`; hard delete bloqueado en código (LFPDPPP / LGPD)
    - **Optimistic locking** (`WHERE status = prevStatus`) en `bulkArchiveLeads`, `bulkUpdateStatus`, `archiveOneLead`
    - **Export CSV streaming chunked**: `ReadableStream` + `.range(0, 999)` recursivo + tope 100k filas + BOM UTF-8 (`\uFEFF`) para Excel
    - **Privacidad por default**: filtro `consent_to_contact=true` en exports
    - **Confirmación textual** *"ARCHIVAR N"* antes de bulk archive
  - **Qué incluye (Fase 2 — Inteligencia Comercial, commit `ec9eb55`):**
    - Pestaña **Conversaciones reales** conectada a `lead_whatsapp_conversations` + `lead_interactions` (fallback por phone para pre-leads)
    - **LVR** (Lead Velocity Rate): `(leads_7d - leads_7d_prev) / leads_7d_prev * 100`
    - **Radar SLA Overdue**: leads `new|contacted` con `MAX(updated_at, last_interaction) > 48h` sin tarea abierta
    - **Distribución de Calor** (Hot / Warm / Cold) por score ≥60/≥40/resto
    - `PipelineCard` con badges 🔥 HOT + ⚠️ SLA + bordes cálidos
  - **Qué incluye (Fase 3 — Agente IA de Ventas, mismo commit `ec9eb55`):**
    - 3 plantillas dinámicas por score: `close` / `value` / `reactivate`
    - Personalización con respuestas de `event_surveys` (q_business, q1_clarity, etc.)
    - Links `wa.me` pre-armados con encoding RFC 3986 (`buildWhatsAppLink`)
    - Endpoint `/api/admin/crm/ai-suggestions?leadId=X` con rate limit 30/min
    - Separación arquitectónica: lógica pura (`sales-templates.ts`) vs I/O (`ai-sales-server.ts`)
  - **Validación E2E**: script `scratch/qlick-crm-ai-audit.mjs` corre **18/18 aserciones OK** contra DB real (escenarios I1-I4)
  - **Tests**: **545/545 verde** · type-check ✓ · lint ✓ · build ✓
  - **Bot engine INTACTO** (política de aislamiento verificada con `git diff v1.1-crm1-stable HEAD -- src/lib/whatsapp/bot-engine.ts` → 0 hits)
- [x] **v0.8.0 — Wizard WhatsApp funcional + Español MX** — release cerrado y taggeado el 2026-07-06 (HEAD `main`, tag `v0.8.0`)
  - Handoff completo: `docs/HANDOFF_v0.8.0_FUNCIONAL.md`
  - 21 commits del cluster G-15 (r1-r7) + Fase name capture + auditoría nocturna
  - 535/535 tests verde (base antes de Fases 1+2+3 del CRM)
  - **Qué incluye:**
    - Wizard post-evento end-to-end funcional (Q1→Q2→Q3→q_consent→q_business→cierre)
    - Detección de buttonId formato dinámico (`survey_q1_clarity_very_clear`) + legacy
    - Nuevo intent `survey_q_consent_continue` (avanzar de q_consent a q_business)
    - Tab Encuestas con labels legibles (formato dinámico + Consentimiento Sí/No)
    - Tab Leads promovidos con badges score/qualification/consent
    - Cierre sin mensaje duplicado (solo thank-you, follow-up bucket removido)
    - Copy 100% español mexicano consistente (bot WhatsApp + emails + web pages)
  - **Tag:** `v0.8.0` (rollback target estable, pre-CRM-Inteligente)
- [x] **Events Funnel Foundation v0.7.0** — fase cerrada y mergeada a `main` (rama `feat/events-funnel-foundation`) el 2026-06-26
  - 12 commits: migration (6 tablas + RLS) → tipos dominio → mapper → 5 server libs (events/confirmations/attendees/surveys/promotion) → refactor `linkLeadToEventRecord` (cierra H2 de Fase 2) → importer CLI con `xlsx` → 23 unit tests del importer → barrel + doc
  - **Cierre del H2 del QA Fase 2** (race condition en tags) por construcción: `linkLeadToEventRecord` ahora usa `lead_event_links` (INSERT-only con UNIQUE)
  - Validado: `npm test` (37/37 ✅), `npx tsc --noEmit` ✅, `npm run lint` ✅, `_test-fase3.mjs` 7/7 PASS contra Supabase real con cleanup automático
  - Doc de cierre: `docs/EVENTS_FUNNEL_FOUNDATION.md`
  - **Deuda activa de Fase 3 → ver `docs/OPEN_ITEMS.md` §1 y §2**
- [x] **LMS Real Foundation v0.9.0** — fase cerrada y mergeada a `main` (commit `78db4a3`) el 2026-06-25
  - 14 commits: DB (5 tablas + RLS) → server libs → docs handoff → Google OAuth → fix `client.ts` → QR enrollment → fallbacks UUID/FK → seed script → docs E2E plan → tour Playwright
  - Validado: `npm run type-check && npm run build` green, query directa a DB confirma 4 cursos + 12 módulos + 36 lecciones
- [x] **feat/google-oauth** — Google OAuth reemplaza magic link + fix `client.ts` acceso literal a `NEXT_PUBLIC_*`
- [x] **feat/qr-enrollment** — Inscripción con QR + tracking `source` + página `/inscripcion/[slug]`
  - Fallbacks automáticos: `getCourseBySlug` cae al mock cuando DB no tiene el slug; `enrollUserInCourse` valida UUID antes del upsert y cae a demo si el ID es mock legacy
- [x] **seed:courses** — Script ejecutado el 2026-06-25: 4 cursos + 12 módulos + 36 lecciones cargados en Supabase (idempotente, ya no-op en re-runs).
- [x] **Entitlements v1.0.0+** — capa de acceso comercial (Fase A+B+C) mergeada a `main` (commits `5f76584` / `2d156a6` / `7b26fcc` / `8b9ea5d` / `42076da` / `f2f158d` / `[próximo]`).
  - **Fase A (v1.0.0)**: schema con `courses.access_type`, tablas `course_access` + `payments` con RLS. 1 curso paid ($499 MXN) + 3 free.
  - **Fase B**: server lib `src/lib/lms/entitlements.ts` con `getCourseAccess`, `checkCourseAccess`, `grantAccess`, `revokeAccess` (idempotente).
  - **v1.0.1/1.0.2**: alineación con la capa legacy `src/lib/payments/` (mockProvider, stubs de Stripe/MercadoPago/Conekta, types en `@/types`). Rename `provider_payment_id` → `external_reference`, CHECK status con valores legacy, columnas `method`/`coupon_id`/`discount_mxn`/`enrollment_id`.
  - **Fase C**: endpoint `POST /api/dev/simulate-webhook` + página `/pagar/[courseSlug]` con SimulatorForm. Flujo: free → /inscripcion, paid → /pagar → simulate (paid/failed/pending) → grantAccess si paid.
  - **Auditoría de uso (commit `f2f158d`)**: 5 críticos detectados y arreglados. Endpoint crea enrollment post-grantAccess, dashboard une enrollments+course_access con retroactivo, `/aprender/[lesson]` chequea access (era falla de seguridad), `/cursos/[slug]` botón apunta a `/inscripcion` (no /login).
  - **Auditoría profunda (próximo commit)**: 3 críticos más arreglados.
    - `getCourseById` agregado al LMS server (UUIDs reales); dashboard enriquecido con datos del LMS en lugar del mock (Fix X-1: courseTitle="" en cards).
    - `/inscripcion/[slug]?ref=qr` ahora preserva `ref` al redirigir a `/pagar` (Fix X-4).
    - `/aprender/[lesson]` ya no da `hasAccess=true` si la DB está caída (Fix X-5: agujero de seguridad).
    - `SimulatorForm` permite elegir método (Tarjeta / OXXO / SPEI) en vez de hardcoded `card` (Fix C-1).
    - `/inscripcion` ya no muestra `$$precio MXN` (Fix X-6: doble `$`).
  - **X-2 (ALTO, próximo commit)**: `/cursos` y `/cursos/[slug]` ahora son DINÁMICAS y leen del LMS real. Catálogo muestra precios correctos ($499 MXN para curso paid, $0 para free). Badges de precio/agregados. Botón CTA diferenciado (Comprar/Empezar/Continuar según access). Endpoint `/api/dev/simulate-webhook` ahora rechaza requests en producción (NODE_ENV check).
  - **Reusado de legacy**: `mockProvider` para el patrón de provider, `Payment`/`Coupon`/`applyCoupon` de `@/types`.
  - Pendiente test E2E con cuenta NO-admin (admin no puede entrar como student por diseño).

## Deuda activa (no bloqueante)

- **Catálogo real**: los 4 cursos siguen duplicados entre `src/lib/data/courses.ts` (mock) y la DB (via seed). Cuando David decida el catálogo final con socios, se elimina el mock y se regenera el seed con los datos reales.
- **Inconsistencia `LessonVideoProvider "external"`** (CHECK vs TS) — H1 del audit original. Fix de 1 línea cuando se decida.
- **`ADMIN_EMAIL_ALLOWLIST` durante testing**: probamos con la cuenta `layerzero3dprint@gmail.com` que NO estaba en el allowlist. Si vuelve a estar en el allowlist, OAuth alumno va a loopear (es admin, no entra como student — por diseño).

## En curso

- **Fase 4 (CRM Próximo Ciclo): Calendario Real, Tareas y Notificaciones Proactivas** — planificada post-v0.9.0.
  - **Objetivo:** cerrar el último tramo del CRM "real" reemplazando los mocks restantes (Calendario + Broadcast) y subir proactividad (no solo el admin mira el CRM, el CRM le avisa).
  - **Branch destino (a crear):** `feat/crm-fase-4-calendario-tareas`.
  - **Mejoras programadas:**
    1. **Paginación server-side en tabla de leads del CRM** — migrar `CRMView.tsx` a paginación por cursores/páginas server-side (`?page=N&size=50` o `?cursor=…`) consumiendo el endpoint `/api/admin/crm/leads` con `.range()`. Escalar a >5,000 leads sin ralentizar navegador. Reusar el patrón de paginación por `.range()` ya validado en el export CSV streaming.
    2. **Refactor de nombres en DB** — separar columna `name` en `first_name` + `last_name` en tabla `leads` (migration aditiva + `view` de compatibilidad). Resuelve la fragilidad de `firstName()` (split por espacio) que asume primer token = first name, bug activo que falsifica saludos para nombres con prefijos (ej. "I3 David Martínez" → "Hola I3"). Pendiente detectado en iter 4 del audit script v0.9.0.
    3. **Alertas proactivas SLA** — conectar el radar de SLA Overdue (>48h sin contacto) con notificaciones salientes automáticas:
       - **Email** (default) via Brevo/Resend, mismo pipeline que `event_reminder_log` (idempotente, rate limited).
       - **Slack** (opcional) via webhook URL configurada por env var (`SLACK_LEAD_ALERT_WEBHOOK`).
       - Trigger: cron job diario que consulta `crm_tasks.done=false AND leads.status IN (new, contacted) AND MAX(updated_at, last_interaction) > 48h` y notifica al vendedor responsable (campo `sales_owner` — pendiente asignar real).
  - **Capacidades nuevas que se conectan:**
    - Reemplazar vista demo de Calendario/Citas por **Google Calendar integration** (OAuth + watch events + crear eventos desde UI admin).
    - Tareas CRM (`crm_tasks` ya existentes en schema) con UI para crear/asignar/completar sin salir del drawer del lead.
  - **Criterios de éxito verificables (Fase 4):**
    - Tabla de leads carga <200ms para 5,000 filas (medido con Playwright MCP).
    - `lead.first_name` y `lead.last_name` poblados al 100% para leads nuevos (`mapLeadRowToLead` actualizado).
    - Cron job SLA dispara emails reales a `david17891@gmail.com` cuando se crea un lead sintético con `updated_at > 48h ago`.
    - El módulo Calendario deja de leer `src/lib/data/crm-data.ts` y pasa a `event_qr_tokens` + nueva tabla `calendar_events` (si se decide).
  - **Dependencias externas:**
    - Google Calendar API credentials (requiere setup OAuth consent screen — ~1h).
    - Decisión de producto sobre destinatario SLA (¿solo vendedor? ¿también al admin?).
  - **Tags de respaldo esperados:** `v1.2-crm1-stable` (post-Fase 4) como nuevo rollback target.
  - **Trigger:** Deuda activa documentada en handoff canónico v0.9.0 §"Pendientes documentados".

---

## ✅ Cerradas (histórico de Fases admin-eventos)

Las 3 fases siguientes se completaron durante el sprint 2026-06-27 → 2026-07-01 y se mergea­ron progresivamente a `main`. Se listan aquí solo como contexto histórico.

- **Fase 4 vieja: UI admin `/admin/eventos` + WhatsApp manual** — branch `feat/admin-eventos`, cerrada y mergeada a `main` el 2026-06-28.
  - ✅ **Bloque 1**: detalle del evento con tabs (Confirmados/Asistentes/Encuestas/Leads) + búsqueda + match manual + des-marcar encuestas
  - ✅ **Bloque 1C**: métricas de conversión del funnel (4 ratios)
  - ✅ **Bloque 2**: estados de WhatsApp follow-up + audit log (`lead_whatsapp_log`)
  - ✅ **Bloque 2E**: historial de contactos WhatsApp en el drawer del CRM (`lead_interactions` API + UI)
  - ✅ **Bloque 3A**: empty states diseñados con iconos y CTAs
  - ✅ **Bloque 3B**: SubmitButton con `useFormStatus` + aplicado en 5 forms
  - ✅ **Bloque 3C**: error boundary global `/admin/**`
  - ✅ **Bloque 3D**: loading states explícitos (5 `loading.tsx` + AdminView interno)
  - ✅ **Bloque 3E**: validación de inputs (Field con `error` + `aria-invalid` + `role="alert"`)
  - ✅ **Bloque 3F**: mobile polish (375×812 verificado en Playwright MCP)
  - ✅ **Bloque 4 (cierre)**: docs (EVENTS_ADMIN_GUIDE.md 620 líneas, CHANGELOG.md, PRE_MERGE_CHECKLIST.md, demo-socios.html). 19 commits ahead of origin. Pendiente: push de David + PR + merge.

- **Fase 5 vieja: Notificaciones + admin CRUD + audit log + clone/undo** — branch `feat/fase-5-planning`, cerrada el 2026-06-28. Tests: 110/110 ✅.
- **Fase 6 vieja: Polish + auditoría + métricas globales** — branch `feat/fase-6-hitos`, cerrada el 2026-07-01. Tests: 110/110 ✅, score 9/10.

## Pendientes — features

| # | Feature | Branch | Decisión abierta |
|---|---|---|---|
| 6 | Onboarding del alumno | `feat/onboarding-alumno` | scope exacto (tooltips vs tour modal vs emails) |
| 5 | Pagos — adapters sin credenciales | `feat/pagos-adapters` | proveedor (MercadoPago / Stripe / Conekta) |
| 7 | Tests automáticos (Vitest + SQL) | (puede ser branch por fase) | scope fase 1 |

## Completados

- [x] **`feat/google-oauth`** — Google OAuth reemplaza magic link (mergeado a `feature/lms-real-foundation` el 2026-06-25)
  - Fix incluido: `client.ts` ahora usa acceso literal a `NEXT_PUBLIC_*` (bug conocido documentado en `config.ts:108-113`)
  - Bug OAuth: cuentas en `ADMIN_EMAIL_ALLOWLIST` no pueden entrar como alumno (por diseño)
- [x] **Tests E2E — Fase 1 (tour Playwright MCP)** — mergeado el 2026-06-25. 7 screenshots en `docs/screenshots/2026-06-25-e2e-tour/` con cross-check de DB. Plan completo en `docs/E2E_TESTS_PLAN.md`. **Fase 2 (`@playwright/test` + CI) queda pendiente** hasta que haya CI real configurado.
- [x] **Entitlements v1.0.0+ (Fase A+B+C)** — schema + core lib + simulador. 5 commits en main (`5f76584` / `2d156a6` / `7b26fcc` / `8b9ea5d` / `42076da`). Plan completo en `docs/ENTITLEMENTS_PLAN.md`. Pendiente test E2E con cuenta NO-admin.

## Lecciones aprendidas (para futuras sesiones)

- **Auditar el repo antes de aceptar un plan de agente**: el plan inicial de un agente genérico (producido por LLM) no chequea el repo. Antes de aceptar una propuesta, hacer `ls src/lib/`, `grep -r "Payment"` y similares. En la sesión del 2026-06-26 descubrimos que `src/lib/payments/` ya existía y duplicamos trabajo hasta que hicimos una auditoría.
- **Supabase SQL Editor NO maneja DO blocks con ALTER adentro**: los DO blocks simples corren, pero los que contienen `ALTER TABLE` no aplican los cambios. Usar siempre `ALTER TABLE` directo con `IF EXISTS` / `IF NOT EXISTS`. Esta es una limitación del SQL Editor de Supabase, no de Postgres puro.
- **Multi-agente: abstener por ahora**. Acordado con David: features de tamaño medio se hacen secuenciales en una sesión, documentadas en este roadmap. Para planes multi-agente, dividir en sub-tareas <8 archivos cada una o aceptar partial-state + post-mortem manual.
- **Admin no puede testear el flujo de pagos**: por diseño, una cuenta admin no es student. Para E2E de pagos, crear una cuenta NO-admin o sacarla temporalmente del allowlist.

---

## Política de datos (PII) — 2026-06-26

Regla inquebrantable: **datos personales reales (nombres, teléfonos, emails de personas físicas) NUNCA entran al repo, tests, fixtures, screenshots públicas, ni commits.**

### Lo que SÍ se puede
- Datos reales en operación local: Supabase del proyecto, admin privado, demo privada del socio.
- Importador (cuando exista) leyendo Excels de `private-data/` o ruta configurable por env var.
- Backups locales encriptados fuera del repo.

### Lo que NO se puede
- Subir el Excel ni ningún archivo con datos personales al repo.
- Commits con teléfonos, emails, nombres reales de personas.
- Tests/fixtures con datos reales (usar siempre sintéticos: `+52XXXXXXXXXX`, `@example.com`).
- Screenshots públicas con datos identificables (anonimizar o usar métricas agregadas).
- Logs con PII (`console.log` de leads, attendees, etc. — usar IDs, no datos crudos).

### Patrones `.gitignore` (ya agregados)
- `/private-data/` y `/datos-privados/` → carpetas locales del equipo
- `lista_*.xlsx`, `asistencia_*.xlsx`, `clientes_*.xlsx`, `encuesta_*.xlsx`, `leads_*.xlsx`, `evento_*.xlsx` → Excels típicos
- Cualquier archivo nuevo con PII debe agregarse al `.gitignore` antes de existir

### Cuando se agregue el importador
- Lee de `QLICK_IMPORT_PATH` (env var) o una ruta local conocida
- NUNCA hardcodear rutas que incluyan el repo
- Tests con fixtures sintéticos en `tests/fixtures/` (sí commiteables)
- Validar que los headers del Excel no incluyan campos inesperados de PII

---

## Visión estratégica (reencuadre del cliente, 2026-06-26)

El cliente reposicionó Qlick: no es solo un LMS, es una **plataforma propia** que combina:

- **LMS**: cursos, lecciones, alumnos, inscripciones, progreso, pagos.
- **CRM**: leads, prospectos, seguimiento, estados comerciales, oportunidades.
- **Eventos/conferencias**: registros, confirmados, asistentes, encuestas, seguimiento.
- **WhatsApp**: primero manual con `wa.me` + estados, después API Business (futuro).
- **Automatizaciones**: no como piezas sueltas, sino como funciones conectadas al flujo comercial.

**Flujo objetivo:** Evento/campaña → prospecto → CRM → seguimiento WhatsApp → inscripción → pago → acceso al curso → progreso → futuras ventas.

### Lo que ya existe (post-v0.9.0 — 2026-07-06)
- LMS funcional (catálogo, detalle, login, dashboard, lecciones, progreso).
- Auth con Supabase + roles admin/student.
- CRM con **persistencia real** post-v0.9.0: conversaciones del bot, LVR/SLA/Heat intelligence, agente IA con 3 sugerencias dinámicas y wa.me pre-armados.
- Admin `/admin/eventos/[id]` con tabs (Encuestas, Leads, Pipeline, Conversaciones, Resumen) + SLA Overdue + Heat distribution.
- Wizard WhatsApp funcional + copia 100% español MX.
- WhatsApp Cloud API operativa (inbound + outbound). Bot engine intacto a través del release v0.9.0.
- Supabase: schema sincronizado, 24 tablas, RLS activo, typegen regenerable, soft delete + optimistic locking + CSV streaming.
- Pago simulado funcional (Entitlements v1.0.0+).
- Pipeline de email transaccional (Brevo) + recordatorios de evento (`event_reminder_log`).
- Pendientes (no hecho todavía): Calendario real (Google Calendar), Broadcast WhatsApp masivo, alertas SLA outbound. → **Fase 4 (CRM Próximo Ciclo)**.

### Roadmap priorizado (acordado con David, 2026-06-26)

| # | Fase | Estado | Notas |
|---|---|---|---|
| 0 | **LMS al 100%** | 🟡 en curso | polish, hidratación bug, dashboard persist |
| 1 | **Preparar flujo conceptual del evento** | ✅ hecho (doc `EVENTS_FUNNEL_CONCEPT.md`) | flujo de eventos/conferencias conceptual |
| 2 | **CRM pasa de demo a real** | ✅ hecho (Fase 2) | `crm-service.ts` conectado a Supabase vía `leads-server.ts` |
| 3 | **Módulo de eventos + importador seguro** | ✅ hecho (Fase 3) | 6 tablas + 5 server libs + importer CLI. Cierra H2 de Fase 2. |
| 4 | **UI admin `/admin/eventos` + WhatsApp manual workflow** | ✅ hecho (Fase 4) | CRUD + tabs + Pipeline view + métricas + WhatsApp follow-up. Branch `feat/admin-eventos` cerrado. |
| 5 | **Notificaciones + audit log + clone/undo** | ✅ hecho (Fase 5) | Resend wrapper + audit log con diff view + clone + undo archivar. Branch `feat/fase-5-planning` cerrado. |
| 6 | **Polish + auditoría + métricas globales** | ✅ hecho (Fase 6) | métricas globales con tooltips + búsqueda libre `q` en audit log + login magic-link fallback + seed demo idempotente. Branch `feat/fase-6-hitos` cerrado. 4 críticos + 7 medios + 1 bajo cerrados. Score 9/10. |
| 7-9 | **CRM Inteligente v2.0 (Fases 1+2+3)** | ✅ hecho (v0.9.0) | borrado lógico + bulk optimistic lock + CSV streaming + conversaciones reales + LVR/SLA/Heat + agente IA. Commits `d150d9d` + `ec9eb55`. 545/545 tests verde. |
| 10 | **CRM Próximo Ciclo — Calendario Real + Tareas + Notificaciones Proactivas** | ⚪ planeada | paginación server-side tabla leads + refactor `name` → `first_name`/`last_name` + alertas SLA outbound (Email + Slack). Ver bloque **En curso** arriba. |
| 11 | **Pagos reales** (Stripe / MercadoPago / Conekta) | ⚪ futuro | reemplazar simulador |
| 11 | **WhatsApp Business API** (templates Meta aprobadas) | ⚪ futuro | outreach proactivo requiere `conf_*` templates |

**Lo que NO se hace todavía** (decisión explícita del cliente):
- Enviar mensajes automáticos por WhatsApp.
- Conectar WhatsApp API.
- Importar confirmados como alumnos (deben pasar por el flow de lead).
- Asumir consentimiento comercial si no está explícito en la encuesta.
- Subir Excels con datos personales al repo.

## Pendientes — decisión de producto (con socios)

- [ ] **Contenido real de cursos** — videos reales (no placeholders de YouTube). Bloqueado: definir qué cursos se producen y cuándo.

## Pendientes — decisiones técnicas

- [ ] **Proveedor de pagos** (MercadoPago / Stripe / Conekta / mix). Costo, comisiones, experiencia para alumno mexicano.
- [ ] **Plantilla de email transaccional** (reset password, bienvenida). Default de Supabase vs custom.
- [ ] **Monitoring de errores en runtime** (Sentry vs nada por ahora).

## NO se hace todavía

- Multi-agente paralelo. Acordado con David: features de tamaño medio se hacen secuenciales en una sesión, documentadas en este roadmap.
- `@playwright/test` framework (Fase 2 de tests E2E) hasta tener CI real en GitHub Actions.
- Load tests hasta tener tráfico real.

---

## Convenciones del repo

- Cada feature nueva va en su propio branch `feat/<nombre>` desde `main` (post-merge del 2026-06-25, ya no se usa `feature/lms-real-foundation` como base estable).
- Merge entre features va a `main` directamente (David da luz verde al cierre de cada fase).
- Commit messages: `feat(...)`, `fix(...)`, `docs(...)`, `chore(...)`, siguiendo conventional commits.
- Antes de pedir review: `npm run type-check && npm run lint && npm run build`.

## Glosario de branches

- `main` — producción. NO se toca sin luz verde. Recibe merges directo de features cerradas.
- `feat/*` — features individuales en desarrollo.
- `fix/*` — bugfixes.
- `docs/*` — cambios solo de documentación.
