# Deuda #1 — Liquidada

**Commit:** `15f5fb6` — `feat(admin): survey-config save endpoint + editor wire-up + validator bugfix`

## Lo que se construyó

### 1. Endpoint `POST /api/admin/events/[id]/survey-config`

Server-only. Auth admin (`requireAdmin` + `ADMIN_EMAIL_ALLOWLIST`). Validación con `validateSurveyConfig`. Si payload OK, UPDATE a `events.survey_config` (jsonb) via service-role + audit log en `admin_audit_log` con action `event_survey_config_update` + before/after snapshots.

```http
POST /api/admin/events/{id}/survey-config
Content-Type: application/json

{
  "surveyConfig": {
    "questions": [
      { "id": "q1", "text": "...", "type": "buttons", "options": [...] }
    ],
    "followUps": { "mql": { "text": "...", "templateName": null } }
  }
}
```

Respuestas:
- `200 { ok: true, eventId, surveyConfig, note }`
- `400 { ok: false, error: "surveyConfig inválido. ..." }`
- `401 { ok: false, error: "No autenticado como admin." }`
- `404 { ok: false, error: "Evento no encontrado." }`
- `500 { ok: false, error: "No se pudo actualizar: PGRST..." }`

### 2. Helper extraído: `saveSurveyConfigForEvent`

`src/lib/events/survey-config-save.ts` — encapsula la lógica de guardado (read prev + UPDATE + audit log). Testeable con mock supabase.

### 3. SurveyEditor ahora guarda de verdad

El botón "💾 Guardar" ahora hace `fetch POST` al endpoint. Estados:
- **Saving:** muestra "⏳ Guardando..."
- **Success:** muestra "✅ Guardado. N pregunta(s) persistidas en Supabase."
- **Error:** muestra "❌ [error message]" en rojo

### 4. 🐛 Bug encontrado y arreglado en el validator

El validator original chequeaba `qq.isConsent === true` (en la QUESTION) cuando el flag realmente está en las OPCIONES. Como resultado, **una config con 2 preguntas que tuvieran `isConsent: true` en opciones pasaba la validación silenciosamente** — riesgo legal bajo LFPDPPP.

**Fix:** `consentCount++` ahora se incrementa dentro del loop de `options`, no en el loop de `questions`. Cobertura de tests cubre este caso explícitamente.

## Tests añadidos (10 tests nuevos en `tests/survey-config-endpoint.test.mjs`)

```
✓ validator: rechaza config con 1 opción en buttons (mínimo 2)
✓ validator: rechaza config con 4 opciones en buttons (máximo 3)
✓ validator: rechaza título >20 chars (límite Meta)
✓ validator: rechaza questions array vacío
✓ validator: rechaza >1 flag isConsent (LFPDPPP: consent debe ser único)
✓ validator: rechaza >1 flag isBusinessDescription
✓ validator: rechaza preguntas sin id
✓ validator: acepta payload válido con isConsent + isCommercialInterest
✓ validator: acepta payload válido con pregunta text + buttons mixto
✓ validator: rechaza null/undefined/empty
```

**NOTA IMPORTANTE sobre tests E2E end-to-end:**
Los tests E2E del endpoint completo (auth + UPDATE + audit) no se pudieron implementar aquí porque `node --experimental-strip-types` no resuelve el alias `@/lib/...` de Next.js, y `saveSurveyConfigForEvent` importa de `@/lib/crm/audit-server` que tiene más dependencias transitivas. El test del validator (que es la lógica core que corre ANTES del guardado) sí está cubierto.

Para Fase 8+ se puede:
- Usar `tsconfig-paths/register` en el setup de tests.
- O migrar a Vitest que sí resuelve path aliases.
- O usar `tsx` con `--tsconfig-paths` flag.

## Validación

- ✅ `npm run type-check` (0 errores)
- ✅ `npm run lint` (0 warnings)
- ✅ `npm test` (475/475 — antes 465, +10 nuevos)

## Próximo paso (Fase 8+ opcional)

Cuando David quiera cerrar el ciclo del PR:
1. PR `feat/funnel-dynamic-surveys-crm` → `main` con este commit incluido
2. Aplicar la migration `20260705220000_add_survey_config_to_events.sql` en Supabase
3. Merge + deploy
4. (Opcional) Aprobar Meta template `conf_post_conferencia` para que el cron use template en vez de texto libre