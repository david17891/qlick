# Qlick LMS — Roadmap

> Fuente de verdad del plan del LMS. Cualquier desvío se conversa y se actualiza acá.
> Última revisión: 2026-06-26 (sesión nocturna con David) — **Fase A+B+C de Entitlements cerradas**.

---

## Estado actual

- [x] **LMS Real Foundation v0.9.0** — fase cerrada y mergeada a `main` (commit `78db4a3`) el 2026-06-25
  - 14 commits: DB (5 tablas + RLS) → server libs → docs handoff → Google OAuth → fix `client.ts` → QR enrollment → fallbacks UUID/FK → seed script → docs E2E plan → tour Playwright
  - Validado: `npm run type-check && npm run build` green, query directa a DB confirma 4 cursos + 12 módulos + 36 lecciones
- [x] **feat/google-oauth** — Google OAuth reemplaza magic link + fix `client.ts` acceso literal a `NEXT_PUBLIC_*`
- [x] **feat/qr-enrollment** — Inscripción con QR + tracking `source` + página `/inscripcion/[slug]`
  - Fallbacks automáticos: `getCourseBySlug` cae al mock cuando DB no tiene el slug; `enrollUserInCourse` valida UUID antes del upsert y cae a demo si el ID es mock legacy
- [x] **seed:courses** — Script ejecutado el 2026-06-25: 4 cursos + 12 módulos + 36 lecciones cargados en Supabase (idempotente, ya no-op en re-runs).
- [x] **Entitlements v1.0.0+** — capa de acceso comercial (Fase A+B+C) mergeada a `main` (commits `5f76584` / `2d156a6` / `7b26fcc` / `8b9ea5d` / `42076da`).
  - **Fase A (v1.0.0)**: schema con `courses.access_type`, tablas `course_access` + `payments` con RLS. 1 curso paid ($499 MXN) + 3 free.
  - **Fase B**: server lib `src/lib/lms/entitlements.ts` con `getCourseAccess`, `checkCourseAccess`, `grantAccess`, `revokeAccess` (idempotente).
  - **v1.0.1/1.0.2**: alineación con la capa legacy `src/lib/payments/` (mockProvider, stubs de Stripe/MercadoPago/Conekta, types en `@/types`). Rename `provider_payment_id` → `external_reference`, CHECK status con valores legacy, columnas `method`/`coupon_id`/`discount_mxn`/`enrollment_id`.
  - **Fase C**: endpoint `POST /api/dev/simulate-webhook` + página `/pagar/[courseSlug]` con SimulatorForm. Flujo: free → /inscripcion, paid → /pagar → simulate (paid/failed/pending) → grantAccess si paid.
  - **Reusado de legacy**: `mockProvider` para el patrón de provider, `Payment`/`Coupon`/`applyCoupon` de `@/types`.
  - Pendiente test E2E con cuenta NO-admin (admin no puede entrar como student por diseño).

## Deuda activa (no bloqueante)

- **Catálogo real**: los 4 cursos siguen duplicados entre `src/lib/data/courses.ts` (mock) y la DB (via seed). Cuando David decida el catálogo final con socios, se elimina el mock y se regenera el seed con los datos reales.
- **Inconsistencia `LessonVideoProvider "external"`** (CHECK vs TS) — H1 del audit original. Fix de 1 línea cuando se decida.
- **`ADMIN_EMAIL_ALLOWLIST` durante testing**: probamos con la cuenta `layerzero3dprint@gmail.com` que NO estaba en el allowlist. Si vuelve a estar en el allowlist, OAuth alumno va a loopear (es admin, no entra como student — por diseño).

## En curso

- (vacío — listo para arrancar la siguiente feature)

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
