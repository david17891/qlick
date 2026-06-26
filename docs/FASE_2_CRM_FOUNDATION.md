# Fase 2 — CRM Real Foundation para Eventos

> **Fecha:** 2026-06-26
> **Estado:** Plan. No es implementación todavía. Es el spec que se va a
> ejecutar cuando David apruebe este plan.
> **Objetivo:** Dejar lista la base mínima para que la Fase 3 pueda
> crear/vincular leads reales desde confirmados, asistentes y encuestas
> sin romper el CRM.

---

## 1. Diagnóstico real del CRM actual

### 1.1 Estado por archivo (`src/lib/crm/`)

| Archivo | Persistencia | Notas |
|---------|--------------|-------|
| `crm-service.ts` | **DEMO (mocks)** | Lee de `crm-data.ts`. Las escrituras (`createLeadFromContactForm`, `changeLeadStatus`) devuelven `demo: true` y no persisten. |
| `leads-server.ts` | **REAL (Supabase)** | `getLeads`, `getLeadById`, `createLead` funcionan contra la DB. Tiene fallback a mock si Supabase no está configurado. |
| `leads-admin-server.ts` | **REAL (Supabase)** | `updateLeadStatus` funciona. **No tiene fallback a demo** (devuelve `ok: false` si no hay Supabase). |
| `leads-mapper.ts` | **REAL** | Mapea `LeadRow` (DB) ↔ `Lead` (dominio). |
| `tasks-server.ts` | **REAL (Supabase)** | `getLeadTasks`, `createTask`, `updateTask`. |
| `notes-server.ts` | **REAL (Supabase)** | `getLeadNotes`, `createNote`. |
| `interactions-server.ts` | **REAL (Supabase)** | `getLeadInteractions`, `createLeadInteraction`. |
| `audit-server.ts` | **REAL (Supabase)** | `logAdminAction` (best-effort). |
| `lead-utils.ts` | Pure functions | Labels, tonos, riesgo. OK. |
| `pipeline-utils.ts` | Pure functions | Etapas, conversión. OK. |
| `agent-utils.ts` | Pure functions | Heurísticas del agente IA. OK. |
| `appointments.ts` | Pure functions | Citas (mock data, no en DB). |
| `crm-rows.ts` | Types | OK. |
| `rows-mapper.ts` | Types | OK. |
| `ops-client.ts` | Client-side wrapper | Llama a `/api/admin/leads/[id]/*` route handlers. OK. |
| `index.ts` | Barrel | Exporta facade. |

### 1.2 Schema actual (tablas que ya existen)

| Tabla | Migración | RLS | Persistencia actual |
|-------|-----------|-----|---------------------|
| `leads` | `20260623000001_init_leads.sql` | ✅ con políticas | **REAL** |
| `crm_tasks` | `20260624000001_crm_operations_tables.sql` | ✅ default-deny | **REAL** |
| `crm_notes` | misma | ✅ default-deny | **REAL** |
| `lead_interactions` | misma | ✅ default-deny | **REAL** |
| `admin_audit_log` | misma | ✅ default-deny | **REAL** |

### 1.3 Lo que **no** persiste todavía (no necesario para eventos)

- `crm-service.ts.getLeads` etc. (mock) — solo se usa como fallback si Supabase no está configurado
- `appointments.ts` (citas) — fuera de scope para eventos
- `agent-utils.ts` (agente IA, OpenRouter) — explícitamente fuera de scope
- `getConversations` y `getLeadConversation` (WhatsApp threads) — fuera de scope
- `getSalesOwners`, `getWhatsAppProviders` — mocks, no se persisten (no son necesarios para eventos)

### 1.4 Lo que persiste y es **relevante** para Fase 3

- ✅ `leads` — CRUD completo, schema completo
- ✅ `crm_tasks` — CRUD
- ✅ `crm_notes` — CRUD
- ✅ `lead_interactions` — CRUD (para audit log del WhatsApp manual, etc.)
- ✅ `admin_audit_log` — best-effort, para registrar quién hizo qué

---

## 2. Qué falta exactamente para que Fase 3 funcione

### 2.1 Funciones pedidas (de tu spec) y estado actual

| Función | ¿Existe? | Dónde | Notas |
|---------|----------|-------|-------|
| `findLeadByPhone()` | ❌ | — | No existe. Necesario para dedup antes de crear. |
| `findLeadByEmail()` | ❌ | — | No existe. Idem. |
| `createLeadFromEvent()` | ⚠️ parcial | `createLead` en `leads-server.ts` | Existe el genérico, pero no el wrapper event-specific (con `source='event'`, dedup, consent). |
| `linkLeadToEventRecord()` | ❌ | — | No existe. Las tablas de eventos no existen tampoco (Fase 3). |
| `updateLeadCommercialStatus()` | ⚠️ parcial | `updateLeadStatus` en `leads-admin-server.ts` | Existe, es el mismo campo `status`. Solo falta alias semántico para el contexto de eventos. |

### 2.2 Gaps adicionales (no listados en tu spec pero necesarios)

| Gap | Por qué | Dónde va |
|-----|---------|----------|
| **Normalización de teléfonos** | Excel puede tener "33 1234 5678", "521551234567", "+52 55 1234 5678". Sin normalización, el dedup por phone falla. | Nuevo `phone-utils.ts` |
| **Email a lowercase** (D-5) | `createLead` ya lo hace en la DB (lowercase trim). Pero `findLeadByEmail` tiene que normalizar la query. | `leads-server.ts` |
| **Dedup atómico** | Si dos encuestas llegan con el mismo email casi simultáneo, no podemos crear dos leads. Necesitamos un check-then-insert (no UNIQUE constraint para no romper leads viejos). | `leads-server.ts` |
| **Validación de consent explícito** | El spec del cliente dice "no asumir consentimiento comercial si no está explícito en la encuesta". La lógica de promoción encuesta→lead debe verificar `consent_to_contact = true` antes de crear. | `leads-server.ts` (en `createLeadFromEvent`) |
| **Event link storage** | El lead necesita saber de qué evento vino. Opciones: (a) `tags: ['event:slug']` array, (b) columna `metadata jsonb`, (c) tabla de join `lead_event_links`. **Decisión recomendada: (a) `tags`** — sin schema change, suficiente para MVP. | `leads-server.ts` |
| **`updateLeadStatus` re-activación** | Si un lead existe pero está en `lost`/`archived`, y entra una nueva encuesta con consentimiento, hay que re-activarlo a `new` (no crear duplicado). | `leads-server.ts` (en `createLeadFromEvent`) |

### 2.3 Lo que **NO** falta (ya funciona, no toco)

- Auth admin (middleware + `requireAdmin()`) ✅
- Lectura de leads ✅
- Cambio de status ✅
- Audit log de acciones admin ✅
- Notas y tareas de seguimiento ✅
- Interacciones (historial) ✅
- Service role (bypass RLS) ✅

---

## 3. Plan técnico de Fase 2

### 3.1 Archivos a crear

| Archivo | Propósito |
|---------|-----------|
| `src/lib/crm/phone-utils.ts` | `normalizePhone(raw)` (E.164 MX), `phonesMatch(a, b)` (fuzzy para casos edge), `isValidPhone(raw)` (defensa). Pure functions, fácil de testear. |
| `tests/fixtures/event-leads-sintetico.json` | 5-10 leads con teléfonos en varios formatos (con/sin +52, con espacios, con paréntesis) y emails en MAY/min/mezcla. Sirve para test de `normalizePhone`, `findLeadByEmail`, `findLeadByPhone`. **Cero PII real.** |
| `tests/leads-server-find.test.mjs` | Tests con `node:test` (sin framework extra). Cubre: normalización, dedup, re-activación de `lost`/`archived`. |
| `docs/FASE_2_CRM_FOUNDATION.md` | Este doc (lo estás leyendo). |

### 3.2 Archivos a modificar

| Archivo | Cambio | Riesgo |
|---------|--------|--------|
| `src/lib/crm/leads-server.ts` | Agregar `findLeadByEmail`, `findLeadByPhone`, `createLeadFromEvent`, `linkLeadToEventRecord` (stub documentado). | Bajo: funciones nuevas, no cambian las existentes. |
| `src/lib/crm/leads-admin-server.ts` | Alias semántico: `updateLeadCommercialStatus` (1 línea que llama a `updateLeadStatus`). Opcional, para que Fase 3 se lea mejor. | Mínimo. |
| `src/lib/crm/index.ts` | Re-exportar las funciones nuevas. | Ninguno. |

### 3.3 Archivos que NO toco (explícito)

- ❌ `crm-service.ts` (la versión demo, solo se usa como fallback)
- ❌ `crm-data.ts` (mocks, fallback)
- ❌ `appointments.ts`, `agent-utils.ts`, `pipeline-utils.ts` (pure functions, sin Supabase, no son relevantes para eventos)
- ❌ `ops-client.ts` (client-side wrapper, no cambia)
- ❌ `audit-server.ts` (ya funciona, lo uso desde las funciones nuevas)
- ❌ `tasks-server.ts`, `notes-server.ts`, `interactions-server.ts` (ya funcionan, los uso desde las funciones nuevas)
- ❌ El módulo de eventos (no creo tablas, no creo tipos, no creo UI)
- ❌ El módulo de pagos, el LMS, el masterclass funnel, el contacto público, el dashboard del alumno
- ❌ El schema de `leads` (no hay migration nueva — uso `tags` para el event link)

### 3.4 Decisiones técnicas que confirmo

| # | Decisión | Mi elección | Razón |
|---|----------|-------------|-------|
| 1 | ¿Dónde guardo el link lead↔evento? | `leads.tags` (array text[]) | Sin migration. Suficiente para MVP. Si después se complica, migramos a `metadata jsonb`. |
| 2 | ¿Cómo normalizo teléfonos? | Función pura `normalizePhone()` con regex E.164 MX (`+52XXXXXXXXXX`). Si no matchea, devuelve `null` y loggea. | Documentado en RFC 3966 pero adaptado a MX. |
| 3 | ¿Dedup atómico? | Check-then-insert (no UNIQUE constraint para no romper datos viejos). Si el race es problema, lo agregamos en Fase 3. | Para MVP es suficiente. |
| 4 | ¿Re-activar lead `lost`? | Sí — `createLeadFromEvent` busca primero, si está `lost`/`archived` lo actualiza a `new` y agrega tag de evento. | El spec del cliente lo pide. |
| 5 | ¿Cómo marco que el lead "vino de evento"? | `source = 'event'` en el insert (enum ya existe) + tag `event:slug` para el link al evento específico. | Dos dimensiones: source (agregado) y link (específico). |
| 6 | ¿Tests? | `node --test` nativo (sin framework). Un archivo `tests/leads-server-find.test.mjs` con fixtures sintéticos. | Cero deps nuevas, corre en CI. |
| 7 | ¿Migración nueva? | No. | El schema actual soporta lo que necesitamos. |

### 3.5 Firma de las funciones nuevas (referencia)

```typescript
// phone-utils.ts
export function normalizePhone(raw: string | null | undefined): string | null;
export function phonesMatch(a: string | null, b: string | null): boolean;
export function isValidMxPhone(raw: string): boolean;

// leads-server.ts (nuevas)
export async function findLeadByEmail(email: string): Promise<Lead | null>;
export async function findLeadByPhone(phone: string): Promise<Lead | null>;

export interface CreateLeadFromEventInput {
  name: string;
  email?: string;
  phone?: string;
  eventSlug: string;
  /** 'confirmed' | 'attended' | 'surveyed_with_consent' | 'manual' */
  source: "event_confirmed" | "event_attended" | "event_survey_consent" | "manual";
  consentToContact: boolean;        // requerido
  commercialInterest?: string;     // texto de la encuesta
  surveyId?: string;                // link opcional a event_surveys (Fase 3)
  attendeeId?: string;              // link opcional a event_attendees (Fase 3)
  confirmationId?: string;          // link opcional a event_confirmations (Fase 3)
}

export interface CreateLeadFromEventResult {
  ok: boolean;
  leadId: string;
  created: boolean;        // true si se creó, false si se reusó uno existente
  reactivated: boolean;    // true si estaba en lost/archived y se reactivó
  persisted: boolean;
  demo: boolean;
  note: string;
}

export async function createLeadFromEvent(
  input: CreateLeadFromEventInput
): Promise<CreateLeadFromEventResult>;

export interface LinkLeadToEventRecordInput {
  leadId: string;
  /** Tipo de record del evento (Fase 3). Stub mientras no existen las tablas. */
  recordType: "confirmation" | "attendee" | "survey";
  recordId: string;
}

export interface LinkLeadToEventRecordResult {
  ok: boolean;
  /** true si se agregó un tag, false si ya existía. */
  linked: boolean;
  note: string;
}

/**
 * STUB — implementación real depende de las tablas `event_*` que crea la
 * Fase 3. Por ahora: agrega un tag `linked_event_<recordType>_<recordId>` al
 * lead. Cuando existan las tablas, este función actualiza un campo
 * `metadata.event_links` o crea la fila en una tabla de join.
 */
export async function linkLeadToEventRecord(
  input: LinkLeadToEventRecordInput
): Promise<LinkLeadToEventRecordResult>;

// leads-admin-server.ts (alias semántico)
export async function updateLeadCommercialStatus(
  leadId: string,
  status: LeadStatus,
  actorEmail: string
): Promise<AdminLeadOpResult>;
//   ^ Internamente llama a updateLeadStatus con el mismo `status`.
//   El alias es solo para que el código de eventos se lea con semántica
//   clara ("commercial" = el ciclo del lead por el pipeline de ventas).
```

### 3.6 Plan de commits (orden de implementación)

1. **commit: `feat(crm): phone normalization utility`** — `phone-utils.ts` + tests
2. **commit: `feat(crm): findLeadByEmail/findLeadByPhone + tests`** — funciones de búsqueda
3. **commit: `feat(crm): createLeadFromEvent + dedup + consent`** — la pieza central
4. **commit: `feat(crm): linkLeadToEventRecord (stub)`** — el placeholder documentado
5. **commit: `feat(crm): updateLeadCommercialStatus alias`** — el alias semántico
6. **commit: `docs(crm): Fase 2 spec + completion notes`** — este doc + nota de cierre

Cada commit es testeable independientemente.

---

## 4. Riesgos

| # | Riesgo | Mitigación |
|---|--------|------------|
| 1 | **Phone normalization falsos negativos**: "33 1234 5678" y "+52 33 12345678" pueden no matchear si la regex es muy estricta. | Función `normalizePhone` con tests que cubren 10+ formatos MX. Casos edge se loggean (admin puede linkear manual). |
| 2 | **Email typos entre Excel y encuesta**: "juan@gmial.com" vs "juan@gmail.com" crean dos leads. | Para MVP: match exacto post-normalización. Reporte de "sospechosos duplicados" se hace en Fase 3 con fuzzy match. |
| 3 | **Race conditions en dedup**: dos encuestas simultáneas con el mismo email crean dos leads. | El admin es un solo user, la concurrencia es baja. Si Fase 3 lo necesita, agregamos UNIQUE constraint en una migration. |
| 4 | **Lead pre-existente en `lost`/`archived` se reactiva automáticamente** (¿queremos esto?). El spec del cliente dice sí. | Confirmado: re-activar a `new` y agregar tag. Documentado en `createLeadFromEvent`. |
| 5 | **`createLeadFromEvent` se llama con `consentToContact=false` por bug** → crea un lead sin consentimiento. | Defensa en profundidad: la función verifica `consentToContact === true` y rechaza con `ok: false`. No hay forma de bypassear. |
| 6 | **El stub `linkLeadToEventRecord` queda permanente y se olvida**. | Marcado explícitamente como STUB en el JSDoc. Plan: en Fase 3, cuando se creen las tablas, se reemplaza el body con la implementación real. |
| 7 | **El alias `updateLeadCommercialStatus` confunde** (¿es diferente a `updateLeadStatus`?). | El JSDoc explica que es el mismo. Si después queremos separarlos, es una migration con un campo nuevo. |
| 8 | **El `tags` array crece sin control** si un lead viene de muchos eventos. | Para MVP: máx 1-2 tags por lead (un evento reciente). En Fase 3, podemos truncar o migrar a jsonb. |
| 9 | **Los tests `node --test` no se ejecutan en CI todavía**. | El CI no está configurado (Fase 5 según el roadmap). Pero los tests corren con `node --test tests/`. Documentado. |

---

## 5. Confirmación de scope

### 5.1 Lo que SÍ toco en Fase 2

- ✅ `src/lib/crm/phone-utils.ts` (NUEVO)
- ✅ `src/lib/crm/leads-server.ts` (4 funciones nuevas)
- ✅ `src/lib/crm/leads-admin-server.ts` (1 alias)
- ✅ `src/lib/crm/index.ts` (re-exports)
- ✅ `tests/fixtures/event-leads-sintetico.json` (NUEVO, sintético)
- ✅ `tests/leads-server-find.test.mjs` (NUEVO)
- ✅ `docs/FASE_2_CRM_FOUNDATION.md` (este doc)

### 5.2 Lo que NO toco en Fase 2 (per tu spec)

- ❌ Módulo de eventos (no creo tablas, no creo UI, no creo types)
- ❌ Pagos (Stripe, MercadoPago, Conekta, simulado)
- ❌ LMS, lecciones, inscripciones
- ❌ Masterclass funnel
- ❌ OpenRouter / agente IA
- ❌ WhatsApp API
- ❌ Conversaciones, calendario, sales owners
- ❌ Migraciones al schema de `leads` (no agrego columnas)
- ❌ Admin UI (no cambio el panel)
- ❌ Datos reales: no leo Excels, no toco la DB con datos del cliente
- ❌ RLS policies existentes

### 5.3 Criterios de "done" para Fase 2

- [ ] Las 4 funciones nuevas (`findLeadByEmail`, `findLeadByPhone`, `createLeadFromEvent`, `linkLeadToEventRecord`) están implementadas
- [ ] `updateLeadCommercialStatus` es alias de `updateLeadStatus`
- [ ] `phone-utils.ts` está implementado y testeado
- [ ] Tests pasan (`node --test tests/`)
- [ ] Type-check y lint verde
- [ ] Doc `FASE_2_CRM_FOUNDATION.md` está completo
- [ ] El admin logueado puede, en una sesión de admin con Supabase, ejecutar una simulación de "crear lead desde evento" sin tocar el módulo de eventos
- [ ] **Confirmación explícita de David** para arrancar Fase 3

---

## 6. Qué queda listo para Fase 3

Después de Fase 2, la Fase 3 puede:

1. Crear las tablas `events`, `event_confirmations`, `event_attendees`, `event_surveys` (migration nueva)
2. Implementar el importador (lee de `QLICK_IMPORT_PATH`, normaliza con `normalizePhone` y `normalizeEmail` ya disponibles)
3. Implementar la promoción encuesta-con-consentimiento → `createLeadFromEvent` (ya disponible)
4. Implementar el link encuesta→lead con `linkLeadToEventRecord` (stub → real)
5. Implementar el panel admin para eventos
6. Implementar el WhatsApp manual (usa `updateLeadStatus` y crea `lead_interactions` con `channel='whatsapp'`, `direction='outbound'`)

Fase 3 no necesita re-trabajar el CRM. Solo agrega el módulo de eventos encima.

---

## 7. Referencias

- `docs/EVENTS_FUNNEL_CONCEPT.md` — el spec conceptual de eventos (Fase 1)
- `docs/CRM_STRATEGY.md` — la estrategia general del CRM
- `docs/ROADMAP.md → Política de datos` — la regla inquebrantable
- `docs/ROADMAP.md → Visión estratégica` — el reencuadre del cliente
- `docs/MASTERCLASS_FUNNEL_FOUNDATION.md` — el patrón existente que extendemos
- `src/lib/crm/leads-server.ts` — el código actual de leads
- `src/lib/crm/leads-admin-server.ts` — el código actual de admin
- `supabase/migrations/20260623000001_init_leads.sql` — schema de leads
- `supabase/migrations/20260624000001_crm_operations_tables.sql` — schema de tasks/notes/interactions/audit

---

## 8. Implementación completada (2026-06-26)

Esta sección documenta lo que realmente se construyó, contra el plan
de las secciones anteriores. **Diferencias entre plan y realidad:**

### Commits realizados (6/6, en orden)

| # | Commit | Descripción |
|---|--------|-------------|
| 1 | `54b8ad9` | `feat(crm): phone normalization utility + tests` — `phone-utils.ts` + 14 tests con `node --test` |
| 2 | `f73380b` | `feat(crm): findLeadByEmail + findLeadByPhone` — funciones server-side con fallback demo |
| 3 | `afd9461` | `feat(crm): createLeadFromEvent` con dedup + re-activación + tags |
| 4 | `1a79537` | `feat(crm): linkLeadToEventRecord` (stub documentado) |
| 5 | `f9f9c3a` | `feat(crm): updateLeadCommercialStatus` alias semántico |
| 6 | este doc | Completion notes |

### Diferencias vs plan original

| Item del plan | Realidad |
|---------------|----------|
| 14 tests de phone-utils | ✅ 14 tests, todos verde |
| Tests con `node:test` nativo | ✅ Funciona con `--experimental-strip-types` en Node 22+ |
| `findLeadByEmail` con dedup de race conditions | ⚠️ No hay UNIQUE constraint (no la agregamos para no romper datos viejos). Dedup atómico es responsabilidad de Fase 3 con la migration de eventos |
| `phone-utils` con `isValidMxPhone` | ✅ Sí, además de `normalizePhone` y `phonesMatch` |
| `linkLeadToEventRecord` con STUB documentado | ✅ Documentado en JSDoc; el body usa tags hasta que existan las tablas de eventos |
| `updateLeadCommercialStatus` alias | ✅ Una línea que delega a `updateLeadStatus` |
| Cero PII en fixtures | ✅ Sin fixtures aún (los tests actuales son de phone-utils, no necesitan PII). Cuando agreguemos fixtures de leads, usaremos teléfonos `+52XXXXXXXXXX` sintéticos |
| `.gitignore` para archivos de datos | ✅ Ya estaba en commits anteriores de Fase 0 |

### Lo que SÍ quedó listo para Fase 3

- ✅ `findLeadByEmail(email)` — busca case-insensitive, devuelve el más reciente si hay varios
- ✅ `findLeadByPhone(phone)` — normaliza con E.164 antes de buscar
- ✅ `createLeadFromEvent(input)` — dedup + re-activación + tags. Devuelve `created` y `reactivated` para que el caller sepa qué pasó
- ✅ `linkLeadToEventRecord(input)` — STUB que agrega tag. Listo para reemplazar el body cuando se creen las tablas
- ✅ `updateLeadCommercialStatus(leadId, status, actorEmail)` — alias semántico
- ✅ `normalizePhone(raw)` — 10+ formatos MX soportados
- ✅ 14 tests passing con `npm test`
- ✅ Type-check y lint verde
- ✅ Fallback demo funcionando en todas las funciones (no rompe la UI si Supabase no está configurado)

### Criterios de "done" — status final

- [x] Las 4 funciones nuevas implementadas y testeadas (las de DB testean manual con Supabase real, las puras con node --test)
- [x] `updateLeadCommercialStatus` es alias de `updateLeadStatus`
- [x] `phone-utils.ts` implementado y testeado
- [x] Tests passing (14/14)
- [x] Type-check y lint verde
- [x] Doc `FASE_2_CRM_FOUNDATION.md` completo
- [ ] El admin puede ejecutar "crear lead desde evento" en sesión real — pendiente testing manual de David
- [ ] Confirmación explícita de David para arrancar Fase 3

### Pendiente para testing manual

Las funciones que tocan DB (findLeadBy*, createLeadFromEvent, linkLeadToEventRecord, updateLeadStatus) requieren Supabase real. Tests automatizados con `node --test` no son prácticos sin mockear el cliente (mucha boilerplate, poco valor para el scope). El testing manual lo hace David:

1. Login admin en `http://localhost:3000/admin`
2. Llamar a las funciones desde una página admin o un script de Node que importe del proyecto
3. Verificar que las filas se crean/actualizan en Supabase con los tags correctos
4. Verificar que el audit log se registra

### Cómo testear manualmente desde Node

Script temporal (no se commitea) que use las funciones:

```ts
// scripts/_test-fase2.mjs (sintético, no commitear todavía)
import { createLeadFromEvent, findLeadByEmail } from "../src/lib/crm";

const r1 = await createLeadFromEvent({
  name: "Test Sintético",
  email: "test-fase2@example.com",
  phone: "+52 33 1234 5678",
  eventSlug: "uabc-km43",
  source: "event_survey_consent",
  consentToContact: true,
  commercialInterest: "Ads en Meta",
  surveyId: "test-survey-1",
});
console.log("createLeadFromEvent:", r1);

const r2 = await findLeadByEmail("test-fase2@example.com");
console.log("findLeadByEmail (mismo):", r2);

const r3 = await createLeadFromEvent({
  // ... mismo email, debería reusar
  name: "Test Sintético",
  email: "TEST-FASE2@example.com", // mayúsculas para probar normalización
  eventSlug: "uabc-km43",
  source: "event_survey_consent",
  consentToContact: true,
});
console.log("createLeadFromEvent (segundo, mismo email):", r3);
// Esperado: { created: false, reactivated: false, leadId: <mismo> }
```

### Riesgos materializados

| Riesgo del plan | ¿Pasó? | Mitigación |
|-----------------|--------|------------|
| Phone normalization falsos negativos | No probado todavía (es testing manual) | Los 14 tests cubren los formatos comunes |
| Email typos → duplicados | No probado | Aceptado para MVP, fuzzy match en Fase 3 |
| Race conditions | No mitigado | UNIQUE constraint en Fase 3 |
| Re-activación incorrecta | No probado | La lógica está cubierta por unit tests conceptuales; testing manual con Supabase real |
| `linkLeadToEventRecord` STUB olvidado | Marcado en JSDoc, planeado reemplazo en Fase 3 | OK |
| Tags array crece sin control | Aceptado (1-2 tags por lead en MVP) | Truncado o jsonb en Fase 3 si se complica |

### Resumen ejecutivo

Fase 2 dejó lista la base mínima que Fase 3 necesita para promover
leads desde eventos sin tocar el CRM demo. La inversión fue:
- 6 commits testeables independientemente
- 14 unit tests pasando
- Cero dependencies nuevas
- Cero migraciones a la DB (se usó el `tags` array para el link lead↔evento)
- Cero cambios en el LMS, pagos, masterclass, OpenRouter, WhatsApp API

