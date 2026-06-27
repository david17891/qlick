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

**Síntoma:** la función valida `!input.recordType` (truthiness) pero no
el valor. Un JSON payload con `recordType: "otro"` se acepta y crea row
con `link_type='otro'`, que no está en el enum `lead_event_link_type`
→ la DB lo rechaza con CHECK constraint.

**Mitigación actual:** el type TS `LeadEventLinkType` lo previene en compile time para callers tipados. JSON payloads sin tipo se rompen en runtime.

**Fix propuesto:** `const LEAD_RECORD_TYPES = ['confirmation','attendee','survey']` + `isLeadEventLinkType()` como hace `updateLeadStatus` con `isLeadStatus`. **Scope: 1 línea, hacerlo en Fase 4.**

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

**Síntoma:** las cards en `/admin/eventos` muestran los MISMOS números
para todos los eventos. Ejemplo observado: evento "QA Fase 4 — Demo" con
5 confirmados / 3 asistentes / 3 encuestas; evento "Ejemplo" recién
creado muestra también 5/3/3 (cuando debería ser 0/0/0). Solo
"leadsPromoted" está bien porque SÍ se calcula por `event_id`.

**Diagnóstico:** en `getAdminEvents` (events-server.ts), los queries de
conteo usan `.in("event_id", eventIds)` con `count: "exact", head: true`
sin GROUP BY → devuelve el TOTAL de filas que matchean cualquier evento,
no por evento. Ese total único se asigna a `confirmationCount`,
`attendeeCount`, `surveyCount` de cada card.

**Origen:** bug pre-existente de Fase 3 server lib, detectado durante
el smoke test del CRUD admin de eventos (2026-06-27 ~01:44). El bug
C-3 (encima) es un sub-caso del mismo problema (mismo patrón).

**Workaround actual:** entrar al detalle del evento (que sí calcula los
conteos filtrando por `event_id` específico) para ver los números
reales. La card global miente.

**Fix propuesto:** cambiar las 3 queries problemáticas para hacer
GROUP BY por event_id y devolver un Map<eventId, count>. Mismo patrón
que ya se usa para `promotedByEvent`. Scope: ~30 min, no requiere
migration. **Severity 🟠 porque David ya tiene 2 eventos y la
información que ve es engañosa.**

### 🟢 B-4 — Navbar "Mi panel" manda a `/dashboard` (alumnos) para admins

**Síntoma:** estando en `/admin/*`, click en "Mi panel" del navbar lleva
a `/login` (porque no hay sesión de alumno) o al dashboard de alumnos.

**Origen:** bug pre-existente del layout (`Navbar.tsx`), no del CRUD de
eventos. Detectado durante smoke test (2026-06-27).

**Fix propuesto:** cambiar el link según rol (admin → `/admin`, alumno →
`/dashboard`). Scope: ~15 min. **Severity 🟢 porque no bloquea nada,
solo confunde.**

### 🟡 B-5 — Cover image de evento sobresale del card en `/admin/eventos`

**Síntoma:** las cards con `cover_image_url` renderizado muestran la imagen
parcialmente FUERA del border del card por arriba (David reportó "el perro
se ve fuera del card"). La card "sin portada" con el gradient de fallback
se ve OK.

**Estado del debug (2026-06-27 ~02:05):**
- Verifiqué que `.bg-cover`, `.bg-center`, `.h-32`, `.overflow-hidden`
  están todas en el CSS compilado (`6fea3aa7d8c4bd43.css`).
- El Card component tiene `overflow-hidden` aplicado correctamente
  (`cn('rounded-2xl bg-white …', 'p-0 flex flex-col overflow-hidden')`).
- Probé 3 patrones distintos (`<img className="h-32">` → wrapper relative
  absolute → `<div bg-cover bg-center>` con background-image). Todos
  producen el mismo overflow visual.
- Sospecha: el `<div>` interno con `h-32` no respeta la altura, o el
  `bg-cover` está escalando la imagen más allá del contenedor padre.

**Workaround actual:** el admin puede ver el evento OK en su detalle;
la imagen de portada es solo decorativa en el listado. No bloquea nada.

**Fix propuesto:** debuggear con DevTools (F12 → Elements) en la próxima
sesión. Hipótesis a verificar: (a) el `bg-cover` no aplica a URLs
externas sin `crossOrigin`, (b) el `<Card>` envuelve en algo más que
rompe `overflow-hidden`, (c) el grid `gap-4` mete un margin que empuja.
Scope: ~15 min con DevTools. **Severity 🟡 porque tiene workaround.**

---

### 🟡 B-2 — Calendario CRM no renderiza `crm_tasks` (sesión 2026-06-27)

**Síntoma:** David reportó (2026-06-27 ~01:14) que la tarea de seguimiento
que creó desde el drawer del lead aparece en el detalle del lead pero
NO aparece en el tab "📅 Calendario" del CRM.

**Diagnóstico:** el Calendario de `CRMView.tsx` (líneas 299-341) renderiza
solo `appts` (citas comerciales agendadas), NO `crm_tasks` (tareas de
seguimiento). Son dos entidades distintas en el modelo:

- `appts` — citas tipo "call" / "whatsapp" / "meeting" / "follow_up",
  agendadas explícitamente. → **sí** aparecen en Calendario.
- `crm_tasks` — tareas internas de seguimiento, creadas en el drawer
  del lead con `due_at` opcional. → **no** aparecen en Calendario.

El comentario del código (línea 336-339) ya advertía:
> Demo: no conectado a Google Calendar. El tipo Appointment deja el campo
> externalCalendarId listo para sincronización futura.

**Workaround actual:** las tareas se ven en el detalle del lead (sección
"Tareas de seguimiento" del drawer). Si David quiere vista unificada de
"qué tengo que hacer esta semana", tiene que abrir cada lead.

**Fix propuesto:** agregar 2ª card en la sección Calendario del
`CRMView.tsx` que liste `crm_tasks` con `status='pending'` y `due_at`
futuro/vencido (ordenadas por `due_at` ascendente). Pasarlas al
componente como nueva prop, fetch en `crm-service.ts` con el patrón
que ya usa para `getLeadTasks`. Scope: ~30 min, no requiere migration.

**Severidad 🟡** porque tiene workaround (la tarea sí es visible en el
drawer), pero rompe el flujo mental de "calendario = todo lo que tengo
pendiente". Detectado en el smoke test del Paso 1 de Fase 4.

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
