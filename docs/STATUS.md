# Project Status — Snapshot vivo

> **Propósito:** Single source of truth "dónde estamos AHORA". A diferencia de
> `ROADMAP.md` (planes) y `OPEN_ITEMS.md` (deuda histórica), este doc captura
> el estado actual de producción en un momento dado.
>
> **Cuándo actualizarlo:** después de cada deploy, cambio de env var, fix
> crítico, o descubrimiento que invalida lo escrito. NO es append-only —
> se sobreescribe con el nuevo snapshot.
>
> **Última actualización:** 2026-07-04 ~15:20 (Sesión auditoría nocturna + 3 fixes (rate limit, tests gates, webhook refactor). 292/292 tests ✅, type-check ✅, lint ✅, build ✅. WABA "Qlick Marketing Digital" operativa con número MX real. Evento 10 jul.)

---

## 🌐 Deploy activo

| Campo | Valor |
|---|---|
| **Dominio** | `https://www.qlick.digital` (apex redirect www→apex en Vercel) |
| **Dominio Vercel (auto)** | `qlick-three.vercel.app` (legacy, sigue activo) |
| **Production deploy ID** | (más reciente de los fixes 2026-07-04) |
| **Production URL (auto)** | `qlick-three.vercel.app` |
| **Branch** | `main` |
| **Commit HEAD** | `14f9c7c` (revert del cron hard-fail, 13 commits de fixes nocturnos previos mergeados) |
| **Commits ahead of origin** | (depende del último push de David) |
| **Mensaje actual** | `Revert "fix(security): cron endpoints hard-fail when CRON_SECRET missing in prod"` |
| **Build status** | ✅ READY + PROMOTED + aliasAssigned |
| **Build duration** | ~50s (con cache del deploy anterior) |

### Dominio `qlick.digital` (sesión 2026-07-02)

- Comprado en Hostinger, 1 año, $3.50 USD. **Renovación $55/yr — considerar migrar a Cloudflare Registrar en 2027-06** (ahorro ~$25/yr).
- DNS delegado a Cloudflare (michael + monroe). Proxy OFF (DNS only) para que Vercel pueda emitir cert SSL.
- Vercel: `qlick.digital` + `www.qlick.digital` → Valid Configuration. Cert SSL emitido.
- Catch-all Email Routing: Drop. 3 reglas: `hola@` + `privacidad@` + `noreply@` → `david17891@gmail.com`.

### Email pipeline (sesión 2026-07-02)

- **Brevo Free** (300 emails/día): cuenta creada, dominio `qlick.digital` autenticado (Brevo code TXT + 2 DKIM CNAMEs + DMARC TXT). Remitente `Qlick <noreply@qlick.digital>` verificado.
- **API key en Vercel production**: `BREVO_API_KEY`, `BREVO_FROM_ADDRESS`, `BREVO_REPLY_TO`. Test real con `messageId: <...@smtp-relay.mailin.fr>` ✅.
- **Cloudflare Email Routing MX records** agregados manualmente (3 MX + 1 SPF). Routing de `privacidad@qlick.digital` confirmado con email externo ✅.

### Deploys de producción (limpieza ✅ 2026-06-29 ~02:55)

Eran 13 deploys `READY + target=production` acumulados del 06-23 al 06-29 (mezcla
de bugs viejos + redeploys). Limpiados vía `DELETE /v13/deployments/{id}`:
12 borrados, queda **solo el actual** que sirve el dominio.

---

## 🔐 Env vars en Vercel (production + preview)

| Key | Tipo | Valor | Notas |
|---|---|---|---|
| `NEXT_PUBLIC_APP_URL` | plain | `https://qlick-three.vercel.app` | Corregido esta sesión (estaba vacío → fallback localhost) |
| `NEXT_PUBLIC_SUPABASE_URL` | sensitive | (decrypted en bundle) | URL del proyecto `ugpejblymtbwtsoiykyj` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | sensitive | (decrypted en bundle) | Formato nuevo `sb_publishable_…` |
| `SUPABASE_SECRET_KEY` | sensitive | (server-only) | Service role para admin |
| `SUPABASE_PROJECT_REF` | sensitive | `ugpejblymtbwtsoiykyj` | Para CLI/MCP |
| `ADMIN_EMAIL_ALLOWLIST` | sensitive | `david17891@gmail.com` | **Agregado esta sesión** — antes vacío, por eso 404s en admin server-rendered |
| `DEV_ADMIN_SECRET` | sensitive | (64-char hex) | **Agregado esta sesión** — gating único del endpoint `/api/dev/login` que ahora funciona en production para Mavis testing |

**Env vars que NO están seteadas** (y por eso funcionan en modo demo):
- `RESEND_API_KEY`, `RESEND_FROM_ADDRESS`, `RESEND_REPLY_TO`, `ADMIN_NOTIFICATION_EMAILS` — emails no salen en prod (smoke test en dev con sandbox `onboarding@resend.dev` solo llega al owner)

---

## ✅ Lo que funciona end-to-end (production)

| Feature | Estado | Verificación |
|---|---|---|
| **Home pública `/`** | ✅ | Render OK |
| **Catálogo cursos `/cursos`** | ✅ | Lista 4 cursos (mock + DB real) |
| **Detail curso `/cursos/[slug]`** | ✅ | Renderiza con LMS real |
| **Eventos públicos `/eventos`** | ✅ | 3 eventos demo en mock |
| **Detail evento `/eventos/[slug]`** | ✅ | Renderiza con meta + form de registro |
| **Login alumno OAuth Google** | ✅ | `qlick-three.vercel.app/login` → consent → callback-student → `/dashboard` |
| **Login alumno magic link** | ✅ | Mismo callback, sin redirect a Google |
| **Admin login (magic link)** | ✅ | `qlick-three.vercel.app/admin/login` → `/admin` (requiere email en allowlist) |
| **Admin login (Google OAuth)** | ✅ TEMPORAL | Mismo `/admin/login` → click "Continuar con Google" → consent → `/admin`. Callback `/auth/callback` valida allowlist (mismo que magic link). Solo funciona para `david17891@gmail.com` por ahora. **Para retirar:** eliminar `AdminGoogleLoginButton.tsx` + el bloque que lo usa en `admin/login/page.tsx` (commit `b8ab547`). |
| **Admin Resumen** | ✅ | Métricas globales reales (de Supabase) |
| **Admin Eventos** | ✅ | Lista eventos (de Supabase) |
| **Admin Masterclasses** | ✅ | Lista masterclasses (de Supabase) |
| **Admin System/audit-log** | ✅ | Tabla paginada con filtros URL + búsqueda libre `q` |
| **Import .xlsx** | ✅ | Wizard en `/admin/eventos/[id]/import` — sube, parsea con SheetJS, importa a Supabase |
| **WhatsApp status tracking** | ✅ | Dropdown en drawer del lead → server action `markWhatsAppStatus` → `lead_whatsapp_log` |

---

## ⚠️ Lo que funciona pero es DEMO (no real)

Ver `docs/CRM_MODE_STATUS.md` para detalle. Resumen:

| Sección CRM | Estado | Por qué |
|---|---|---|
| **Conversaciones** | 🟡 Demo | Lee `src/lib/data/crm-data.ts`. Mensajes ficticios. No hay WhatsApp Business API. |
| **Calendario / Citas** | 🟡 Demo | Lee mock. No hay Google Calendar integration. |
| **Agente IA** | 🟢 Real (con switch) | **DeepSeek V4-Flash + V4-Pro con escalado automatico (commit `1d5131f`, rama `feat/fase-6-llm-switch`).** Default Flash; escala a Pro si Flash responde baja conf o falla. |
| **WhatsApp providers** | 🟡 Parcial | `manual_wa` activo (click-to-chat real), `meta_cloud_api` + `bsp` son stubs. |
| **Sales Owners** | 🟡 Demo | Asignación a leads es ficticia. |
| **Broadcast WhatsApp** | 🟡 Demo | Genera lista de links `wa.me` pre-armados. Admin abre cada uno manual. NO envía automáticamente. |

---

## 🗄️ Database (Supabase `ugpejblymtbwtsoiykyj`)

**Estado actual (audit 2026-06-30 12:23):** 24 tablas en `public`. Schema sincronizado con el repo via `db push`.

- 21 tablas pre-existentes del conjunto Fase 1-5 (events, leads, payments, masterclasses, etc.).
- 3 tablas aplicadas en esta sesion via `repair --status reverted` + `db push`:
  `event_qr_tokens`, `lead_whatsapp_conversations`, `lead_consent_log`
  (todas con RLS=true, default-deny, solo service role).

**Pendientes de verificar en proximas sesiones** (marcadas `applied` en ledger
pero su efecto real puede no estar — falta auditar una por una):
- `lead_whatsapp_log` y columnas `leads.whatsapp_status`,
  `leads.last_contacted_at`, `leads.phone_normalized`.
- Constraint `lead_event_links_unique(link_type, link_id)`.

Detalle completo en `docs/DB_AUDIT_2026-06-30.md`.

---

## 🧠 LLM Switch (Qlick Fase 2 · 2026-06-30)

Implementado en `src/lib/ai/deepseek-provider.ts`:

- **Flash** (`deepseek-chat`) — default para todas las tareas.
- **Pro** (`deepseek-reasoner`) — se activa en 2 casos:
  1. Tarea es `suggest_reply` (outbound sensible).
  2. Flash responde `ok=false` o `confidence < DEEPSEEK_ESCALATE_THRESHOLD`.

**Env vars (todas con defaults razonables):**
- `DEEPSEEK_MODEL_FLASH` — default `deepseek-chat`.
- `DEEPSEEK_MODEL_PRO` — default `deepseek-reasoner`.
- `DEEPSEEK_ESCALATE_THRESHOLD` — default `0.7`.

**Fallback final:** si Flash Y Pro fallan, devuelve mensaje generico
("Disculpa, tengo un problema tecnico...") con `needsReview=true`. El bot
engine sigue mostrando al admin antes de enviar al lead.

**Tests:** 151/151 (140 baseline + 11 nuevos del switch).

---

## 📱 WhatsApp Cloud API — Estado actual (2026-07-01 ~02:20)

**Inbound (WhatsApp → Qlick):** ✅ **FUNCIONA END-TO-END**
- Webhook entrega a `/api/whatsapp/webhook` confirmado múltiples veces.
- Bot engine procesa 5+ mensajes de David (greeting, register, provide_email, question).
- Handler skip firma porque `WHATSAPP_WEBHOOK_SECRET` removido (workaround no prod-safe).

**Outbound (Qlick → WhatsApp):** ✅ **FUNCIONA** (texto libre)
- Las 4 vars (`WHATSAPP_CLOUD_ACCESS_TOKEN`, `PHONE_NUMBER_ID`, `APP_ID`, `WABA_ID`) operativas en Vercel production.
- Provider `meta_cloud_api` activo (validado en log: `metaConfigured: true, hasToken: true`).
- Bot responde con texto libre (templates no creados aún en Meta).
- 5 mensajes probados: David → "Hola" → Bot responde bienvenida → David → "Si" → Bot info evento → David → email → Bot registra email + QR → David → "Costo?" → Bot LLM responde.

**Persistencia real:** ✅ **FUNCIONA**
- `findLeadByPhone` query optimizada usa `phone_normalized` (índice UNIQUE) → resuelve lead real en <100ms (a veces 5s timeout intermitente).
- `createLeadFromWhatsApp` crea lead real con UUID (sin `whatsapp_status` para evitar PGRST204).
- `buildResponsePlan` usa `phoneNormalized` directo (no `lead.phone` que podía venir undefined).
- Confirmado en logs: `findLeadByPhone result { found: true, timedOut: false }` → `lead.phone: '+526532935492'`.

**Contexto entre mensajes:** ⚠️ **NO FUNCIONA**
- `loadConversationWindow` debería cargar últimos 8 mensajes pero no se observa uso.
- LLM responde igual a "Costo?" y "El costo" (sin contexto previo).
- Bot repite "Hola Por, gracias por escribir..." en cada `question` intent.
- Issue: el system prompt del LLM probablemente fuerza saludo inicial.

**IDs críticos (para próximas sesiones):**
- WABA: `1670509767335938`
- App Qlick_wb: `1532987041600498`
- Phone sandbox: `+1 555 201 7643` (phone_number_id `1224238960768919`)
- David phone: `+52 165 329 3549`

**Pendientes Fase 7 (post 6 jul) — ACTUALIZADO:**
1. 🟠 **limpiar console.error de debug** agregados en `bot-engine.ts`, `meta-cloud-api-provider.ts`, `index.ts`, `leads-server.ts`, `webhook/route.ts` (cambiar a `console.log` con flag dev o eliminar).
2. 🟠 **restaurar `void processInboundSafely`** en handler webhook (actualmente `await Promise.race` con timeout 10s — funciona pero es hack).
3. 🟠 **arreglar `loadConversationWindow`** — verificar por qué no carga los mensajes previos. El LLM no usa contexto entre turnos.
4. 🟠 **ajustar system prompt del LLM** para que NO repita "Hola Por, gracias por escribir..." en cada mensaje (solo en primer mensaje).
5. 🟠 **crear 3 templates en Meta Business Manager** (`conf_bienvenida`, `conf_info_evento`, `conf_confirmacion_registro`) → re-habilitar outreach proactivo.
6. 🟠 **auditar schema tabla `leads`** — verificar si `whatsapp_status` y `last_contacted_at` existen (probable que falten, por eso hicimos defensive code).
7. 🟡 **re-setear `WHATSAPP_WEBHOOK_SECRET`** con valor sincronizado entre Vercel y Meta → re-habilita validación de firma.
8. 🟡 **borrar app fantasma `2202427980234937`** (probablemente requiere soporte Meta).
9. 🟡 **`findLeadByPhone` timeout intermitente** (5s) — a veces Supabase se pone lento. Considerar timeout menor + retry, o investigar por qué tarda tanto en algunos casos.
10. 🟡 **`persistConversation` falla con 23505 unique violation** — el row ya existe en DB de runs anteriores. Idempotencia funciona (bot sigue) pero el log es ruidoso.

Detalle completo del debug en `data/PROJECT-LOG.md` entrada del 2026-07-01.

---

## 🐛 Issues activos

### 🔴 I-1 — Email dual admin/student ✅ CERRADO 2026-06-29 (commit `81b0456`)

**Síntoma original:** `david17891@gmail.com` no podía entrar como student porque `isStudentEmail()` rechazaba emails en allowlist admin.

**Decisión:** permitir dualidad. Un mismo email puede actuar en ambos roles según la ruta (`/admin` o `/dashboard`). RLS en Supabase previene que un admin vea datos de otros alumnos — solo los suyos propios.

**Implementación:** `isStudentEmail()` ya no chequea admin status. Doc actualizada en `src/lib/auth/student-auth.ts` y `docs/HOW-TO-RUN.md`.

### 🔴 I-2 — CRM en modo híbrido (algunas pestañas real, otras mock)

**Síntoma:** el CRM tiene `realMode` que detecta si Supabase está configurado, pero la implementación es por-pestaña inconsistente: Leads/Pipeline/Resumen leen Supabase real, Conversaciones/Calendario/Agente IA/Sales Owners leen mock. El usuario no tiene forma de saber qué es real y qué es ficticio sin leer el código.

**Impacto:** confunde en demo a socios ("¿esto son mis datos?"). Ya documentado en `docs/CRM_MODE_STATUS.md` (2026-06-25) pero el UI no avisa explícitamente por sección.

**Fix propuesto:** banner por sección indicando "Real · Supabase" vs "Demo · datos ficticios", o migrar Conversations/Calendario/Agente IA a Supabase. **Scope: Fase 7+ (WhatsApp Business API / Google Calendar / OpenRouter).**

### 🟠 I-3 — Deploys viejos de producción acumulados ✅ CERRADO 2026-06-29

**Síntoma original:** 13 deploys `READY + target=production` en Vercel acumulados del 06-23 al 06-29.

**Fix aplicado:** 12 borrados vía `DELETE /v13/deployments/{id}`. Solo queda el actual (`dpl_BBwdygHPDVgL6PfbdMWCSCAqLGW8`). Verificado: `qlick-three.vercel.app/` y `/admin/masterclass` siguen devolviendo 200.

**Lección:** para próximos deploys, antes de promover uno nuevo a producción, considerar borrar el anterior si no es necesario como fallback. No hay riesgo de rollback inmediato porque siempre se puede re-deployar desde git.

### 🟠 I-4 — Re-prompting de auth al cambiar de método

**Síntoma:** cuando David se logueó con OAuth Google (cookie de admin creada), después intentó loguear con magic link como student, y el sistema le pidió re-verificación. El flujo fue: login student → callback → redirige a `/dashboard` → `requireStudent()` rechaza (es admin) → vuelve a `/login` → parece que pide re-verify pero en realidad es loop.

**Impacto:** UX confuso. El usuario no entiende por qué le pide "volver a entrar" cuando ya entró.

**Fix propuesto:** unificar el redirect post-auth para que si falla `requireStudent()` con `isAdminEmail()`, redirija a `/admin` en vez de `/login`. Mostrar un toast "Estás logueado como admin — entra al panel desde el navbar". **Scope: 1 hora, fix puntual.**

### 🟠 I-5 — Sesión alumno se pierde al navegar fuera de /dashboard ✅ CERRADO 2026-06-29 ~13:00

**Síntoma reportado (David):** login como alumno OK → /dashboard OK → navega a /cursos, /eventos, /acerca, /beneficios → OK. Click en "Mi panel" → redirect a /login. Navbar tampoco mostraba "Mi panel" después de un rato.

**Causa raíz real (3 iteraciones para encontrarla):**

1. **Iteración 1:** pensé que era middleware matcher incompleto. Apliqué fix `ae34e12` (extender matcher + propagar cookies a `req.cookies`). David reportó "mismo comportamiento, no mejoró nada".

2. **Iteración 2:** `commit 6082e5e` — encontré la causa real via Playwright network inspector: el DashboardView tenía `<Button href="/logout">` como link "Cerrar sesión". Next.js pre-carga el RSC de los links visibles (GET a `/logout`), y el handler ejecutaba `signOut()` server-side ANTES de que el usuario hiciera clic, borrando las cookies. Fix doble: cambiar link por botón con `onClick` que llama `signOut()` del browser client + endurecer `/logout` para que solo acepte POST.

3. **Iteración 3:** David reportó flash visual "Acceso alumnos" → "Mi panel" en navbar. Causa: Navbar era client component que renderizaba con identity vacío en SSR y `useEffect` actualizaba post-hidratación. Fix `7671843`: Navbar ahora es wrapper server (`NavbarServer.tsx`) que calcula la identidad SSR via `getCurrentStudent` / `getCurrentAdmin` y la pasa al Navbar client como `initialIdentity` prop. HTML servido ya tiene los botones correctos desde el primer byte.

**Verificado en producción:**
- Login → /dashboard → /cursos → /dashboard: cookies 2 throughout ✓
- `nav.innerText` después de navegar como authed: `"Cursos Eventos Acerca de Beneficios Preguntas Contacto Mi panel Salir"` ✓
- Network inspector muestra 0 referencias activas a `/logout` (solo comentarios que documentan el fix).

**Lección:** en @supabase/ssr con Next.js, hay 3 puntos que SIEMPRE hay que validar:
1. Middleware matcher cubre TODAS las rutas con `getUser()` server-side
2. NINGÚN `<a href>` o `<Button href>` apunta a endpoints con side effects (RSC prefetch los ejecuta)
3. Client components que muestran estado derivado de auth deben recibir `initialIdentity` desde SSR (no hidratar con default + useEffect)

---

## 🧪 Cómo verificar (para próxima sesión)

```bash
# 1. Deploy correcto
curl -sI https://qlick-three.vercel.app/ | head -5
# → Debe devolver 200 con cache headers de Vercel

# 2. Env vars pobladas
curl -s https://qlick-three.vercel.app/robots.txt | grep -i sitemap
# → Debe mostrar https://qlick-three.vercel.app/sitemap.xml (env var horneada)

# 3. Supabase conectada
# Login con Google → callback → /dashboard sin loop
# (antes del fix: loop infinito; ahora: dashboard real)

# 4. Admin sin 404
# Login admin con david17891@gmail.com → /admin/masterclass → renderiza
# (antes del fix: 404 soft por ADMIN_EMAIL_ALLOWLIST vacío)

# 5. Sesión alumno persistente (post-fix I-5)
$secret = (Get-Content .env.local | Select-String "DEV_ADMIN_SECRET" | ForEach-Object { ($_ -split "=", 2)[1] })
$login = Invoke-WebRequest -Uri "https://qlick-three.vercel.app/api/dev/login" -Method POST -ContentType "application/json" -Body (@{ email = "david17891@gmail.com"; secret = $secret } | ConvertTo-Json) -UseBasicParsing -SessionVariable sv
Invoke-WebRequest -Uri "https://qlick-three.vercel.app/dashboard" -UseBasicParsing -MaximumRedirection 0 -WebSession $sv
# → Debe devolver 200 (no 307 a /login)
```

---

## 🎟️ Fase 7a — Pase digital + funnel promotion + cron reminders (2026-07-01 ~17:45)

Cierra el ciclo de vida del lead en el evento: registrar → recibe pase → reminders → asiste → funnel promotion.

### 1. Pase digital por correo (Bloque 1)
- Cuando el bot detecta email (intent `provide_email`):
  1. Inserta QR token en `event_qr_tokens` (igual que antes).
  2. Genera QR visual (PNG 512px, data URL) con `generateQrDataUrl`.
  3. Manda email con QR embebido + CTA "Ver mi pase online" al correo del asistente.
  4. **Best-effort:** si el email falla, el link por WhatsApp sigue funcionando.
- Template: `src/lib/email/templates/event-qr-pass.ts` (HTML inline brand-aligned).
- Helper: `src/lib/email/event-qr-pass.ts` (`sendEventQrPassEmail`).

### 2. Funnel promotion al check-in (Bloque 2)
- Migración SQL: `20260701170000_lead_event_attended_status.sql` agrega el valor
  `event_attended` al enum `lead_status`.
- POST `/api/check-in/[token]` después de marcar check-in en `event_qr_tokens` +
  `event_attendees`:
  - Busca el lead por `phone_normalized`.
  - Si existe y no estaba en `event_attended` ni en `lost`/`archived` →
    `UPDATE leads SET status='event_attended', tags=[..., 'event:<slug>:attended']`.
  - Si no existe (walk-in) → loggeo + sigue, NO falla.
- El cambio cierra el gap que David mencionó el 2026-07-01: "el check-in cambia de etapa en el funnel".
- Tipos actualizados: `LeadStatus` en `types/crm.ts` + `types/supabase.ts` (union + array).
- Etiquetas legibles: "Asistió al evento" (tone `success`) en `src/lib/crm/lead-utils.ts`.

### 3. Cron reminders 24h + 2h antes (Bloque 3)
- `vercel.json` con `*/30 * * * *` → `GET /api/cron/event-reminders`.
- `src/lib/cron/event-reminders.ts` (`runEventRemindersJob`):
  - Calcula ventanas 24h±30min y 2h±30min desde "ahora".
  - Busca eventos `published` cuyo `starts_at` cae en la ventana.
  - Para cada uno, busca tokens QR sin reminder previo (idempotente vía
    `event_reminder_log` UNIQUE en `(event_qr_token_id, reminder_kind)`).
  - Manda email recordatorio (best-effort) con `sendEventReminderEmail`.
- Tabla nueva: `event_reminder_log` (`20260701180000_event_reminder_log.sql`).
  RLS=on (sin policies → solo service role).
- Templates: `event-reminder.ts` (24h "Mañana: X", 2h "En 2 horas: X").

### Env vars requeridas (en Vercel production)

**⚠️ Documento legacy:** esta sección menciona Resend, pero el pipeline de email
fue migrado a Brevo el 2026-07-02 (commit `7b0e271`). Las env vars activas son:

| Key | Tipo | Default | Notas |
|---|---|---|---|
| `BREVO_API_KEY` | sensitive | (vacío) | Si vacío en prod, email NO se envía. **Seteada**. |
| `BREVO_FROM_ADDRESS` | plain | `noreply@qlick.digital` | Dominio `qlick.digital` validado en Brevo (TXT + 2 DKIM CNAMEs + DMARC). **Seteada**. |
| `BREVO_REPLY_TO` | plain | `david17891@gmail.com` | Reply-to del email. **Seteada**. |
| `CRON_SECRET` | sensitive | (vacío) | Si seteado, Vercel Cron manda `Authorization: Bearer <secret>`. Si vacío, abierto (dev). **Seteada (post-recovery 14f9c7c)**. |

(Variables RESEND_* deprecadas — mantenidas solo por compatibilidad con migrations SQL antiguas.)

### Limitación documentada

**WhatsApp automatizado (templates de Meta)** NO está implementado. Para que
los reminders también lleguen por WhatsApp, se necesitan templates aprobadas
en Meta Business Manager (`event_reminder_24h`, `event_reminder_2h`) — proceso
de 24-48h. Para el 6 de julio, los reminders salen solo por email (que ya
funciona). Migración a WhatsApp queda para Fase 7+.

### Validación

- `npm run type-check` → ✅ 0 errores
- `npm run lint` → ✅ 0 warnings/errors
- `npm test` → ✅ 292/292 (eran 246, +46 nuevos del bloque de auditoría 2026-07-04: 9 cron-auth + 13 webhook-auth + 24 rate-limit)
- `npm run build` → ✅ Compila, ruta `/api/cron/event-reminders` registrada

### Pendiente David (pre-deploy)

1. Correr migración SQL en Supabase (los 2 archivos `.sql` aplican con `db push`).
2. Verificar que `RESEND_API_KEY` y `RESEND_FROM_ADDRESS` estén en Vercel production env.
3. Push del branch `feat/fase-6-waba-setup` (o cherry-pick a `feat/fase-7-*`).
4. (Opcional) Setea `CRON_SECRET` y configúralo en Vercel Cron para auth.

Detalle completo en `docs/HANDOFF_v0.7.1_FASE_7A_REMINDERS.md`.

---

## 📚 Docs de referencia

- `ROADMAP.md` — fases, decisiones, prioridades
- `OPEN_ITEMS.md` — deuda técnica append-only con severidades
- `CHANGELOG.md` — release notes consolidadas (Keep a Changelog en español)
- `data/PROJECT-LOG.md` — registro append-only de cambios puntuales (deploys, env vars, fixes urgentes)
- `docs/CRM_MODE_STATUS.md` — qué parte del CRM es real vs demo (2026-06-25)
- `docs/FASE-6-AUDIT.md` — auditoría de Fase 6 (score 9/10)
- `docs/EVENTS_ADMIN_GUIDE.md` — manual operativo del panel admin de eventos
- `docs/VERCEL_ENV_SETUP.md` — setup de env vars en Vercel
- `docs/SUPABASE_CONNECTION_BOOTSTRAP.md` — setup inicial de Supabase

---

## 🔒 Auditoría nocturna 2026-07-04 (~05:00 → ~15:20)

**Sesión:** David + Mavis. **Método:** revisión de endpoints públicos + búsqueda del patrón `if (envVar)` + fix del gate del cron (regression 14f9c7c) + 3 fixes de auditoría.

### Env vars en Vercel production (verificadas 2026-07-04 ~05:30)

| Key | Estado | Notas |
|---|---|---|
| `WHATSAPP_WEBHOOK_SECRET` | ✅ **SET** | Generado y subido por David (post-G-2). Webhook hard-fail seguro. |
| `CRON_SECRET` | ✅ **SET** | Generado por David (recovery post-721279d). 64-char hex. Push del revert (14f9c7c) cachea el env var. |
| `RESEND_*` | ❌ No seteado | Email usa Brevo (ver §"Email pipeline" arriba). |

### WABA operativa para evento del 10 jul

- **WABA:** "Qlick Marketing Digital" (ID `2083618983565979`)
- **Phone:** `+52 16634306074` (chip Telcel eSIM Amigo)
- **Display name:** "Qlick" (aprobado por Meta, requiere página Facebook "Qlick Marketing Digital" conectada al perfil)
- **Token permanente** generado y subido a Vercel (reemplaza el temporal de 24h).
- **Sandbox WABA (`1670509767335938`)** queda en desuso — el código apunta solo a la WABA nueva vía env vars.

### Fusión de fixes nocturnos (13 commits antes del revert)

- `95c7b64` — middleware headers (HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy)
- `d757b0b` — outbound idempotency (skip bot en duplicate webhook)
- `1d56fc7` — sin phone en errorLogs (PII compliance)
- `11e8109` — message_type enum compliance
- `78a5ad8` — per-phone rate limit (5 calls / 60s) para DeepSeek
- `4d24e0e` — idempotent persistStatusUpdatesIfAny
- `58dd460` — type error extend sendResult
- `32da323` — phantom-row fix a inline flows
- `548acb7` — skip outbound cuando Meta send falla
- `6fe6654` — 8s AbortController timeout a Meta Cloud API
- `74f6c1e` — persistConversation idempotent en webhook retries
- `85211e6` — **webhook hard-fail en prod si WHATSAPP_WEBHOOK_SECRET missing** ✅ activo
- `721279d` — **cron hard-fail** ⚠️ **REVERTIDO** (`14f9c7c`) por regresión en prod (crons caídos porque CRON_SECRET nunca estuvo seteado)

### Fixes de auditoría 2026-07-04 ~15:00 (bloque actual)

1. **Rate limit per-IP en `/api/submit-survey`** (commit pendiente):
   - Nuevo módulo `src/lib/api/rate-limit.ts` (sliding window 5/60s + `getClientIp` que prioriza `x-forwarded-for`, fallback `x-real-ip`, default `unknown`).
   - Aplicado al endpoint público. Devuelve 429 con `Retry-After` header.

2. **Tests de los gates** (commit pendiente):
   - `tests/cron-auth.test.mjs` (9 tests): cubre Bearer correcto/incorrecto/case-sensitivity/whitespace, CRON_SECRET vacío en dev = pasa.
   - `tests/whatsapp-webhook-auth.test.mjs` (13 tests): cubre HMAC válido/inválido/hex inválido/longitud distinta, gate prod-sin-secret 503, dev-sin-secret skip, secret-set+firma 401.
   - `tests/api-rate-limit.test.mjs` (17 tests): cubre 5 allowed/6to rejected, keys independientes, window custom, defaults, cleanup, getClientIp con xff/xri/sin headers.

3. **Refactor del webhook route** (commit pendiente):
   - Extraído `verifySignature` + el gate completo a `src/lib/whatsapp/webhooks/verify-signature.ts`.
   - Webhook route ahora solo llama `checkWebhookSignatureGate(req, rawBody)` y traduce el resultado a `NextResponse`. Reducción de ~25 líneas en el route.
   - Mismo patrón aplicado a los 2 cron endpoints (`/api/cron/cleanup-qr-tokens`, `/api/cron/event-reminders`) → extraído a `src/lib/api/cron-auth.ts`.

### Pendientes David (post-bloque)

- Push de los 3 commits del bloque de auditoría (~5 commits esperados: 2 nuevos módulos, 3 refactors + tests, 1 rate limit aplicado + commit de tests).
- Verificar en producción post-deploy:
  - `curl -X POST https://qlick-three.vercel.app/api/cron/event-reminders` → debe devolver 401 sin Bearer, 200 con Bearer de CRON_SECRET.
  - `curl -X POST https://qlick-three.vercel.app/api/whatsapp/webhook -H "x-hub-signature-256: sha256=invalid"` → 401.
  - 6 submits seguidos desde misma IP a `/api/submit-survey` → el 6to 429.
- **Plantillas Meta (3 templates)** sigue siendo el único pendiente que no podemos trabajar directamente nosotros. Tiempo Meta: 24-48h aprobación. Recomendación: mandar ya.