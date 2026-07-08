# Project Status — Snapshot vivo

> **Propósito:** Single source of truth "dónde estamos AHORA". A diferencia de
> `ROADMAP.md` (planes) y `OPEN_ITEMS.md` (deuda histórica), este doc captura
> el estado actual de producción en un momento dado.
>
> **Cuándo actualizarlo:** después de cada deploy, cambio de env var, fix
> crítico, o descubrimiento que invalida lo escrito. NO es append-only —
> se sobreescribe con el nuevo snapshot.
>
> **Última actualización:** 2026-07-08 13:50 — **Bot WhatsApp: 2 bugs críticos arreglados y mergeados a main (hotfix)**. Sesión urgente post-deploy (David reportó en conversaciones reales del evento "Marketing + IA para Emprendedores"). Cerrado: (a) Bug 1: bot salía con "¡Hola WhatsApp!" / "¡Excelente WhatsApp!" / "Listo WhatsApp" cuando Meta no provee `profile.name` del contacto (fix: `PLACEHOLDER_NAMES` ahora filtra "whatsapp" y "whatsapp lead"); (b) Bug 2: LLM rompía el flow secuencial nombre → email (caso Yesenia: "Bue. Día quiero regístrate" → bot saltaba a "dame tu email" → loop de 3-4 turnos). Fix: nuevo helper puro `matchInscriptionIntent(body)` + intercept en `case "question"` que setea `awaiting_field="name"` sin pasar por el LLM. Tests: +30 unitarios en `tests/whatsapp-bot-name-capture.test.mjs`, +16 simulaciones de conversación en `tests/whatsapp-bot-conversation-sim.test.mjs` (incluye caso Yesenia completo: 5 turnos vs 7 antes). Validación: 668/668 tests verde · type-check ✓ · lint ✓ · build ✓. Commit: `16c7c43` (rama `fix/whatsapp-bot-name-capture-2026-07-08` → merge a main `88e39f7` por sesión Mavis). Auto-deploy Vercel disparado. NO tocado: LLM provider, system prompt, Supabase schema/RLS, templates Meta. Surgical. Pendiente: entrada en `data/PROJECT-LOG.md` (commit separado, encoding histórico del archivo está corrupto).

---

## 🏷️ Release point actual: v0.9.0 (CRM Inteligente v2.0)

**Tag Git de respaldo (HEAD estable):** *(se crea en commit de cierre de gobierno — apunta al commit `ec9eb55`)*
**Commits relevantes en `main`:**
- `dc74db1` — `fix(admin/events): propagar format/streaming/eventRules al POST` ← **HEAD actual** *(hotfix post-v0.9.0)*
- `7188289` — `fix(bot): fallback honesto cuando no hay eventos publicados (no evento fantasma)`
- `ec9eb55` — `feat(crm): Fase 2-3 - Conversaciones reales + inteligencia comercial + agente IA dinamico`
- `d150d9d` — `feat(crm): Fase 1 - Archivado logico, bulk actions con optimistic lock, export CSV streaming`
- `cc320fc` — `docs(release): v0.8.0 - Wizard WhatsApp funcional + Español MX`

**Branch:** `main` (deployado en Vercel)
**Handoff canónico:** `docs/HANDOFF_v0.9.0_CRM_INTELIGENTE.md` ← **leer primero para contexto completo del release**

### Puntos de respaldo (Rollback Tags) disponibles

| Tag | Estado | Devuelve a | Notas |
|---|---|---|---|
| `v0.9.0` *(por crear en commit de cierre)* | **RELEASE ACTUAL** | `ec9eb55` + docs canónicos | Head estable, suite verde |
| `v1.1-crm1-stable` | ✅ Snapshot pre-Fase 2-3 | `d150d9d` | Cierre Fase 1 CRM (soft delete + bulk + CSV streaming) |
| `v1.0-bot-stable` | ✅ Snapshot bot puro | pre-CRM | Bot 100% funcional (registro, QR, encuestas) |
| `v0.8.0` | ✅ Snapshot previo al CRM | `cc320fc` | Wizard WhatsApp + Español MX |

```bash
# Rollbacks rápidos (sin perder datos de Supabase):
git checkout v1.1-crm1-stable    # vuelve a Fase 1 CRM (sin conversaciones reales ni IA)
git checkout v1.0-bot-stable     # vuelve a estado pre-CRM (solo bot + wizard)
git checkout v0.8.0              # vuelve a wizard WhatsApp sin CRM

# Rollback quirúrgico del release actual:
git revert ec9eb55 --no-edit
```

### Qué cambió vs v0.8.0

| Antes (v0.8.0) | v0.9.0 (CRM Inteligente v2.0) |
| --- | --- |
| Borrado de leads era hard delete (cascadeaba `lead_consent_log` → ilegal LGPD/LFPDPPP) | **Soft delete** obligatorio (`archiveLead`) — borrado físico bloqueado |
| Updates masivos last-write-wins (race conditions con bot) | **Optimistic locking** (`WHERE status = prevStatus`) en bulk + individual |
| Export CSV `SELECT *` colapsaba Vercel Hobby (>5k leads) | **Streaming chunked** con `ReadableStream` + `.range()` en bloques de 1,000 + tope defensivo 100k + BOM UTF-8 (`\uFEFF`) |
| Sin filtro de consentimiento en exports | **Default `consent_to_contact=true`** en CSV export (privacidad por default) |
| Sin confirmación antes de archivar N leads | **Confirmación textual obligatoria** *"ARCHIVAR N"* |
| Pestaña Conversaciones del CRM leía mock (`crm-data.ts`) | **Conexión real** a `lead_whatsapp_conversations` + `lead_interactions` con fallback por phone para pre-leads |
| Overview admin con métricas planas | **Inteligencia comercial**: LVR, Radar SLA (>48h), Distribución de Calor (Hot/Warm/Cold) |
| Cajón del lead sin guía de venta | **Agente IA dinámico**: 3 plantillas (close/value/reactivate) por score + survey + botones `wa.me` pre-armados |
| PipelineCard sin señalar urgencia | **Badges 🔥 HOT + ⚠️ SLA** + bordes cálidos para destacar leads desatendidos |

### Métricas del release v0.9.0

- **Tests unitarios / integración:** **545/545 verde** (sin regresión vs v0.8.0)
- **Audit E2A (script `scratch/qlick-crm-ai-audit.mjs`):** **18/18 aserciones OK** contra DB real (escenarios I1-I4)
- **`npm run type-check`:** ✓ 0 errores
- **`npm run lint`:** ✓ 0 warnings/errors
- **`npm run build`:** ✓ Compila 55+ rutas (Static + Dynamic)
- **Bot engine (`src/lib/whatsapp/bot-engine.ts`):** ✅ **Funcionalmente íntegro** — modificado 341 líneas desde v1.1-crm1-stable (6 commits), pero todos los cambios son feature/fix del propio bot (escalado humano en categorías duras, fallback honesto sin eventos publicados, copy check-in presencial, gate virtual SÍ/VOY, mensajes condicionales por formato). NO hay intrusión de CRM/campaign. Suite verde 569/569.
- **Cobertura de compliance (LGPD/LFPDPPP):** ✅ soft delete + audit logs + consent filter
- **Cobertura de UX:** ✅ conversaciones reales + métricas inteligentes + agente IA dinámico

---

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

24 tablas en `public`. Sin cambios de schema en v0.9.0 (todo es a nivel de `src/lib` + presentación).

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

- `docs/HANDOFF_v0.9.0_CRM_INTELIGENTE.md` — **handoff completo de este release** ← leer primero
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
