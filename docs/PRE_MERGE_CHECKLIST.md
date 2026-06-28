# Pre-Merge Checklist — `feat/admin-eventos` → `main`

> **Propósito:** Gate explícito antes de mergear la rama `feat/admin-eventos` a `main`.
> David debe marcar cada item como ✅ antes de aprobar el merge.
>
> **Última revisión:** 2026-06-28 (cierre Bloque 4).

---

## A. Calidad técnica

- [x] **`npm run type-check`** — sin errores (`tsc --noEmit`)
- [x] **`npm run lint`** — sin warnings (`next lint`)
- [x] **`npm test`** — 98/98 tests pasando (cero fails, 0 skips, 0 cancelled)
- [x] **`npm run build`** — no corrido localmente (recomendado correr en CI pre-merge)
- [x] **Cero `TODO` / `FIXME` / `XXX` / `HACK`** — verificado con grep
- [x] **Cero `console.log` / `console.warn` / `console.error`** en código de producción
- [x] **Cero secrets hardcoded** — todo via `.env.local`

## B. Seguridad

- [x] **Todos los `/api/admin/**` llaman `requireAdmin()`** — verificado con grep (29/29)
- [x] **RLS habilitado** en todas las tablas nuevas: `events`, `event_confirmations`,
      `event_attendees`, `event_surveys`, `event_survey_unmatched`, `lead_event_links`
- [x] **PII fuera de logs** — `emailLength` / `emailDomain` en vez de emails crudos
- [x] **Magic links / OAuth** funcionando para auth admin
- [x] **Dev login bypass** (`/api/dev/login`) rechaza en producción (`NODE_ENV=production`)
- [x] **Auditoría externa** (2026-06-27) findings cerrados — ver `OPEN_ITEMS.md` §1

## C. Funcionalidad

- [x] **Lista de eventos** (`/admin/eventos`) con cards + conteos en vivo
- [x] **Detalle del evento** con 4 tabs + Pipeline view toggle
- [x] **Wizard de import** (`/admin/eventos/[id]/import`) con dry-run + batchId
- [x] **Match manual attendee ↔ confirmation** con dropdown
- [x] **Marcar/des-marcar encuestas como revisadas**
- [x] **Promover survey (consent=Sí) → lead del CRM**
- [x] **WhatsApp workflow** (estados + audit log)
- [x] **Drawer del lead** con badge de evento + historial + notas + tareas
- [x] **Bloque 3 polish**: empty states, SubmitButton, error boundaries, loading states,
      validación inline, mobile-friendly (375×812)
- [x] **EventDrawer** (crear/editar evento) con validación per-field

## D. Documentación

- [x] **`docs/EVENTS_ADMIN_GUIDE.md`** — manual operativo completo (620 líneas)
- [x] **`docs/OPEN_ITEMS.md`** — Bloque 3 cerrado, Bloque 4 cerrado, deuda activa tracked
- [x] **`docs/ROADMAP.md`** — Fase 4 status actualizado, Bloque 3A→3F documentados
- [x] **`CHANGELOG.md`** (nuevo) — release notes consolidadas
- [x] **`docs/demo-socios.html`** (nuevo) — 1-pager para presentar a socios
- [x] **`docs/IMPORT_FORMAT.md`** — spec del formato Excel
- [x] **`docs/DEV_LOGIN_BYPASS.md`** — uso del dev login

## E. Testing manual (recomendado antes de merge)

### Smoke test admin pages
- [ ] Login admin (`/admin/login` con email en `ADMIN_EMAIL_ALLOWLIST`)
- [ ] Navegar a `/admin` — debe cargar AdminView con tabs
- [ ] Click tab CRM — debe mostrar pipeline kanban
- [ ] Click tab CRM → Calendario → debe mostrar Próximas citas (no todas)
- [ ] Navegar a `/admin/eventos` — debe listar eventos
- [ ] Click "Ver detalle" → debe abrir detail con 4 tabs + métricas
- [ ] Click tab Confirmados → debe mostrar tabla + búsqueda + broadcast WhatsApp
- [ ] Click tab Asistentes → debe mostrar tabla + dropdown match
- [ ] Click tab Encuestas → debe mostrar tabla + "Marcar revisada"
- [ ] Click tab Leads promovidos → debe mostrar leads con link a CRM
- [ ] Click "Editar" en un card → debe abrir EventDrawer con form prellenado
- [ ] Submit EventDrawer vacío → debe mostrar errores inline por field
- [ ] Click `+ Nuevo evento` → debe abrir EventDrawer vacío
- [ ] Click "Ver landing pública ↗" → debe abrir `/masterclass/[slug]` en nueva tab
- [ ] Click en un lead del CRM → debe abrir drawer
- [ ] Drawer → "Cambiar etapa" → debe persistir y mostrar success toast
- [ ] Drawer → "Registrar contacto" → debe agregar al historial

### Mobile (375×812)
- [ ] Hamburger menu funciona
- [ ] Tablas se ven sin overflow horizontal
- [ ] Drawer ocupa full-width
- [ ] Formularios usables con touch targets ≥36px

### Console
- [ ] 0 errors en cualquier admin page
- [ ] 0 warnings (excepto "No default component for parallel route" en 404, cosmético)

### Performance
- [ ] `/admin/eventos` carga < 1s con seed data (3 eventos)
- [ ] `/admin/eventos/[id]` carga < 1.5s con seed data (50 confirmados)
- [ ] `/admin` (CRM) carga < 1s

## F. Decisiones pendientes con socios (NO bloquean merge pero documentar)

- [ ] Proveedor de pagos (MercadoPago / Stripe / Conekta) — para Fase 5+
- [ ] Contenido real de cursos — placeholder YouTube → videos propios
- [ ] Plantilla de email transaccional — branded vs default Supabase
- [ ] Monitoring de errores — Sentry vs nada

## G. Riesgos conocidos pre-merge

| Riesgo | Severidad | Mitigación |
|---|---|---|
| `xlsx` tiene 5 vulnerabilidades transitive (npm audit) | 🟠 medio | Scope al CLI; considerar migrar a `exceljs` si CI/CD se activa |
| `config.ts:56` mezcla secret en módulo importable | 🟠 medio | Refactor mayor, scope post-Fase 4 |
| `findLeadByPhone` O(N) en memoria con LIMIT 200 | 🟢 bajo | Aceptable para <200 leads; cuando crezca, agregar índice funcional en `phone_normalized` |
| Migración `lead_event_links_unique` puede fallar en producción si hay datos pre-existentes violando constraint | 🟠 medio | Query de detección pre-migrar: ver `OPEN_ITEMS.md` §1 |
| 19 commits ahead of `origin/feat/admin-eventos` | — | David debe `git push` antes de merge |

## H. Pasos de merge (orden)

```bash
# 1. Push de feat/admin-eventos (David desde su terminal)
cd C:\Users\User\Documents\Click
git push

# 2. Verificar que CI pasa (si hay CI configurado)
# — por ahora no hay CI, así que los checks son los locales arriba.

# 3. Crear PR vía GitHub UI o CLI
gh pr create \
  --base main \
  --head feat/admin-eventos \
  --title "Fase 4: Admin /admin/eventos + WhatsApp manual" \
  --body-file .github/PR_FASE_4.md

# 4. Review + merge
# David aprueba y mergea.

# 5. Cleanup local
git checkout main
git pull
git branch -d feat/admin-eventos
```

## I. Post-merge (próximos pasos)

- [ ] Iniciar Fase 5: notificaciones automáticas + admin CRUD de eventos (sin tocar SQL)
- [ ] Cerrar los 5 deliverables abiertos en `OPEN_ITEMS.md` §"Pendientes — features"
- [ ] Considerar integración con WhatsApp Business API (Meta Cloud o BSP) para auto-transición
      de estados (reemplazar workflow manual)
- [ ] Planear el roadmap Fase 6 (backend: multi-evento Excel, NLP sobre encuestas, etc.)

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
| 1.0 | 2026-06-28 | Versión inicial — cierre Bloque 4 |