# Qlick LMS — Roadmap

> Fuente de verdad del plan del LMS. Cualquier desvío se conversa y se actualiza acá.
> Última revisión: 2026-06-25 (sesión con David).

---

## Estado actual

- [x] **LMS Real Foundation v0.7.0** — rama `feature/lms-real-foundation`
  - 5 tablas nuevas en Supabase (`courses`, `modules`, `lessons`, `enrollments`, `lesson_progress`)
  - RLS activa con policies correctas (catalog: público solo `published`; datos alumno: solo `auth.uid()`)
  - Server libs (`src/lib/lms/*`) con fallback demo
  - Auth alumnos separada de admin (`student-auth.ts` + `session.ts:getCurrentStudent`)
  - UI: `/login`, `/dashboard`, Navbar con identidad tri-state
  - `docs/LMS_REAL_FOUNDATION.md` (handoff completo)
  - **NO mergeado a main todavía** — esperando luz verde del owner.
- [x] Auditoría técnica del branch (PASS con 1 hallazgo medio y 3 bajos)
  - H1 — Inconsistencia `LessonVideoProvider "external"` (CHECK vs TS): **pendiente fix**
  - H2/H3/H4 — warnings bajos, decisión del owner

## En curso

- [ ] **`feat/qr-enrollment`** — inscripción real con QR por curso (modelo A) + atribución
  - Migración: `ALTER TABLE enrollments ADD COLUMN source text` (idempotente)
  - Endpoint: `/api/qr/[courseSlug]` devuelve PNG del QR
  - Página: `/inscripcion/[courseSlug]` (preview + OAuth + server action)
  - Tracking: `?ref=qr` → `enrollments.source = 'qr'`
  - Callback actualizado para soportar `?next=` (one-click desde inscripción)
  - QR codifica `${NEXT_PUBLIC_APP_URL}/inscripcion/[slug]?ref=qr` (cambia cuando David tenga dominio real)

## Pendientes — features

| # | Feature | Branch | Decisión abierta |
|---|---|---|---|
| 4 | Flujo real de inscripción | `feat/qr-enrollment` | modelo A (QR por curso) confirmado |
| 4b | Inscripción por QR (modelo A) | `feat/qr-enrollment` | en este branch |
| 6 | Onboarding del alumno | `feat/onboarding-alumno` | scope exacto (tooltips vs tour modal vs emails) |
| 5 | Pagos — adapters sin credenciales | `feat/pagos-adapters` | proveedor (MercadoPago / Stripe / Conekta) |
| 7 | Tests automáticos (Vitest + SQL) | (puede ser branch por fase) | scope fase 1 |

## Completados

- [x] **`feat/google-oauth`** — Google OAuth reemplaza magic link (mergeado a `feature/lms-real-foundation` el 2026-06-25)
  - Fix incluido: `client.ts` ahora usa acceso literal a `NEXT_PUBLIC_*` (bug conocido documentado en `config.ts:108-113`)
  - Bug OAuth: cuentas en `ADMIN_EMAIL_ALLOWLIST` no pueden entrar como alumno (por diseño)

## Pendientes — decisión de producto (con socios)

- [ ] **Catálogo real en DB** — cargar los 4 cursos demo a Supabase con un script de seed. Bloqueado: definir si el catálogo se amplía o se queda en 4.
- [ ] **Contenido real de cursos** — videos reales (no placeholders de YouTube). Bloqueado: definir qué cursos se producen y cuándo.

## Pendientes — decisiones técnicas

- [ ] **Proveedor de pagos** (MercadoPago / Stripe / Conekta / mix). Costo, comisiones, experiencia para alumno mexicano.
- [ ] **Plantilla de email transaccional** (reset password, bienvenida). Default de Supabase vs custom.
- [ ] **Monitoring de errores en runtime** (Sentry vs nada por ahora).

## NO se hace todavía

- Multi-agente paralelo. Acordado con David: features de tamaño medio se hacen secuenciales en una sesión, documentadas en este roadmap.
- Tests E2E (Playwright) hasta tener onboarding cerrado.
- Load tests hasta tener tráfico real.

---

## Convenciones del repo

- Cada feature nueva va en su propio branch `feat/<nombre>` desde `feature/lms-real-foundation`.
- Merge entre features va a `feature/lms-real-foundation` (NO a `main` hasta que David diga).
- Commit messages: `feat(...)`, `fix(...)`, `docs(...)`, `chore(...)`, siguiendo conventional commits.
- Antes de pedir review: `npm run type-check && npm run lint && npm run build`.

## Glosario de branches

- `main` — producción. NO se toca sin luz verde.
- `feature/lms-real-foundation` — base estable del LMS, recibe merges de features chicos.
- `feat/*` — features individuales en desarrollo.
- `fix/*` — bugfixes.
- `docs/*` — cambios solo de documentación.
