# Plan Maestro v4 — Ejecutado Completo

**Rama:** `feat/funnel-dynamic-surveys-crm`
**Push a:** origin (rama lista para PR)
**Base:** `main`
**Estado:** ✅ **12 commits, 22 archivos modificados, +3,029 / -315 líneas**

---

## Commits ejecutados (en orden)

| # | SHA | Descripción |
|---|---|---|
| 1 | `b54527a` | `feat(db): add survey_config jsonb to events` |
| 2 | `c9b01bc` | `feat(types): SurveyConfig, SurveyQuestion, SurveyFollowUps` |
| 3 | `56a8c2c` | `feat(mapper): validate survey_config with manual schema + Default template` |
| 4 | `d0100d4` | `feat(scoring): calculateLeadScoreFromConfig with dynamic question weighting` |
| 5 | `b12b893` | `feat(wizard): buildDynamicSurveyStep + detectDynamicSurveyButton` |
| 6 | `ccc3033` | `feat(bot-engine): dynamic wizard using survey_config (with legacy fallback)` |
| 7 | `c056df6` | `feat(promotion): PromotionEngine + auto status transitions + CRM tasks` |
| 8 | `c3e4bc8` | `feat(forms): dynamic web survey rendering from survey_config` |
| 9 | `96594e6` | `feat(submit-survey): dynamic endpoint with auto-promo + Brevo admin alert` |
| 10 | `bb5ba1e` | `feat(admin): survey editor UI for /admin/eventos/[id]` |
| 11 | `bad3313` | `feat(cron): proactive survey reminders 4h post-event via WhatsApp` |
| 12 | `41bb477` | `feat(admin): hot leads panel + granular scoring/promotion tests` |

---

## Validación pasada

- ✅ `npm run type-check` (0 errores)
- ✅ `npm run lint` (0 warnings)
- ✅ `npm test` (**465/465 tests pasan** — antes 444, +21 nuevos)

### Tests nuevos

- `tests/lead-scoring-dynamic.test.mjs` — 13 tests del scoring dinámico
- `tests/promotion-engine.test.mjs` — 8 tests del Promotion Engine

---

## Lo que está construido

### Capa de datos
- `events.survey_config` (jsonb, nullable=false) — definición dinámica por evento
- Plantilla Default del sistema (5 preguntas) con flags isConsent, isCommercialInterest, isBusinessDescription
- Validador runtime (sin Zod, manual) con límites Meta (3 botones, 20 chars)

### Capa de scoring
- `calculateLeadScoreFromConfig(responses, config)` — scoring dinámico 0-100
- Detección de flags isConsent / isCommercialInterest / isBusinessDescription
- `substituteTemplateVars(text, vars)` para `{{1}}` → nombre

### Capa de promoción
- `applyPromotionRules(leadId, score, ctx)` — actualiza status, crea CRM task, notifica admin via audit log
- `selectFollowUpBucket(score)` — mql/hot/coldWarm
- **Reglas:**
  - MQL (≥60): status=`qualified`, task HOT (priority=high, due +1d), admin notified
  - Hot (40-59): status=`contacted`, task media (due +3d)
  - Warm (20-39): status=`contacted`, task baja (due +7d)
  - Cold (<20): sin cambios

### Capa wizard (WhatsApp)
- `buildDynamicSurveyStep({eventTitle, question, leadName})` — builder único que maneja buttons y text
- `detectDynamicSurveyButton(buttonId)` — extrae questionId/optionId
- `bot-engine.ts` refactorizado: handlers `survey_qN_*` soportan config dinámico, fallback a path legacy hardcoded si no hay `questions[]` en metadata

### Capa web
- `/encuesta/[token]` renderiza dinámicamente desde `surveyConfig` (no más campos hardcoded)
- Detecta automáticamente `isConsent` flag — no requiere checkbox separado si hay una opción con ese flag
- Validación client-side (rating required, fallback consent si no hay flag)

### Capa endpoint
- `/api/submit-survey` completamente dinámico:
  1. Carga evento + surveyConfig
  2. Crea encuesta con config (scoring dinámico)
  3. Marca token como usado
  4. **Auto-promoción** si consent + commercial_interest
  5. **Promotion Engine** (status + CRM tasks)
  6. **Follow-up WhatsApp** al lead por texto libre con `{{1}}`
  7. **Email Brevo** al admin si MQL/Hot

### Capa cron
- `/api/cron/survey-reminders` — cada hora, busca eventos finalizados en ventana 4h±1h
- Para cada attendee sin survey submitted:
  - Genera token único (reutiliza si existe)
  - Envía WhatsApp con link privado
  - Loggea en `event_reminder_log` (idempotente)
- Meta template `conf_post_conferencia` con {{1}}/{{2}}/{{3}} queda como TODO (espera aprobación Meta)

### Capa admin UI
- `/admin/eventos/[id]` → nueva tab **"📋 Editor"** con:
  - Lista editable de questions (drag-to-reorder con ↑↓ buttons)
  - Add/remove options por question
  - Validaciones live (3 botones, 20 chars, ≤1 isConsent, ≤1 isBusinessDescription)
  - Botón "↺ Reset a default" (5 preguntas del sistema)
  - Score editable por opción
  - Checkboxes isConsent / isCommercialInterest / isBusinessDescription
  - **Botón "💾 Guardar"** muestra toast "pendiente" — el endpoint POST está fuera de scope de este commit (Fase 8+)

- `/admin?tab=crm` → nuevo widget **"🔥 Leads Calientes sin Actividad"**
  - Top 20 leads hot/mql sin contacto en >3 días
  - Score DESC, link directo al drawer del lead
  - Empty state con mensaje de aliento si no hay leads hot pendientes

---

## Cosa que NO se hizo (deuda consciente)

1. **Endpoint POST `/api/admin/events/[id]/survey-config`** — el botón "Guardar" del editor muestra toast pendiente. Crear cuando David apruebe la UI. Estimado: 2 horas.
2. **Meta template `conf_post_conferencia`** — el cron envía texto libre con el link. Cuando David apruebe el template en Meta Business Manager (~24-48h), cambiar `provider.send` por la llamada con template + variables `{{1}}`/`{{2}}`/`{{3}}`.
3. **Auto-promoción solo para encuestas con score alto** — el flujo actual es: cualquier lead con consent + commercial_interest se auto-promueve. Si David quiere filtros más finos (ej. "solo si score ≥ 40"), se ajusta en 5 min en `applyPromotionRules`.
4. **Templates reutilizables** (`event_survey_templates` tabla separada) — YAGNI por ahora. Si David quiere "Masterclass" como template reusable entre eventos, se extrae del JSONB con migration aditiva.
5. **Drag-and-drop real** (no botones ↑↓) — el editor usa botones. Si David quiere react-dnd o similar, son 2 horas más.

---

## Próximos pasos sugeridos

### Inmediato (para validar end-to-end)
1. David aplica la migration `20260705220000_add_survey_config_to_events.sql` en Supabase dashboard (o via SQL Editor — está pendiente por el drift de credenciales).
2. PR review con `gh pr create` (rama lista).
3. Una vez mergeado a main, deploy a Vercel.

### Corto plazo (Fase 8+)
1. Endpoint `POST /api/admin/events/[id]/survey-config` con auth admin + audit log.
2. Aprobar Meta template `conf_post_conferencia` y cambiar `cron/survey-reminders.ts` para usarlo.
3. (Opcional) Drag-and-drop real en el editor visual.

---

## Estado final

- **Working tree:** clean
- **Branch:** `feat/funnel-dynamic-surveys-crm`
- **Ahead of main:** 12 commits
- **Tests:** 465/465 pasan
- **Build:** type-check ✓ lint ✓
- **Push a origin:** ✅ exitoso
- **Listo para:** PR review

Comando sugerido para abrir PR desde la terminal de David:
```bash
gh pr create --base main --head feat/funnel-dynamic-surveys-crm \
  --title "feat(funnel): dynamic surveys + scoring + promotion engine (12 commits)" \
  --body "Plan completo ejecutado. Ver docs/PLAN_EJECUTADO.md para detalle."
```