# Qlick LMS — Roadmap

> Fuente de verdad del plan del LMS. Cualquier desvío se conversa y se actualiza acá.
> Última revisión: 2026-06-28 (sesión tarde-noche) — **Fase 6 Hitos A+B+C cerrados**.

---

## Estado actual

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

- **Fase 4: UI admin `/admin/eventos` + WhatsApp manual** — branch `feat/admin-eventos`, **18+ commits desde 2026-06-27, cerrado y mergeado a `main`** el 2026-06-28 (sesión madrugada + tarde).
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

- **Fase 5: Notificaciones + admin CRUD + audit log + clone/undo** — branch `feat/fase-5-planning`, **11 commits desde 2026-06-28**. Cierre total:
  - ✅ **Paquete A**: setup (`.env.example` con vars Resend + admin notifications)
  - ✅ **Paquete B**: notificaciones por email (Resend wrapper + template + trigger + SMTP_SETUP.md)
  - ✅ **Paquete C**: audit log admin (migration additive + `logAdminAction` extendido + `listAuditLogs` + `/admin/system/audit-log` page con diff view)
  - ✅ **Paquete D**: clone + undo archivar (`cloneEvent` server lib + POST route + EventDrawer botón + toast no-bloqueante con auto-dismiss 5s + accesibilidad aria)
  - ✅ **Paquete E**: polish (mobile 375px verified, EVENTS_ADMIN_GUIDE actualizado, OPEN_ITEMS cierre, ROADMAP, CHANGELOG v0.11.0, PRE_MERGE_CHECKLIST)
  - Tests: 110/110 ✅. Type-check ✅. Lint ✅. Build ✅.
  - Pendiente: push de David + PR + merge a `main` (después de merge de Fase 4).

- **Fase 6: Polish + auditoría + métricas globales** — branch `feat/fase-6-hitos`, **siguiente sprint**. Cierre total:
  - ✅ **Hito A**: auditoría completa de Fase 6 work (`docs/FASE-6-AUDIT.md`) — 4 críticos, 11 medios, 8 bajos.
  - ✅ **Hito B**: login alumno con magic link reactivado como fallback (`StudentLoginCard`) — Google OAuth sigue siendo el principal. State preservation entre modos.
  - ✅ **Hito C**: header de métricas globales en `/admin/eventos` (6 stat cards con tooltips) + búsqueda libre `q` en audit log + seed demo realista con idempotencia.
  - ✅ **Críticos cerrados**: C-1 (audit log idempotente), C-2 (WhatsApp log idempotente), C-3 (docstring honesto de `q`), C-4 (entityId null check).
  - ✅ **Medios cerrados**: M-1 (real randomness con crypto.randomInt), M-2 (PRNG determinístico para sort), M-5 (Tooltip aria-describedby), M-7 (conversion solo eventos pasados), M-8 (MagicLinkForm state preservation), M-10 (escape wildcards en búsqueda libre), M-11 (`ignoreDuplicates: true` para preservar cambios manuales).
  - ✅ **Bajos cerrados**: L-6 (`loading.tsx` para `/admin/eventos`, pre-existente de Fase 4 Bloque 3D).
  - ⏳ **Pendientes (no bloquean demo ni merge)**: M-6 (viewport collision Tooltip — requiere Floating UI), M-9 (DiffView truncation en entries grandes), L-1, L-2, L-3, L-4, L-5, L-7, L-8 (cosméticos).
  - Score: 9/10 (refresh post-triage 2026-06-28).
  - Tests: 110/110 ✅. Type-check ✅.
  - Pendiente: push de David + PR + merge a `main` (después de merge de Fase 5).

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

### Lo que ya existe (parcialmente)
- LMS funcional (catálogo, detalle, login, dashboard, lecciones, progreso).
- Auth con Supabase + roles admin/student.
- CRM con **dominio + UI en demo mode** (`src/lib/crm/`, 16 archivos, 17 tipos, sin persistencia real).
- WhatsApp: 10 intents, `wa.me` manual provider activo, stubs de Meta Cloud API / BSP.
- Agente IA: heurísticas deterministas, stubs de OpenRouter, guardrails.
- Supabase: 9 migrations, RLS, typegen, server actions.
- Pago simulado funcional.

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
| 7 | **Pagos reales** (Stripe / MercadoPago / Conekta) | ⚪ futuro | reemplazar simulador |
| 7 | **WhatsApp Business API** | ⚪ futuro | webhooks, plantillas, Meta Cloud API |

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
