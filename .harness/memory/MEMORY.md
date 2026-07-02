# Qlick LMS — Shared Team Memory

> Memoria compartida del equipo Mavis para Qlick LMS. Cada rein (developer,
> tester, code-reviewer, crm-expert, lms-payments-expert, supabase-expert)
> puede leer/escribir acá cuando descubre algo **cross-rein** (no solo de su
> dominio). Memoria por rein (patrones locales) va en su propio `MEMORY.md`
> dentro de la carpeta del rein.

> **Regla:** antes de escribir, verificar que aplique a ≥ 2 reins. Si solo
> aplica a uno, vive en su MEMORY.md local.

## Project snapshot (establecido en bootstrap 2026-06-29)

- **Repo:** `C:\Users\User\Documents\Click` · remoto `david17891/qlick` (privado)
- **Stack:** Next.js 14.2.35 (App Router) · TypeScript strict · Tailwind 3 ·
  Supabase Auth + DB · Resend para email · `node --test` para unit tests
- **Branch activa:** `feat/fase-6-hitos` (HEAD ahead 9 sobre origin; push
  pendiente de David)
- **Deploy:** Vercel (`https://qlick-three.vercel.app`) · DB en Supabase
  project `ugpejblymtbwtsoiykyj`
- **Fases cerradas mergeadas a `main`:** Events Funnel Foundation v0.7.0 ·
  LMS Real Foundation v0.9.0 · Google OAuth · QR Enrollment · Entitlements
  v1.0.0+ (Fases A+B+C) · feat/fase-6-hitos con Hitos A+B+C cerrados
- **Fases pendientes de merge (en local, push pendiente):** feat/admin-eventos
  (Fase 4) · feat/fase-5-planning · feat/fase-6-hitos

## Convenciones que aplican a TODO el equipo

1. **Conventional Commits** con área entre paréntesis: `feat(cursos):`,
   `fix(auth):`, `refactor(pagos):`, `chore(deps):`. Imperativo, ≤ 72 chars.
2. **No commitear secretos ni PII.** Si aparece un Excel con datos reales,
   va a `private-data/` (fuera del repo). Tests y fixtures siempre sintéticos.
3. **Push requiere terminal de David.** La sesión Mavis no tiene `gh` auth.
   Confirmar antes de cualquier commit destructivo (`reset --hard`,
   `push --force`, `DROP`/`TRUNCATE` en SQL).
4. **Datos sintéticos:** emails `mavis+test@qlick.app` o `@example.com`,
   teléfonos `+52XXXXXXXXXX`. NUNCA nombres / emails / teléfonos reales en
   tests, fixtures, logs o screenshots públicas.
5. **Validación mínima antes de declarar listo:**
   `npm run type-check && npm run lint && npm test` (+ `npm run build` si
   se tocaron rutas nuevas o RSC).
6. **Documentación:** cambios visibles → `data/PROJECT-LOG.md`. Deploys →
   `docs/STATUS.md`. Decisiones arquitecturales → `docs/DECISIONS.md` (D-NNN).
   Cierre de fase → `docs/HANDOFF_<version>_<fase>.md`.
7. **Convención para tests:** `tests/<area>/<case>.test.mjs` (Node test
   runner). Hay 110 tests verdes al cierre de Fase 6.

## Lecciones aprendidas (cross-fase)

- **SQL Editor de Supabase no maneja DO blocks con `ALTER TABLE` adentro.**
  Usar siempre `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` directo. Confirmado
  en sesión 2026-06-26.
- **Auditar el repo antes de aceptar un plan de agente** (sesión 2026-06-26):
  el plan inicial de LLM duplicó trabajo porque no chequeó `src/lib/payments/`
  ya existente. Antes de proponer feature nuevo: `ls src/lib/`, `grep -r
  "<concepto>"`.
- **`/aprender/[lesson]` agujero de seguridad previo (Fase 2 → arreglo en
  v1.0.0+ auditoría):** si la DB está caída, no devolver `hasAccess=true` por
  default. Gate explícito fail-closed (Fix X-5 en `docs/ROADMAP.md`).
- **`/api/dev/simulate-webhook` debe rechazar requests en producción** con
  `NODE_ENV` check (Fix X-2 en `docs/ROADMAP.md`).
- **`/cursos` y `/cursos/[slug]`** ahora son dinámicas (Fase 2) — leer siempre
  del LMS real, no del mock legacy.

## Comunicación con David (usuario)

- Idioma: español (es-MX).
- Tono: casual, "socio", conciso. Recomendación + razón en lugar de pros/contras.
- Antes de acciones destructivas o push: pedir **luz verde** explícita.
- Después de cambios relevantes: reportar al padre (sesión
  `mvs_9831e64ee9d4477d8632f5b78d4bf951`) con paths + validación corrida.
- **No sugerir cuándo dejar de trabajar.** Sus transferencias de control las
  decide él.

## Cómo crecer este archivo

- Solo entradas que aplican a ≥ 2 reins. Si es local de un rein → `MEMORY.md`
  del rein (futuro).
- Formato libre pero fechado (`### <topic> (YYYY-MM-DD)`).
- Si una entrada contradice AGENTS.md / `.harness/docs/project-standards.md`,
  revisar primero antes de escribir — probablemente el contrato global está bien.
