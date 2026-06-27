# Fase 3 — Events Funnel Foundation (v0.7.0)

> **Fecha:** 2026-06-26
> **Estado:** Implementación completada en rama `feat/events-funnel-foundation`.
> Pendiente de merge a `main` después de validar con `_test-fase3.mjs`.
> **Objetivo:** Dejar lista la base del módulo de eventos para que la
> Fase 4 (UI admin + WhatsApp manual) pueda operar sobre datos reales
> sin tocar la base del funnel.

---

## 1. Resumen ejecutivo

Fase 3 dejó lista la **infraestructura de datos + server libs + importador
CLI** del módulo de eventos. Lo que **NO** entra en esta fase es la UI
admin y el WhatsApp manual workflow — eso queda para Fase 4.

La inversión fue:
- 11 commits testeables independientemente
- 6 tablas nuevas + 4 enums (event_status, event_confirmation_source, event_attendee_source, lead_event_link_type)
- 14 tests unitarios pasando (importer)
- Cero dependencias nuevas excepto `xlsx` (acotada al importador CLI)
- Cero PII en fixtures o tests
- Cierre del **H2 del QA round 1 de Fase 2** (race condition en tags) por construcción: `lead_event_links` es INSERT-only

---

## 2. Lo que se entregó

### 2.1 Schema (commit 1)

| Tabla | Propósito | RLS |
|-------|-----------|-----|
| `events` | Catálogo público de eventos | SELECT público si `status='published'` |
| `event_confirmations` | Personas que confirmaron asistencia (no son leads) | Default-deny |
| `event_attendees` | Quién realmente asistió (puede NO matchear con confirmation) | Default-deny |
| `event_surveys` | Respuestas de encuesta (gatilla el `consent_to_contact`) | Default-deny |
| `event_survey_unmatched` | Visibilidad admin: prospectos con interés sin consent | Default-deny |
| `lead_event_links` | Join lead ↔ event record (cierra H2 de Fase 2) | Default-deny |

`lead_event_links` tiene UNIQUE `(lead_id, link_type, link_id)` → dos requests concurrentes que intenten agregar el mismo link: uno gana, el otro recibe `23505 unique_violation` y se reporta como "ya estaba" (idempotente).

### 2.2 Tipos del dominio (commit 2)

`src/types/events.ts`:
- `Event`, `EventConfirmation`, `EventAttendee`, `EventSurvey`,
  `EventSurveyUnmatched`, `LeadEventLink`
- 6 enums literales (mismas que la DB)
- `EventImportSummary` + `ImportWarning` (output del importador)

### 2.3 Mapper (commit 3)

`src/lib/events/event-mapper.ts`: funciones puras row → dominio. Single source of truth = typegen de Supabase.

### 2.4 Server libs (commits 4-6)

5 archivos server-only con fallback consistente al patrón del proyecto:
- `events-server.ts` — CRUD + admin summaries con conteos
- `confirmations-server.ts` — list + create + cross-check
- `attendees-server.ts` — list + create + unmatched detection
- `surveys-server.ts` — list + create
- `promotion.ts` — **la pieza central**: encuesta con consent → lead via `createLeadFromEvent` (de Fase 2)

`promotion.ts` aplica las 3 reglas del `EVENTS_FUNNEL_CONCEPT.md` §5:
1. `consent_to_contact = true` (sin esto, NO se promueve)
2. `commercial_interest` no vacío
3. Email O phone presente

Si falla alguna, marca la survey en `event_survey_unmatched` con la razón.

### 2.5 Refactor del STUB de Fase 2 (commit 7)

`linkLeadToEventRecord` en `src/lib/crm/leads-server.ts` ya NO es STUB:
- Antes: SELECT-then-UPDATE de `tags` (race window entre SELECT y UPDATE)
- Ahora: INSERT directo en `lead_event_links` (sin race, idempotente por UNIQUE)

Cierra el **H2 del QA round 1 de Fase 2**. Contrato público preservado.

### 2.6 Importador CLI (commit 8)

`scripts/import-event.mjs` con `xlsx` como única dep nueva:
- Lee `.xlsx` de `--file` (ruta local) o `$QLICK_IMPORT_PATH`
- Auto-detecta headers con sinonimos ES + EN (override manual con `--map`)
- Tolerante al layout del Excel real (headers en fila variable, no fila 1)
- Normaliza teléfonos MX (`+52XXXXXXXXXX` por default si 10 dígitos)
- Maneja 9 dígitos como warning (no rechazo)
- Modo `--dry-run` para validar antes de tocar la DB
- Reporte: `inserted / duplicates / invalid / errors`

### 2.7 Tests unitarios (commit 9)

`tests/event-importer.test.mjs` con 14 tests cubriendo:
- `parseYesNo`: 5 variaciones
- `resolveHeader`: 5 sinonimos
- `mapSourceToEnum`: 4 casos
- `parseXlsxForImport`: 9 end-to-end con Excel sintético generado en memoria (cero fixtures commiteados)

### 2.8 Barrel (commit 10)

`src/lib/events/index.ts`: fachada pública del módulo. Re-exporta server libs, importer, mappers y tipos.

---

## 3. Lo que NO se entregó (per spec + decisión de scope)

### 3.1 Diferido a Fase 4 (siguiente fase lógica)

- ❌ **UI admin** (`/admin/eventos`): lista de eventos, detalle, wizard de import, drawer de lead con "de qué evento vino". Hoy se usa Supabase Dashboard.
- ❌ **WhatsApp manual workflow**: template de mensaje + `wa.me/` link + audit log + estados del botón (`no_contactado` → `mensaje_preparado` → `contactado` → `respondió` → `interested`/`lost`). El concept lo define pero la UI no entra en esta fase.
- ❌ **Server actions públicos** para que un visitante complete un form público de "registrarme al evento X". El formulario público de masterclass ya existe (`/masterclass/[slug]`) y es el patrón a imitar cuando lo decidamos.

### 3.2 Diferido a Fase 5+ (out of scope)

- ❌ **Notificaciones automáticas** (email al admin cuando entra encuesta) — requiere SMTP.
- ❌ **Multi-evento en un solo Excel** (D-8 del concept).
- ❌ **CRUD admin completo de eventos** desde panel sin tocar SQL.
- ❌ **Análisis de sentimiento de la encuesta** (NLP sobre respuestas libres).
- ❌ **Pagos dentro del evento** (cobrar inscripción in-situ).

### 3.3 Por scope, no por scope creep

- ❌ **Tests E2E con Playwright** sobre `/admin/eventos` — CI no está listo, el tour Playwright manual puede verificarlo.
- ❌ **Pagos** — sigue siendo scope del LMS (no de eventos).
- ❌ **WhatsApp Business API** — sigue manual (Fase 4+).

---

## 4. Archivos creados / modificados

### 4.1 Creados (10 archivos)

```
supabase/migrations/20260627000000_events_funnel.sql   (274 líneas)
src/types/events.ts                                    (236 líneas)
src/lib/events/event-mapper.ts                         (130 líneas)
src/lib/events/events-server.ts                        (419 líneas)
src/lib/events/confirmations-server.ts                 (252 líneas)
src/lib/events/attendees-server.ts                    (200 líneas)
src/lib/events/surveys-server.ts                       (146 líneas)
src/lib/events/promotion.ts                            (339 líneas)
src/lib/events/importer.ts                             (425 líneas)
src/lib/events/index.ts                                (102 líneas)
scripts/import-event.mjs                               (300 líneas)
tests/event-importer.test.mjs                          (288 líneas)
docs/EVENTS_FUNNEL_FOUNDATION.md                       (este doc)
```

### 4.2 Modificados (2 archivos)

```
src/lib/crm/leads-server.ts                            (linkLeadToEventRecord: STUB → real)
src/types/supabase.ts                                  (+6 tablas + 4 enums, typegen provisional)
```

---

## 5. Decisiones técnicas

| # | Decisión | Elección | Razón |
|---|----------|----------|-------|
| 1 | ¿Dónde guardo el link lead↔evento? | `lead_event_links` (tabla de join) | Cierra H2 de Fase 2 (race). Trazabilidad real con SELECT directo. |
| 2 | ¿Cómo normalizo teléfonos en el importer? | `normalizePhone` de Fase 2 + fallback `+52` si 10 dígitos | Reuso. Tolerante al Excel real del cliente (sin código de país). |
| 3 | ¿Dedup de confirmations/attendees? | `UPSERT ... onConflict ignoreDuplicates` | UNIQUE constraint en DB hace el trabajo. No hay check-then-insert. |
| 4 | ¿Encuesta sin consentimiento se promueve? | NO. Va a `event_survey_unmatched` con `reason='no_consent'` | Regla inquebrantable D-1 del concept. |
| 5 | ¿Asistió sin confirmar se promueve? | NO. Solo si respondió encuesta con consent (D-2 del concept) | Asistencia sin encuesta queda como dato operativo, no trigger comercial. |
| 6 | ¿Encuesta con interés pero sin email/phone? | `event_survey_unmatched` con `reason='no_email_no_phone'` | Visibilidad admin para contactar manualmente. |
| 7 | ¿Dep `xlsx`? | Sí, acotada al CLI | Alternativa CSV es fricción para el cliente. 5MB es aceptable. |
| 8 | ¿Auto-detectar headers o forzar mapping? | Auto-detección con sinonimos ES/EN + `--map` opcional | Cubre el Excel del cliente + headers variables. Override manual como escape hatch. |
| 9 | ¿Tests automatizados con Excel real? | NO. Excel sintético en memoria | Cero PII en fixtures. Cero riesgo de commitear datos del cliente. |
| 10 | ¿CLI con top-level await? | Sí (`scripts/import-event.mjs` es ESM) | Más simple que wrap en async main(). Funciona en Node 22. |

---

## 6. Riesgos conocidos

| # | Riesgo | Mitigación |
|---|--------|------------|
| 1 | **Typegen provisional** en `src/types/supabase.ts`. Las 6 tablas están agregadas a mano. Si la migration no matchea exactamente, TS falla. | David corre `supabase gen types typescript --linked > src/types/supabase.ts` después de aplicar la migration. El diff debe ser cero (o muy chico). |
| 2 | **`xlsx` tiene vulnerabilidades transitive** (1 moderate, 5 high reportadas por npm audit). No son críticas para un script CLI que lee archivos locales. | `npm audit` regular. Migrar a `exceljs` si Subresource Integrity se vuelve un problema (no aplica a Node local). |
| 3 | **`findConfirmationByEmailOrPhone` solo busca por email O phone**, no ambos. Si un confirmation tiene email "A" y phone "B", pero la survey tiene email "B" y phone "A", no matchea. | Aceptable para MVP. Fase 4 puede agregar fuzzy match. |
| 4 | **`promotion.ts` corre por survey individual**. Si importamos 200 encuestas, hay que llamar `promoteSurveyToLead` 200 veces. | OK para MVP (admin lo corre batch manual). Fase 4 puede agregar `promoteAllPendingSurveys(eventId)`. |
| 5 | **`getUnmatchedAttendees` devuelve filas donde `confirmation_id IS NULL`**, pero no detecta "el attendee es la misma persona que un confirmation con email distinto" (por ej. typos). | Aceptable para MVP. Reporte admin lista "X vinieron sin confirmar antes" — admin reconcilia manual. |
| 6 | **`audit-server.ts` registra el admin que promovió**, pero no el motivo de la promoción (por qué el admin decidió promover manualmente una survey con consent=false, si lo hace). | Fase 4 lo agrega cuando haya UI admin con botones de override. |
| 7 | **Importador no valida formato de email estricto** (solo regex mínima). Si el Excel tiene "juan@", el parser lo deja pasar y la DB lo rechaza con CHECK constraint → batch falla 1 fila pero las demás siguen. | OK (deduplicado). Si el admin quiere 100% valido, pre-valida con `--dry-run`. |

---

## 7. Criterios de "done"

- [x] Migration con 6 tablas + 4 enums + RLS + indexes
- [x] Tipos del dominio en `src/types/events.ts`
- [x] Mapper row → dominio en `src/lib/events/event-mapper.ts`
- [x] 5 server libs server-only (events, confirmations, attendees, surveys, promotion)
- [x] `linkLeadToEventRecord` ya no es STUB (usa `lead_event_links`)
- [x] `lead_event_links` cierra el H2 de Fase 2 por construcción (INSERT-only)
- [x] Importador CLI funcional con `--dry-run` y `--map`
- [x] 14 tests unitarios pasando
- [x] Barrel público en `src/lib/events/index.ts`
- [x] Doc `EVENTS_FUNNEL_FOUNDATION.md` completo
- [ ] `_test-fase3.mjs` corre contra Supabase real (todos los tests pasan)
- [ ] Merge a `main` con luz verde de David

---

## 8. Implementación completada — commits

| # | Commit | Descripción |
|---|--------|-------------|
| 1 | `d6dedde` | chore(events): migration v0.7.0 events funnel (6 tablas + RLS) |
| 2 | `45d1fbb` | feat(events): tipos del dominio |
| 3 | `6408c15` | feat(events): mapper row↔dominio + typegen provisional |
| 4 | `4c954f9` | feat(events): events-server CRUD |
| 5 | `9456471` | feat(events): confirmations + attendees server libs |
| 6 | `543d558` | feat(events): surveys-server + promotion (encuesta→lead) |
| 7 | `d0acaaa` | refactor(crm): linkLeadToEventRecord real (cierra H2) |
| 8 | `fe1a951` | feat(events): importador CLI con xlsx |
| 9 | `8ccbfa2` | test(events): importer unit tests |
| 10 | `65af271` | feat(events): barrel `src/lib/events/index.ts` |
| 11 | este doc | docs(events): EVENTS_FUNNEL_FOUNDATION.md |

---

## 9. Próximos pasos (Fase 4 — UI Admin + WhatsApp manual)

1. **David aplica la migration** `20260627000000_events_funnel.sql` en Supabase.
2. **David regenera el typegen**: `npx supabase gen types typescript --linked > src/types/supabase.ts`.
3. **David corre el script de test** `_test-fase3.mjs` para validar end-to-end.
4. **Merge a `main`** con luz verde.
5. **Fase 4 (próxima rama)**:
   - `/admin/eventos` lista con cards
   - Detalle de evento con tabs: Confirmados / Asistentes / Encuestas / Leads
   - Wizard de import (subir .xlsx, ver preview, confirmar)
   - Drawer del lead con "📅 Vino de evento X, encuesta Y, interés Z"
   - WhatsApp manual: `buildWhatsAppMessage(lead, event)` + `wa.me/` link + audit
   - Server action público para que visitantes se registren al evento (form público)
6. **Fase 5 (cuando exista SMTP)**: notificaciones automáticas de encuestas entrantes.
7. **Fase 6+**: WhatsApp Business API, multi-evento en un Excel, NLP sobre encuestas.

---

## 10. Referencias

- `docs/EVENTS_FUNNEL_CONCEPT.md` — el spec conceptual de Fase 1
- `docs/MASTERCLASS_FUNNEL_FOUNDATION.md` — el patrón análogo (masterclass) que se imitó
- `docs/FASE_2_CRM_FOUNDATION.md` — lo que dejó Fase 2 (con el H2 que cerramos acá)
- `docs/ROADMAP.md → Fase 3` — la priorización de esta fase
- `docs/PRIVACY_AND_DEPLOY_CHECKLIST.md` — la regla de cero PII en repo
- `docs/DECISIONS.md` — ADRs previos (D-018 masterclass, D-019 entitltements, etc.)
- `supabase/migrations/20260627000000_events_funnel.sql` — la migration
- `scripts/import-event.mjs` — el CLI
- `scripts/_test-fase3.mjs` — el test manual end-to-end (lo crea el siguiente paso)
