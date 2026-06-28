# Changelog — Qlick Marketing Integral

> Release notes consolidadas. Una sección por release significativo (no por commit).
>
> Convención: [Keep a Changelog](https://keepachangelog.com) en español.
> Tipos: **Added** (feature nuevo), **Changed** (cambio compatible), **Fixed** (bug fix),
> **Deprecated**, **Removed**, **Security**, **Internal** (refactor / paperwork).

---

## [Unreleased] — Fase 5 (Admin notificaciones + audit log + clone/undo)

**Branch:** `feat/fase-5-planning` (11 commits desde 2026-06-28).
**Status:** 🟡 Funcional + tested, pendiente merge a `main` post-review de David.
**Prereq:** `feat/admin-eventos` (Fase 4) mergeado a `main` primero.

### Added

#### Notificaciones por email (Paquete B)

- **Resend wrapper** (`src/lib/email/resend-client.ts`) — funciona en dev mode (loggea en consola sin API key), fail-safe (no rompe la operación principal si falla el send), normaliza recipients CSV → array.
- **Template `survey-with-consent`** (`src/lib/email/templates/survey-with-consent.ts`) — HTML inline con brand colors, NO PII en subject (anti-spam), escapea HTML para evitar inyección, link al drawer del lead con `&amp;` correcto.
- **Trigger automático** (`src/lib/events/promotion.ts`) — al `promoteSurveyToLead` crear un lead nuevo → manda email al admin. Best-effort: si falla, NO rollbackea.
- **Doc `SMTP_SETUP.md`** — guía paso a paso para David configurar Resend (signup → DNS → API key → test).

#### Audit log de admin (Paquete C)

- **Migration `20260629000000_admin_audit_log_diff.sql`** — additive `ALTER TABLE` para agregar `before`/`after` columns (snapshots JSONB). Compatible con installs existentes (entrys viejas quedan con null).
- **`logAdminAction` extendido** — ahora acepta `before` + `after` snapshots. Compatible con callers viejos (campos opcionales).
- **Events integration** — `createEvent`, `updateEvent`, `updateEventStatus` pasan snapshots completos del estado.
- **`listAuditLogs`** (server lib) — filtros por actor/entity/action/fechas + paginación + `total` count.
- **Página `/admin/system/audit-log`** — tabla paginada con filtros URL-driven (admin/entity/acción/fechas), badge de acción coloreado, **diff view expandible** (rojo `before` vs verde `after`).

#### Clone + Undo archivar (Paquete D)

- **`cloneEvent`** (server lib) — genera slug único (`<slug>-copia` / `-copia-N`, limpia sufijos previos; max 50 intentos), título con ` (Copia)`, status=`draft` FORZADO. NO copia confirmados/asistentes/encuestas/leads.
- **POST `/api/admin/events/[id]/clone`** — route handler protegido por `requireAdmin`, devuelve `{ event, sourceEvent }`.
- **Botón "📋 Clonar evento"** en EventDrawer (footer modo edit) — fila separada con hint "La copia queda en borrador".
- **Toast "Clonado — Abrir"** con link al clon (no auto-dismiss).
- **Undo archivar** — toast no-bloqueante con botón "Deshacer" (vuelve a `draft`) + barrita de progreso animada + auto-dismiss en 5s.
- **Accesibilidad del toast** — `role="status"` con `aria-live="polite"` para undo/info, `role="alert"` para errores. Respeta `prefers-reduced-motion`.
- **Audit log**: action `event_clone` con `metadata.source_event_id` + snapshots before/after.

### Internal

- **CSS** (`globals.css`): keyframe `toast-progress` (5s linear) + media query `prefers-reduced-motion`.
- **Barrel update** (`src/lib/events/index.ts`): re-exporta `cloneEvent`.

### Tests

- 110/110 pasando (sin cambios — el flujo ya está cubierto por los tests de createEvent/updateEvent existentes; undo/clone no agregan lógica nueva que rompa los tests). E2E manual en `EVENTS_ADMIN_GUIDE.md` §10.

---

## [v0.10.0] — Fase 4 (Admin `/admin/eventos` + WhatsApp manual) — 2026-06-28

**Branch:** `feat/admin-eventos` (~30 commits desde 2026-06-27).
**Status:** ✅ Funcional. Pendiente merge a `main` post-review de David.

### Added

#### Admin de eventos (`/admin/eventos`)

- Lista de eventos con cards y conteos en vivo (confirmados / asistentes / encuestas / leads promovidos).
- Detalle del evento con 4 tabs navegables (Confirmados / Asistentes / Encuestas / Leads promovidos).
- Vista Pipeline kanban 5 columnas (toggle desde el detail).
- Métricas de funnel en vivo (conversion rates entre etapas).
- Búsqueda + filtro por fuente en tab Confirmados.
- Búsqueda y match manual attendee ↔ confirmation con dropdown de candidatos.
- Marcar/des-marcar encuestas como revisadas (`reviewed_at` + `reviewed_by`).
- Acciones de WhatsApp por fila + broadcast pre-armado para todos los confirmados.

#### Wizard de import xlsx (`/admin/eventos/[id]/import`)

- Upload drag & drop de `.xlsx`.
- Auto-detección de headers vía sinonimos ES + EN + fuzzy match (determinista, no AI).
- Dry-run antes de tocar DB con preview de inserted / duplicates / invalid / warnings.
- Override manual de headers con `--map` JSON.
- Formato estricto documentado en `docs/IMPORT_FORMAT.md`.
- Idempotencia: `importBatchId` único por run, dedup atómico por UNIQUE constraint.
- Report con warnings de data quality por fila.

#### CRM drawer del lead

- Badge "📅 Vino de evento X, encuesta Y, interés Z" en el header.
- Historial de contactos (`lead_interactions`): badges dirección (inbound/outbound/system) + canal (whatsapp/email/phone/form/system) + form para registrar nuevo.
- Drawer con: datos, cambiar etapa, WhatsApp actions, conversación IA (demo), notas, tareas, citas, sugerencias IA (demo).

#### WhatsApp workflow

- Estados por lead: `no_contactado` → `mensaje_preparado` → `contactado` → `respondió` → `interested` / `lost`.
- Audit log en `lead_whatsapp_log` (template usado, message preview, sent_by, sent_at).

#### Admin polish (Bloque 3)

- **3A** — `EmptyState` component reutilizable con icono + título + descripción + CTA.
- **3B** — `SubmitButton` con estado pending via `useFormStatus` + aplicado en 5 forms.
- **3C** — Error boundary global en `/admin/**`.
- **3D** — 5 `loading.tsx` skeletons + `AdminView` interno.
- **3E** — Validación inline con `aria-invalid` + `role="alert"` + mensajes accionables.
- **3F** — Mobile polish (375×812 verificado con Playwright MCP, 0 horizontal overflow).

#### Dev tooling

- Endpoint `/api/dev/login` (POST one-shot) + script `tests/playwright/dev-login.mjs`.
- Doc `docs/DEV_LOGIN_BYPASS.md` con uso desde Playwright MCP.

### Changed

- `AdminView` ahora muestra skeleton en `ready=false` (en vez de texto plano "Cargando panel…").
- EventDrawer cambia de error banner genérico a errores per-field inline.
- LeadDetailDrawer (notas/tareas/interacciones) usa `<Field error>` para validación inline.
- `Field` component extendido con `error` + `required` props; auto-inyecta `aria-invalid` + `aria-describedby` en Input/Textarea hijos.

### Fixed

- **Fuzzy match de headers cortos** (`importer.ts`): un edit en strings ≤3 chars matcheaba
  cualquier cosa (ej: "Foo" → "ok" con Levenshtein 2, false positive). Ahora fuzzy match
  desactivado para minLen ≤3 (exact match sigue funcionando). Cierra 2 tests pre-existentes.
- **CRM Próximas citas** (`CRMView.tsx`): el badge decía "1 agendadas" pero la lista mostraba
  6 (incluyendo "No asistió" y "Completada"). Fix: usar `upcomingAppts.map` en vez de `appts.map`.
- **Hydration warning en Input.tsx**: agregado `suppressHydrationWarning` a `<input>` y `<textarea>`
  (patrón Next.js para password managers).
- **Typo en seed del taller funnels-vente**: "disenar"/"conversion" sin acentos → "diseñar"/"conversión".

### Security

- Auditoría externa 2026-06-27: race en `promoteSurveyToLead` cerrada con UNIQUE INDEX;
  PII fuera de logs (`emailLength`/`emailDomain` en vez de emails crudos);
  `link_event_unique` redefinida como `(link_type, link_id)`.
- RLS habilitado en todas las tablas de eventos (`events`, `event_confirmations`,
  `event_attendees`, `event_surveys`, `event_survey_unmatched`, `lead_event_links`).
- Todos los `/api/admin/**` llaman `requireAdmin()` (defensa en profundidad).

### Internal

- 9 server libs (events / confirmations / attendees / surveys / promotion + ops-client).
- 6 tablas nuevas + 4 enums + RLS.
- Migrations aplicadas: `20260627000000_events_funnel.sql` (Fase 3) +
  `20260627010000_funnel_hardening.sql` + `20260627020000_survey_reviewed.sql` +
  `20260628000000_whatsapp_followup.sql`.
- Tests: 98/98 pasando.
- Docs nuevos: `EVENTS_ADMIN_GUIDE.md`, `AUDIT_REPORT.md` (referencia), `demo-socios.html`,
  actualizaciones a `OPEN_ITEMS.md`, `ROADMAP.md`.

---

## [v0.7.0] — Fase 3 (Events Funnel Foundation) — 2026-06-26

**Branch:** `feat/events-funnel-foundation` → mergeado a `main`.

### Added

- Schema de eventos: 6 tablas + 4 enums + RLS.
- 5 server libs: events / confirmations / attendees / surveys / promotion.
- Mapper row ↔ dominio + typegen provisional.
- Importer CLI con parser tolerante a headers variables.
- Barrel `src/lib/events/index.ts` como fachada pública.
- 37 unit tests + 7 end-to-end contra Supabase real.

### Fixed

- Cierre del H2 del QA Fase 2 (race condition en tags): `linkLeadToEventRecord` ahora usa
  `lead_event_links` (INSERT-only con UNIQUE) en vez de SELECT-then-UPDATE sobre `leads.tags`.

---

## [v0.9.0] — LMS Real Foundation — 2026-06-25

**Branch:** `feature/lms-real-foundation` → mergeado a `main`.

### Added

- DB: 5 tablas + RLS para LMS.
- Server libs: `getCourseById`, `getCourseBySlug`, `enrollUserInCourse`.
- Google OAuth (reemplaza magic link).
- QR enrollment con tracking `source` + página `/inscripcion/[slug]`.
- Fallbacks automáticos (UUID legacy → mock fallback).
- Seed script (idempotente): 4 cursos + 12 módulos + 36 lecciones.
- Tour Playwright con 7 screenshots + cross-check de DB.

---

## [v1.0.x] — Entitlements — 2026-06-25

**Branch:** `feature/qlick-entitlements` → mergeado a `main`.

### Added

- Schema con `courses.access_type`, tablas `course_access` + `payments` con RLS.
- 1 curso paid ($499 MXN) + 3 free.
- Server lib `src/lib/lms/entitlements.ts` con `getCourseAccess`, `checkCourseAccess`,
  `grantAccess`, `revokeAccess` (idempotente).
- Endpoint `POST /api/dev/simulate-webhook` + página `/pagar/[courseSlug]` con SimulatorForm.
- Auditoría de uso (5 críticos arreglados).

---

## Notas de proceso

- Cada release tiene branch dedicado (`feat/<feature>`, `feature/<feature>`) y se mergea a `main`
  después de luz verde explícita de David.
- OPEN_ITEMS.md es la lista viva de deuda activa + features pendientes. Se actualiza cada sesión.
- ROADMAP.md tiene el plan estratégico por fase. Se actualiza al cerrar fase.
- EVENTS_ADMIN_GUIDE.md es el manual operativo del admin (post-Fase 4).