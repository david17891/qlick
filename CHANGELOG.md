# Changelog — Qlick Marketing Integral

> Release notes consolidadas. Una sección por release significativo (no por commit).
>
> Convención: [Keep a Changelog](https://keepachangelog.com) en español.
> Tipos: **Added** (feature nuevo), **Changed** (cambio compatible), **Fixed** (bug fix),
> **Deprecated**, **Removed**, **Security**, **Internal** (refactor / paperwork).

---

## [v0.8.0] — Wizard WhatsApp funcional + Español MX — 2026-07-06

**Tag:** `v0.8.0` (rollback target estable)
**Branch:** `main` (HEAD post-tag)
**Handoff:** `docs/HANDOFF_v0.8.0_FUNCIONAL.md`
**Tests:** 535/535 verde · type-check ✓ · lint ✓ (0 warnings) · build ✓

Este release acumula los clusters **G-15 r1-r7** (wizard funcional + UI admin
mejorada + copy MX) más la **Fase name capture** previa. Cierra el ciclo
donde el wizard de encuesta post-evento WhatsApp funciona end-to-end sin
que el LLM "robe" turnos del flow conversacional, y todo el copy user-facing
suena en español mexicano consistente.

### Added

- **Wizard de encuesta WhatsApp end-to-end (G-15 r1-r5)**
  - Detección de buttonId formato dinámico (`survey_q1_clarity_very_clear`) +
    legacy (`survey_q1_very_clear`) unificada en `detectSurveyButtonAny`
    (`src/lib/whatsapp/survey-wizard.ts`).
  - Síntesis de buttonId desde texto crudo cuando Meta omite el field
    (dudupe/retry/button reply reentrega) — `synthesizeSurveyOptionFromText`
    + `buildDynamicButtonIdFromOption`.
  - Nuevo intent `survey_q_consent_continue` — "Sí" en q_consent avanza a
    q_business (step 5), "No" cierra. `survey_q4_text/skip` aceptan step 4 OR 5.
  - `consent_to_contact` derivado de `responses.q_consent` explícito
    (yes→true, no→false), fallback a `businessCaptured` si ausente.
- **Admin panel `/admin/eventos/[id]` mejorado (G-15 r4)**
  - Tab Encuestas con rama "dynamic" en `detectSurveyShape` que formatea
    labels legibles (incluye `Consentimiento: Sí/No`).
  - Tab Leads promovidos renderiza badges inline (🎯 Score, HOT/WARM/MQL/
    COLD con tone según bucket, ✓ Consent).
  - `mapLeadRowToLead` ahora incluye `score`, `qualification`,
    `surveyOfferSentAt` con cast explícito (typegen stale).
  - `PipelineCard` acepta props opcionales `score/qualification` y renderiza
    badges cuando están presentes.
- **Documentación de release**
  - `docs/HANDOFF_v0.8.0_FUNCIONAL.md` (handoff completo).
  - `docs/STATUS.md` snapshot v0.8.0.
  - `docs/ROADMAP.md` entrada v0.8.0.
  - Este CHANGELOG.
  - Tag Git `v0.8.0` pusheado.

### Changed

- **Cierre del wizard ahora manda 1 solo mensaje (G-15 r5)**
  - Removido el send del follow-up bucket HOT/MQL/coldWarm del close path
    (`survey_q4_text` + `survey_q_consent_continue`).
  - Solo thank-you estándar de cierre. Consistente entre path texto y path
    Saltar. Sin mensaje fantasma que aparezca en WhatsApp pero no en DB.
  - Si el admin quiere disparar bucket follow-up, debe usar
    `/api/events/:id/send-survey-offers` desde el panel.
- **Copy 100% español mexicano (G-15 r6-r7)**
  - 8 archivos del WhatsApp bot outbound + emails transaccionales arreglados.
  - 12 archivos de páginas web admin/student/staff + LLM system prompt
    arreglados.
  - **Mappings aplicados:** voseo → tuteo (`querés` → `quieres`, `tenés` →
    `tienes`, etc.), `escribinos` → `escríbenos`, `contanos` → `cuéntanos`,
    `por acá` → `por aquí`, `Disculpá` → `Disculpa`, `respondé` → `responde`.

### Fixed

- **Bug G-15 r0 (David 2026-07-06 12:36):** "Muy claro no avanza wizard" —
  Meta omite buttonId en dedupe/retry; ahora sintetizamos desde texto.
- **Bug G-15 r3 (David 2026-07-06 13:30):** "Encuestas=0, Leads promovidos=0,
  no me da info del lead" — q_consent ahora persiste, consent_to_contact se
  deriva correctamente, formato dinámico soportado en UI.
- **Bug G-15 r5 (David 2026-07-06 14:55):** "Mensaje extra en cierre wizard" —
  follow-up bucket duplicaba el thank-you; ahora solo thank-you.
- **Bug G-15 r6 (David 2026-07-06 15:10):** "Contanos/escribinos/por acá
  no se dicen en español mexicano" — todos los archivos user-facing migrados.

### Internal

- 5 nuevos tests para formato dinámico en `survey-display.test.mjs`.
- Tests existentes actualizados para validar `detectSurveyButtonAny` con
  ambos formatos (legacy + dinámico) — 12 nuevos tests en
  `survey-button-detection.test.mjs`.
- 14 tests en `survey-text-fallback.test.mjs` para
  `synthesizeSurveyButtonFromText`.
- LLM system prompt (`bot-personality-templates.ts:64`) actualizado a
  español mexicano para que no genere voseo en runtime.

### Lecciones aprendidas (para futuras sesiones)

1. **Tests E2E con DB limpia no detectan bugs del path webhook → bot.**
   El E2E del r2 simuló buttonId en formato legacy, pasó, pero prod usa
   formato dinámico. Regla: tests E2E deben usar el formato EXACTO que
   produce prod, no uno equivalente.
2. **Anti-invention trap — NO fabricar comportamiento de servicios.**
   Decir "Supabase detecta tokens pegados en chat y los rota
   automáticamente" sin evidencia es wrong. La razón válida para no pegar
   tokens por chat es solo de seguridad (logs de Mavis son persistentes),
   no comportamiento del servicio.
3. **Fix defensivo NO es aceptable cuando el root cause es identificable.**
   G-15 r0 requería leer logs de Vercel y entender QUE Meta omite
   buttonId, no agregar un regex permisivo.

---

## [Unreleased] — Fase 6 (Polish + auditoría + métricas globales)

**Branch:** `feat/fase-6-hitos` (siguiente branch lógico tras `feat/fase-5-planning`)
**Status:** 🟡 Funcional + tested (110/110), pendiente merge a `main` post-review de David.
**Prereq:** Fase 5 mergeada a `main` primero.

### Added

#### Métricas globales en `/admin/eventos` (Hito C)

- **Header con 6 stat cards agregadas** (Card con grid 2/3/6 responsive):
  - Confirmados totales, Asistentes totales (% sobre confirmados),
    Encuestas completadas, Leads promovidos desde encuestas,
    Encuestas sin match (sin consent), Conversión global.
- **Conversión global solo sobre eventos PASADOS** — excluye eventos próximos
  que aún no tienen leads promovidos. Si no hay eventos pasados, muestra `—`
  en vez de `0%`.
- **Tooltips explicativos en cada stat** — ícono `?` con texto que aclara qué
  mide la métrica y de dónde sale el número (%). Hover/focus accessible.
- **`Tooltip` component reutilizable** (`src/components/ui/Tooltip.tsx`) —
  aria-describedby + title fallback + soporte `align="end"` para tooltips
  cerca del borde derecho del viewport.

#### Búsqueda libre en audit log (Hito C)

- **Input `Búsqueda libre`** en `/admin/system/audit-log` — placeholder
  `"lead, david@, event_clone…"`, persiste en URL como `?q=...`.
- **Server lib `listAuditLogs`** extendido con filtro `q` — OR sobre
  `action`, `actor_email`, `entity_type`, `entity_id` (columnas indexadas).
- **Escape de wildcards** — `%` y `_` se escapan antes de pasarlos a `ilike`
  para evitar resultados inesperados.

#### Login alumno con magic link como fallback (Hito B)

- **`StudentLoginCard`** (`src/app/login/StudentLoginCard.tsx`) — Google OAuth
  sigue siendo el método principal (1 click), magic link reactivado como
  fallback visible con divider "o usa otro método".
- **State preservation** — el `MagicLinkForm` se mantiene siempre montado (solo
  cambia `hidden`), preservando `email` + `sent` cuando el usuario alterna entre
  modos.
- **Microcopy renovada** — "Bienvenido de vuelta · Continúa donde lo dejaste"
  + badge "🔒 Acceso seguro · sin contraseñas" + trust strip "Nunca compartimos
  tu correo ni tu actividad con terceros".

#### Seed demo realista (Hito C — soporte demos)

- **`scripts/seed-demo.mjs`** — seed sintético de eventos + confirmados +
  asistentes + encuestas + leads + WhatsApp log + audit log. Idempotente.
- **NPM scripts** — `npm run seed:demo`, `seed:demo:reset`, `seed:demo:cleanup`.
- **Doc `SEED-DEV.md`** — qué crea, privacidad, cómo usar, cómo funciona la
  idempotencia.

### Fixed

- **C-1** — Audit log del seed ya NO acumula entries por corrida. Check
  `existingAuditEntries` antes del INSERT usando `seed_tag` en metadata.
- **C-2** — Lead WhatsApp log del seed idempotente (preventivo, mismo patrón).
- **C-3** — Docstring de `q` honesto: ya NO afirma buscar en `metadata`.
  Doc dice explícitamente que solo busca en columnas indexadas y cómo
  buscar en metadata si se necesita.
- **C-4** — `entry.entityId.slice(0, 8)` ya NO rompe con null. Render
  defensivo con `entry.entityId ? ... : "—"`.
- **M-7** — Conversion global solo sobre eventos pasados (no distorsionaba
  la métrica incluyendo eventos próximos).

### Security / Privacy

- **Audit seed entries** usan `seed_tag` en metadata que permite cleanup
  selectivo. La página del audit log distingue seed entries de reales
  mediante el filtro `q` o `actorEmail` (admin real = `david@qlick.mx`).

### Internal

- **`src/components/ui/index.ts`** — exporta `Tooltip` + `TooltipProps`.
- **`src/lib/crm/audit-server.ts`** — interface `ListAuditLogsInput` extendida
  con `q`, lógica de escape de wildcards.
- **`src/app/admin/system/audit-log/page.tsx`** — filtros URL-driven ampliados
  con `q`, render defensivo para `entityId` null.

### Docs

- **`docs/FASE-6-AUDIT.md`** — auditoría completa (23 issues: 4 críticos,
  11 medios, 8 bajos) + status post-fix (4 críticos + 3 medios aplicados).
- **`docs/SEED-DEV.md`** — guía del seed.
- **`docs/TECHNICAL-REVIEW.md`** — snapshot técnico del repo a 2026-06-28.
- **`docs/ESTADO-ACTUAL.html`** — vista 1-pager del estado actual.

### Tests

- 110/110 pasando (sin cambios — los fixes no agregan lógica que rompa tests).
- Type-check ✅. Lint ✅. Build ✅.

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