# Project Status — Snapshot vivo

> **Propósito:** Single source of truth "dónde estamos AHORA". A diferencia de
> `ROADMAP.md` (planes) y `OPEN_ITEMS.md` (deuda histórica), este doc captura
> el estado actual de producción en un momento dado.
>
> **Cuándo actualizarlo:** después de cada deploy, cambio de env var, fix
> crítico, o descubrimiento que invalida lo escrito. NO es append-only —
> se sobreescribe con el nuevo snapshot.
>
> **Última actualización:** 2026-07-06 ~15:25 — Release `v0.8.0` documentado
> (wizard WhatsApp funcional + español mexicano consistente). 535/535 tests
> verde localmente.

---

## 🏷️ Release point actual: v0.8.0

**Tag Git:** `v0.8.0` (pusheado a origin)
**Commit HEAD:** `<ver CHANGELOG v0.8.0>`
**Branch:** `main`
**Handoff doc:** `docs/HANDOFF_v0.8.0_FUNCIONAL.md` ← **leer primero para contexto completo**

### Qué cambió vs estado previo

| Antes (v0.6.0-masterclass-funnel-foundation) | v0.8.0 (este release) |
| --- | --- |
| Wizard se rompía con "Muy claro" (buttonId no llegaba) | Wizard end-to-end funcional (formato dinámico + legacy detectados) |
| q_consent "Sí" no avanzaba al q_business | Nuevo intent `survey_q_consent_continue` |
| Encuestas tab mostraba "(sin respuestas)" | Labels legibles, formato dinámico soportado |
| Leads promovidos sin info (score/qualification) | Badges inline en pipeline view |
| Cierre mandaba 2 mensajes (thank-you + bucket) | Solo thank-you, sin duplicación |
| Copy rioplatense ("contanos", "escribinos", voseo) | Español mexicano consistente (bot + email + web) |

### Métricas del release

- **Tests:** 535/535 verde (504 baseline + 31 nuevos: name capture + G-15 r1-r7 + survey display)
- **type-check:** ✓ 0 errores
- **lint:** ✓ 0 warnings/errors
- **build:** ✓ Compila, ~55 rutas (Static + Dynamic)
- **Cobertura de copy MX:** bot WhatsApp + emails transaccionales + páginas web admin/student/staff + LLM system prompt (8 + 12 archivos)

---

## 🌐 Deploy activo

| Campo | Valor |
|---|---|
| **Dominio** | `https://www.qlick.digital` (apex redirect www→apex en Vercel) |
| **Dominio Vercel (auto)** | `qlick-three.vercel.app` (legacy, sigue activo) |
| **Branch** | `main` |
| **Último push** | (verificar `git log --oneline -1 origin/main`) |
| **Commits ahead of origin** | **0** — working tree clean post-v0.8.0 |
| **Build status** | ✅ READY + PROMOTED + aliasAssigned |

### Dominio `qlick.digital` (sesión 2026-07-02)

- Comprado en Hostinger, 1 año, $3.50 USD. **Renovación $55/yr — considerar migrar a Cloudflare Registrar en 2027-06** (ahorro ~$25/yr).
- DNS delegado a Cloudflare (michael + monroe). Proxy OFF (DNS only) para que Vercel pueda emitir cert SSL.
- Vercel: `qlick.digital` + `www.qlick.digital` → Valid Configuration. Cert SSL emitido.
- Catch-all Email Routing: Drop. 3 reglas: `hola@` + `privacidad@` + `noreply@` → `david17891@gmail.com`.

### Email pipeline (sesión 2026-07-02)

- **Brevo Free** (300 emails/día): cuenta creada, dominio `qlick.digital` autenticado (Brevo code TXT + 2 DKIM CNAMEs + DMARC TXT). Remitente `Qlick <noreply@qlick.digital>` verificado.
- **API key en Vercel production**: `BREVO_API_KEY`, `BREVO_FROM_ADDRESS`, `BREVO_REPLY_TO`. Test real con `messageId: <...@smtp-relay.mailin.fr>` ✅.
- **Cloudflare Email Routing MX records** agregados manualmente (3 MX + 1 SPF). Routing de `privacidad@qlick.digital` confirmado con email externo ✅.

---

## 🔐 Env vars en Vercel (production + preview)

| Key | Tipo | Valor | Notas |
|---|---|---|---|
| `NEXT_PUBLIC_APP_URL` | plain | `https://qlick-three.vercel.app` | Corregido sesión 2026-07-02 |
| `NEXT_PUBLIC_SUPABASE_URL` | sensitive | (decrypted en bundle) | URL del proyecto `ugpejblymtbwtsoiykyj` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | sensitive | (decrypted en bundle) | Formato nuevo `sb_publishable_…` |
| `SUPABASE_SECRET_KEY` | sensitive | (server-only) | Service role para admin |
| `SUPABASE_PROJECT_REF` | sensitive | `ugpejblymtbwtsoiykyj` | Para CLI/MCP |
| `ADMIN_EMAIL_ALLOWLIST` | sensitive | `david17891@gmail.com` | Para admin server-rendered |
| `DEV_ADMIN_SECRET` | sensitive | (64-char hex) | Gating único del endpoint `/api/dev/login` |
| `WHATSAPP_WEBHOOK_SECRET` | sensitive | (set post-G-2) | Webhook hard-fail seguro en prod |
| `CRON_SECRET` | sensitive | (64-char hex) | Vercel Cron `Authorization: Bearer <secret>` |
| `BREVO_API_KEY` | sensitive | (set) | 300 emails/día |
| `BREVO_FROM_ADDRESS` | plain | `noreply@qlick.digital` | Dominio validado en Brevo |
| `BREVO_REPLY_TO` | plain | `david17891@gmail.com` | Reply-to del email |
| `WHATSAPP_CLOUD_ACCESS_TOKEN` | sensitive | (set) | Token permanente WABA nueva |
| `PHONE_NUMBER_ID` | sensitive | (set) | Phone sandbox `+52 16634306074` |
| `APP_ID` | sensitive | (set) | App Qlick_wb |
| `WABA_ID` | sensitive | (set) | WABA `2083618983565979` |

**Env vars que NO están seteadas** (y por eso funcionan en modo demo):
- `RESEND_API_KEY`, `RESEND_FROM_ADDRESS`, `RESEND_REPLY_TO` — emails usan Brevo
- `ADMIN_NOTIFICATION_EMAILS` — admin notifications no salen en prod

---

## ✅ Lo que funciona end-to-end (production)

### Core v0.8.0: Wizard WhatsApp (NUEVO en este release)

| Feature | Estado | Verificación |
|---|---|---|
| **Wizard Q1→Q2→Q3 (formato dinámico buttonId)** | ✅ | David completó flow completo el 2026-07-06 ~14:55. Verificado en logs de Vercel |
| **Wizard q_consent "Sí" → q_business** | ✅ | Nuevo intent `survey_q_consent_continue` funciona end-to-end |
| **Wizard q_business texto libre** | ✅ | David escribió "Impresión 3d" → thank-you persistido |
| **Wizard q_business Saltar** | ✅ | Mismo thank-you path, lead cierra sin texto |
| **Cierre sin mensaje duplicado** | ✅ | Solo thank-you, follow-up bucket removido |
| **Promotion engine + scoring** | ✅ | Score 55 (David) → bucket HOT aplicado |
| **consent_to_contact derivado de q_consent** | ✅ | `responses.q_consent="yes"` → `consentToContact=true` |

### Admin panel `/admin/eventos/[id]` (MEJORADO en este release)

| Feature | Estado | Verificación |
|---|---|---|
| **Tab Encuestas con formato dinámico** | ✅ | Labels legibles, q_consent: "Sí/No", formato dinámico soportado |
| **Tab Leads promovidos con badges** | ✅ | Score, calificación (HOT/WARM/MQL/COLD), ✓ Consent renderizados |
| **Pipeline view con badges** | ✅ | `PipelineCard` acepta props score/qualification |
| **Admin Resumen** | ✅ | Métricas globales reales (de Supabase) |
| **Admin Eventos** | ✅ | Lista eventos (de Supabase) |
| **Admin Masterclasses** | ✅ | Lista masterclasses (de Supabase) |
| **Admin Handoffs** | ✅ | Server Component con `requireAdmin()` + tabla paginada + filtros URL-driven |
| **Admin System/audit-log** | ✅ | Tabla paginada con filtros URL + búsqueda libre `q` |
| **Import .xlsx** | ✅ | Wizard en `/admin/eventos/[id]/import` |

### Core pre-v0.8.0 (sin cambios)

| Feature | Estado | Verificación |
|---|---|---|
| **Home pública `/`** | ✅ | Render OK |
| **Catálogo cursos `/cursos`** | ✅ | Lista 4 cursos (mock + DB real) |
| **Detail curso `/cursos/[slug]`** | ✅ | Renderiza con LMS real |
| **Eventos públicos `/eventos`** | ✅ | 3 eventos demo en mock |
| **Detail evento `/eventos/[slug]`** | ✅ | Renderiza con meta + form de registro |
| **Login alumno OAuth Google** | ✅ | callback-student → `/dashboard` |
| **Login alumno magic link** | ✅ | Mismo callback, sin redirect a Google |
| **Admin login (magic link)** | ✅ | `/admin/login` → `/admin` (requiere email en allowlist) |
| **WhatsApp status tracking** | ✅ | Dropdown en drawer del lead → server action `markWhatsAppStatus` |
| **WhatsApp Cloud API inbound** | ✅ | Webhook entrega a `/api/whatsapp/webhook` confirmado múltiples veces |
| **WhatsApp Cloud API outbound** | ✅ | Texto libre funciona (templates Meta pendientes — ver pendientes) |
| **Persistencia conversaciones** | ✅ | `findLeadByPhone` optimizado + `persistConversation` idempotente |

---

## ⚠️ Lo que funciona pero es DEMO (no real)

Ver `docs/CRM_MODE_STATUS.md` para detalle. Resumen:

| Sección CRM | Estado | Por qué |
| --- | --- | --- |
| **Conversaciones** | 🟡 Demo | Lee `src/lib/data/crm-data.ts`. Mensajes ficticios. |
| **Calendario / Citas** | 🟡 Demo | Lee mock. No hay Google Calendar integration. |
| **Agente IA** | 🟢 Real (con switch) | DeepSeek V4-Flash + V4-Pro con escalado automático |
| **Sales Owners** | 🟡 Demo | Asignación a leads es ficticia. |
| **Broadcast WhatsApp** | 🟡 Demo | Genera lista de links `wa.me` pre-armados. |

---

## 🗄️ Database (Supabase `ugpejblymtbwtsoiykyj`)

24 tablas en `public`. Schema sincronizado con el repo via `db push`.

Tablas relevantes a v0.8.0:
- `event_surveys` — respuestas del wizard, formato JSONB con keys dinámicas (`q1_clarity`, `q_consent`, `q_business`, etc.)
- `leads` — score, qualification, consent_to_contact, last_contacted_at
- `lead_event_links` — UNIQUE(link_type, link_id), INSERT-only (cierra H2 QA Fase 2)
- `lead_whatsapp_conversations` — log inbound/outbound del bot
- `lead_whatsapp_log` — status updates + auditoría
- `event_qr_tokens` — pases digitales con QR
- `event_reminder_log` — UNIQUE(event_qr_token_id, reminder_kind), idempotente
- `lead_consent_log` — auditoría de consent (LGPD compliance)

Detalle completo en `docs/DB_AUDIT_2026-06-30.md` + migrations en `supabase/migrations/`.

---

## 📱 WhatsApp Cloud API — Estado actual (v0.8.0)

**Inbound (WhatsApp → Qlick):** ✅ **FUNCIONA END-TO-END**
- Webhook entrega a `/api/whatsapp/webhook` confirmado múltiples veces.
- Bot engine procesa 5+ mensajes de David + wizard completo 2026-07-06.
- Signature verification activa (`WHATSAPP_WEBHOOK_SECRET`).
- AbortController 8s timeout a Meta Cloud API inbound.

**Outbound (Qlick → WhatsApp):** ✅ **FUNCIONA** (texto libre + Wizard close)
- Las 4 vars (`WHATSAPP_CLOUD_ACCESS_TOKEN`, `PHONE_NUMBER_ID`, `APP_ID`, `WABA_ID`) operativas en Vercel production.
- Provider `meta_cloud_api` activo.
- Bot responde con texto libre Y con thank-you estándar del wizard.
- Wizard close: 1 solo mensaje (thank-you), follow-up bucket removido.

**WABA operativa para evento del 10 jul:**
- **WABA:** "Qlick Marketing Digital" (ID `2083618983565979`)
- **Phone:** `+52 16634306074` (chip Telcel eSIM Amigo)
- **Display name:** "Qlick" (aprobado por Meta)
- **Token permanente** generado y subido a Vercel.

---

## 🐛 Issues activos (post-v0.8.0)

### Conocidos (no bloquean release)

- **I-2:** CRM híbrido (algunas pestañas real, otras mock) — banner por sección pendiente.
  **Scope: Fase 7+** (necesita migrar Conversations/Calendario a Supabase real).
- **I-4:** Re-prompting de auth al cambiar de método (OAuth → magic link → loop).
  **Scope: 1 hora fix puntual.**
- **G-5:** Meta templates (`conf_bienvenida`, `conf_info_evento`, `conf_confirmacion_registro`)
  — necesarias para outreach proactivo. **Tiempo Meta: 24-48h aprobación. David las pide.**
- **G-12:** `findLeadByPhone` timeouts intermitentes (5s). Commit `79b32b0` aplica 3s timeout + 1 retry.
- **G-17:** app fantasma Meta `2202427980234937` — probablemente requiere soporte Meta.

Detalle completo en `docs/OPEN_ITEMS.md`.

---

## 🧪 Cómo verificar (para próxima sesión)

```bash
# 1. Tests verde
npm run type-check && npm run lint && npm test && npm run build
# → 535/535 ✓, lint ✓, type-check ✓, build ✓

# 2. Wizard end-to-end vía WhatsApp Cloud API
# Login admin con david17891@gmail.com → /admin/eventos/[id]
# → Verificar tab Encuestas muestra respuestas con labels
# → Verificar tab Leads promovidos muestra badges (score/HOT/COLD/Consent)

# 3. Copy MX verificado
grep -rE "querés|tenés|podés|escribinos|contanos|por acá|Disculpá" src/lib src/app src/components
# → Debe devolver 0 hits en user copy (solo comments defensivos)

# 4. Rollback a v0.8.0 (si algo se rompe)
git checkout v0.8.0
```

---

## 🎟️ Releases previos

| Tag | Descripción | Fecha |
| --- | --- | --- |
| `v0.8.0` | **ESTE RELEASE** — Wizard WhatsApp funcional + Español MX | 2026-07-06 |
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

- `docs/HANDOFF_v0.8.0_FUNCIONAL.md` — **handoff completo de este release** ← leer primero
- `docs/ROADMAP.md` — fases, decisiones, prioridades
- `docs/OPEN_ITEMS.md` — deuda técnica append-only con severidades
- `CHANGELOG.md` — release notes consolidadas (Keep a Changelog en español)
- `data/PROJECT-LOG.md` — registro append-only de cambios puntuales (deploys, env vars, fixes urgentes)
- `docs/CRM_MODE_STATUS.md` — qué parte del CRM es real vs demo
- `docs/EVENTS_ADMIN_GUIDE.md` — manual operativo del panel admin de eventos
- `docs/VERCEL_ENV_SETUP.md` — setup de env vars en Vercel
- `docs/SUPABASE_CONNECTION_BOOTSTRAP.md` — setup inicial de Supabase
- `docs/GITHUB_WORKFLOW.md` — convenciones de branch + commit + PR