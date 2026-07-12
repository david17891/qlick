# AGENTS.md

Plataforma LMS de cursos de marketing de Qlick Marketing Digital — Next.js
14 + TypeScript + Supabase + Tailwind, con un panel admin, CRM de leads
(incluye agente IA en modo sugerencia) y funnel de eventos/masterclass.

> **Audience:** every AI coding agent (and humans) working on this repo. The
> Mavis multi-agent team lives in `.harness/` and reads this file as ground
> truth for project conventions.

---

## Setup commands

- Install deps:         `npm install`
- Start dev:            `npm run dev`                  # http://localhost:3000
- Build:                `npm run build`
- Lint:                 `npm run lint`
- Typecheck:            `npm run type-check`
- Unit tests:           `npm test`                     # node --test, .mjs files in tests/
- Audit voseo MX:       `npm run audit:voseo`          # detecta conjugaciones rioplatenses en templates/UI
- Audit links:          `npm run audit:links`
- Check Supabase env:   `npm run check:supabase`
- Apply migration:       `node --env-file=.env.local scripts/apply-migration-management.mjs archivo.sql`  # camino canónico de DDL desde Mavis (Management API, ver docs/AGENT_SUPABASE_PROTOCOL.md §11)
- Apply migration (preview): mismo comando + `--dry-run`
- Seed demo data:       `npm run seed:demo` (idempotent; `seed:demo:reset`, `seed:demo:cleanup`)
- Seed LMS courses:     `npm run seed:courses`         # 4 cursos + 12 módulos + 36 lecciones

Setup primerizo + operativa paso a paso: `docs/HOW-TO-RUN.md`.

---

## Project layout

- `src/app/` — Next.js App Router (rutas públicas y privadas, server actions, API routes)
- `src/components/` — UI (admin, brand, contact, course, crm, dashboard, events, layout, ui, video)
- `src/lib/` — server libs (`auth`, `audit`, `contact`, `crm`, `data`, `email`, `events`, `leads`,
  `lms`, `masterclasses`, `payments`, `qr`, `supabase`, `video`, `whatsapp`, `ai`)
- `src/types/` — tipos del dominio (fuente de verdad, compartidos client + server)
- `src/middleware.ts` — refresh de sesión Supabase y guards de ruta
- `supabase/migrations/` — SQL versionado (`YYYYMMDDHHMMSS_descripcion.sql`)
- `tests/` — `*.test.mjs` (node test runner) + `tests/playwright/` (E2E)
- `scripts/` — utilidades de dev (seeds, audit, checks). NO se versionan:
  `scripts/kill-dev.ps1`, `scripts/generate-magic-link.mjs` (están en `.gitignore`)
- `data/PROJECT-LOG.md` — log append-only de cambios puntuales
- `docs/` — documentación viva (`STATUS.md` snapshot, `OPEN_ITEMS.md` deuda, `ROADMAP.md` plan,
  `HOW-TO-RUN.md` operativa, `AGENT_SUPABASE_PROTOCOL.md`, `AI_AGENT_GUARDRAILS.md`,
  `GITHUB_WORKFLOW.md`, etc.)
- `.harness/` — Mavis multi-agent team (orchestrator + reins). NO son código de producto.

---

## Code style

- TypeScript **strict** (`tsconfig.json` con `strict: true`); cero `any` nuevos en código de
  producto. Tests E2E legacy en `.mjs` pueden relajar. Si aparecen `as any`, es típicamente
  typegen Supabase stale — regenerar con `npm run typegen` (ver sprint S1.3 del audit 2026-07-11).
- ESLint config: `eslint-config-next` (reglas de Next.js + React hooks). `npm run lint` debe
  pasar antes de commit.
- Prettier no está configurado explícitamente — seguir el estilo existente (single quotes,
  2-space, trailing commas cuando aplica).
- Tailwind 3 utility-first; evitar CSS ad-hoc salvo en `globals.css`.
- App Router: **Server Components por defecto**, marcar `"use client"` solo cuando hay estado,
  efectos, refs, o handlers que lo requieren.
- Variables de entorno del cliente solo `NEXT_PUBLIC_*`; nada sensible en el bundle del cliente
  (secret keys, service-role tokens, dev secrets).

---

## Testing instructions

- Unit: `npm test` ejecuta `node --experimental-strip-types --test tests/*.test.mjs`.
  Añadir un `*.test.mjs` por cada lib nueva en `tests/` siguiendo los patrones existentes
  (`whatsapp-lead-link.test.mjs`, `event-importer.test.mjs`, etc.).
- E2E: scripts puntuales en `tests/playwright/` (no hay `@playwright/test` instalado todavía;
  ver `docs/E2E_TESTS_PLAN.md` para el plan). Los tours E2E los corre Mavis vía Playwright MCP
  cuando David lo pide, capturando las 5 rutas clave.
- Antes de push:
  1. `npm run type-check` pasa
  2. `npm run lint` pasa
  3. `npm test` pasa (target actual: 1066/1066 ✅)
  4. `npm run build` compila (valida SSG/SSR de las ~145 rutas)

---

## PR & commit conventions

- Branch base: `main` está **siempre deployable y reservado para releases**.
  La integración actual se hace contra `feat/fase-N-*` hasta que exista `develop`.
- Modelo de ramas: `feat/*`, `fix/*`, `docs/*`, `refactor/*`, `chore/*` (ver `docs/GITHUB_WORKFLOW.md`
  para detalle). Nunca pushear directo a `main`.
- Mensajes: **Conventional Commits** en español o inglés (`feat(cursos):`, `fix(auth):`,
  `docs:`). Línea 1 ≤ 72 chars, imperativo.
- Commits atómicos: un commit = un cambio lógico. Mezclar refactor + feature es mala práctica.
- PR con título descriptivo, descripción (qué/por qué/cómo probarlo), al menos 1 revisor,
  CI verde antes de merge.

> **Push lo hace la sesión Mavis.** Configurado el 2026-06-30 con fine-grained PAT
> persistido en `HKCU\Environment\GH_TOKEN` + git credential helper. Verificación + cómo
> recrear: `docs/SETUP_GITHUB_AUTH.md`. Si `git push` falla, NO asumir que la auth se
> perdió — verificar las 3 condiciones del doc antes de pedirle a David que la renueve.
> Confirmar siempre antes de cualquier commit destructivo (drop, reset --hard, push --force).

---

## Security

- **Nunca commitear secretos.** `.env*.local`, `.env`, `supabase/config.toml` y el resto de
  material sensible ya están en `.gitignore`. Las claves reales viven en Vercel env vars.
- `.env.local` se carga al dev server pero **no** debe versionarse. Si se detecta una fuga,
  rotar la clave de inmediato y documentar el incidente.
- Secret keys, service-role tokens y `DEV_ADMIN_SECRET` **nunca** van a `NEXT_PUBLIC_*`.
- `.env.example` se mantiene como plantilla pública.
- Acceso admin está gateado por `ADMIN_EMAIL_ALLOWLIST` (CSV en `.env.local`, en producción
  se setea en Vercel env vars).
- `DEV_ADMIN_SECRET` es la única barrera de `/api/dev/login` (intencionalmente testeable desde
  Vercel para tours E2E). Tratar como secreto: si se filtra, rotar en `.env.local` + Vercel.

---

## Política de datos (PII)

**Regla dura:** NUNCA commitear datos personales / PII.

- Excels de eventos/clientes/leads (`lista_*.xlsx`, `asistencia_*.xlsx`, `clientes_*.xlsx`,
  `encuesta_*.xlsx`, `leads_*.xlsx`, `evento_*.xlsx`) van a `private-data/` o `datos-privados/`,
  fuera del repo (ya filtrados en `.gitignore`).
- En tests, fixtures, screenshots públicas y logs: usar siempre **datos sintéticos**:
  nombres falsos, teléfonos `+52XXXXXXXXXX`, emails `@example.com` (o `mavis+test@qlick.app`).
- El CRM real y los formularios siguen en modo demo mientras no estén: RLS activo en todas las
  tablas con PII, políticas por rol, aviso de privacidad publicado (LFPDPPP) y consentimiento
  explícito. Ver `docs/AGENT_SUPABASE_PROTOCOL.md` §8 y `docs/PRIVACY_AND_DEPLOY_CHECKLIST.md`.

---

## Documentación operativa (single source of truth)

- **Snapshot vivo de producción:** `docs/STATUS.md` — sobreescribir tras deploys, env changes o
  fixes críticos. NO append-only.
- **Log append-only de cambios:** `data/PROJECT-LOG.md` — entradas puntuales con timestamp.
- **Deuda abierta:** `docs/OPEN_ITEMS.md` — bugs conocidos, próximos pasos no bloqueantes.
- **Plan / fases:** `docs/ROADMAP.md` — fuente de verdad del roadmap de Qlick.
- **Decisiones:** `docs/DECISIONS.md` — ADRs (`D-001`, `D-002`, …).
- **Handoff entre fases:** `docs/HANDOFF_*.md` al cierre de cada fase.

Reglas de oro:
1. Cada cambio de schema/versionado → commit + entrada en `data/PROJECT-LOG.md`.
2. Cada deploy a Vercel → actualizar snapshot en `docs/STATUS.md`.
3. Cada cierre de fase → `docs/HANDOFF_<version>_<fase>.md` + update de `docs/ROADMAP.md`.

---

## Mavis multi-agent team

El equipo IA vive en `.harness/`. **No listado en este archivo** — el daemon inyecta el roster
en runtime y un listado manual drift.

Si abrís un PR que toca a un rein o un doc, ver:
- `.harness/agent.md` — orchestrator (Harness)
- `.harness/reins/<name>/agent.md` — cada rein con scope y stop conditions explícitos
- `.harness/docs/project-standards.md` — convenciones que aplican a todos
- `.harness/memory/MEMORY.md` — memoria compartida del equipo (cross-rein)

> **Regla:** las instrucciones operativas globales viven aquí (AGENTS.md) o en
> `.harness/docs/`. NO duplicar reglas en cada rein — link.
