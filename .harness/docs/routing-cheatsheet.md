# Routing Cheat-Sheet — Qlick LMS

> Tabla de 1 página para el orchestrator (y para vos) cuando hay una tarea
> nueva: **"si toca X → rein Y → doc canónica Z"**. Mantener en sync con
> los `description:` de `.harness/reins/*/agent.md`.

## Cómo usar esta tabla

1. **Identificá el dominio** de la tarea (columna 1).
2. **Asigná el rein** que la toma (columna 2).
3. **Leé la doc canónica** del dominio antes de actuar (columna 3).
4. Si la tarea **cruza dominios** (ej: agregar un access_type nuevo en
   una tabla Y actualizar el flujo de pago Y ajustar el dashboard del
   alumno), disectá primero y delegá en orden con handoff explícito.
5. **Bloqueá y reportá** al padre si aparece cualquier `Block-and-ask`
   trigger de `.harness/agent.md` (DDL destructivo, push a `main`,
   secretos, etc.).

---

## Mapa dominio → rein → doc canónica

| Si la tarea toca… | Rein | Doc canónica | Block-and-ask típico |
| --- | --- | --- | --- |
| `src/app/**`, `src/components/**`, `src/lib/**` (genérico) | `developer` | este archivo + `docs/STATUS.md` | cambios de modelo de datos |
| Eventos, masterclass, embudo de leads (`/eventos/*`, `/admin/eventos/*`) | `crm-expert` | `docs/EVENTS_FUNNEL_FOUNDATION.md`, `docs/EVENTS_FUNNEL_CONCEPT.md`, `docs/MASTERCLASS_FUNNEL_FOUNDATION.md` | tocar `lead_event_links` directamente |
| CRM kanban, leads, conversaciones, WhatsApp, formulario `/contacto` | `crm-expert` | `docs/CRM_IMPLEMENTATION_REPORT.md`, `docs/CRM_MODE_STATUS.md`, `docs/CONTACT_AND_WHATSAPP_STRATEGY.md` | cambiar `validateAgentReply` o `FORBIDDEN_PHRASES` |
| Agente IA (modo sugerencia, guardrails) | `crm-expert` | `docs/AI_AGENT_GUARDRAILS.md`, `docs/WHATSAPP_AI_AGENT_STRATEGY.md` | pasar `needsReview` a `false` (autoenvío) |
| Cursos (`/cursos*`), aprender (`/aprender*`), dashboard (`/dashboard/*`) | `lms-payments-expert` | `docs/LMS_REAL_FOUNDATION.md`, `docs/ENTITLEMENTS_PLAN.md` | cambiar `src/lib/lms/entitlements.ts` (fuente de verdad) |
| Pagos (`/pagar*`), MercadoPago/Stripe/Conekta, webhooks | `lms-payments-expert` | `docs/PAYMENTS_MEXICO_STRATEGY.md` | credenciales reales (deben vivir en Vercel) |
| Video provider, QR codes | `lms-payments-expert` | `docs/VIDEO_STRATEGY.md` | rotar API keys |
| Supabase Auth, RLS, migraciones (`supabase/migrations/*`) | `supabase-expert` | `docs/AGENT_SUPABASE_PROTOCOL.md`, `docs/SUPABASE_*` | DDL destructivo, RLS changes, proyectos/branches con costo |
| `src/lib/supabase/**`, service role, advisors | `supabase-expert` | `docs/SUPABASE_MCP_RUNBOOK.md`, `docs/AGENT_SUPABASE_PROTOCOL.md` §4 | imprimir valores de keys en logs |
| Email (Resend / SMTP), audit logging | `supabase-expert` | `docs/SMTP_SETUP.md` | cambiar remitente de emails transaccionales |
| Seeds (`scripts/seed*`, `npm run seed:*`) | `supabase-expert` | `docs/SEED-DEV.md` | correr seed contra producción sin confirmar |
| Tests nuevos (`tests/*.test.mjs`), reproducir bug con TDD | `tester` | `docs/E2E_TESTS_PLAN.md` (alto nivel) | crear `.integration.test.mjs` sin luz verde |
| Pre-merge: seguridad, RLS, PII, types, a11y, commits | `code-reviewer` | `docs/PRE_MERGE_CHECKLIST.md`, `docs/TECHNICAL-REVIEW.md` | aprobar si falla `npm run type-check`/`lint`/`test` |
| Deploy a Vercel, env vars, secrets | `supabase-expert` (env) + `developer` (release) | `docs/VERCEL_ENV_SETUP.md`, `docs/STATUS.md` | pushear directo a `main` |
| Privacidad / LFPDPPP / datos reales | `supabase-expert` | `docs/PRIVACY_AND_DEPLOY_CHECKLIST.md` | activar captura de datos sin los 4 gates |

---

## Cuando NO delegar (lo hago yo directo en la sesión actual)

- Tareas **chicas y aisladas** en 1-2 archivos (1 fix puntual, 1 refactor
  pequeño, 1 query de Supabase para inspeccionar).
- **Lectura / inspección**: grep, ls, abrir docs, verificar estado.
- **Sync de docs** como el de este bootstrap (E1-E5) — son mecánicos y
  no requieren scope creep.
- **Cambio puramente cosmético** sin decisión de arquitectura.

---

## Cuando SÍ delegar (team plan con workers en paralelo)

- Feature que cruza **3+ dominios** (ej: nueva tabla `subscriptions` +
  flujo de pago + dashboard del alumno + email).
- Refactor con **riesgo de regresión** en archivos múltiples → `developer`
  produce + `tester` valida con tests + `code-reviewer` revisa.
- Migración real a Supabase con **DDL no trivial** → `supabase-expert`
  produce migración + `code-reviewer` valida RLS + `developer` ajusta
  código.
- Cualquier cambio que toque **`supabase/migrations/*.sql`** +
  código + tests + docs → 3-4 workers paralelos.

---

## Cómo invocar al orchestrator

El orchestrator (Mavis root session) **lee los `description:`** de cada
rein y los matchea con la tarea. Vos no tenés que decir "delegá a X" —
yo lo infiero del dominio y de los verbos. Si querés forzar un rein
específico, decímelo explícito: *"que lo haga `crm-expert`"* o *"pasalo
por `code-reviewer` antes de merge"*.

---

**Mantenedor:** Mavis orchestrator. Si una fila queda stale (un rein
cambió de scope o un doc se renombró), actualizar este archivo en el
mismo PR.