# Project Status — Snapshot vivo

> **Propósito:** Single source of truth "dónde estamos AHORA". A diferencia de
> `ROADMAP.md` (planes) y `OPEN_ITEMS.md` (deuda histórica), este doc captura
> el estado actual de producción en un momento dado.
>
> **Cuándo actualizarlo:** después de cada deploy, cambio de env var, fix
> crítico, o descubrimiento que invalida lo escrito. NO es append-only —
> se sobreescribe con el nuevo snapshot.
>
> **Última actualización:** 2026-06-29 ~13:35 (post-fix navbar flash + sesión persistente).

---

## 🌐 Deploy activo

| Campo | Valor |
|---|---|
| **Dominio** | `https://qlick-three.vercel.app` |
| **Production deploy ID** | `dpl_qo40c17el…` |
| **Production URL (auto)** | `qlick-qo40c17el-david17891-9351s-projects.vercel.app` |
| **Branch** | `feat/fase-6-hitos` |
| **Commit** | `6826b41` (HEAD — chore untrack tmp scripts) |
| **Commit anterior** | `7671843` (fix(navbar): wrapper SSR + client components separados) |
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
| **Agente IA** | 🟡 Demo | Lee mock. Stubs de OpenRouter. |
| **WhatsApp providers** | 🟡 Parcial | `manual_wa` activo (click-to-chat real), `meta_cloud_api` + `bsp` son stubs. |
| **Sales Owners** | 🟡 Demo | Asignación a leads es ficticia. |
| **Broadcast WhatsApp** | 🟡 Demo | Genera lista de links `wa.me` pre-armados. Admin abre cada uno manual. NO envía automáticamente. |

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

**Causa raíz:** el middleware matcher cubría solo `/admin/*` y `/api/admin/*`. El patrón oficial de `@supabase/ssr` requiere que el middleware refresque el access_token JWT usando el refresh_token. Sin ese refresh, después de ~1h el JWT expiraba y `supabase.auth.getUser()` fallaba con `user=null` en el server component de /dashboard. La Navbar (browser client) tenía el mismo síntoma.

**Fix aplicado (commit `ae34e12`):** extender el matcher del middleware para incluir `/dashboard/:path*`, `/aprender/:path*`, `/pagar/:path*`. La función `middleware()` ahora tiene dos ramas explícitas:
- **Rama admin** (`/admin/*`, `/api/admin/*`): valida allowlist como antes.
- **Rama student** (`/dashboard`, `/aprender/*`, `/pagar/*`): solo refresca sesión, NO bloquea. La decisión de redirect la sigue tomando el server component (`requireStudent()` + RLS).

**Verificado en producción:**
- `POST /api/dev/login` → 200 OK con 2 cookies `sb-*-auth-token.{0,1}` (expires Aug 2027).
- `GET /dashboard` con esas cookies → 200 OK (no 307 a /login).
- Build output: `ƒ Middleware  83.4 kB` confirma middleware compilado con matcher extendido.

**Lección:** en @supabase/ssr con Next.js, el middleware DEBE cubrir TODAS las rutas que llamen `getUser()` server-side. Asumir que solo las rutas admin necesitan matcher es un bug silencioso que se manifiesta ~1h después del login.

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