# Project Status — Snapshot vivo

> **Propósito:** Single source of truth "dónde estamos AHORA". A diferencia de
> `ROADMAP.md` (planes) y `OPEN_ITEMS.md` (deuda histórica), este doc captura
> el estado actual de producción en un momento dado.
>
> **Cuándo actualizarlo:** después de cada deploy, cambio de env var, fix
> crítico, o descubrimiento que invalida lo escrito. NO es append-only —
> se sobreescribe con el nuevo snapshot.
>
> **Última actualización:** 2026-07-01 ~02:20 (Bot WhatsApp END-TO-END con persistencia real. Lead resolution funciona (David encontrado en DB). 5 mensajes probados: greeting→register→provide_email→question. Contexto entre mensajes NO funciona todavía (loadConversationWindow no carga ventana). 4 issues restantes + cleanup debug.)

---

## 🌐 Deploy activo

| Campo | Valor |
|---|---|
| **Dominio** | `https://qlick-three.vercel.app` |
| **Production deploy ID** | `dpl_qo40c17el…` |
| **Production URL (auto)** | `qlick-qo40c17el-david17891-9351s-projects.vercel.app` |
| **Branch** | `feat/fase-6-hitos` |
| **Commit** | `43320d2` (HEAD — docs(github-auth): setup persistente + reference doc) |
| **Commits ahead of origin** | 0 (los 12 commits de la sesión 30-jun ya están pusheados) |
| **Mensaje actual** | `chore: untrack tmp scripts from feat/fase-6-hitos` |
| **Build status** | ✅ READY + PROMOTED + aliasAssigned |
| **Build duration** | ~51s (con cache del deploy anterior) |

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