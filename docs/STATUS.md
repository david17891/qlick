# Project Status — Snapshot vivo

> **Propósito:** Single source of truth "dónde estamos AHORA". A diferencia de
> `ROADMAP.md` (planes) y `OPEN_ITEMS.md` (deuda histórica), este doc captura
> el estado actual de producción en un momento dado.
>
> **Cuándo actualizarlo:** después de cada deploy, cambio de env var, fix
> crítico, o descubrimiento que invalida lo escrito. NO es append-only —
> se sobreescribe con el nuevo snapshot.
>
> **Última actualización:** 2026-07-10 5:32 Phoenix — **Recordatorios manuales de eventos + Envío de certificados Concept C activos**.
> David decidió desactivar el cron automático de `event-reminders` porque Vercel Hobby rechaza schedules con más de 1 ejecución/día y `*/30 * * * *` lo bloqueaba en silencio. Ahora los recordatorios se disparan manual via el botón **"🔔 Disparar recordatorio 24h"** en `/admin/eventos/[id]?tab=confirmations`.
>
> Adicionalmente, el flujo de certificados (Concept C) está activo: `/cert/[folio]` es público, el panel admin `CertificateBatchPanel` permite preview/confirmación/envío batch por correo (Brevo) con fallback manual a WhatsApp. La migración `20260708170000` está aplicada y validada.

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
>>>>>>> feat/certificados-concept-c
