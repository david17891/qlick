# Handoff: v0.5.0 — Admin Auth + Real Leads Operations

> **Fecha:** 2025-06-25
> **Rama:** `feature/admin-auth-leads-operations`
> **Base:** `81505e5` (v0.4.1 merge)
> **Estado:** parcialmente commiteado — auth gate funcional, lead operations funcionales,
> **BLOQUEADO: login admin magic link no verificado en runtime**

---

## 1. Resumen ejecutivo

Se construyeron 4 capas de admin sobre la app existente:
1. **Auth gate** (Checkpoint 1) — middleware + allowlist + magic link ✅
2. **Real leads en CRM** (Checkpoint 2) — tablas + lectura real ✅
3. **Lead operations** (Checkpoint 3) — status, notas, tareas, audit log ✅
4. **Login verificado end-to-end** — ⛔ **NO VERIFICADO — bloqueado por bugs de PKCE**

Los commits 1-3 están limpios y validados (type-check, lint, smoke test 12/12 contra BD).
El login admin **nunca funcionó de punta a punta** por una cadena de bugs que se fueron
descubriendo uno tras otro. El último intento de fix no fue verificado.

---

## 2. Commits estables (en la rama)

| Commit | Desc | Contenido |
|-------|------|-----------|
| `8937a9c` | feat: add admin auth gate | middleware.ts, admin-auth.ts, session.ts, login page, callback route, server/admin clients |
| `16613ca` | feat: show real leads in admin CRM | leads-server (lectura), CRMView integration, AdminView |
| `3567d9e` | fix: preserve session cookies on admin magic-link callback | callback/route.ts — cookies se seteaban en NextResponse.next() descartado, no en el redirect devuelto |
| `68b63c9` | feat: add basic lead operations | migración 4 tablas + 3 enums, lib/crm (6 archivos), API routes (3 handlers), LeadDetailDrawer (real mode), types/supabase.ts |

---

## 3. Archivos sin commitear (working tree)

### 3a. Cambios de UX (legítimos, pendientes de commit una vez verificado el login)

| Archivo | Cambio |
|---------|--------|
| `src/app/actions/admin-auth.ts` | Agregó mensaje de rate-limit distinguible (`over_email_send_rate_limit`) |
| `src/app/admin/login/page.tsx` | Mensajes distintos para `?error=expired`, `?error=forbidden`, `?error=callback`; usa `requestMagicLinkClient` en vez del Server Action |
| `src/app/auth/callback/route.ts` | Detecta `error_code=otp_expired` de Supabase → redirige `?error=expired` |
| `src/lib/supabase/client.ts` | Quitó singleton cache del browser client (causaba stale state en dev hot reload) |

### 3b. Archivos nuevos (pendientes de commit)

| Archivo | Rol |
|---------|-----|
| `src/lib/auth/admin-auth-client.ts` | **CLAVE** — helper client-side para `signInWithOtp`. Lee vars con acceso literal `process.env.NEXT_PUBLIC_*` (requerido para que Next.js las inline en el bundle del cliente). Tiene `console.log` temporales de debug. |

### 3c. Scripts temporales (descartables, NUNCA commitear)

| Archivo | Rol |
|---------|-----|
| `scripts/generate-magic-link.mjs` | Genera magic links via Admin API (bypassea mailer/rate-limit). Útil para debug. |
| `scripts/kill-dev.ps1` | Mata listeners en puertos 3000/3001. |

---

## 4. El problema actual — por qué el login no funciona

### Cadena de bugs descubiertos (en orden cronológico)

| # | Bug | Estado |
|---|-----|--------|
| 1 | Callback seteaba cookies en `NextResponse.next()` descartado, no en el redirect devuelto → middleware rebotaba al login sin sesión | ✅ Fixeado y commiteado (`3567d9e`) |
| 2 | `signInWithOtp` estaba en Server Action (`admin-auth.ts`). PKCE genera un `code_verifier` que se persiste en cookie del server, no del navegador. El callback no lo encontraba → `exchangeCodeForSession` fallaba | ✅ Fixeado (no commiteado): movido a `admin-auth-client.ts` (client-side) |
| 3 | `createSupabaseBrowserClient()` usaba `supabaseConfig` que lee vars dinámicamente (`readEnv(key)`). En el navegador, `process.env` es `{}` (Next.js no puede inline acceso dinámico). El cliente lanzaba "Supabase no configurado" | ✅ Fixeado (no commiteado): `admin-auth-client.ts` lee con acceso literal |
| 4 | Singleton cache en `client.ts` — un primer render SSR fallido contaminaba llamadas posteriores | ✅ Fixeado (no commiteado): cache eliminado |
| 5 | **SÍNTOMA ACTUAL:** después de los fixes 2-4, la página de login se queda "cargando" al clicar "Enviar enlace mágico" — `signInWithOtp` se llama (hay logging temporal) pero nunca resuelve (ni éxito ni error) | ⛔ **SIN DIAGNÓSTICO FINAL** |

### Diagnóstico del bug #5 (estado actual)

El último síntoma reportado: la página de login no cambia — el botón dice "Enviando enlace..." y se queda ahí. El server no muestra errores. Hay `console.log` temporales en `admin-auth-client.ts` que deberían aparecer en la consola del navegador (F12 → Console), pero no se confirmó qué muestran.

**Lo que sabemos:**
- `createBrowserClient` ya no lanza (fix #3 aplicado)
- `signInWithOtp` se invoca (el loading state del formulario pasa a `true`)
- La promesa no resuelve (ni `.then` ni `.catch`)

**Hipótesis no descartadas:**
1. El `createBrowserClient` se crea OK pero el `fetch` interno a Supabase Auth cuelga (CORS, DNS, o algo del proveedor)
2. El `signInWithOtp` del browser client intenta usar `storage: cookie` que en ciertos contextos (SSR previo, cookies third-party) puede colgar
3. El hot reload de Next.js pudo dejar el módulo en estado inconsistente — un reinicio limpio del dev server podría resolverlo

**Lo que falta para diagnosticar:**
- Abrir la **consola del navegador** (F12 → Console) después de clicar el botón y reportar qué aparece (los `console.log` temporales)
- O: agregar un **timeout** alrededor del `signInWithOtp` para forzar un error visible

---

## 5. Arquitectura del auth admin

```
┌─────────────────────────────────────────────────────────┐
│ Navegador (Client Component)                             │
│                                                         │
│  /admin/login                                           │
│    ↓ clic "Enviar enlace"                               │
│  requestMagicLinkClient() ← admin-auth-client.ts        │
│    ↓ signInWithOtp (browser client, PKCE)              │
│    → Supabase envía email con magic link                │
│    → code_verifier se guarda en cookie del navegador    │
│                                                         │
│  /auth/callback?code=...                                │
│    ↓ exchangeCodeForSession(code)                        │
│    → Lee code_verifier de cookie (server-side)          │
│    → Setea cookies de sesión en el response            │
│    → Verifica allowlist                                 │
│    → Redirect a /admin o /admin/login?error=...        │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ Servidor (middleware + route handlers)                   │
│                                                         │
│  middleware.ts                                           │
│    - /admin/login → público                              │
│    - /admin/* → requiere sesión + allowlist              │
│    - /api/admin/* → mismo, devuelve 401/403 JSON        │
│                                                         │
│  requireAdmin() (session.ts)                             │
│    - Re-valida sesión + allowlist en cada handler       │
│    - Defensa en profundidad (middleware ya filtró)       │
└─────────────────────────────────────────────────────────┘
```

### Archivos de auth

| Archivo | Rol | Side |
|---------|-----|------|
| `middleware.ts` | Protege rutas admin, redirige si no hay sesión | Server |
| `src/lib/auth/admin-auth.ts` | Validación allowlist (`isAdminEmail`, `isAuthEnabled`) | Server |
| `src/lib/auth/session.ts` | `requireAdmin()` — sesión + allowlist para handlers | Server |
| `src/app/auth/callback/route.ts` | Intercambia code por sesión, valida allowlist | Server (Route Handler) |
| `src/app/admin/login/page.tsx` | Formulario de magic link | Client |
| `src/lib/auth/admin-auth-client.ts` | `requestMagicLinkClient()` — signInWithOtp browser-side | Client ⚠️ |
| `src/app/actions/admin-auth.ts` | Server Action original (rate-limit message, SIN USAR actualmente) | Server (idle) |

---

## 6. Arquitectura de lead operations (Checkpoint 3)

```
┌─────────────────────────────────────────────────┐
│ Client (LeadDetailDrawer)                        │
│                                                  │
│  ops-client.ts → fetch /api/admin/leads/[id]/* │
│  rows-mapper.ts → snake_case → camelCase view    │
└──────────────────┬──────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────┐
│ API Routes (route handlers)                      │
│                                                  │
│  /api/admin/leads/[id]/route.ts     → PATCH    │
│  /api/admin/leads/[id]/notes/route.ts → GET/POST│
│  /api/admin/leads/[id]/tasks/route.ts → GET/POST│
│  Todos: requireAdmin() + checkSupabaseConfig()   │
└──────────────────┬──────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────┐
│ Server Lib (service role, bypass RLS)           │
│                                                  │
│  leads-admin-server.ts → updateLeadStatus        │
│  notes-server.ts → getLeadNotes, createCRMNote   │
│  tasks-server.ts → getLeadTasks, createCRMTask,  │
│                    updateTaskStatus                │
│  interactions-server.ts → getLeadInteractions,    │
│                          createLeadInteraction   │
│  audit-server.ts → logAdminAction (best-effort)  │
│  crm-rows.ts → tipos derivados de supabase.ts    │
│  rows-mapper.ts → snake → camelCase view types    │
└──────────────────────────────────────────────────┘
```

---

## 7. Variables de entorno

### Requeridas para auth admin

```
# Siempre existieron (públicas)
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
NEXT_PUBLIC_SUPABASE_ANON_KEY        # alias legacy, fallback

# Siempre existieron (server-only)
SUPABASE_SECRET_KEY                   # alias legacy, fallback
SUPABASE_SERVICE_ROLE_KEY            # alias legacy, fallback
SUPABASE_PROJECT_REF

# Nuevas para auth admin (server-only)
ADMIN_EMAIL_ALLOWLIST=david17891@gmail.com,layerzero3dprint@gmail.com

# Ya existía
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Configuración en Supabase Dashboard

| Setting | Valor esperado |
|---------|---------------|
| Authentication → URL Configuration → Site URL | `http://localhost:3000` |
| Authentication → URL Configuration → Redirect URLs | `http://localhost:3000/auth/callback` |
| Authentication → Email Provider → Confirm email | ON |
| Rate limits (plan free) | **2 emails/hora** (no modificable en free tier) |

⚠️ **IMPORTANTE:** el rate limit del plan free es extremadamente restrictivo. Cada intento de login consume 1 de 2 cuotas/hora. Error o éxito, consume. Es imposible iterar rápido en desarrollo con magic links en el plan free.

---

## 8. Plan de continuación (por orden de prioridad)

### 🔴 Prioridad 1 — Desbloquear el login admin

El magic link nunca se verificó en runtime. Antes de avanzar con commits o docs, hay que demostrar que un admin puede:
1. Pedir magic link → recibir correo → clic → aterrizar en `/admin` con sesión activa

**Acciones sugeridas:**

#### Opción A — Diagnóstico limpio
1. **Reiniciar el dev server limpio** (matar todo, `npm run dev`).
2. Abrir `http://localhost:3000/admin/login` con **F12 → Console** abierto.
3. Pedir magic link → observar los `console.log` de `admin-auth-client.ts` en la consola.
4. Si `[admin-auth-client] init signInWithOtp` aparece pero `[admin-auth-client] signInWithOtp done` NO → el `signInWithOtp` cuelga.
5. Si NINGUNO aparece → el `createBrowserClient` lanza antes (revisar qué vars se inlinaron).

#### Opción B — Bypass temporal (alternativa rápida)
Si el diagnóstico no resuelve rápido, considerar:
1. Crear un endpoint `/api/dev/session` temporal que use `supabase.auth.admin.createUser({ email, password })` + cookie manual.
2. O: usar `signInWithPassword` si el usuario tiene contraseña asignada.
3. O: usar `supabase.auth.admin.generateLink()` server-side y abrir el link con `fetch` desde el script para extraer el code.
4. **Este endpoint se borra antes de mergear.**

#### Opción C — Subir de plan en Supabase
El plan Pro ($25/mes) elimina las restricciones de rate-limit y permite SMTP propio.
No es necesario para dev, pero sí para producción.

### 🟡 Prioridad 2 — Commits pendientes

Una vez verificado el login:
```
git add src/app/actions/admin-auth.ts src/app/admin/login/page.tsx \
        src/app/auth/callback/route.ts src/lib/supabase/client.ts \
        src/lib/auth/admin-auth-client.ts
git commit -m "fix: move signInWithOtp to browser client for PKCE compatibility

PKCE code_verifier must persist in browser cookies, not server cookies.
Server Action's createSupabaseServerClient stored the verifier server-side
where the callback couldn't find it. Moved to client-side browser client
with literal process.env access (Next.js inline requirement).

Also: rate-limit message, callback error params, singleton cache fix."
```

### 🟡 Prioridad 3 — Documentación

Crear:
- `docs/ADMIN_AUTH_LEADS_OPERATIONS.md` — guía completa de la feature
- `docs/adr/D-018.md` — decisión de arquitectura (service role + RLS default-deny)
- Actualizar `.env.example` con `ADMIN_EMAIL_ALLOWLIST`

### 🟢 Prioridad 4 — Checkpoint 4 (validación completa)

```bash
npm run lint           # ya pasa: 0 warnings
npm run type-check     # ya pasa: 0 errors
npm run build          # ⚠️ PENDIENTE
npm run audit:links    # ⚠️ PENDIENTE
npm run check:supabase # ⚠️ PENDIENTE
# Escaneo de secrets    # ⚠️ PENDIENTE
```

---

## 9. Reglas vigentes (fuera de alcance)

De la handoff original — estas NO se tocan:
- Pagos · WhatsApp API · OpenRouter
- Migrar LMS · radar web · webinar funnel
- Actualizar Next/React/Tailwind
- Audit fix --force
- Commitear .env.local
- Mergear a main sin OK

---

## 10. Notas técnicas para el siguiente desarrollador

### Sobre PKCE y magic links en Supabase + Next.js
- `@supabase/ssr` usa PKCE por defecto. `signInWithOtp` genera un `code_verifier` que DEBE persistir en la misma cookie store donde el callback lo lee.
- Si el `signInWithOtp` corre server-side (Server Action), el verifier se guarda en cookies del response HTTP de la action, no en el navegador. El callback no lo encuentra.
- **Solución canónica:** llamar `signInWithOtp` desde el browser client (`createBrowserClient`).
- Las `NEXT_PUBLIC_*` vars en Next.js solo se inlinan con acceso literal (`process.env.NEXT_PUBLIC_FOO`). Acceso dinámico (`readEnv(key)`) funciona en server, no en client.

### Sobre el browser client singleton
- `createBrowserClient` de `@supabase/ssr` ya tiene cache interno. Agregar un segundo cache singleton (`let cached`) es redundante y causa bugs en dev (hot reload recrea el módulo pero el cache queda stale).
- Se quitó el singleton en `client.ts`. Si esto causa performance issues en producción, se puede restaurar pero con invalidación en HMR.

### Sobre scripts temporales
- `scripts/generate-magic-link.mjs` usa la Admin API (`/auth/v1/admin/generate_link`) que produce links en flujo **implícito** (`#access_token=...`), incompatible con nuestro callback PKCE (`exchangeCodeForSession` espera `?code=`). Útil para debug pero NO para validar el flujo real.
- `scripts/kill-dev.ps1` mata procesos en puertos 3000/3001.

### Sobre el rate-limit
- Plan free: 2 emails/hora por IP. No configurable en el Dashboard.
- Cada intento consume cuota, éxito o error.
- La única forma de resetear es esperar ~1h sin intentos desde la última IP.
- Para desarrollo iterativo, considerar un segundo email o subir de plan.

---

---

## 11. Cierre del bug #5 — verificado end-to-end (2026-06-25)

**Sesión nocturna retomada con un agente distinto (Mavis).** El bug #5 queda
**cerrado** — el flujo nunca estuvo roto. Lo que pasó:

### Lo que se verificó en runtime

1. `signInWithOtp` SÍ resolvió: log de Console del navegador
   (`[admin-auth-client] signInWithOtp done {hasError: false}`) confirmó que
   la promesa terminó sin error.
2. El email SÍ llegó al destinatario (bandeja de entrada, no spam).
3. El magic link SÍ redirigió al callback; el callback SÍ intercambió el code
   por sesión y SÍ setteó las cookies (`sb-<project>-auth-token` visible en
   DevTools → Application → Cookies).
4. El middleware SÍ dejó pasar la request porque el email estaba en
   `ADMIN_EMAIL_ALLOWLIST`.
5. El usuario aterrizó en `/admin` con el panel cargado.

### Diagnóstico revisado

El "se queda cargando" reportado en el commit anterior fue un **falso
positivo**. La causa: los `console.log` temporales agregados para
diagnóstico generaron ruido en Console que se mezcló con los
`MaxListenersExceededWarning` de extensiones del navegador (MetaMask,
Kaspersky, etc.), distorsionando la lectura.

En la verificación final, con F12 → Console abierto y los logs leídos en
orden, el flujo se ve lineal:

```
init signInWithOtp → signInWithOtp done {hasError: false} → setState(sent=true)
```

El loading state del botón dura menos de un segundo (lo que tarda la
POST a `*.supabase.co/auth/v1/otp` en ir y volver), no es un cuelgue.

### Lo que cambió en este commit (f883062)

- **Limpieza:** borrados los `console.log` temporales en
  `admin-auth-client.ts` (líneas 60 y 71 originales). Cumplieron su
  propósito.
- **Sin cambios funcionales** respecto al plan original del handoff.

### Estado final del feature

| Checkpoint | Estado |
|------------|--------|
| 1. Auth gate | ✅ Verificado runtime |
| 2. Real leads en CRM | ✅ Verificado (smoke test 12/12) |
| 3. Lead operations | ✅ Verificado (type-check + lint) |
| 4. Login end-to-end | ✅ Verificado runtime (este commit) |

### Siguiente hito

Migrar la información operativa de este handoff a
`docs/ADMIN_AUTH_LEADS_OPERATIONS.md` (guía permanente) y archivar este
documento como histórico. ADR D-018 cubre la decisión arquitectónica.

---

*Documento original generado durante la sesión de desarrollo. Refleja el
estado al 2025-06-25 al inicio; esta sección 11 documenta el cierre del
bug #5 verificado el 2026-06-25.*
