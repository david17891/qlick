# Pre-Merge Checklist — `feat/fase-6-hitos` → `main`

> **Propósito:** Gate explícito antes de mergear la rama `feat/fase-6-hitos` a `main`.
> David debe marcar cada item como ✅ antes de aprobar el merge.
>
> **Última revisión:** 2026-06-28 (cierre Fase 6 Hitos A+B+C+D + triage de cierre).
>
> **Prereq:** `feat/admin-eventos` (Fase 4) y `feat/fase-5-planning` (Fase 5) mergeadas a `main` primero.

---

## A. Calidad técnica

- [x] **`npx tsc --noEmit`** — sin errores (type-check)
- [x] **`npm run lint`** — sin warnings (`next lint`)
- [x] **`npm test`** — 110/110 tests pasando (cero fails, 0 skips, 0 cancelled)
- [x] **`npm run build`** — production build OK
- [x] **Cero `TODO` / `FIXME` / `XXX` / `HACK`** en código de producción
- [x] **Cero `console.log`** en código de producción (solo `console.error` para fail-safe logging)
- [x] **Cero secrets hardcoded** — todo via `.env.local` (vars Resend documentadas en SMTP_SETUP.md)
- [x] **Seed demo idempotente** — `scripts/seed-demo.mjs` puede correrse N veces sin duplicar data (verificado con `seed_tag` en metadata para audit log + WhatsApp log)

## B. Seguridad

- [x] **Todos los `/api/admin/**` llaman `requireAdmin()`** — verificado con grep (29/29 endpoints)
- [x] **Resend wrapper fail-safe** — si falla el send, NO rollbackea la operación principal (promoteSurveyToLead sigue creando el lead aunque el email falle).
- [x] **Template HTML escapaado** — `&` → `&amp;` en URLs, no permite inyección.
- [x] **Subject sin PII** — el subject del email NO incluye nombre/email del lead (anti-spam filters).
- [x] **Recipients CSV normalizados** — `ADMIN_NOTIFICATION_EMAILS` se valida como array, rechaza strings vacíos.
- [x] **Dev mode sin API key** — el wrapper loggea en consola, no intenta llamar a Resend si falta `RESEND_API_KEY`.
- [x] **Audit log append-only** — no hay DELETE en `admin_audit_log` desde código.
- [x] **Búsqueda libre `q` con escape explícito** — `%` y `_` se escapan antes del `ilike` (cierra M-10).
- [x] **`entityId` defensivo en audit log** — `entityId.slice(0, 8)` con null check (cierra C-4).
- [x] **Service role separation en seed** — `scripts/seed-demo.mjs` usa `SUPABASE_SECRET_KEY` explícitamente, no la anon key.

## C. Funcionalidad

### Hito A — Auditoría completa

- [x] **`docs/FASE-6-AUDIT.md`** — análisis senior con 23 issues inventariados (4 críticos + 11 medios + 8 bajos).
- [x] **Score general 9/10** post-fix (refresh triage 2026-06-28 detectó 5 M-* y 1 L-* ya cerrados en código que el audit original no había actualizado).

### Hito B — Login alumno con magic link fallback

- [x] **`StudentLoginCard`** (`src/app/login/StudentLoginCard.tsx`) — componente client que renderiza Google OAuth como principal + magic link como fallback opcional (toggle visible con divider "o usa otro método").
- [x] **State preservation cross-mode** — `MagicLinkForm` siempre montado (con `hidden` según `mode`), preserva `email` + `sent` cuando el usuario alterna modos.
- [x] **`/login` page refactor** — microcopy renovada ("Bienvenido de vuelta · Continúa donde lo dejaste"), badge seguridad, trust strip final.
- [x] **OAuthLoginForm y MagicLinkForm** reusados sin cambios.

### Hito C — Métricas globales + búsqueda libre + seed demo

- [x] **Header `/admin/eventos`** — Card con 6 stat cards agregadas (Confirmados, Asistentes, Encuestas, Leads promovidos, Sin match, Conversión global).
- [x] **Tooltip explicativo en cada stat** vía `Tooltip` component (con `aria-describedby` + `title` fallback + delay 200ms en focus + soporte `align="end"` para tooltips cerca del borde derecho).
- [x] **Conversión solo sobre eventos PASADOS** — excluye próximos sin leads promovidos. Si no hay pasados, muestra `—` (no `0%`).
- [x] **`Tooltip` component** (`src/components/ui/Tooltip.tsx`) — accesible (a11y covered).
- [x] **Búsqueda libre `q`** en `/admin/system/audit-log` — input en form de filtros, persiste en URL como `?q=...`. Server lib hace OR sobre action / actor_email / entity_type / entity_id con escape de `%`/`_` (wildcards LIKE).
- [x] **Docstring honesto de `q`** — explícito sobre qué columnas busca (NO metadata) y por qué.
- [x] **`scripts/seed-demo.mjs`** — seed sintético completo: 3 eventos, ~28 confirmados, ~16 asistentes, ~12 encuestas, ~9 leads promovidos, ~20 leads sueltos, ~20 WhatsApp log, ~25 audit log. Idempotente via `seed_tag` en metadata.
- [x] **`ignoreDuplicates: true` en `events.upsert`** — preserva cambios manuales de David al título/descripción del evento al re-correr el seed (cierra M-11).
- [x] **`crypto.randomInt` para real randomness** en seed (cierra M-1, M-2).
- [x] **NPM scripts** — `npm run seed:demo`, `seed:demo:reset`, `seed:demo:cleanup`.

### Hito D — Resend utilities + smoke test

- [x] **API key de Resend** (scope `Sending access`, NO Full access) en `.env.local` (gitignored).
- [x] **`scripts/smoke-resend.mjs`** — llama `sendEmail()` con template HTML inline brand-colors, devuelve JSON `{ok, mode, id, error?}`.
- [x] **`scripts/smoke-resend.ps1`** — launcher nativo Windows que bypassea `npx + dotenv-cli + --eval` (hostil en PowerShell; patrón documentado en `memory/windows-powershell.md`).
- [x] **Validación end-to-end ejecutada** — email real recibido por David (status `delivered` en Resend dashboard).

### Hito E — Dominio `qlick.marketing` (separar cuando David dispare)

- [ ] **Dominio comprado y verificado en Resend** (3 records DNS: SPF / DKIM / DMARC).
- [ ] **`RESEND_FROM_ADDRESS` cambiado** a `notificaciones@qlick.marketing` en `.env.local`.
- [ ] **Smoke test con destinatario no-David** confirma que sale del sandbox `onboarding@resend.dev`.
- [ ] **Trigger real ejecutado** — `/admin/eventos/[id]` → tab Encuestas → "Promover a lead" sobre survey con `consent=true` → email llega al admin.
- [ ] **`docs/EVENTS_ADMIN_GUIDE.md` actualizado** con paso de "verificar deliverabilidad".

## D. Documentación

- [x] **`docs/FASE-6-AUDIT.md`** (nuevo + refreshed post-triage 2026-06-28) — 23 issues inventariados, 13 cerrados, score 9/10.
- [x] **`docs/SEED-DEV.md`** (nuevo) — guía operativa del seed demo.
- [x] **`docs/TECHNICAL-REVIEW.md`** (nuevo) — review técnico de Fase 6.
- [x] **`docs/ESTADO-ACTUAL.html`** (nuevo) — snapshot visual del estado actual.
- [x] **`docs/OPEN_ITEMS.md`** — Sesión 2026-06-28 tarde con Fase 6 cerrada (este commit).
- [x] **`docs/ROADMAP.md`** — Fase 6 cerrada con score 9/10, refresh post-triage.
- [x] **`CHANGELOG.md`** — entrada Fase 6 con todas las features.
- [x] **`docs/PRE_MERGE_CHECKLIST.md`** (este doc) — gate explícito antes de merge a `main` para Fase 6.
- [x] **`docs/SMTP_SETUP.md`** — guía paso a paso para configurar Resend (post-merge, opcional).

## E. Testing manual (recomendado antes de merge)

### Smoke test admin pages

- [ ] Login admin (`/admin/login` con email en `ADMIN_EMAIL_ALLOWLIST`)
- [ ] Navegar a `/admin/eventos` — debe mostrar header con 6 stat cards y tooltips
- [ ] Hover sobre cada stat card — tooltip aparece con explicación
- [ ] Navegar a `/admin/system/audit-log` — debe listar entries
- [ ] En `/admin/system/audit-log` → escribir en input "Búsqueda libre" → debe filtrar resultados
- [ ] Expandir "Ver diff" en una entry con snapshots → debe mostrar before/after
- [ ] Probar `scripts/smoke-resend.ps1` — debe retornar `{ ok: true, mode: "prod", id: "..." }`

### Login alumno (magic link fallback)

- [ ] Ir a `/login` — debe mostrar Google OAuth prominente con divider "o usa otro método"
- [ ] Click en toggle magic link — debe expandir el form (sin perder estado si ya se escribió email)
- [ ] Alternar entre Google y magic link 2-3 veces — el email escrito debe preservarse

### Seed demo

- [ ] `npm run seed:demo` (primera vez) — debe insertar 3 eventos + leads + encuestas + audit log
- [ ] `npm run seed:demo` (segunda vez) — debe reportar "⏭️ X entries del seed ya existen (skip)" y NO duplicar
- [ ] `npm run seed:demo:cleanup` — debe borrar todo lo del seed tag

### Mobile (375×812)

- [ ] `/admin/eventos` — header con 6 stat cards sin overflow horizontal (puede ser grid 2x3 en mobile)
- [ ] `/admin/system/audit-log` — filtros apilados, tabla con scroll horizontal OK
- [ ] `/login` — toggle magic link sin overflow

### Console

- [ ] 0 errors en cualquier admin page (Fase 6 no introduce nuevos)
- [ ] 0 warnings (excepto "No default component for parallel route" en 404, cosmético)

### Performance

- [ ] `/admin/eventos` carga < 1.5s con seed data (6 stat cards + 3 eventos)
- [ ] `/admin/system/audit-log` carga < 1.5s con ~50 entries (incluye diff view lazy)
- [ ] `npm run seed:demo` completa en < 30s (3 eventos + ~120 inserts)

## F. Decisiones aplicadas en Fase 6

- [x] **Magic link reactivado como fallback** (no reemplazo de Google OAuth) — toggle visible, no auto-collapsed.
- [x] **Score del audit refresh post-triage** — 8.5/10 → 9/10 al detectar 5 M-* y 1 L-* ya aplicados en código.
- [x] **`ignoreDuplicates: true` en seed** — preservar cambios manuales de David (decisión M-11).
- [x] **Escape explícito de wildcards en `q`** — opción A del audit original (suficiente para demo).

## G. Riesgos conocidos pre-merge

| Riesgo | Severidad | Mitigación |
|---|---|---|
| Resend API key no configurada en producción | 🟢 bajo | Dev mode loggea en consola; producción requiere setup de David (SMTP_SETUP.md) |
| Sandbox `onboarding@resend.dev` solo entrega a David | 🟡 medio | Leads reales no reciben email hasta Hito E (dominio verificado) |
| `xlsx` tiene 5 vulnerabilidades transitive (npm audit) | 🟠 medio | Scope al CLI; considerar migrar a `exceljs` si CI/CD se activa |
| `config.ts:56` mezcla secret en módulo importable | 🟠 medio | Refactor mayor, scope post-Fase 6 |
| `findLeadByPhone` O(N) en memoria con LIMIT 200 | 🟢 bajo | Aceptable para <200 leads |
| `admin_audit_log` crece sin límite | 🟢 bajo | Si crece >10k rows, considerar archivado anual |
| `M-6` Tooltip viewport collision sin Floating UI | 🟢 bajo | Workaround `align="end"` cubre el caso del header `/admin/eventos` |
| `M-9` DiffView sin truncation en entries grandes | 🟢 bajo | No hay entries >5KB en el seed actual |
| Dev server puede tener código stale durante el PR review | 🟢 bajo | Reiniciar `npm run dev` antes de mergear |

## H. Pasos de merge (orden)

```bash
# 1. Merge de Fase 4 primero (si no está mergeada)
cd C:\Users\User\Documents\Click
git checkout main
git pull
git merge feat/admin-eventos
git push

# 2. Merge de Fase 5 (después de Fase 4)
git merge feat/fase-5-planning
git push

# 3. Push de feat/fase-6-hitos
git checkout feat/fase-6-hitos
git push  # David corre esto desde su terminal

# 4. Verificar que CI pasa (si hay CI configurado)
# — por ahora no hay CI, así que los checks son los locales arriba.

# 5. Crear PR vía GitHub UI o CLI
gh pr create \
  --base main \
  --head feat/fase-6-hitos \
  --title "Fase 6: Polish + auditoría + métricas globales + magic-link fallback" \
  --body-file .github/PR_FASE_6.md

# 6. Review + merge
# David aprueba y mergea.

# 7. Setup post-merge de Resend (opcional, si quiere activar emails en prod)
# David sigue docs/SMTP_SETUP.md y configura .env.local en Vercel.
```

## I. Post-merge (próximos pasos)

- [ ] David configura Resend en producción (sigue `docs/SMTP_SETUP.md`) si quiere emails reales a leads.
- [ ] Decidir Hito E (dominio `qlick.marketing`) — bloqueado por compra del dominio por David.
- [ ] Considerar archivado anual del `admin_audit_log` cuando supere 10k rows.
- [ ] Planear Fase 7 (backend: multi-evento Excel, NLP sobre encuestas, WhatsApp Business API).
- [ ] Si pasa a Fase 7 con CI/CD: evaluar migración de `xlsx` a `exceljs` para limpiar npm audit.

---

**Aprobación final de David** (cuando todo esté ✅):

```
[ ] Aprobado para merge a main
Fecha: ___________
Notas: ___________
```

---

## Histórico

| Versión checklist | Fecha | Notas |
|---|---|---|
| 1.0 | 2026-06-28 | Cierre Fase 4 (Bloque 4) |
| 2.0 | 2026-06-28 | Cierre Fase 5 (Paquete A+B+C+D+E) |
| 3.0 | 2026-06-28 ~23:15 | Cierre Fase 6 (Hitos A+B+C+D + triage refresh) — este doc |
