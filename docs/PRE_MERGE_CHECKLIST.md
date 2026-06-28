# Pre-Merge Checklist — `feat/fase-5-planning` → `main`

> **Propósito:** Gate explícito antes de mergear la rama `feat/fase-5-planning` a `main`.
> David debe marcar cada item como ✅ antes de aprobar el merge.
>
> **Última revisión:** 2026-06-28 (cierre Fase 5 Paquete A+B+C+D+E).
>
> **Prereq:** `feat/admin-eventos` (Fase 4) mergeado a `main` primero.

---

## A. Calidad técnica

- [x] **`npx tsc --noEmit`** — sin errores (type-check)
- [x] **`npm run lint`** — sin warnings (`next lint`)
- [x] **`npm test`** — 110/110 tests pasando (cero fails, 0 skips, 0 cancelled)
- [x] **`npm run build`** — production build OK
- [x] **Cero `TODO` / `FIXME` / `XXX` / `HACK`** en código de producción
- [x] **Cero `console.log`** en código de producción (solo `console.error` para fail-safe logging)
- [x] **Cero secrets hardcoded** — todo via `.env.local` (vars Resend documentadas en SMTP_SETUP.md)

## B. Seguridad

- [x] **Todos los `/api/admin/**` llaman `requireAdmin()`** — verificado con grep
  - `/api/admin/events/[id]/clone` (nuevo en Fase 5) ✅
- [x] **Migration additive** (`20260629000000_admin_audit_log_diff.sql`) — `IF NOT EXISTS` en ALTER TABLE. Compatible con installs existentes.
- [x] **Resend wrapper fail-safe** — si falla el send, NO rollbackea la operación principal (promoteSurveyToLead sigue creando el lead aunque el email falle).
- [x] **Template HTML escapaado** — `&` → `&amp;` en URLs, no permite inyección.
- [x] **Subject sin PII** — el subject del email NO incluye nombre/email del lead (anti-spam filters).
- [x] **Recipients CSV normalizados** — `ADMIN_NOTIFICATION_EMAILS` se valida como array, rechaza strings vacíos.
- [x] **Dev mode sin API key** — el wrapper loggea en consola, no intenta llamar a Resend si falta `RESEND_API_KEY`.
- [x] **Audit log append-only** — no hay DELETE en `admin_audit_log` desde código.

## C. Funcionalidad

### Paquete B — Notificaciones por email

- [x] **Resend wrapper** (`src/lib/email/resend-client.ts`) — best-effort, fail-safe, dev mode.
- [x] **Template `survey-with-consent`** — HTML inline con brand colors + link al drawer del lead.
- [x] **Trigger automático** — al `promoteSurveyToLead` crear lead nuevo → email al admin.
- [x] **Recipients configurables** via `ADMIN_NOTIFICATION_EMAILS` (CSV).

### Paquete C — Audit log de admin

- [x] **Migration additive** — `before`/`after` JSONB columns (nullable).
- [x] **`logAdminAction` extendido** — acepta `before`/`after` opcionales.
- [x] **Events integration** — `createEvent`, `updateEvent`, `updateEventStatus` pasan snapshots completos.
- [x] **`listAuditLogs`** (server lib) — filtros + paginación + total.
- [x] **Página `/admin/system/audit-log`** — tabla + filtros URL-driven + diff view expandible.

### Paquete D — Clone + Undo archivar

- [x] **`cloneEvent`** (server lib) — slug único, status='draft' forzado, NO copia confirmados/asistentes/encuestas/leads.
- [x] **POST `/api/admin/events/[id]/clone`** — route handler protegido.
- [x] **Botón "📋 Clonar evento"** en EventDrawer (footer modo edit).
- [x] **Toast "Clonado — Abrir"** con link al clon.
- [x] **Undo archivar** — toast no-bloqueante con botón "Deshacer" + auto-dismiss 5s.
- [x] **Accesibilidad del toast** — `role="status"` + `aria-live="polite"` + `prefers-reduced-motion`.

### Paquete E — Polish

- [x] **Mobile 375×812 verified** — audit log + admin eventos + evento detail sin overflow horizontal.

## D. Documentación

- [x] **`docs/EVENTS_ADMIN_GUIDE.md`** — manual operativo completo, actualizado con undo + clone + audit log + Resend.
- [x] **`docs/SMTP_SETUP.md`** (nuevo) — guía paso a paso para configurar Resend (30 min).
- [x] **`docs/OPEN_ITEMS.md`** — Sesión 2026-06-28 tarde con Fase 5 cerrada (este commit).
- [x] **`docs/ROADMAP.md`** — Fase 4 + Fase 5 cerradas, preview Fase 6.
- [x] **`CHANGELOG.md`** — v0.11.0 entry con todas las features de Fase 5.
- [x] **`docs/PRE_MERGE_CHECKLIST.md`** (este doc) — actualizado para Fase 5.
- [x] **`docs/FASE_5_PLAN.md`** — scope original, sub-bloques, decisiones D-1..D-8.

## E. Testing manual (recomendado antes de merge)

### Smoke test admin pages

- [ ] Login admin (`/admin/login` con email en `ADMIN_EMAIL_ALLOWLIST`)
- [ ] Navegar a `/admin/eventos` — debe listar eventos
- [ ] Click "Editar" en un card → debe abrir EventDrawer
- [ ] En EventDrawer footer → debe aparecer nueva fila "📋 Clonar evento"
- [ ] Click "Clonar evento" → debe crear copia con sufijo "-copia" + cerrar drawer
- [ ] Toast "Clonado — Abrir" debe aparecer bottom-right con link
- [ ] En EventDrawer → click "Archivar" → confirma → toast "archivado — Deshacer"
- [ ] Click "Deshacer" dentro de 5s → debe volver a status="draft"
- [ ] Esperar 5s sin click → toast debe desaparecer solo
- [ ] Navegar a `/admin/system/audit-log` → debe listar entries (puede estar vacío si DB no tiene migrations)
- [ ] En `/admin/system/audit-log` con datos → expandir "Ver diff" → debe mostrar before/after

### Setup de Resend (post-merge, opcional)

- [ ] David sigue `docs/SMTP_SETUP.md` (signup → DNS → API key)
- [ ] Agrega `RESEND_API_KEY`, `RESEND_FROM_ADDRESS`, `ADMIN_NOTIFICATION_EMAILS` a `.env.local`
- [ ] Trigger manual: importar una encuesta con consent=true → debe llegar email al admin

### Mobile (375×812)

- [x] `/admin/system/audit-log` — filtros apilados, tabla con scroll horizontal OK
- [x] `/admin/eventos` — cards 1 col, sin overflow
- [x] `/admin/eventos/[id]` — métricas 2x2 grid, tabs pills wrap

### Console

- [ ] 0 errors en cualquier admin page (Fase 5 no introduce nuevos)
- [ ] 0 warnings (excepto "No default component for parallel route" en 404, cosmético)

### Performance

- [ ] `/admin/eventos` carga < 1s con seed data (3 eventos)
- [ ] `/admin/eventos/[id]` carga < 1.5s con seed data
- [ ] `/admin/system/audit-log` carga < 1.5s con 50 entries

## F. Decisiones aplicadas en Fase 5

- [x] **D-1**: Resend confirmado (no SendGrid).
- [x] **D-4**: retention indefinido (archivado anual si crece).
- [x] **D-6**: audit UI en Paquete C (mínimo viable: tabla + diff).
- [x] **D-7**: undo + clone incluidos en Fase 5.

## G. Riesgos conocidos pre-merge

| Riesgo | Severidad | Mitigación |
|---|---|---|
| Resend API key no configurada | 🟢 bajo | Dev mode loggea en consola; producción requiere setup de David (SMTP_SETUP.md) |
| `xlsx` tiene 5 vulnerabilidades transitive (npm audit) | 🟠 medio | Scope al CLI; considerar migrar a `exceljs` si CI/CD se activa |
| `config.ts:56` mezcla secret en módulo importable | 🟠 medio | Refactor mayor, scope post-Fase 5 |
| `findLeadByPhone` O(N) en memoria con LIMIT 200 | 🟢 bajo | Aceptable para <200 leads |
| `admin_audit_log` crece sin límite | 🟢 bajo | Si crece >10k rows, considerar archiving de entries >1 año |
| `cloneEvent` puede fallar si hay 50+ copias del mismo evento | 🟢 bajo | Max 50 intentos; usuario debe borrar manualmente o renombrar |
| Dev server puede tener código stale durante el PR review | 🟢 bajo | Reiniciar `npm run dev` antes de mergear |

## H. Pasos de merge (orden)

```bash
# 1. Merge de Fase 4 primero (si no está mergeada)
cd C:\Users\User\Documents\Click
git checkout main
git pull
git merge feat/admin-eventos
git push

# 2. Push de feat/fase-5-planning
git checkout feat/fase-5-planning
git push

# 3. Verificar que CI pasa (si hay CI configurado)
# — por ahora no hay CI, así que los checks son los locales arriba.

# 4. Crear PR vía GitHub UI o CLI
gh pr create \
  --base main \
  --head feat/fase-5-planning \
  --title "Fase 5: Notificaciones + audit log + clone/undo" \
  --body-file .github/PR_FASE_5.md

# 5. Review + merge
# David aprueba y mergea.

# 6. Setup post-merge de Resend (opcional)
# David sigue docs/SMTP_SETUP.md y configura .env.local en Vercel.
```

## I. Post-merge (próximos pasos)

- [ ] David configura Resend (sigue `docs/SMTP_SETUP.md`).
- [ ] Activar emails en producción: importar una encuesta real con consent → confirmar que llega email al admin.
- [ ] Iniciar Fase 6: pagos reales (Stripe / MercadoPago / Conekta) + WhatsApp Business API (decisión de proveedor).
- [ ] Considerar archivado anual del `admin_audit_log` cuando supere 10k rows.
- [ ] Planear el roadmap Fase 7 (backend: multi-evento Excel, NLP sobre encuestas, etc.).

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
| 2.0 | 2026-06-28 | Cierre Fase 5 (Paquete A+B+C+D+E) — este doc |