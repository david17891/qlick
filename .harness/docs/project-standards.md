# Qlick LMS — Project Standards

> Convenciones operativas globales del proyecto. Los reins referencian este
> archivo en lugar de duplicar reglas. Si cambia una regla global, este
> archivo se actualiza primero.

> **Lexical precedence** (de mayor a menor autoridad):
> 1. `docs/*` — fuente canónica histórica del proyecto. Este archivo los
>    **resume y enlaza**, no los reemplaza. Si hay conflicto, gana `docs/*`.
> 2. `AGENTS.md` (raíz) — contrato global para AI coding agents
>    (OpenCode/Codex/Cursor/Devin). Setup, layout, style, testing, PR, seguridad, PII.
> 3. Este archivo (`project-standards.md`) — índice cross-cutting que
>    consolida reglas dispersas para que un agente nuevo llegue en 1 lectura.
> 4. `agent.md` específico del rein — scope local y stop conditions del rol.

---

## 1. Stack y comandos canónicos

- **Next.js 14.2.35** con App Router, TypeScript strict, Tailwind 3.
- **npm** (hay `package-lock.json`); no usar yarn / pnpm.
- Setup: `npm install` → `npm run dev` en `http://localhost:3000`.
- Validación mínima antes de declarar listo:
  ```powershell
  npm run type-check
  npm run lint
  npm test
  # Si tocaste rutas nuevas o RSC:
  npm run build
  ```

## 2. Estilo de código

- **TypeScript strict**, sin `any` nuevos en código de producto. Si tenés que
  meter `any`, justificarlo en el comentario del commit / PR.
- ESLint config: `eslint-config-next` (Next.js + React Hooks).
- Sin Prettier configurado — seguir el estilo existente (single quotes,
  2-space, trailing commas, punto y coma en server libs).
- Server Components por defecto. Marcar `"use client"` solo cuando es
  estrictamente necesario (estado, efectos, refs, handlers, componentes con
  estado interno de `@/components/ui/*`).
- Tipos compartidos viven en `src/types/`. Si un tipo toca cliente y servidor,
  va acá (no duplicado en un `*.d.ts` local).

## 3. Datos: sintéticos en tests / fixtures, reales solo en operación local

| Contexto | Regla |
| --- | --- |
| Tests unitarios / fixtures / screenshots / logs en repo | Sintético. Emails `@example.com` o `mavis+test@qlick.app`, teléfonos `+52XXXXXXXXXX`, nombres ficticios. |
| Datos reales (leads, eventos, alumnos) | Operan localmente en Supabase / admin privado / demo privada de David. **Nunca** en commits. |
| Excels de eventos/clientes (`lista_*.xlsx`, `asistencia_*.xlsx`, `clientes_*.xlsx`, `encuesta_*.xlsx`, `leads_*.xlsx`, `evento_*.xlsx`) | Van a `private-data/` o `datos-privados/` (carpetas ya en `.gitignore`). |
| CRM y formulario `/contacto` en repo | Modo demo (sin escribir a tablas reales) hasta que RLS + aviso de privacidad + consentimiento estén todos verdes. |

> Ver `docs/PRIVACY_AND_DEPLOY_CHECKLIST.md` para el gate de captura de datos
> reales (LFPDPPP, México).

## 4. Variables de entorno y secretos

- `.env*`, `.env*.local`, `supabase/config.toml` están en `.gitignore`. **No
  tocar** salvo para añadir entradas al `.env.example` (plantilla pública).
- `NEXT_PUBLIC_*` se expone al cliente. **Nunca** poner secretos ahí (service
  role, secret keys, `DEV_ADMIN_SECRET`, API keys de MercadoPago/Stripe/Conekta).
- Variables reales viven en Vercel env vars (producción / preview).
- `.env.local` se carga al dev server pero **no** se versiona.
- `DEV_ADMIN_SECRET` es la única barrera de `/api/dev/login` — tratar como
  secreto. Si se filtra: rotar en `.env.local` + Vercel env vars simultáneamente.

## 5. Branching, commits, PRs

- **Modelo de ramas:**
  - `main` — producción, siempre deployable y reservada para releases.
  - `feat/<fase>-*` — fase activa (actual: `feat/fase-6-hitos`).
  - `fix/*`, `docs/*`, `refactor/*`, `chore/*` — ramas puntuales.
  - **No pushear directo a `main`.**
- **Conventional Commits** con área entre paréntesis (`feat(cursos):`,
  `fix(auth):`, `refactor(pagos):`, `chore(deps):`, `docs:`).
- **Atomicidad:** un commit = un cambio lógico. No mezclar refactor con
  feature. Si toca muchas áreas, probablemente son varios commits.
- **Mensaje:** imperativo, ≤ 72 chars en línea 1, cuerpo opcional tras línea
  en blanco.
- **PR template:** ver `.github/pull_request_template.md` (qué cambia / por
  qué / cómo probarlo / checklist de calidad).
- **Push:** desde la terminal de David. La sesión Mavis no tiene `gh` auth.
  Confirmar antes de commits destructivos.

## 6. Supabase: gate de cambios

> Ver `docs/AGENT_SUPABASE_PROTOCOL.md` para el detalle completo. Resumen:

- **Migraciones:** una por archivo en
  `supabase/migrations/YYYYMMDDHHMMSS_descripcion.sql`. Idempotente cuando sea
  posible. Una vez aplicada a producción, no se edita.
- **DDL destructivo:** `DROP`, `TRUNCATE`, `ALTER TABLE DROP COLUMN`,
  `DELETE` sin WHERE → requiere aprobación explícita de David.
- **Proyectos / branches / planes con costo:** requieren aprobación.
- **RLS:** tablas con PII requieren RLS activo + políticas por rol + aviso de
  privacidad + consentimiento. Hasta cumplir los 4, no se capturan datos
  reales.
- **Advisors:** correr `supabase_list_advisors` después de cualquier DDL.
- **SQL Editor de Supabase:** no maneja `DO` blocks con `ALTER TABLE` adentro.

## 7. Documentación operativa (single source of truth)

| Doc | Rol |
| --- | --- |
| `docs/STATUS.md` | Snapshot vivo de producción. **Sobre-escribir** tras deploys / env changes / fixes críticos. |
| `data/PROJECT-LOG.md` | Log **append-only** de cambios puntuales con timestamp. |
| `docs/OPEN_ITEMS.md` | Deuda viva: bugs conocidos, próximos pasos no bloqueantes. |
| `docs/ROADMAP.md` | Plan/fases — fuente de verdad del roadmap. |
| `docs/DECISIONS.md` | ADRs (`D-001`, `D-002`, …). |
| `docs/HANDOFF_<version>_<fase>.md` | Cierre de fase. |
| `docs/SUPABASE_*`, `docs/AGENT_*`, `docs/CRM_*`, `docs/PAYMENTS_*`, `docs/VIDEO_*`, `docs/EVENTS_*`, `docs/AI_*`, `docs/WHATSAPP_*` | Detalle por dominio. |

**Reglas de actualización:**
1. Cambio de schema / data → commit + entrada en `data/PROJECT-LOG.md`.
2. Deploy a Vercel → actualizar `docs/STATUS.md`.
3. Cierre de fase → `docs/HANDOFF_<version>_<fase>.md` + `docs/ROADMAP.md`.
4. Decisión arquitectural → ADR en `docs/DECISIONS.md` (formato corto: contexto,
   decisión, consecuencias).

## 8. Testing

- **Stack:** `node --experimental-strip-types --test tests/*.test.mjs`. No hay
  Vitest ni `@playwright/test` aún.
- **Convención:** `tests/<area>/<case>.test.mjs` (ej. `tests/event-importer.test.mjs`).
- **Para bugs:** TDD — primero test rojo que reproduce, después fix.
- **Para Supabase tests:** sufijo `.integration.test.mjs` y NO correr sin luz
  verde. CI aún no está conectado (ver `docs/E2E_TESTS_PLAN.md` para la Fase
  2 de E2E).
- **Datos sintéticos en tests:** siempre.

## 9. Accessibility baseline (convención del repo)

- Inputs interactivos con `aria-invalid` cuando hay error visible.
- Errores con `role="alert"`.
- Tooltips con `aria-describedby`.
- Loading states explícitos (`loading.tsx` en rutas admin).
- Mobile-first: 375×812 verificado en Playwright MCP al cierre de cada fase.
- `SubmitButton` con `useFormStatus` en forms de admin.
- Ver `docs/EVENTS_ADMIN_GUIDE.md` para el detalle de Fase 4.

## 10. IA agent en CRM: modo sugerencia

> Resumen de `docs/AI_AGENT_GUARDRAILS.md`.

- Todo output lleva `needsReview: true`.
- `validateAgentReply` valida contra `FORBIDDEN_PHRASES` (pagos, descuentos,
  accesos, reembolsos, precios inventados, datos sensibles).
- `mustEscalateToHuman` fuerza escalamiento en: reembolsos/quejas/jurídico,
  pagos/transferencias/SPEI/OXXO/tarjeta/rechazo, soporte técnico, descuentos,
  datos personales/privacidad.
- Anti-alucinación: solo recomienda cursos reales (`recommendCourseHeuristic`),
  no cita precios en plantillas.
- El agente **nunca envía** mensajes — el humano lo hace.
- Cambiar `needsReview` a `false` (autoenvío) sería decisión de producto
  separada, con métricas de seguridad y logging.

---

## Historial de cambios

- **2026-06-29** — Creado durante bootstrap del equipo Mavis (init skill).
  Consolidación de reglas dispersas en `docs/HOW-TO-RUN.md`,
  `docs/GITHUB_WORKFLOW.md`, `docs/AGENT_SUPABASE_PROTOCOL.md`,
  `docs/AI_AGENT_GUARDRAILS.md` y `AGENTS.md`.
