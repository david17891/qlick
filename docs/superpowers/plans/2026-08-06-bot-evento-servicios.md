# Bot Evento y Servicios Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Incorporar captación y seguimiento de leads de servicios, empezando por `Kickstart de Meta Ads`, sin alterar el funnel de eventos en producción.

**Architecture:** Mantener el evento como flujo aislado y agregar un contexto comercial de servicios compartido por los cinco modos del bot. Persistir cada interés de servicio en una tabla relacionada con el lead, crear la tarea CRM de contacto de forma idempotente y activar el nuevo comportamiento con `bot_services_enabled`.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Supabase/Postgres, WhatsApp Cloud API, DeepSeek, Brevo, Node test runner y Tailwind para el panel admin existente.

## Global Constraints

- No modificar el registro, pagos, QR, encuestas, recordatorios ni accesos del evento.
- Mantener `info` como señal del evento; la campaña de servicios usará una frase prellenada específica.
- Un lead se identifica por teléfono normalizado y puede conservar intereses de evento y servicios simultáneamente.
- El presupuesto de Ads siempre se comunica como adicional al precio del servicio.
- No pedir accesos, materiales, actores, locaciones ni requisitos de producción al lead desde el bot.
- No prometer citas, ventas, clientes, conversiones ni resultados garantizados.
- No usar direcciones de correo placeholder para leads de servicios.
- El flujo de servicios queda apagado hasta superar pruebas y smoke tests mediante `bot_services_enabled`.
- Las migraciones son aditivas y no contienen `DROP`, borrados masivos ni cambios destructivos.
- No registrar ni copiar secretos de Vercel, GitHub, DeepSeek, Supabase o API Box.
- Usar datos sintéticos en tests y no registrar PII en logs.
- No hacer commit, push o deploy sin una solicitud explícita de David.

---

## File Map

**Crear:**

- `supabase/migrations/20260806120000_service_lead_interests.sql` — tabla de intereses comerciales, email nullable y relación opcional desde tareas.
- `supabase/migrations/20260806121000_kickstart_meta_ads_catalog_v3.sql` — catálogo factual inicial de Meta Ads.
- `src/types/service-leads.ts` — tipos de dominio e inputs del flujo de servicios.
- `src/lib/services/service-leads-server.ts` — captura idempotente de intereses y actualización de contexto CRM.
- `src/lib/email/service-lead-notification.ts` — correo interno con datos opcionales y escape HTML.
- `src/lib/whatsapp/service-intent.ts` — detección de campaña, consultas de paquete y contexto comercial.
- `tests/service-leads-server.test.mjs` — persistencia, deduplicación y promoción CRM.
- `tests/service-intent.test.mjs` — clasificación de mensajes de servicios y ambigüedad.
- `tests/whatsapp-bot-services.test.mjs` — flujo conversacional de servicios.
- `tests/ai-services-context.test.mjs` — inyección del catálogo en todos los modos.

**Modificar:**

- `src/types/supabase.ts` — filas, inserts, enums y tablas nuevas hasta que exista typegen actualizado.
- `src/types/crm.ts` — permitir `email: string | null` en el dominio del lead.
- `src/lib/crm/leads-mapper.ts` — mapear email nullable sin cambiar el contrato del flujo de evento.
- `src/lib/crm/crm-rows.ts` — tipos derivados de `crm_tasks` y `lead_service_interests`.
- `src/lib/crm/tasks-server.ts` — aceptar `serviceInterestId` opcional al crear una tarea.
- `src/lib/services/services-prompt-builder.ts` — incluir descripción, `includes`, tiempos y costos adicionales; eliminar fallback comercial obsoleto.
- `src/lib/ai/agent-provider.ts` — conservar y documentar el contrato común del catálogo de servicios.
- `src/lib/ai/agent-prompts.ts` — inyectar contexto común en socrático, Súper Ejecutivo y `human_first`.
- `src/lib/ai/deepseek-provider.ts` — pasar `servicesCatalogBlock` al prompt socrático.
- `src/lib/ai/simulator.ts` — cargar el mismo catálogo que producción.
- `src/lib/admin/system-settings-server.ts` — agregar `KEY_BOT_SERVICES_ENABLED` y lectura fail-closed.
- `src/app/api/admin/bot/stats/route.ts` — exponer el estado del kill switch.
- `src/components/admin/BotConfigTab.tsx` — mostrar y cambiar el kill switch desde el panel.
- `src/lib/whatsapp/bot-engine.ts` — integrar routing, contexto de servicio, captura CRM y estado de conversación.
- `tests/qlick-services-b2b-prompt.test.mjs` — cubrir `includes`, descripción, costo de Ads y fallback seguro.
- `tests/bot-mode-dispatch.test.mjs` — cubrir el catálogo en todos los modos.
- `tests/whatsapp-bot.test.mjs` — preservar regresiones del evento y añadir caso de routing no invasivo.
- `data/PROJECT-LOG.md` — registrar la migración y el cambio operativo después de aplicar el schema.
- `docs/STATUS.md` — actualizar solo después del deploy y smoke test de producción.

## Task 0: Baseline y Respaldo

**Files:**

- Read only: `AGENTS.md`, `docs/AGENT_SUPABASE_PROTOCOL.md`, `docs/STATUS.md`, `docs/superpowers/specs/2026-08-06-bot-evento-servicios-design.md`.
- External backup: `C:\Users\User\AppData\Local\Temp\opencode\click-pre-services.bundle`.

**Interfaces:**

- Consumes: current branch, current working tree and Supabase migration protocol.
- Produces: verified Git backup, baseline test evidence and a clean list of unrelated untracked files.

- [ ] **Step 1: Verify the existing Git backup**

Run:

```powershell
git bundle verify "C:\Users\User\AppData\Local\Temp\opencode\click-pre-services.bundle"
git rev-parse HEAD
git status --short
```

Expected: the bundle is valid, `HEAD` is `176ae615e987cdc95152b5c87cf8a62975df6d51`, and only the previously existing untracked generated materials appear.

- [ ] **Step 2: Run the baseline checks before implementation**

Run:

```powershell
npm test
npm run type-check
npm run lint
npm run build
```

Expected: all commands exit with code 0. Any pre-existing failure must be recorded before the first implementation edit and must not be hidden by the new feature.

- [ ] **Step 3: Prepare the database backup checkpoint**

Before applying either migration, use the Supabase backup/export procedure in `docs/AGENT_SUPABASE_PROTOCOL.md` and verify the target project from `.env.local`. Use the existing Management API path for DDL; do not echo `SUPABASE_SECRET_KEY`, database passwords or access tokens.

Expected: a recoverable schema/catalog backup exists outside the repository and no secret value appears in command output or files under `docs/`.

## Task 1: Canonical Meta Ads Catalog

**Files:**

- Create: `supabase/migrations/20260806121000_kickstart_meta_ads_catalog_v3.sql`
- Modify: `src/lib/services/services-prompt-builder.ts`
- Test: `tests/qlick-services-b2b-prompt.test.mjs`

**Interfaces:**

- Consumes: `ServiceWithVariants[]` from `@/types/services` and `getActiveServices()` from `src/lib/services/orders-server.ts`.
- Produces: `formatServicesPromptBlock(services: ServiceWithVariants[]): string` with factual package details and `getServicesPromptBlock(): Promise<string>` with an honest fallback.

- [ ] **Step 1: Add failing formatter assertions**

Extend `tests/qlick-services-b2b-prompt.test.mjs` with a fixture whose variant has:

```js
description: "+ Ads (presupuesto del cliente)",
includes: ["4 videos comerciales", "8 piezas gráficas"],
priceMXN: 12000,
deliveryDaysMin: 7,
deliveryDaysMax: 14,
```

Assert that the formatted block contains the description, every included item, the formatted price, the delivery range and the phrase that Ads are additional. Add a test that `formatServicesPromptBlock([])` does not contain stale package prices and instead contains an honest catalog-unavailable message.

- [ ] **Step 2: Run the focused test and verify the failure**

Run:

```powershell
node --experimental-test-module-mocks --import ./tests/loader-register.mjs --experimental-strip-types --test tests/qlick-services-b2b-prompt.test.mjs
```

Expected: the new assertions fail because the current formatter omits `description`, `includes` and delivery information and uses a hardcoded fallback.

- [ ] **Step 3: Implement dynamic package formatting**

Update `formatServicesPromptBlock` so each active variant renders:

```text
- <label>: $<price> MXN
  <description, when present>
  Incluye: <all includes items joined with ", ">
  Entrega: <min>-<max> días
```

Render `includes` as the source of truth, preserve the `description` qualifier such as `+ Ads`, and never replace a missing catalog with fixed commercial prices. The empty-catalog block must say that the catalog could not be confirmed and point to the public services page or human contact.

- [ ] **Step 4: Add a short in-memory catalog cache**

Add a five-minute module cache to `getServicesPromptBlock`, matching the existing course catalog cache pattern. Cache successful catalog data and cache an empty result only for the same short TTL. Expose a test reset helper only if the current test loader requires it; do not add a public runtime endpoint.

- [ ] **Step 5: Add the catalog migration**

In `20260806121000_kickstart_meta_ads_catalog_v3.sql`, update the published service and active variants to the approved initial copy:

- Básico: `$3,500 MXN`, 5–7 days, up to 3 images, 2 AI videos of 10–20 seconds, campaign setup, launch and initial report.
- Recomendado: `$12,000 MXN`, 7–14 days, videos comerciales, graphic pieces, one initial campaign and 30 days of recommended optimization.
- Premium: `$18,000 MXN`, 7–14 days, 8–10 videos comerciales, photo session, landing page, training, internal audit, review meeting and 30 days of recommended optimization.
- Every variant description states that Meta Ads investment is separate.
- Production outside the local scope, special locations, travel and paid actors are not included.

Use `INSERT ... ON CONFLICT` or targeted `UPDATE` statements. Do not delete existing variants; deactivate only a variant that the approved catalog explicitly replaces.

- [ ] **Step 6: Run catalog tests and type-check**

Run:

```powershell
node --experimental-test-module-mocks --import ./tests/loader-register.mjs --experimental-strip-types --test tests/qlick-services-b2b-prompt.test.mjs
npm run type-check
```

Expected: the catalog tests pass and the existing service domain types remain valid.

## Task 2: Service Interest Schema and Domain Types

**Files:**

- Create: `supabase/migrations/20260806120000_service_lead_interests.sql`
- Create: `src/types/service-leads.ts`
- Modify: `src/types/supabase.ts`
- Modify: `src/lib/crm/crm-rows.ts`
- Modify: `src/lib/crm/tasks-server.ts`
- Test: `tests/service-lead-domain.test.mjs`

**Interfaces:**

- Consumes: existing `leads`, `crm_tasks`, `services` and `service_variants` tables.
- Produces: `ServiceInterestStatus`, `ServiceInterest`, `CaptureServiceInterestInput`, `CaptureServiceInterestResult`, and `service_interest_id` support on CRM tasks.

- [ ] **Step 1: Define the domain contract and failing pure tests**

Create `src/types/service-leads.ts` with these exact shapes:

```ts
export type ServiceInterestStatus =
  | "detected"
  | "contacted"
  | "qualified"
  | "won"
  | "lost";

export interface ServiceInterest {
  id: string;
  leadId: string;
  serviceId: string | null;
  serviceSlug: string;
  variantId: string | null;
  variantSlug: string | null;
  category: string;
  needSummary: string;
  preferredContactTime: string | null;
  source: "whatsapp" | "facebook_ads";
  campaignKey: string | null;
  consentBasis: "inbound_service_request";
  status: ServiceInterestStatus;
  sourceMessageId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CaptureServiceInterestInput {
  phoneNormalized: string;
  leadName?: string | null;
  serviceSlug: string;
  variantSlug?: string | null;
  category: string;
  needSummary: string;
  preferredContactTime?: string | null;
  source: "whatsapp" | "facebook_ads";
  campaignKey?: string | null;
  sourceMessageId: string;
  consentBasis: "inbound_service_request";
}

export interface CaptureServiceInterestResult {
  ok: boolean;
  leadId: string | null;
  interestId: string | null;
  taskId: string | null;
  createdLead: boolean;
  duplicate: boolean;
  notificationSent: boolean;
  persisted: boolean;
  note: string;
}
```

Add pure tests for valid status values and for rejecting empty `phoneNormalized`, `serviceSlug`, `category` or `sourceMessageId` before persistence.

- [ ] **Step 2: Implement the additive SQL migration**

Create the `service_interest_status` enum if absent, then create `public.lead_service_interests` with:

```sql
lead_id uuid not null references public.leads(id) on delete cascade,
service_id uuid references public.services(id) on delete set null,
service_slug text not null,
variant_id uuid references public.service_variants(id) on delete set null,
variant_slug text,
category text not null,
need_summary text not null default '',
preferred_contact_time text,
source text not null default 'whatsapp',
campaign_key text,
consent_basis text not null,
status public.service_interest_status not null default 'detected',
source_message_id text,
created_at timestamptz not null default now(),
updated_at timestamptz not null default now()
```

Add indexes for `(lead_id, status)`, `service_slug`, `source` and a unique partial index on `source_message_id` where it is not null. Enable RLS with no public policies so only service-role server code writes and reads the table.

Add `service_interest_id uuid references public.lead_service_interests(id) on delete set null` to `public.crm_tasks` with an index. Make `public.leads.email` nullable without changing event registration validation.

- [ ] **Step 3: Update the hand-authored Supabase types**

Add the new enum, table row, insert and update shapes to `src/types/supabase.ts`. Update `src/lib/crm/crm-rows.ts` with:

```ts
export type ServiceInterestRow = Tables<"lead_service_interests">;
export type ServiceInterestInsert = TablesInsert<"lead_service_interests">;
export type ServiceInterestUpdate = TablesUpdate<"lead_service_interests">;
```

Update `Lead.email` in `src/types/crm.ts` and the mapper in `src/lib/crm/leads-mapper.ts` to use `string | null`. Keep event-specific email validation at its existing capture boundary.

Update `CrmTaskInsert` consumers so `serviceInterestId?: string | null` maps to `service_interest_id`.

- [ ] **Step 4: Run type checks before applying the migration**

Run:

```powershell
npm run type-check
node --env-file=.env.local scripts/apply-migration-management.mjs supabase/migrations/20260806120000_service_lead_interests.sql --dry-run
```

Expected: TypeScript passes and the Management API dry run reports valid DDL without applying it.

## Task 3: Idempotent CRM Capture and Notification

**Files:**

- Create: `src/lib/services/service-leads-server.ts`
- Create: `src/lib/email/service-lead-notification.ts`
- Modify: `src/lib/crm/tasks-server.ts`
- Test: `tests/service-leads-server.test.mjs`
- Test: `tests/service-lead-notification.test.mjs`

**Interfaces:**

- Consumes: `CaptureServiceInterestInput`, `findLeadByPhone`, `createSupabaseAdminClient`, `createCRMTask`, `getAdminNotificationRecipients` and `sendEmail`.
- Produces: `captureServiceInterest(input: CaptureServiceInterestInput): Promise<CaptureServiceInterestResult>` and `sendServiceLeadNotificationToAdmin(input): Promise<{ ok: boolean; error?: string }>`.

- [ ] **Step 1: Write persistence tests with mocked server dependencies**

Add tests covering:

- A new phone creates one lead with `name = "Por confirmar"` when no valid name exists, `email = null`, `status = "interested"`, `source = "facebook_ads"`, `intent = "schedule_call"` and `consent_to_contact = true`.
- An existing event lead is reused by phone, keeps event tags and advanced status, and receives a separate service-interest row.
- The first request creates exactly one interest, one CRM task and one notification attempt.
- Replaying the same `sourceMessageId` returns `duplicate: true` and creates no second interest, task or email.
- A Supabase failure returns `persisted: false` without throwing to the WhatsApp response path.

Use synthetic values such as `+525500000001`, `lead-test@example.com` only in tests. Do not use live contacts.

- [ ] **Step 2: Run the tests to establish the red state**

Run:

```powershell
node --experimental-test-module-mocks --import ./tests/loader-register.mjs --experimental-strip-types --test tests/service-leads-server.test.mjs
```

Expected: the new module and its capture function are not yet available, so the focused tests fail.

- [ ] **Step 3: Implement `captureServiceInterest`**

Implement this sequence:

1. Validate and trim the input without logging its values.
2. Query `lead_service_interests` by `source_message_id`; return the existing result if found.
3. Find the lead by normalized phone.
4. If absent, insert a lead with `Por confirmar`, nullable email, source and consent from the input.
5. If present, merge service tags without replacing event tags. Promote only `new` or `info_requested` to `interested`; preserve `contacted`, `qualified`, `enrolled`, `active_student`, `event_attended`, `lost` and `archived` according to existing lead rules.
6. Resolve `service_id` and optional `variant_id` by active slug.
7. Insert the interest row with `source_message_id` and `consent_basis`.
8. Create one pending CRM task using `created_by_email = "system@qlick"` and the new `service_interest_id`.
9. Send the internal notification as best effort. A failed email must not delete the lead or interest.
10. Return IDs, duplicate state, persistence state and notification state without PII in the note.

Add a helper to update an open interest with a captured name and `preferredContactTime` without creating a second task.

- [ ] **Step 4: Implement the service notification**

Create an input that accepts optional email and renders:

- Subject: `Nuevo lead de servicios desde WhatsApp — <service label>`.
- Name, WhatsApp, service/category, selected package, need summary, preferred contact time, campaign and CRM URL.
- Escaped HTML and plain text versions.
- No `mailto:` link when email is absent.

Use `getAdminNotificationRecipients()` and `sendEmail()`. Never include internal API tokens or full raw conversation dumps in the email.

- [ ] **Step 5: Run persistence and notification tests**

Run:

```powershell
node --experimental-test-module-mocks --import ./tests/loader-register.mjs --experimental-strip-types --test tests/service-leads-server.test.mjs tests/service-lead-notification.test.mjs
npm run type-check
```

Expected: all focused tests pass and strict TypeScript remains clean.

## Task 4: Service Intent and Conversation State

**Files:**

- Create: `src/lib/whatsapp/service-intent.ts`
- Modify: `src/lib/whatsapp/bot-engine.ts`
- Test: `tests/service-intent.test.mjs`
- Test: `tests/whatsapp-bot-services.test.mjs`

**Interfaces:**

- Consumes: normalized WhatsApp body, optional service metadata and active conversation state.
- Produces: `detectServiceIntent(text, context): ServiceIntentMatch` and a stable service context stored in outbound metadata.

- [ ] **Step 1: Write the classifier tests**

Define these expected cases:

```js
assert.equal(detectServiceIntent("info", {}).kind, "none");
assert.equal(detectServiceIntent("Hola, quiero información de videos y publicidad en Meta", {}).kind, "kickstart_meta_ads");
assert.equal(detectServiceIntent("¿Qué paquetes tienen?", {}).kind, "services_general");
assert.equal(detectServiceIntent("¿Qué incluye el paquete básico?", { activeServiceSlug: "kickstart-meta-ads" }).kind, "package_question");
assert.equal(detectServiceIntent("Quiero información", {}).kind, "ambiguous");
```

Also assert that opt-out text, exact event button labels and explicit event registration phrases are not classified as services.

- [ ] **Step 2: Implement `service-intent.ts`**

Use a normalized lowercase text detector with these groups:

- Campaign: `videos y publicidad en Meta`, `kickstart meta ads`, `campaña de Meta`.
- Service: `servicios`, `agencia`, `diseño web`, `Google Business`, `consultoría`, `publicidad`, `videos comerciales`.
- Package: `paquete`, `planes`, `qué incluye`, `cuánto cuesta`, `precio` when a service context exists.

Do not classify standalone `info` as service. Return `kind`, optional `serviceSlug`, optional `campaignKey`, and a short `category` label. Keep the detector pure and independent of Supabase.

- [ ] **Step 3: Add service metadata to the bot state**

Extend the outbound metadata contract with:

```ts
type ServiceConversationMetadata = {
  serviceSlug: string;
  serviceInterestId?: string;
  awaitingName?: boolean;
  awaitingContactTime?: boolean;
  campaignKey?: string;
};
```

Persist this metadata with the outbound response. On the next inbound message, use it to distinguish a service package question from an event question and to update the open service interest.

- [ ] **Step 4: Integrate routing without changing event branches**

Modify `detectIntent` and `buildResponsePlan` in `src/lib/whatsapp/bot-engine.ts` with this precedence:

1. Opt-out.
2. Exact event button IDs and event registration gates.
3. Existing event registration and email/name gates.
4. Explicit service campaign or service-context intent.
5. Existing greeting/question fallback.

Add a `service_inquiry` bot intent only for the deterministic initial service response. Keep ordinary package follow-up questions on the existing LLM `question` path with `servicesCatalogBlock` present.

For `service_inquiry`, send a concise response containing the Kickstart link and a question about the desired package or need. Do not list technical onboarding requirements. For a missing name, ask once and preserve `awaitingName`; for a missing preferred time, ask optionally and preserve the lead regardless of the answer.

- [ ] **Step 5: Capture the service interest at the engine boundary**

After `findOrCreateLead` and before sending the response, call `captureServiceInterest` for an explicit service/campaign request using `message.messageId` as `sourceMessageId`. On later name or preferred-time messages call the update helper instead of creating a new task.

If Supabase is unavailable, continue sending the service response and log only `{ leadId, persisted: false, serviceSlug }`. Do not log phone, name, email or raw message text.

- [ ] **Step 6: Run service and event regression tests**

Run:

```powershell
node --experimental-test-module-mocks --import ./tests/loader-register.mjs --experimental-strip-types --test tests/service-intent.test.mjs tests/whatsapp-bot-services.test.mjs tests/whatsapp-bot.test.mjs
```

Expected: service tests pass and existing event cases for `hola`, `info`, `Inscribirme`, `Próximos eventos`, `provide_email`, opt-out and paid registration remain green.

## Task 5: Shared Context in All Five Modes

**Files:**

- Modify: `src/lib/ai/agent-prompts.ts`
- Modify: `src/lib/ai/deepseek-provider.ts`
- Modify: `src/lib/ai/simulator.ts`
- Modify: `src/lib/ai/agent-provider.ts`
- Test: `tests/ai-services-context.test.mjs`
- Test: `tests/bot-mode-dispatch.test.mjs`

**Interfaces:**

- Consumes: `AgentContext.servicesCatalogBlock`, `ServiceConversationMetadata` and `getServicesPromptBlock()`.
- Produces: equivalent factual service context in `socratic_autopilot_v2`, `socratic_no_tools_v1`, `super_executive`, `super_executive_v2` and `human_first`.

- [ ] **Step 1: Add failing mode coverage**

Build one synthetic `AgentContext` with a catalog containing `Incluye video comercial` and `+ Ads (presupuesto del cliente)`. Assert that each prompt builder contains both strings and the no-cross-sell rule. Assert that a service question does not receive the event registration CTA as its primary instruction.

- [ ] **Step 2: Make the classic prompt accept service context**

Extend `buildSystemPrompt` with a final optional parameter:

```ts
servicesCatalogBlock?: string
```

Do not change the meaning or order of existing event arguments for current callers. Update the provider call explicitly with `context.servicesCatalogBlock`.

- [ ] **Step 3: Centralize common service rules**

Add a small pure helper in `src/lib/ai/agent-prompts.ts` or a focused sibling module that returns the common rules for:

- Dynamic package catalog.
- Ads budget separate from service fee.
- No guaranteed results.
- No appointment confirmation.
- Human seller closes technical scope.
- No invasive event cross-sell.

Use that helper in `buildSystemPrompt`, `buildSuperExecutivePrompt`, `buildHumanFirstPrompt` and therefore `buildSuperExecutiveV2Prompt` through its existing base composition.

- [ ] **Step 4: Pass the catalog through provider and simulator paths**

Update `pickSystemPromptForMode` in `src/lib/ai/deepseek-provider.ts` to pass the optional block to the socratic builder. In `src/lib/ai/simulator.ts`, load `getServicesPromptBlock()` when services are enabled or the simulated message is a service message, and include it in both the direct system prompt and `AgentContext`.

Do not load the services catalog for ordinary event-only deterministic templates; this preserves the event path latency and failure behavior.

- [ ] **Step 5: Run all mode tests**

Run:

```powershell
node --experimental-test-module-mocks --import ./tests/loader-register.mjs --experimental-strip-types --test tests/ai-services-context.test.mjs tests/bot-mode-dispatch.test.mjs tests/human-first-mode.test.mjs
npm run type-check
```

Expected: all five modes contain the same factual service context and all existing mode safeguards remain green.

## Task 6: Kill Switch and Admin Control

**Files:**

- Modify: `src/lib/admin/system-settings-server.ts`
- Modify: `src/app/api/admin/bot/stats/route.ts`
- Modify: `src/components/admin/BotConfigTab.tsx`
- Test: `tests/bot-services-flag.test.mjs`

**Interfaces:**

- Consumes: `system_settings`, existing admin setting endpoint and existing bot stats UI.
- Produces: `KEY_BOT_SERVICES_ENABLED`, fail-closed runtime check and an admin-visible toggle.

- [ ] **Step 1: Add flag tests**

Test that:

- Missing setting returns `false`.
- JSON boolean `true` returns `true`.
- String value `"true"` returns `true` for compatibility with existing settings writes.
- Any other value returns `false`.

- [ ] **Step 2: Implement the server setting**

Add:

```ts
export const KEY_BOT_SERVICES_ENABLED = "bot_services_enabled" as const;

export async function readBotServicesEnabled(): Promise<boolean> {
  const value = await readSystemSetting(KEY_BOT_SERVICES_ENABLED);
  return value === true || value === "true";
}
```

Use the helper at the service routing boundary. If Supabase fails, the helper returns false and event behavior remains unchanged.

- [ ] **Step 3: Expose and control the flag in admin**

Add `bot_services_enabled` to the stats response and a clearly labeled toggle in `BotConfigTab.tsx`. Reuse `/api/admin/system-setting`, optimistic UI rollback and the existing stats refetch pattern. The label must state that it activates only the services flow and does not pause event automation.

- [ ] **Step 4: Verify the kill switch**

Run the flag tests, then simulate the same service message with the flag off and on. Expected: off keeps the current event-safe fallback and creates no service interest; on enters the service flow. Event messages behave the same in both states.

## Task 7: Multi-Mode Service Conversation Tests

**Files:**

- Modify: `tests/whatsapp-bot-services.test.mjs`
- Modify: `tests/ai-services-context.test.mjs`
- Modify: `tests/qlick-services-b2b-prompt.test.mjs`
- Modify: `tests/whatsapp-bot.test.mjs`
- Modify: `tests/bot-mode-dispatch.test.mjs`

**Interfaces:**

- Consumes: routing, capture, prompts, flag and synthetic catalog from Tasks 1–6.
- Produces: regression evidence for event, services and all selectable bot modes.

- [ ] **Step 1: Cover the service campaign journey**

Use synthetic phone `+525500000001` and assert:

1. Campaign phrase returns the Kickstart link.
2. Package question returns factual includes and price.
3. Ads budget is described as separate.
4. Missing name prompts once.
5. Name and preferred time update the existing interest.
6. Lead status is `interested`.
7. Exactly one task and one notification attempt exist.
8. The user receives no appointment confirmation.

- [ ] **Step 2: Cover mixed context**

Simulate event conversation followed by a service question, then `Inscribirme`. Assert that both contexts remain available, no event tag is removed, no service prompt forces event registration and the final registration targets the original event.

- [ ] **Step 3: Cover ambiguity and opt-out**

Assert that standalone `info` follows the event path, a context-free ambiguous message asks for clarification, and `baja`/`stop` exits without creating or updating a service contact task.

- [ ] **Step 4: Run the focused suite**

Run:

```powershell
node --experimental-test-module-mocks --import ./tests/loader-register.mjs --experimental-strip-types --test tests/whatsapp-bot-services.test.mjs tests/ai-services-context.test.mjs tests/qlick-services-b2b-prompt.test.mjs tests/bot-mode-dispatch.test.mjs
```

Expected: all focused tests pass with zero PII in test fixtures or logs.

## Task 8: Apply Schema, Deploy Safely and Verify Production

**Files:**

- Apply: `supabase/migrations/20260806120000_service_lead_interests.sql`
- Apply: `supabase/migrations/20260806121000_kickstart_meta_ads_catalog_v3.sql`
- Modify after successful deployment: `data/PROJECT-LOG.md`
- Modify after successful deployment: `docs/STATUS.md`

**Interfaces:**

- Consumes: approved migrations, verified build and the existing Supabase/Vercel operational protocols.
- Produces: live schema, live catalog, controlled service activation and production evidence.

- [ ] **Step 1: Preview both migrations**

Run:

```powershell
node --env-file=.env.local scripts/apply-migration-management.mjs supabase/migrations/20260806120000_service_lead_interests.sql --dry-run
node --env-file=.env.local scripts/apply-migration-management.mjs supabase/migrations/20260806121000_kickstart_meta_ads_catalog_v3.sql --dry-run
```

Expected: both previews succeed and show only additive schema/catalog changes.

- [ ] **Step 2: Apply the migrations after the database backup checkpoint**

Run the same commands without `--dry-run`, in schema-first order. Capture only migration names, project ref and success/failure status; never capture access tokens or database passwords.

- [ ] **Step 3: Run the complete verification suite**

Run:

```powershell
npm test
npm run type-check
npm run lint
npm run build
npm run audit:links
```

Expected: every command exits 0. A failure blocks activation.

- [ ] **Step 4: Activate the flag for the Meta campaign**

Set `system_settings.bot_services_enabled` to `true` through the authenticated admin setting path. Do not change `bot_global_mode`, `bot_paused_global` or event settings as part of this activation.

- [ ] **Step 5: Run production smoke tests with synthetic contacts**

Verify one event conversation and one service conversation with synthetic test data. Check the service lead, interest, task, notification attempt and outbound reply. Check that no event confirmation or payment row was created by the service conversation.

- [ ] **Step 6: Monitor and document**

Review the first service conversations manually, then append the migration result to `data/PROJECT-LOG.md` and update the production snapshot in `docs/STATUS.md`. Do not place phone numbers, emails or message bodies in either document.

## Plan Self-Review

- **Spec coverage:** Event isolation is covered by Tasks 4, 7 and 8; catalog truth by Task 1; CRM structure by Tasks 2 and 3; all five modes by Task 5; kill switch by Task 6; rollout and rollback by Task 8.
- **Placeholder scan:** The plan contains no unfinished requirement marker, vague error-handling step or unspecified test command.
- **Type consistency:** `CaptureServiceInterestInput` and `CaptureServiceInterestResult` are defined in Task 2 and consumed unchanged in Task 3 and Task 4. `servicesCatalogBlock` already exists on `AgentContext` and is threaded into the builders in Task 5. `service_interest_id` is introduced in the schema, Supabase types, CRM task input and persistence flow in that order.
- **Safety check:** No task edits event confirmation/payment code, no task reads credential values, and every database change has a dry-run and backup checkpoint.
