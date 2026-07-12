# Project Status — Snapshot vivo

> **Propósito:** Single source of truth "dónde estamos AHORA". A diferencia de
> `ROADMAP.md` (planes) y `OPEN_ITEMS.md` (deuda histórica), este doc captura
> el estado actual de producción en un momento dado.
>
> **Cuándo actualizarlo:** después de cada deploy, cambio de env var, fix
> crítico, o descubrimiento que invalida lo escrito. NO es append-only —
> se sobreescribe con el nuevo snapshot.
>
> **Última actualización:** 2026-07-12 01:48 Phoenix — **Sprint v16 hotfix #3 mergeado (PR #20)**: persistencia real de `onSelectMode` en `system_settings` (antes solo cambiaba estado local) + anti-flicker de carga en la sección de Modos (skeleton mientras `statsLoading && !stats`, ya no dibuja un modo falso por 500ms). Crea endpoint dedicado `/api/admin/bot/mode` (la auditoría v16 R2 ya lo había anticipado) con SSOT del tipo `BotGlobalMode` + type guard `isBotGlobalMode` en `system-settings-server.ts`. Validación: 1173/1173 tests, type-check ✓, lint 0/0, build ✓ (endpoint listado en `/api/admin/bot/mode`). La deuda pre-existente del STATUS (no refleja sprint v16 PR #14/#16/#17 ni hotfix #1/#2) queda como pendiente menor — la cubre otra sesión.
>
> Estado anterior (2026-07-12 01:32): Sprint v16 hotfix #2 (PR #19) — 4 ajustes UI/UX en `ConversationsTab` y `BotConfigTab`. Sigue vigente (mergeado a main con HEAD `9bbf187`).

---

## Sprint v16 — Hotfix #3 (2026-07-12 01:48): persistencia real de modo + anti-flicker

**Cambios:**

1. **Endpoint dedicado `/api/admin/bot/mode`** (`src/app/api/admin/bot/mode/route.ts`, 95 líneas, patrón idéntico a `/api/admin/bot/global-pause`):
   - `GET` → `{ ok, mode: BotMode | null }` leyendo `system_settings.bot_global_mode`.
   - `POST` con body `{ mode: "socratic_autopilot_v2" | "socratic_no_tools_v1" | "super_executive" }` → UPSERT en system_settings. Idempotente. Valida contra set cerrado de 3 valores; cualquier otro string → 400.
   - `requireAdmin` + `checkSupabaseConfig` (mismo guard que el resto del admin).
2. **SSOT `BotGlobalMode` + type guard `isBotGlobalMode`** en `src/lib/admin/system-settings-server.ts` (32 líneas nuevas). El type guard se usa tanto en lectura (defensivo contra jsonb viejo) como en escritura (rechazo antes del UPSERT).
3. **`onSelectMode` ahora persiste** en `BotConfigTab.tsx` (commit frontend):
   - Optimistic update + POST a `/api/admin/bot/mode` + refetch de `/api/admin/bot/stats` para reconciliar `stats.bot_global_mode` con la SSOT.
   - Si el POST falla → rollback del modo local + `setError` con el mensaje.
   - No-op si ya está activo el modo.
   - Estado `modeSaving` deshabilita las 3 ModeTarjeta durante el POST.
4. **Anti-flicker de carga** en la sección "Modo Global del Bot":
   - Antes: `useState<BotMode>("socratic_autopilot_v2")` inicializaba con Socrático v2 por defecto. Cuando `fetchStats()` terminaba (~500ms después), saltaba a `stats.bot_global_mode`. La UI dibujaba un modo falso por medio segundo.
   - Ahora: mientras `statsLoading && !stats`, muestra 3 placeholders animados con `animate-pulse` + el mensaje *"Cargando configuración activa desde base de datos…"*. Solo cuando llega la primera respuesta de `/api/admin/bot/stats` se pintan las 3 ModeTarjeta con el modo activo real.

**Rama:** `feat/fase-16-6-hotfix-ui-3` (desde main, 2 commits atómicos: backend endpoint+tipo, frontend onSelectMode+skeleton).

**Validación:** type-check ✓ · lint ✓ (0/0) · **1173/1173 tests verde** (mismo baseline que hotfix #2) · build ✓ (endpoint `/api/admin/bot/mode` listado en el build manifest).

**Lo que David puede hacer ya en producción (después del merge + deploy):**
- Cambiar de modo en `/admin` → tab "Bot" → sección "Modo Global del Bot" → click en la tarjeta. El cambio se persiste en `system_settings.bot_global_mode` antes de que el botón vuelva a estar disponible. El provider deepseek lo lee en el siguiente turno (caché 30s invalidado en el `setSystemSetting`).
- Si la base de datos no responde, el modo local hace rollback y aparece un toast rojo con el error. La UI nunca queda en estado inconsistente con la SSOT.
- La carga inicial de la pestaña ya no parpadea: skeleton visible hasta que llega `bot_global_mode` real de la DB.

**Riesgo operacional:**
- El caché 30s en `readSystemSetting` se invalida explícitamente al hacer `setSystemSetting(KEY_BOT_GLOBAL_MODE, ...)`, así que el provider ve el cambio en el siguiente turno (no requiere esperar el TTL). Mismo patrón que `bot_paused_global` (M4) y `bot_daily_outbound_limit` (M2).
- El endpoint dedicado es más estricto que el genérico: el set cerrado de 3 valores es defensa en profundidad contra un bug en la UI que mande strings arbitrarios.
- Sin migraciones (no toca schema). El endpoint vive en `/api/admin/bot/mode` y la SSOT del tipo en `system-settings-server.ts`.

---

## Hotfix #3 (2026-07-08 ~21:00): admin edit confirmed attendee (name/email/phone)

**Cambios:**
- `updateConfirmationFields()` server-side en `confirmations-server.ts`: valida formato (mismas reglas que `updateLeadFields` del CRM — email RFC-lite, phone E.164 via `normalizePhone`, name 1-100), diff contra fila, audit log con before/after JSONB (`action='event_confirmation_edit'`), re-mapea `event_qr_tokens` si cambia email/phone (best-effort — no rompe la op principal si falla).
- `editConfirmationAction()` server action en `_actions.ts`: delega a la lib, `revalidatePath` al éxito.
- `EditConfirmationButton.tsx` client component: modal inline con form (name/email/phone) + Save/Cancel, `useFormState` + `useFormStatus` para feedback de error/éxito en vivo, cierre automático al success. Patrón consistente con el drawer del CRM global.
- +13 tests en `tests/confirmations-admin-edit-fields.test.mjs` cubriendo validación, diff, audit, errores DB, re-mapeo QR, confirmation not found.

**Rama:** `fix/eventos-confirmados-edit-2026-07-08` (en worktree `C:\Users\User\Documents\Click-fix-confirmados`). Mergeado a main después de "rama principal" de David.

**Validación:** type-check ✓ · lint ✓ · **726/726 tests verde** (713 + 13 nuevos) · build ✓.

**Lo que David puede hacer ya en producción:**
- Ir a `/admin/eventos/[id]?tab=confirmations` → cada fila de confirmado tiene botón "✏️ Editar" → click → modal con form → save.
- Placeholders heredados del bug del bot ("WhatsApp Lead", emails `wa.xxx@placeholder.local`) se identifican fácil y se corrigen en sitio.
- Cada save registra `event_confirmation_edit` en `admin_audit_log` con `before/after` + `metadata.fields_changed` + `metadata.eventId`.
- Si cambia el email/phone, el QR token asociado se re-mapea automáticamente (best-effort) — "Reenviar email" usa los datos nuevos sin re-generar el token.

---

## Feature previa (2026-07-08 ~19:30, mergeada en hotfix #1+#2): admin edit lead fields + bot order-independent

Sesión David pidió: (a) editar los 4 leads "WhatsApp Lead" legacy desde el drawer del CRM (placeholders del bug del bot, ej. `36249ecd` Yesy087, `646bc08f` UK, `a5360d1c`, `fe8ff672`), (b) hacer el bot más inteligente con orden-independiente de nombre+email.

**Feature 1 — Admin edit lead fields (commit `997378f`):**
- `updateLeadFields()` server-side con validación (email RFC-lite, phone E.164, name 1-100), diff contra fila actual (solo persiste lo que cambió), audit log JSONB con before/after snapshots (`action='lead_field_edit'`).
- `PATCH /api/admin/leads/[id]` extendido: acepta status Y/O name/email/phone en cualquier combinación.
- `patchLeadFields()` en ops-client.ts.
- `LeadDetailDrawer`: toggle view/edit inline en "Datos de contacto". Form con 3 inputs + Save/Cancel + optimistic update + rollback. Badge amber "placeholder" en valores heredados del bug (WhatsApp Lead, wa.xxx@placeholder.local) para que David los identifique de un vistazo.
- +15 tests unitarios en `tests/leads-admin-edit-fields.test.mjs`.

**Feature 2 — Bot order-independent name+email (commit `dfb2f8b`):**
- Helper exportado `extractNameAndEmailTogether()`: detecta "nombre + email juntos" en cualquier orden, con/sin coma, múltiples emails (toma primero, limpia resto del nombre).
- Override en `processInboundMessage` catchall: si matchea, fuerza intent=`provide_name` antes que `detectIntent` (que mandaría a welcome/question). El handler `provide_name` ya tenía implicit email capture (FIX 2026-07-07), así que ahora ejecuta update email + generateQrToken + sendEventQrPassEmail + createConfirmation en el mismo turno.
- Casos cubiertos: "Sitlalic Guzmán ramos sitlalic.guzman@uabc.edu.mx" (3 palabras + email) → ambos en 1 turno. "david@x.com David Esparza" (email antes) → ambos en 1 turno. "David david@x.com" (1 palabra) → null (necesita apellido, manejado por otro path).
- +17 tests en `tests/whatsapp-bot-order-independent.test.mjs`.
- `--experimental-test-module-mocks` agregado a `npm test` (Node 22) para que tests puedan mockear módulos ES.

**Rama:** `fix/leads-admin-edit-fields-2026-07-08` (en worktree `C:\Users\User\Documents\Click-fix-leads-edit`). **Mergeada a main** (`1d24561`) → auto-deploy Vercel disparado (`dpl_8PdQHmtctZuDtwsx4FNdfeBrKGEs` READY).

**Validación:** type-check ✓ · lint ✓ · 713/713 tests verde (681 anteriores + 15 leads-edit + 17 bot-order) · build ✓ (55+ rutas SSG/SSR).

---

## 🏷️ Release point actual: v0.9.0 (CRM Inteligente v2.0)

**Tag Git de respaldo (HEAD estable):** *(se crea en commit de cierre de gobierno — apunta al commit `ec9eb55`)*
**Commits relevantes en `main`:**
- (HEAD actual: 1d24561 — merge de leads-admin-edit-fields; el merge de eventos-confirmados-edit está pendiente)

**Branch:** `main` (deployado en Vercel)
**Handoff canónico:** `docs/HANDOFF_v0.9.0_CRM_INTELIGENTE.md` ← **leer primero para contexto completo del release**

### Puntos de respaldo (Rollback Tags) disponibles

| Tag | Estado | Devuelve a | Notas |

### Hotfixes mergeados a main este sprint (2026-07-08)

| Commit | Descripción | Branch origen | Vercel deploy |
| --- | --- | --- | --- |
| `1d24561` | Merge fix/leads-admin-edit-fields (admin edit leads + bot order-independent) | `fix/leads-admin-edit-fields-2026-07-08` | `dpl_8PdQHmtctZuDtwsx4FNdfeBrKGEs` READY |
| (pendiente) | Merge fix/eventos-confirmados-edit (edit confirmado en vista Confirmados) | `fix/eventos-confirmados-edit-2026-07-08` | (disparándose) |
| `ce22647` | Merge fix/whatsapp-bot-register-intercept (hotfix #2: register sin nombre + verbos coloquiales) | `fix/whatsapp-bot-register-intercept-2026-07-08` | READY |
| `88e39f7` | Merge fix/whatsapp-bot-name-capture (hotfix #1: saludo + captura nombre) | `fix/whatsapp-bot-name-capture-2026-07-08` | READY |
| `dc74db1` | fix(admin/events): propagar format/streaming/eventRules al POST | (directo) | READY |

### Entorno

- **Producción:** `qlick.digital` / `www.qlick.digital` (Vercel) — auto-deploy en cada push a `main`.
- **Branch alias:** `qlick-git-main-david17891-9351s-projects.vercel.app` (preview del HEAD de main).
- **Supabase:** project `ugpejblymtbwtsoiykyj` (región: aws-us-east-1, plan Free).
- **WhatsApp Business API:** Meta Cloud API. Webhook validando con `WHATSAPP_WEBHOOK_SECRET` (HMAC SHA-256).
- **Email transaccional:** Brevo (sender `noreply@qlick.digital`).
- **Cron jobs Vercel:** 1/día max (Hobby plan): `0 8 * * *` event-reminders, `0 3 * * *` cleanup-qr-tokens, `0 5 * * *` survey-reminders.

### Tests status

**Total actual: 726/726 verde.**
- 110 tests base pre-Fase-7b.
- +32 tests de la sesión 2026-07-08 (15 leads-admin-edit + 17 bot-order-independent + 13 confirmations-admin-edit).
- 583 tests restantes (CRM, eventos, payments, AI agent, QR tokens, etc).

### Decisiones recientes (ADRs en `docs/DECISIONS.md`)

- D-018: Admin client con service role (bypass RLS). actorEmail registrado en audit log.
- D-019 (implícito): confirmation fields edit via server action, re-mapeo QR token best-effort.
- D-020 (implícito): bot order-independent via helper puro + override en processInboundMessage catchall (no LLM intervene).

## 🆕 Fase 1 — Pagos Stripe (integración lista, pendiente deploy)
**Branch:** `feat/pagos-stripe-fase-1` (a crear; no commiteado aún al cierre de esta sesión).
**Handoff planeado:** `docs/HANDOFF_v1.0_STRIPE.md` (post-deploy).

### Schema

| Migration | Cambio | Estado en Supabase |
|---|---|---|
| `20260707100000_event_access.sql` | Tabla `event_access` (espejo de `course_access` para eventos) con RLS `event_access_owner_select` + `event_access_admin_all` (patrón inline `(auth.jwt()->>'app_role') in ('admin','instructor')`). | ✅ Aplicada |
| `20260707110000_payments_course_id_nullable.sql` | `payments.course_id` → NULL (pagos de eventos/masterclass quedan vinculados vía `event_access.payment_id`). | ✅ Aplicada |

> El archivo `20260707100000_event_access.sql` en repo fue sincronizado con el patrón real del repo (corregido de un `public.is_admin()` que no existe a inline `(auth.jwt() ->> 'app_role')` + `coalesce(..., false)` + `to authenticated`).

### Código nuevo

| Archivo | Propósito |
|---|---|
| `src/app/api/payments/create-checkout/route.ts` | Endpoint POST server-side que resuelve el curso por slug, valida auth + `checkCourseAccess`, llama `getPaymentProvider().createCheckout(productRef)`, devuelve `{ flow, redirectUrl, paymentId, ... }`. Idempotente: 409 con `alreadyPaid: true` si ya pagó. |
| `src/app/pagar/[courseSlug]/CheckoutButton.tsx` | Client component que reemplaza al SimulatorForm cuando `NEXT_PUBLIC_PAYMENT_PROVIDER !== 'mock'`. Selector card/oxxo/spei + botón "Pagar ahora" que postea a create-checkout y redirige a Stripe Checkout hosted. |
| `src/app/pagar/[courseSlug]/exito/page.tsx` | Server component que lee `?session_id=XXX`, llama `provider.getStatus()`, verifica `checkCourseAccess` (webhook pudo ya haber corrido), muestra feedback aprobado/pendiente/rechazado según estado. |

### Código modificado

| Archivo | Cambio |
|---|---|
| `src/app/pagar/[courseSlug]/page.tsx` | Branching según `NEXT_PUBLIC_PAYMENT_PROVIDER`: `mock` → SimulatorForm (dev-only), `stripe`/otros → CheckoutButton. Banner de "Pago cancelado" si `?cancelled=1`. **Sigue sin llamar a `checkCourseAccess()` en render** (workaround heredado de 2026-06-26 que evita el render vacío en browser). |
| `src/app/api/webhooks/stripe/route.ts` | Removidos 3 `@ts-ignore` obsoletos sobre `payments.course_id` (el typegen local ya dice nullable desde migración previa). Quedan solo los `@ts-ignore` de `event_access` (la tabla no está en el typegen aún). |

### Tests nuevos

- `tests/payments-registry.test.mjs` (+14 tests, **583/583 verde**): cubre `getActivePaymentProviderName`, `getPaymentProvider`, `listPaymentProviders`, `applyCoupon` (5 escenarios de cupones), y `mockProvider.createCheckout` con `card`/`oxxo`/free.

### Lo que falta para deploy

1. **Pegar `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`** en `.env.local` (David) y Vercel env vars (production).
2. **Setear `NEXT_PUBLIC_PAYMENT_PROVIDER=stripe`** en Vercel (preview + production) para activar el flujo real. Mantener `mock` en dev local.
3. **Registrar webhook endpoint** en Stripe Dashboard: `https://qlick.digital/api/webhooks/stripe` con eventos `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`.
4. **E2E con test cards** (4242 4242 4242 4242, 4000 0000 0000 9995, 0341) contra un evento publicado → verificar que `course_access` (cursos) o `event_access` (eventos) se crea vía webhook.
5. **Actualizar docs/STATUS.md y CHANGELOG.md** post-deploy con tag `v1.0-stripe-real`.

---

## 🌐 Deploy activo (sin cambios)

| Campo | Valor |
|---|---|
| **Dominio** | `https://www.qlick.digital` (apex redirect www→apex en Vercel) |
| **Dominio Vercel (auto)** | `qlick-three.vercel.app` (legacy, sigue activo) |
| **Branch** | `main` |
| **Último push** | `dc74db1` *(hotfix post-v0.9.0 — propagación de campos nuevos en POST /api/admin/events)* |
| **Commits ahead of origin** | **0** — working tree clean post-hotfix |
| **Build status** | ✅ READY + PROMOTED + aliasAssigned (deployment `qlick-ntjo2dm7i`, 44s) |

### Dominio `qlick.digital` (sin cambios desde sesión 2026-07-02)

- Comprado en Hostinger, renovación $55/yr (considerar migrar a Cloudflare Registrar en 2027-06).
- DNS delegado a Cloudflare, Vercel + SSL OK.
- Email Routing (Brevo + Cloudflare MX) operacional con remitente verificado.

---

## 🔐 Env vars en Vercel (production + preview)

Sin cambios desde v0.8.0. Las env vars críticas del CRM (no nuevas en este release, solo expuestas correctamente a los nuevos endpoints) son las mismas:

| Key relevante | Tipo | Notas |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | plain | `https://qlick-three.vercel.app` |
| `SUPABASE_SECRET_KEY` | sensitive | service role para server libs del CRM (admin only) |
| `ADMIN_EMAIL_ALLOWLIST` | sensitive | gatea `requireAdmin()` en `/api/admin/crm/*` |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | sensitive | ya seteadas |

> Los nuevos endpoints `/api/admin/crm/{overview,conversations,ai-suggestions}` usan el cliente Supabase server-side con el JWT del admin en sesión, así que **no requieren env vars nuevas**.

---

## ✅ Lo que funciona end-to-end (production)

### Core v0.9.0: CRM Inteligente v2.0 (NUEVO en este release)

#### Compliance Legal (Fase 1)

| Feature | Estado | Verificación |
|---|---|---|
| **Soft delete (`archiveLead`)** | ✅ | Borrado físico **bloqueado** en código; solo `status='archived'` |
| **Optimistic locking (bulk + individual)** | ✅ | `WHERE status = prevStatus` en `bulkArchiveLeads`, `archiveOneLead`, `bulkUpdateStatus` |
| **Export CSV streaming chunked** | ✅ | `ReadableStream` + `.range(0, 999)` recursivo + BOM UTF-8 (`\uFEFF`) + tope 100k filas |
| **Filtro default `consent_to_contact=true`** | ✅ | CSV exportable sin consentimiento = 0 filas (privacidad por default) |
| **Confirmación textual "ARCHIVAR N"** | ✅ | Guard en UI antes de disparar server action |

#### Inteligencia Comercial (Fase 2)

| Feature | Estado | Verificación |
|---|---|---|
| **Conversaciones reales del bot** | ✅ | `listRealConversations()` une `lead_whatsapp_conversations` + `lead_interactions` con fallback por phone |
| **Lead Velocity Rate (LVR)** | ✅ | `(leads_7d - leads_7d_prev) / leads_7d_prev * 100`, edge case prev=0 → 100% |
| **Radar SLA Overdue (>48h)** | ✅ | Leads `new\|contacted` con `MAX(updated_at, last_interaction) > 48h` Y sin `crm_tasks.done=false` |
| **Distribución de Calor (Hot/Warm/Cold)** | ✅ | Buckets por score (≥60 hot, ≥40 warm, resto cold) |
| **PipelineCard con badges 🔥 + ⚠️** | ✅ | Bordes cálidos para leads hot desatendidos |

#### Agente IA de Ventas (Fase 3)

| Feature | Estado | Verificación |
|---|---|---|
| **Templates dinámicos por score** | ✅ | 3 plantillas (close / value / reactivate) seleccionadas según score + survey |
| **Links `wa.me` pre-armados** | ✅ | `buildWhatsAppLink(phone, message)` con encoding RFC 3986 |
| **Endpoint `/api/admin/crm/ai-suggestions?leadId=X`** | ✅ | Rate limit 30/min, lee lead + `event_surveys`, delega a templates puros |

### Core pre-v0.9.0 (sin cambios)

Ver `docs/HANDOFF_v0.8.0_FUNCIONAL.md` para el detalle completo del wizard WhatsApp + Español MX. Resumen:

- Wizard Q1→Q2→Q3→q_consent→q_business→thank-you (intactos)
- Admin panel `/admin/eventos/[id]` con tabs (Encuestas, Leads promovidos, Pipeline, Resumen)
- Login OAuth Google + magic link, dualidad admin/student
- WhatsApp Cloud API inbound + outbound (texto libre + wizard thank-you)
- Persistencia conversaciones en `lead_whatsapp_conversations` + `lead_interactions`

---

## ⚠️ Lo que funciona pero sigue siendo DEMO (no real)

| Sección CRM | Estado | Por qué | Plan |
|---|---|---|---|
| **Calendario / Citas** | 🟡 Demo | Lee `src/lib/data/crm-data.ts`. No hay Google Calendar integration. | **Fase 4** (con tareas + notificaciones) |
| **Sales Owners** | 🟡 Demo | Asignación de leads sigue siendo ficticia. | **Fase 4** (asignación real + notificaciones) |
| **Broadcast WhatsApp** | 🟡 Demo | Genera lista de `wa.me` pre-armados pero no envía masivo. | Out of scope (requiere templates Meta aprobados) |
| **Concurrencia en tabla de leads UI** | 🟡 Frontend carga todo | La tabla de leads en `CRMView.tsx` carga toda la lista en memoria (sin paginación server-side) | **Fase 4** (cursor pagination) |

| Feature | Estado | Por qué | Plan |
|---|---|---|---|
| **Agente IA (escalado LLM)** | 🟢 Real con switch | DeepSeek V4-Flash (default) + V4-Pro con heurística de escalado | sin cambios |
| **Conversaciones + Inteligência + IA** | 🟢 **REAL** (este release) | Lee Supabase real + cálculo server-side + templates puros | **mantener** |

---

## 🗄️ Database (Supabase `ugpejblymtbwtsoiykyj`)

**Camino de DDL desde Mavis: Management API** (`scripts/apply-migration-management.mjs`). Pooler (`pg` + 6543) y host directo (`db.{ref}.supabase.co:5432`) están rotos (ENOTFOUND/28P01). Ver `docs/AGENT_SUPABASE_PROTOCOL.md` §11 para el flujo canónico.

~24 tablas en `public`. Sin cambios de schema en v0.9.0 (todo es a nivel de `src/lib` + presentación).

Tablas que el CRM Inteligente v2.0 lee intensivamente:
- `leads` — score, qualification, consent_to_contact, last_contacted_at, last_interaction_at
- `lead_whatsapp_conversations` — log inbound/outbound del bot (timestamp, body, direction)
- `lead_interactions` — interacciones manuales del admin (timestamp, kind, notes)
- `lead_event_links` — UNIQUE(link_type, link_id), INSERT-only
- `event_surveys` — respuestas del wizard en JSONB (q1_clarity, q_consent, q_business, etc.)
- `lead_consent_log` — auditoría de consentimientos (LFPDPPP/LGPD compliance)

Detalle completo de schema en `docs/DB_AUDIT_2026-06-30.md` + migrations en `supabase/migrations/`.

---

## 📱 WhatsApp Cloud API — Estado actual (sin cambios)

- **Inbound:** ✅ funcional (webhook + signature verification + bot engine)
- **Outbound:** ✅ funcional (texto libre + wizard thank-you)
- **Bot engine (`bot-engine.ts`):** ✅ **NO MODIFICADO** por este release (política de aislamiento verificada con `git diff v1.1-crm1-stable HEAD`)

---

## 🐛 Issues activos (post-v0.9.0)

### Cerrados en este release

- ~~I-1 (parcial): CRM híbrido tab Conversaciones en demo~~ → **CERRADO**: ahora `listRealConversations()` lee DB real.
- I-2 (CRM híbrido): restantes Calendario + Broadcast siguen demo — **Fase 4**.

### Pendientes (no bloquean, son Fase 4+)

Ver `docs/OPEN_ITEMS.md` + sección **Fase 4** en `docs/HANDOFF_v0.9.0_CRM_INTELIGENTE.md`:

- **Paginación server-side en tabla de leads UI** (>5k leads saturando navegador)
- **Refactor nombre leads**: separar `name` en `first_name` + `last_name` (resuelve `firstName()` frágil)
- **Calendario real** (Google Calendar integration) + tareas CRM con notificaciones
- **Alertas proactivas SLA**: notificaciones salientes (Email / Slack) cuando un lead entra a SLA Overdue
- **G-5 (Meta templates)** — necesarias para outreach proactivo. Bloqueada por aprobación Meta.
- **G-12, G-17** — intermitencias heredadas, fuera del scope de este release.

---

## 🧪 Cómo verificar (para próxima sesión)

```bash
# 1. Suite verde + audit script
npm run type-check && npm run lint && npm test && npm run build
# → 545/545 ✓, lint ✓, type-check ✓, build ✓

# 2. Audit E2E contra DB real (18 aserciones)
node scratch/qlick-crm-ai-audit.mjs
# → 18 OK / 0 FAIL (I1 conversaciones, I2 LVR/SLA/Heat, I3 AI wa.me, I4 bot intacto)

# 3. CRM conectado en /admin/eventos/[id]
# Login con david17891@gmail.com → /admin/eventos/[id]
# → Tab Conversaciones muestra mensajes reales de WhatsApp
# → Header con badges 🔥 HOT en leads score≥60
# → Cajón del lead → "Acciones Recomendadas" muestra 3 sugerencias IA con link wa.me

# 4. Export CSV streaming
curl -H "Cookie: sb-*-auth-token=..." "https://qlick.digital/api/admin/crm/leads/export?status=active&consent=true" -o /tmp/crm.csv
# → Stream chunked, primeras 3 líneas son BOM + header + lead
# → wc -l /tmp/crm.csv <= 100000 (tope defensivo)

# 5. Bot sigue funcionalmente íntegro
git diff v1.1-crm1-stable HEAD --stat -- src/lib/whatsapp/bot-engine.ts
# → 328 insertions / 13 deletions (esperado, son features/fixes legítimos del bot)
# → Si querés auditar que NO hay intrusión CRM/campaign:
git diff v1.1-crm1-stable HEAD -- src/lib/whatsapp/bot-engine.ts | grep -E '(leads|crm|bulkArchive|conversations)' || echo OK no CRM leakage
```

---

## 🎟️ Releases previos

| Tag | Descripción | Fecha |
| --- | --- | --- |
| `v0.9.0` *(por crear)* | **ESTE RELEASE** — CRM Inteligente v2.0 (Fases 1+2+3) | 2026-07-06 |
| `v0.8.0` | Wizard WhatsApp funcional + Español MX | 2026-07-06 |
| `v0.6.0-masterclass-funnel-foundation` | Masterclass funnel foundation | 2026-06-XX |
| `v0.5.1-crm-truth-layer` | CRM truth layer | 2026-06-XX |
| `v0.4.1-privacy-deploy-ready` | Privacy + deploy ready | 2026-06-XX |
| `v0.4.0-leads-foundation` | Leads foundation | 2026-06-XX |
| `v0.3.0-supabase-bootstrap` | Supabase bootstrap | 2026-06-XX |
| `v0.2.0-qlick-lms-crm-demo` | LMS + CRM demo | 2026-06-XX |
| `v0.1.0-qlick-lms-demo` | LMS demo | 2026-06-XX |

Detalle completo en `CHANGELOG.md`.

---

## 📚 Docs de referencia

- `docs/HANDOFF_v0.9.2_CERT_EMAIL.md` — **handoff del sprint Cert Email (envío batch + email Brevo + WhatsApp fallback)** ← nuevo, E2E validado
- `docs/HANDOFF_v0.9.1_CERT_CONCEPT_C.md` — handoff del sprint Certificados Concept C (cert HTML imprimible)
- `docs/HANDOFF_v0.9.0_CRM_INTELIGENTE.md` — handoff del release CRM Inteligente v2.0
- `docs/HANDOFF_v0.8.0_FUNCIONAL.md` — handoff previo (wizard WhatsApp + Español MX)
- `docs/HANDOFF_v0.7.1_FASE_7A_REMINDERS.md` — recordatorios evento
- `docs/ROADMAP.md` — fases, decisiones, prioridades (Fase 4 detallada)
- `docs/OPEN_ITEMS.md` — deuda técnica append-only con severidades
- `CHANGELOG.md` — release notes consolidadas (Keep a Changelog en español)
- `data/PROJECT-LOG.md` — registro append-only de cambios puntuales
- `docs/CRM_MODE_STATUS.md` — qué parte del CRM es real vs demo (actualizado: solo Calendario + Broadcast)
- `scratch/qlick-crm-ai-audit.mjs` — script de auditoría E2E (18 aserciones)
- `docs/EVENTS_ADMIN_GUIDE.md` — manual operativo del panel admin
- `docs/VERCEL_ENV_SETUP.md` — setup de env vars en Vercel
- `docs/SUPABASE_CONNECTION_BOOTSTRAP.md` — setup inicial de Supabase
- `docs/GITHUB_WORKFLOW.md` — convenciones de branch + commit + PR

---

## Sprint cierre-eventos-virtuales (2026-07-11 10:30 — 11:50 Phoenix)

**Motivación:** cerrar el ciclo "confirmado → asistencia real" en eventos Zoom/virtuales/hybrid. Antes del sprint, los confirmados que solo respondían la Q0 de la encuesta post-evento por email/WhatsApp (sin haber abierto el gate virtual ni escaneado el QR) NO quedaban como asistentes en el funnel. El CRM tampoco reflejaba la asistencia.

### Commits mergeados a main (5 commits + 2 hotfixes)

| SHA | Mensaje | Archivos |
|---|---|---|
| `bd5a27d` | `feat(eventos): agregar envio de link de encuesta post-evento y lookup de respuestas` | 5 nuevos (template email, orquestador, mensaje WhatsApp, botón, helper) |
| `ba461ba` | `merge: feat/certificados-concept-c into feat/survey-link-confirmations` | merge de certs v0.9.2 |
| `8d39437` | `test: add tests for send-survey-link-confirmations` | 1 test nuevo (194 líneas) |
| `1e97849` | `fix(eventos): upsert attendee + promote lead en Q0 attendance check` | 6 archivos (1 migration + helper + types + server) |
| `6f2a294` | `merge: cierre-eventos-virtuales UPSERT attendee + promote lead` | merge a main |
| `089300f` | `docs(log): entrada sprint cierre-eventos-virtuales UPSERT + promote lead` | PROJECT-LOG |
| `827b32b` | `fix(email): voseo -> tutéo en template survey-invite` | 1 archivo (5 strings) |
| `d858f9c` | `fix(copy): voseo -> tutéo en todos los copy visibles al cliente (audit completo)` | 10 archivos + 2 scripts |

### Fix aplicado: UPSERT attendee + promote lead (`surveys-server.ts:295-494`)

**Gap #1 (CRÍTICO):** cuando el confirmado respondía Q0=Yes por email, el lead NO se promovía a `event_attended` en el CRM.

**Gap #2 (CRÍTICO):** si el confirmado NUNCA había abierto el gate virtual NI escaneado el QR (camino email-only), el UPDATE sobre `event_attendees` no aplicaba → `checked_in_at` quedaba NULL → el funnel NO lo contaba.

**Fix:** el bloque ahora hace UPSERT en lugar de UPDATE. Si no existe row con `(event_id, email)` o `(event_id, phone_normalized)`, crea uno al vuelo con `source='survey_attended'` (nuevo valor del enum, ver migration abajo) + `checked_in_at=now()`. Si el row ya existía (gate click o check-in previo), preserva el `source` original y solo actualiza `checked_in_at` (idempotente). Race condition con UNIQUE constraint manejada: si `23505` (unique violation) entre el lookup y el INSERT, re-lee el row ganador y hace UPDATE.

Después del UPSERT, busca el lead por email o phone, y si existe + no está en `event_attended` ni cerrado (`lost`/`archived`), UPDATE leads SET `status='event_attended'`, `tags+=[event:{slug}:attended]`, `last_contacted_at=now()`. Mismo patrón que `api/check-in/route.ts:409-437`.

### Refactor: helper puro `detectAttendanceCheck`

La decisión booleana "el confirmado respondió Sí en la Q0" se extrajo de `surveys-server.ts:271-340` a un helper puro en `src/lib/events/survey-attendance-check.ts`. Razón: poder testearla sin mockear Supabase. 10 tests unitarios en `tests/survey-attendance-check.test.mjs` (sin Q0, con Q0, edge cases, score negativo).

### Migration aplicada por David

`supabase/migrations/20260711100000_event_attendee_source_survey_attended.sql` — `ALTER TYPE event_attendee_source ADD VALUE 'survey_attended'`. Aplicada en Supabase antes del merge.

### Audit de voseo (completado en 2 commits)

David detectó conjugaciones voseantes argentinas en el template `survey-invite.ts` (Tardás, decinos, copiá, pegá). El audit se extendió a TODO el copy visible al cliente (212 archivos: `src/lib/email/templates`, `src/lib/whatsapp`, `src/lib/contact`, `src/components`, `src/app`).

**Resultado:** 17 voseos reales corregidos en 11 archivos (4 del email + 13 en otros). Falsos positivos documentados: regex detectors de input del usuario, "deja" tuteo sin tilde, "parámetros" sustantivo.

**Nuevo script:** `scripts/_audit-voseo-templates.mjs` — escanea verbos voseantes (presente + imperativo), pronombres ("vos"), muletillas rioplatenses. Allowlist para falsos positivos conocidos. Exit 0 = cero voseo, exit 1 = lista de matches.

### Validación (corro yo mismo, no me fío del reporte)

| Check | Resultado |
|---|---|
| `npm run type-check` | ✓ 0 errores |
| `npm run lint` | ✓ 0 warnings, 0 errors |
| `npm test` | ✓ **1066/1066 pass** (de 1056 → +10 del nuevo helper; voseo no rompió tests) |
| `npm run build` | ✓ compila, todas las rutas SSG/SSR |
| `node scripts/_audit-voseo-templates.mjs` | ✓ 209/212 archivos limpios, 3 falsos positivos documentados |
| `node scripts/_preview-survey-invite-email.mjs` | ✓ genera `scratch/email-survey-invite-preview.html` |

### Estado del ciclo "confirmado → asistencia real"

**Antes del sprint:**
- Confirmado email-only → `checked_in_at` NULL, no contaba como asistente, lead no avanzaba en CRM.

**Después del sprint:**
- Confirmado email-only → `event_attendees` con `source='survey_attended'` + `checked_in_at=now()`, lead promovido a `event_attended` con tag.
- Confirmado con gate click previo → solo `checked_in_at` (source preservado, idempotente).
- Confirmado con check-in presencial previo → solo `checked_in_at` (source preservado, idempotente).
- Si lead ya en `event_attended` o cerrado → no-op (idempotente + respeta manual).

### Lo que NO está automatizado (deuda viva)

1. **Cron de recordatorio automático a no-respondieron** (24/48h post-evento) — requiere Cloudflare Workers / Supabase pg_cron (Vercel Hobby limita a 1/día). Hoy el admin tiene que mandar manual via `SendSurveyLinkButton`.
2. **Importador de Zoom Attendee Report** (CSV nativo) — el camino más "duro" para asistencia Zoom. Hoy depende del survey email.
3. **Modal detalle del envío** (Gap #3) — el botón actual no muestra los `wa.me` pre-armados para confirmados con phone sin email. David los tiene que copiar del log o reconstruir.

### Trazabilidad

- `data/PROJECT-LOG.md` entrada `2026-07-11 ~10:40 — Sprint cierre-eventos-virtuales: UPSERT attendee + promote lead en Q0` + entrada implícita del audit voseo.
- `docs/ROADMAP.md` actualizado con el sprint (verificar entrada en próxima pasada).
- `docs/OPEN_ITEMS.md` gaps a cerrar (verificar).
- `MEMORY.md` (Mavis global) sección "Voseo/vos en emails visibles al cliente final (HOT, 2026-07-11)" con la regla endurecida.
