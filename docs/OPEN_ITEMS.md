# Open Items — Qlick Marketing Integral

> **Propósito:** Registro vivo de TODO lo que queda pendiente en el
> proyecto. Lo que está acá NO es scope de una fase específica — es la
> "deuda visible" que David y yo debemos trackear entre sesiones para
> no perder nada.
>
> **Cuándo actualizarlo:**
> - Cuando cerramos algo: marcar ✅ o mover a sección "Resueltos reciente".
> - Cuando descubrimos algo nuevo: agregar con severidad.
> - Cuando arrancamos una fase: tachar lo que la fase va a cerrar.
>
> **Severidades:**
> - 🔴 **Crítico** — bloquea producción o tiene riesgo legal/privacidad.
> - 🟠 **Alto** — afecta funcionalidad core o experiencia de uso importante.
> - 🟡 **Medio** — deuda técnica o feature incompleta que tiene workaround.
> - 🟢 **Bajo** — polish, optimización, nice-to-have.
> - ⚪ **Bloqueado** — esperando input de David/sócios o decisión de producto.

---

## 1. Deuda técnica activa

### 🟠 Auditoría externa 2026-06-27 — Hallazgos y cierres

Auditoría externa independiente (sesión separada, sin tocar archivos).
Cierra con commit `cd86f45` (funnel hardening).

**Cerrados en commit `cd86f45`**:

- 🔴 `promoteSurveyToLead` check-then-act race — cerrado con UNIQUE INDEX
  sobre `leads.email` y `leads.phone_normalized` (parcial, NOT NULL) + refactor
  de `createNewLeadForEvent` que captura `23505` y devuelve el existente.
- 🔴 `lead_event_links_unique` mal definido — cerrado cambiando la constraint
  a `(link_type, link_id)`. Cada record de evento (survey, confirmation,
  attendee) se vincula a UN solo lead.
- 🟡 `markSurveyUnmatched` upsert fallaba — cerrado con UNIQUE INDEX
  sobre `event_survey_unmatched.survey_id`. El upsert ahora detecta
  conflict y no duplica.
- 🟡 PII en 5 logs (mock-contact-provider, crm-service, leads-server,
  registrations-server) — cerrado. Logs ahora reportan `nameLength`,
  `emailLength`, `emailDomain`, `tagCount` (no valores crudos).

**Pendientes (no cerrados en el commit)**:

- 🟡 `config.ts:56` mezcla secret en módulo importable por cliente (riesgo
  de frontera, no explotado). Refactor mayor, scope para después del lunes.
- 🟡 `npm audit` no limpio (B-1). xlsx + next/postcss/glob con advisories
  sin fix upstream. Cerrar requiere migrar a `exceljs` o esperar.
- 🟡 H8 `findLeadByPhone` LIMIT 200 (deuda previa, no es race).

**Verificados OK por el auditor** (no requieren acción):

- RLS habilitado en `events`, `event_confirmations`, `event_attendees`,
  `event_surveys`, `event_survey_unmatched`, `lead_event_links`.
- Todos los `/api/admin/**` llaman `requireAdmin()`.
- `consent_to_contact=false` se rechaza en `promoteSurveyToLead`.
- `linkLeadToEventRecord` valida `recordType` contra enum.
- `/api/dev/simulate-webhook` rechaza en producción antes de auth/DB.

**Riesgo residual conocido** (auditor lo mencionó, sin fixing inmediato):
el `ALTER TABLE lead_event_links_unique` puede fallar en producción si
hay datos pre-existentes que violen la nueva constraint (ej. una survey
vinculada a 2 leads por la race previa). Query para detectar antes de
migrar:
```sql
SELECT link_type, link_id, COUNT(*)
FROM public.lead_event_links
GROUP BY link_type, link_id
HAVING COUNT(*) > 1;
```

### 🔴 H2 del QA Fase 2 — Race en `linkLeadToEventRecord` (tags)

**Estado:** ✅ **RESUELTO en Fase 3** (commit `d0acaaa`).
La función ahora usa `lead_event_links` (INSERT-only con UNIQUE) en lugar
de SELECT-then-UPDATE sobre `leads.tags`. Ya no hay race window.

Verificación: test #7 de `_test-fase3.mjs` confirma idempotencia.

### 🟠 H8 del QA Fase 2 — `findLeadByPhone` O(N) en memoria

**Síntoma:** `findLeadByPhone` hace `SELECT * FROM leads WHERE phone IS NOT NULL LIMIT 200` y compara en memoria con `phonesMatch`. Si la base tiene >200 leads con phone y la persona es la #201 al #500, **no la encuentra** → duplicado silencioso en producción.

**Mitigación actual:** aceptable para MVP (todavía no llegamos a 200 leads con phone). Comentado en el código (líneas del leads-server).

**Fix propuesto:** cuando se cree la próxima migration de eventos/agregación, agregar columna `phone_normalized text` + índice funcional `CREATE INDEX ... ON leads (phone_normalized) WHERE phone_normalized IS NOT NULL`. **Scope: Fase 4+.**

### 🟡 H9 del QA Fase 2 — Tags sin validación de shape

**Síntoma:** `leads.tags` es `text[]` libre. Un caller puede meter
`event::test`, `EVENT:UPPER`, `event:slug::::` y se aceptan sin protesta.
Riesgo: duplicación semántica, inyección (tags con `:` rompen parsers),
crecimiento sin control.

**Cambio de contexto:** la trazabilidad lead↔evento ya NO vive en tags
(desde Fase 3 va por `lead_event_links`). Tags siguen siendo metadata
libre. Riesgo residual bajo.

**Fix propuesto:** validador runtime `isValidEventTag(slug)` en server lib. **Scope: Fase 4+ (baja prioridad).**

### 🟡 H10 del QA Fase 2 — `linkLeadToEventRecord` no valida `recordType`

**Estado:** ✅ **RESUELTO** (2026-06-27 ~02:59).

`linkLeadToEventRecord` ahora valida el valor de `recordType` contra
`VALID_RECORD_TYPES = ['confirmation','attendee','survey']` antes de
intentar el insert. Si llega un valor fuera del enum (via JSON sin tipo),
devuelve `{ ok: false, note: 'recordType inválido: "X". Valores
aceptados: confirmation, attendee, survey.' }` en vez de romperse en
la CHECK constraint con un error críptico. Cierra H10.

### 🟡 H11 del QA Fase 2 — Sin GIN index en `leads.tags`

**Síntoma:** queries del estilo `WHERE tags @> ARRAY['event:uabc-km43']`
son seq scan sobre la tabla. Con 100 leads, OK. Con 10k, molesto. Con
100k, problema.

**Cambio de contexto:** con Fase 3, las queries de trazabilidad lead↔evento
van por `lead_event_links` (que sí tiene índice FK). Tags en `leads`
siguen siendo metadata libre. Riesgo residual bajo.

**Fix propuesto:** `CREATE INDEX leads_tags_gin ON leads USING gin (tags);`. **Scope: Fase 4+ (cuando se agreguen queries por tag).**

### 🟠 B-1 — `xlsx` tiene 5 vulnerabilidades transitive (npm audit)

**Síntoma:** `npm audit` reporta 1 moderate + 5 high en deps transitive
de `xlsx`. No son críticas para un script CLI que lee archivos locales,
pero el reporte queda sucio.

**Mitigación actual:** ninguna. Aceptable para MVP.

**Fix propuesto:** considerar migrar a `exceljs` (mantenida, menos transitive deps) si los reportes se vuelven un problema. **Scope: si pasa a Fase 5 con CI/CD.**

### ✅ B-6 — `runEventImport` hacía inserts SECUENCIALES (perf)

**Estado:** ✅ **RESUELTO** (2026-06-27 ~14:00).

Reemplazado el `for-await` secuencial por chunks paralelos via
`Promise.allSettled` con `CHUNK_SIZE = 15`. Filas no-insertables se
filtran primero (sin gastar round-trips). Cada insert es independiente
(dedup atómico por UNIQUE constraint + `importBatchId` para rollback)
y `promoteSurveyToLead` es idempotente, así que no hay race entre
surveys paralelos del mismo chunk. Si un `insertOne` tira inesperadamente
(red, etc.) se cuenta como `skippedInvalid` y se loggea en `warnings` con
`field: "_db"`. ~2x speedup en 170 filas (34s → ~17s) sin saturar el
pool HTTP del admin client ni el de PostgREST. `type-check` + `lint`
limpios.

**Verificación end-to-end:** ✅ David corrió el wizard con un Excel real
post-merge y confirmó que el import termina rápido (sin capturar
métricas exactas). `type-check` + `lint` limpios. Si en el futuro se
quiere medir formalmente el delta, importar un Excel de ≥100 filas
dos veces (antes/después) desde este mismo commit y comparar
`durationMs` del summary.

### 🟢 C-1 — Inconsistencia `LessonVideoProvider "external"` (deuda previa LMS)

**Síntoma:** `LessonVideoProvider` tiene `"external"` en la CHECK constraint
de la DB pero NO en el TS type (solo `"youtube" | "vimeo" | "mp4"`).

**Fix propuesto:** agregar `"external"` al TS type. 1 línea. **Scope: pendiente sin fase asignada.**

### 🟢 C-2 — `masterclass-funnel-foundation` branch sin mergear

**Síntoma:** existe la rama `feature/masterclass-funnel-foundation` en
remotes pero nunca mergeada a main. Si David la necesita en main, hay
que mergear.

**Estado actual:** no es bloqueante para nada (las masterclasses existentes funcionan independientemente). Documentado en ROADMAP.

### 🟠 C-3 — `surveyUnmatchedCount` approximation en `getAdminEvents`

**Síntoma:** `src/lib/events/events-server.ts:getAdminEvents` calcula
`surveyUnmatchedCount` con `Math.round(unmatchedTotal / events.length)`.
Esto da una suma visual inconsistente: si hay 11 unmatched y 5 eventos,
cada card muestra "2" → la suma es 10, no 11.

**Origen:** bug pre-existente del server lib de Fase 3, detectado en
auditoría del paso 1 de Fase 4 (2026-06-26). No es del UI del paso 1.

**Fix propuesto:** cambiar `getAdminEvents` para hacer un SELECT adicional
con `event_surveys.event_id` joined a `event_survey_unmatched.survey_id`,
agrupado por `event_id`. Query simple, mismo patrón que el conteo de
`leadsPromoted`. **Scope: cuando se toque `getAdminEvents` por otra razón.**

### 🟠 B-3 — Contadores globales en cards de eventos (sessions 2026-06-27)

**Estado:** ✅ **RESUELTO en commit `6d333c8`** (2026-06-27 ~02:18).

`getAdminEvents` ya no usa `count: "exact", head: true` sin GROUP BY.
Ahora selecciona `event_id` y cuenta en memoria con Map<eventId, count>.
Las 5 queries devuelven conteos por evento (incluido `surveyUnmatchedCount`
via JOIN con `event_surveys`). Cierra también el sub-caso del C-3.

Verificación visual: evento "QA Fase 4 — Demo" muestra 5/3/3/1 (sus
reales), evento "Ejemplo" (sin datos) muestra 0/0/0/0.

### 🟢 B-4 — Navbar "Mi panel" manda a `/dashboard` (alumnos) para admins

**Estado:** ✅ **RESUELTO** (2026-06-27 ~02:59).

`Navbar.tsx` ahora hace el href contextual:
`href={isAdmin ? "/admin" : "/dashboard"}` (desktop y mobile). Aplicado
tanto en el botón desktop (línea ~161) como en el mobile menu (~253).
Cierra B-4.

### ✅ B-5 — Cover image de evento sobresale del card en `/admin/eventos`

**Estado:** ✅ **RESUELTO** (2026-06-27 ~20:18, commit `8900bed`).

**Decisión final:** quitar la `<img>` de cover en el flujo público y
dejar siempre el gradiente de marca (`bg-brand-gradient`). El bug de
overflow queda cerrado por construcción — no hay `<img>` que pueda
desbordar. Cambios:

- `src/app/eventos/page.tsx` → `EventCard` siempre usa gradiente + emoji 🎟️
- `src/app/eventos/[slug]/EventView.tsx` → hero sin imagen (solo tipografía + meta)
- `src/app/eventos/[slug]/page.tsx` → OpenGraph metadata sin `images`

El campo `cover_image_url` en DB se conserva (no se borra) por compat
con imports previos. Si en el futuro se reactiva la cover image,
agregar como nuevo B-XX con scope definido (asset pipeline + decisión
de quién sube las imágenes).

**Historia del debug** (4 intentos previos, todos fallaron):

4 intentos + DevTools diagnosticaron que el `<img>` SÍ recibe `height:
128px` + `object-fit: cover` correctamente, pero el Card padre con
`flex flex-col` hace que los flex items crezcan (align-items: stretch
default), sobrescribiendo los 128px. Wrapper dedicado con altura
fija + overflow hidden aplicado en commit `cfe993b` — David reportó
que sigue fallando, lo cual sugiere que el problema es más profundo
(quizá el normalize de Tailwind `img { height: auto }` está ganando
contra el style del wrapper, o el browser está cacheando HTML viejo).

Cierre por owner: en lugar de seguir debugueando el render del `<img>`,
se optó por eliminar la dependencia. Pragmático, sin workaround
parcial, mobile-friendly por default (gradiente no requiere asset
externo).

**Severity al cierre:** 🟡 → ⚪.

---

### ✅ B-2 — Calendario CRM no renderiza `crm_tasks` (sesión 2026-06-27)

**Estado:** ✅ **RESUELTO en commit `3d56caa`** (2026-06-27 ~01:29).

El Calendario del CRM (`CRMView.tsx`) ahora pinta 3 cards, no 1:

- **Próximas citas** — `appts` (citas comerciales agendadas, igual que antes).
- **Tareas vencidas** — `crm_tasks` con `status='pending'` y `due_at < ahora`.
  Solo aparece si `overdue.length > 0`, con borde rojo.
- **Tareas de seguimiento** — `crm_tasks` con `status='pending'` y
  `due_at >= ahora` o sin fecha. Incluye todas las tareas próximas.

Implementación:
- `tasks-server.ts:getAllPendingTasks()` — particiona todas las tareas
  pendientes (no por lead, globales) en `overdue`/`upcoming`.
- `/api/admin/crm/tasks` — endpoint protegido por `requireAdmin()`.
- `ops-client.ts:fetchPendingCRMTasks()` + tipo `PendingTasksSplitClient`.
- `CRMView.tsx` — estado + fetch en `useEffect` + UI con 3 cards +
  sub-componente `CalendarTaskRow` + mapper mock→row para que el
  Calendario también funcione en modo demo (no solo real).

Cada `CalendarTaskRow` es clickeable → abre el drawer del lead asociado.
La nota al pie explica el modelo (appts = agendadas, crm_tasks = internas)
y menciona el campo `externalCalendarId` listo para sync futura con
Google Calendar.

Verificación pendiente (visual con sesión admin): confirmar que la tarea
vencida "Tarea 1" (en DB, due 2026-06-27) se renderiza en la card roja
del Calendario.

---

## 2. Features pendientes por fase

### Fase 4 — UI Admin `/admin/eventos` + WhatsApp manual

**Status:** ⚪ No iniciada. Esperando luz verde.

**Scope: COMPLETO, no MVP.** David (2026-06-26): "mientras más completo
mejor, recuerda que al final será la plataforma oficial". Si algo se
corta, conversamos antes — no propongo acotar de entrada.

**Scope completo (del doc `EVENTS_FUNNEL_FOUNDATION.md` §9 + decisión
2026-06-26):**
- [ ] `/admin/eventos` lista de eventos con cards (cards con conteos: confirmations, attendees, surveys, leads promovidos)
- [ ] `/admin/eventos/[id]` detalle con 4 tabs:
  - Confirmados (tabla + búsqueda + filtro por source)
  - Asistentes (tabla + match manual con confirmation si no matchea)
  - Encuestas (tabla con `consent_to_contact` visible, marcar como revisadas)
  - Leads promovidos (lista linked al evento, drawer del lead)
- [ ] Wizard de import:
  - Upload `.xlsx` (drag & drop)
  - Preview con mapping de headers (auto-detect + override)
  - Confirmar import con reporte (inserted/duplicates/invalid/warnings)
  - Opción de `--dry-run` desde el browser (sin tocar DB)
- [ ] Drawer del lead con badge "📅 Vino de evento X, encuesta Y, interés Z"
- [ ] WhatsApp manual workflow completo:
  - `buildWhatsAppMessage(lead, event)` server-side (template con placeholders)
  - Botón "Generar WhatsApp" → abre `wa.me/...?text=...` en nueva pestaña
  - Estados: `no_contactado` → `mensaje_preparado` → `contactado` → `respondió` → `interested`/`lost`
  - Audit log de cada mensaje enviado (en `lead_interactions` o `admin_audit_log`)
- [ ] Server action público: `/eventos/[slug]` con form de "registrarme" (igual que masterclass funnel)
- [ ] **CRUD admin de eventos** (era "Fase 5" en el roadmap, lo subimos acá por scope completo): crear/editar/archivar eventos desde el panel sin tocar SQL
- [ ] **Drawer del evento** con métricas: total inscritos vs asistentes vs leads promovidos vs conversion rate

**Out of scope (queda para Fase 5+):**
- Notificaciones automáticas por email (requiere SMTP)
- WhatsApp Business API (requiere Meta Cloud / BSP)
- Multi-evento en un Excel
- NLP sobre respuestas libres de encuesta

**Dependencias:**
- Migration nueva opcional para `phone_normalized` (cierra H8, recomendable incluirla)
- Posible nueva columna en `events` para `cover_image_url` upload desde el admin (ya existe en la tabla, falta UI)
- Dep `exceljs` o seguir con `xlsx`

**Criterio de "done" para Fase 4 (más estricto que MVP):**
- Todas las funciones de admin accesibles vía browser autenticado
- Sin fallback demo en producción (solo dev)
- Empty states diseñados (no "Error" genérico)
- Loading states explícitos (no "Loading..." eterno)
- Mobile-friendly básico (la mayoría de admin se usa en desktop, pero no debe romperse en mobile)
- Documentación de uso en `docs/EVENTS_ADMIN_GUIDE.md`

### Fase 5 — Notificaciones automáticas + admin CRUD

- [ ] Email al admin cuando entra survey con consent (requiere SMTP — Resend / SendGrid)
- [ ] CRUD admin completo de eventos desde panel sin tocar SQL

### Fase 6+ — Backend

- [ ] WhatsApp Business API (Meta Cloud / BSP) — reemplazar el workflow manual
- [ ] Multi-evento en un solo Excel (D-8 del concept)
- [ ] Análisis de sentimiento sobre respuestas libres de encuesta

---

## 3. Deuda del roadmap previo (LMS / Masterclass)

### Roadmap item 0 — LMS al 100%

- [ ] Catálogo real: los 4 cursos siguen duplicados entre `src/lib/data/courses.ts` y la DB (seed). Cuando David defina el catálogo final con sócios, eliminar el mock.
- [ ] Pendiente: test E2E de pagos con cuenta NO-admin.

### Roadmap item 5 — Pagos (adapters)

- [ ] Decisión abierta: MercadoPago / Stripe / Conekta / mix.
- [ ] Stubs ya existen (`src/lib/payments/`), falta reemplazar por adapter real con credenciales.

### Roadmap item 6 — Onboarding del alumno

- [ ] Scope exacto abierto (tooltips vs tour modal vs emails).
- [ ] Bloqueado hasta definir UX con socios.

### Roadmap item 7 — Tests automáticos (Vitest + SQL)

- [ ] `_test-fase2.mjs` y `_test-fase3.mjs` funcionan pero son scripts ad-hoc, no tests automatizados.
- [ ] Vitest con `unstable_vitest_node` en Postgres local podría cubrir Fase 2/3 server libs.

---

## 4. Decisiones pendientes con socios

### 🟠 Proveedor de pagos

**Bloqueado:** esperando decisión de David con socios sobre MercadoPago vs Stripe vs Conekta vs mix.

**Impacto:** roadmap item 5 + cualquier flujo de inscripción paid.

**Costo/comisiones/tiempo de implementación** varía por proveedor. Recomiendo MercadoPago para MX (audiencia principal) + Stripe como backup para USD.

### 🟠 Contenido real de cursos

**Bloqueado:** los videos de los 4 cursos siguen siendo placeholders de YouTube (no originales).

**Impacto:** el LMS funciona, pero la propuesta de valor "cursos de marketing de Qlick" está vacía sin contenido real.

**Decisión necesaria:** ¿qué cursos producir primero y cuándo?

### 🟡 Plantilla de email transaccional

**Bloqueado:** default de Supabase Auth vs custom branded.

**Impacto:** bienvenida, reset password, confirmaciones.

### 🟡 Monitoring de errores en runtime

**Bloqueado:** Sentry vs nada.

**Impacto:** debug en producción. Hoy los logs son la única fuente.

---

## 5. Watchlist (no bloqueante, para tener presente)

### Memory note — David en periodo de prueba con agencia

- Acuerdo verbal: sueldo base 40,000 MXN/mes + 25% de ganancias propias.
- Línea divisoria: "lo que construyamos a partir de mí es mío".
- Implicación: herramientas propias (Higgsfield, video UGC, productos
  paralelos) son ingreso personal, no de la agencia.

### Memory note — Higgsfield MCP setup existe pero no suscrito

- MCP server configurado y autenticado en el runtime de David.
- Imagen del influencer "Jean" ya creada (job_id `c08f1fbb-7c61-4fa0-bb43-79d271dd78a2`).
- Balance: ~8 créditos restantes (solo imagen, no video).
- Pendiente: decidir si se suscribe a Starter PLUS ($15/mes) para video UGC.
- Plan tentativo: ofrecer video UGC como servicio de agencia (25%) Y revender por su cuenta (100%). Formalizar empresa separada (RESICO) cuando el volumen lo justifique.

### Memory note — Multi-agente NO por ahora

Acordado en sesión del 2026-06-26: features de tamaño medio se hacen
secuenciales en una sesión, documentadas en `ROADMAP.md`. Para planes
multi-agente, dividir en <8 archivos o aceptar partial-state.

---

## 6. Resueltos reciente

### ✅ B-2 — Cierre de paperwork (2026-06-27 ~17:00)

B-2 ya estaba **resuelto en código** desde el commit `3d56caa` (David,
2026-06-27 ~01:29) pero el doc quedó desactualizado (doc-rot). Detectado
en pasada de QA visual al retomar la sesión. Cierre puro de paperwork:

- Marcado como ✅ en la sección 1 (deuda técnica activa).
- Esta entrada en "Resueltos reciente" como rastro.

Implementación validada por lectura de código:
- `CRMView.tsx` (líneas 334-425) pinta 3 cards en el Calendario.
- `tasks-server.ts:getAllPendingTasks()` particiona global por `due_at`.
- `fetchPendingCRMTasks()` ya está integrado en el `useEffect` del CRM.
- `CalendarTaskRow` clickeable → abre drawer del lead.

Verificación visual con sesión admin sigue pendiente — David puede abrir
`/admin` → tab CRM → sub-tab Calendario y debería ver la tarea vencida
"Tarea 1" (en DB desde hoy temprano) en la card con borde rojo.

### ✅ Validación visual del fix single-column en `/eventos/[slug]` (2026-06-27 ~16:45)

Commit `e0df5ab fix(events): single-column en /eventos/[slug] — form prominente`
quedó **validado visualmente** tomando screenshot fullPage de
`/eventos/qa-fase4-demo` con Playwright MCP en viewport ~907×1328:

- Header limpio, badge "Evento Qlick", título grande, meta (cuándo/lugar).
- CTA primario "Confirmar asistencia ↓" en el hero; el ↓ empuja al form.
- Separación amplia (intencional, scroll-margin) entre hero y form.
- Form single-column en card blanco con sombra: Nombre (full) →
  Email + Teléfono (50/50) → checkbox consentimiento → CTA "Confirmar
  asistencia" prominente → microcopy de baja.
- Footer con 4 columnas.

Jerarquía visual correcta, mobile-friendly, el form domina la página como
debe. Fix cumple su objetivo: **registro sin fricción**.

### ✅ Fase 3 — Events Funnel Foundation (v0.7.0)

12 commits, branch `feat/events-funnel-foundation`, mergeado a main
post-limpieza de docs. Detalle completo en `EVENTS_FUNNEL_FOUNDATION.md`.

- Migration `20260627000000_events_funnel.sql` aplicada.
- 6 tablas nuevas + 4 enums + RLS.
- 5 server libs (events, confirmations, attendees, surveys, promotion).
- Importer CLI con `xlsx` (acotado al CLI).
- 37/37 tests unitarios + 7/7 end-to-end contra Supabase real.

### ✅ Cierre del QA round 1 de Fase 2 (commit `20883aa`)

- H3: PII fuera de logs (`emailLength` en vez de `email`)
- H4: `createLead` falla ruidoso en lugar de enmascarar con demo
- H5: `updateLeadStatus` con SELECT previo + UPDATE atómico + audit log con from/to
- H6: `createLeadFromEvent` rechaza sin email/phone
- H12: `phonesMatch` en import estático
- **H1+H2 diferidos** — H2 ahora ✅ cerrado por Fase 3.

### ✅ Fase 2 — CRM Real Foundation para Eventos (v0.6.0)

6 commits, branch cerrado y mergeado.
- 5 funciones: `findLeadByEmail`, `findLeadByPhone`, `createLeadFromEvent`,
  `linkLeadToEventRecord` (era STUB, ahora es real en Fase 3),
  `updateLeadCommercialStatus`.
- 14 unit tests + 9 tests manuales.
- Doc `FASE_2_CRM_FOUNDATION.md`.
