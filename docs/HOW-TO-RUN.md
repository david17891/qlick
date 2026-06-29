# Cómo correr el proyecto — Guía operativa

> **Para:** David (operación local en Windows + PowerShell).
> **Objetivo:** levantar el dev server, entrar como admin, entrar como alumno, navegar todo.
>
> Si algo no coincide con lo que ves, abrí `docs/OPEN_ITEMS.md` o preguntame.

---

## 1. Setup inicial (solo la primera vez)

### 1.1. Dependencias

```powershell
cd C:\Users\User\Documents\Click
npm install
```

### 1.2. Variables de entorno

Si todavía no tenés `.env.local`, copialo del ejemplo:

```powershell
Copy-Item .env.example .env.local
```

Editá `.env.local` y completá **mínimo estas 4 variables** (lo demás puede quedar vacío para modo demo):

```bash
# Supabase (los sacás del dashboard de tu proyecto en supabase.com)
NEXT_PUBLIC_SUPABASE_URL="https://xxxxxxxx.supabase.co"
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
SUPABASE_SECRET_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Tu email admin (debe matchear con la cuenta con la que vas a loguearte)
ADMIN_EMAIL_ALLOWLIST="david17891@gmail.com"
```

**Para usar el dev login bypass** (recomendado para no gastar emails de Supabase):

```bash
# Generar un secret aleatorio
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
[BitConverter]::ToString($bytes).Replace('-','').ToLower()

# Pegar el resultado en .env.local:
DEV_ADMIN_SECRET="<el-valor-que-generaste-acaba-de-arriba>"
```

### 1.3. Cargar data demo (opcional pero muy recomendable)

Inserta 3 eventos, ~28 confirmados, ~16 asistentes, ~12 encuestas, ~9 leads promovidos, ~20 WhatsApp log, ~25 audit log. **Idempotente** — podés correrlo N veces sin duplicar.

```powershell
npm run seed:demo
```

Si querés limpiar todo lo del seed y volver a empezar:

```powershell
npm run seed:demo:cleanup
npm run seed:demo
```

Si querés resetear los eventos del seed a su estado original (útil después de editarlos a mano):

```powershell
npm run seed:demo:reset
```

---

## 2. Levantar el dev server

**Cada vez que quieras trabajar:**

```powershell
cd C:\Users\User\Documents\Click
npm run dev
```

Aguardá a ver esto en consola:

```
- Local:        http://localhost:3000
- Ready in 2.5s
```

Abrí **http://localhost:3000** en el browser. Si ves la home con el gradiente morado y el navbar, todo OK.

**Para frenar el server:** `Ctrl+C` en la terminal.

---

## 3. Entrar como administrador

Tenés 2 caminos. **Probalos en este orden.**

### Camino A — Dev login bypass (rápido, recomendado para iterar)

El bypass crea una sesión real de admin sin pasar por email. Usa el endpoint `/api/dev/admin-session` que solo existe en dev (devuelve 404 en producción).

**Desde la terminal** (te devuelve email + password temporales):

```powershell
node tests/playwright/dev-login.mjs
```

Output:

```json
{"ok":true,"email":"david17891@gmail.com","password":"dev-...","userId":"...","note":"..."}
```

**Después en el browser:**

1. Andá a http://localhost:3000/login
2. Escribí el email y el password que te devolvió el script
3. Click en "Iniciar sesión"
4. Ya estás autenticado. Navegá a http://localhost:3000/admin

> **Si te redirige a `/admin/login`**, el email no está en `ADMIN_EMAIL_ALLOWLIST` de tu `.env.local`. Agregalo, reiniciá `npm run dev` y volvé a intentar.

### Camino B — Magic link por email (flujo real de producción)

Útil para probar el flow tal como lo va a vivir un admin en producción.

1. Andá a http://localhost:3000/admin/login
2. Escribí tu email (el de `ADMIN_EMAIL_ALLOWLIST`)
3. Click en "Enviar enlace mágico"
4. Abrí tu Gmail → buscá email de Supabase → click en el enlace
5. El browser te redirige a `/admin` ya autenticado

> **Limitación del plan free de Supabase:** 2 emails/hora. Si testeás mucho, te quedás sin cuota. Por eso existe el Camino A.

---

## 4. Entrar como usuario/alumno

El login de alumno es **distinto** al de admin. No usan el mismo endpoint.

> **Actualizado 2026-06-29:** desde la sesión nocturna, **se permite dualidad**. Un mismo email puede actuar como admin Y como alumno (decidido por la ruta). RLS previene que un admin vea datos de otros alumnos. Por lo tanto, la nota en 4.1 sobre "un admin no puede entrar como alumno" ya no aplica.

### 4.1. Google OAuth (método principal)

1. Andá a http://localhost:3000/login
2. Click en "Continuar con Google"
3. Elegí tu cuenta de Google (cualquier Gmail sirve, incluido uno en `ADMIN_EMAIL_ALLOWLIST`)
4. Listo, ya estás como alumno. Te lleva a `/dashboard`

### 4.2. Magic link (fallback)

1. Andá a http://localhost:3000/login
2. Click en "o usa otro método" (aparece el toggle)
3. Escribí un email
4. Click en "Enviar enlace mágico"
5. Abrí ese Gmail → click en el enlace
6. Ya estás como alumno

> **Misma limitación que el admin:** 2 emails/hora en plan free de Supabase. Si querés testear muchos flows de alumno, Google OAuth es más rápido.

### 4.3. Crear un usuario alumno de prueba

Si necesitás un alumno persistente para testear (que quede en la DB con enrollments, progreso, etc.):

1. Logueate como admin (Camino A o B)
2. Abrí la consola del navegador en http://localhost:3000/admin
3. Corré:

```js
await window.supabase.auth.signUp({
  email: "alumno-test@ejemplo.com",
  password: "Test1234!"
})
```

O desde la terminal (más limpio para repetir):

```powershell
node tests/playwright/create-student.mjs  # si existe; si no, usá el signup del paso anterior
```

---

## 5. Mapa de navegación

### Público (no requiere login)

| URL | Qué hay |
|---|---|
| `/` | Home con hero, cursos destacados, CTA WhatsApp |
| `/cursos` | Catálogo de los 4 cursos (lee del LMS real) |
| `/cursos/[slug]` | Detalle + inscripción |
| `/eventos` | Lista pública de eventos |
| `/eventos/[slug]` | Hero + form de confirmación |
| `/masterclass` y `/masterclass/[slug]` | Lista y detalle de masterclass |
| `/contacto` | Form de contacto (mock provider por defecto) |
| `/acerca`, `/beneficios`, `/faq`, `/privacidad` | Páginas estáticas |
| `/pagar/[courseSlug]` | Flujo de pago (simulator en dev) |

### Auth

| URL | Qué hay |
|---|---|
| `/login` | Login alumno: Google OAuth (principal) + magic link (fallback) |
| `/admin/login` | Login admin: magic link únicamente |
| `/auth/callback` | Callback de Supabase (no ir manualmente) |
| `/logout` | Cierra sesión |

### Alumno (requiere login con cuenta NO-admin)

| URL | Qué hay |
|---|---|
| `/dashboard` | Panel del alumno: cursos inscriptos + progreso |
| `/mi-panel` | Alias/redirect a `/dashboard` |
| `/aprender/[lesson]` | Reproductor de lección |
| `/inscripcion/[slug]` | Inscripción a curso (free) o redirect a `/pagar` |

### Admin (requiere login con email en `ADMIN_EMAIL_ALLOWLIST`)

| URL | Qué hay |
|---|---|
| `/admin` | Panel principal: métricas globales + 8 tabs (Resumen, Embudo, CRM, etc.) |
| `/admin/eventos` | Lista de eventos con gradiente + 6 stat cards en header |
| `/admin/eventos/[id]` | Detalle con 4 tabs: Confirmados, Asistentes, Encuestas, Leads promovidos |
| `/admin/eventos/[id]/import` | Wizard de import desde Excel |
| `/admin/masterclass` | Lista de masterclass |
| `/admin/masterclass/[id]` | Detalle + acciones por registrado |
| `/admin/system/audit-log` | Audit log con tabla + filtros URL-driven + diff view |
| `/admin/system/supabase` | Vista de la conexión a Supabase (debug) |
| `/admin?tab=crm` | Tab CRM (kanban + calendario + agente IA) |

---

## 6. Comandos útiles del día a día

```powershell
# Levantar / frenar
npm run dev                                # dev server
# Ctrl+C para frenar

# Calidad de código
npm run type-check                         # tsc --noEmit
npm run lint                               # eslint
npm test                                   # 110 tests
npm run build                              # build de producción (valida que compilea)

# Auditoría / chequeos
npm run audit:links                        # verifica que los hrefs no estén rotos
npm run check:supabase                     # chequea que las env vars de Supabase estén

# Data
npm run seed:demo                          # carga data demo
npm run seed:demo:reset                    # resetea eventos del seed a su estado original
npm run seed:demo:cleanup                  # borra toda la data del seed

# Smoke test de Resend (post-setup de email)
powershell -ExecutionPolicy Bypass -File scripts/smoke-resend.ps1
```

---

## 7. Si algo se rompe

### El server no levanta

- **"Port 3000 is already in use":** hay otro proceso usando el puerto. Matálo o cambiá el puerto con `npm run dev -- -p 3001`.
- **"Missing Supabase URL":** falta `.env.local`. Repetí sección 1.2.

### No puedo entrar como admin

- **Redirige a `/admin/login` inmediatamente:** tu email no está en `ADMIN_EMAIL_ALLOWLIST`. Agregalo, reiniciá `npm run dev`.
- **Dev login bypass devuelve 404:** falta `DEV_ADMIN_SECRET` en `.env.local` o estás en `NODE_ENV=production` (raro en dev). Ver sección 1.2.
- **El magic link no llega:** plan free de Supabase, 2 emails/hora. Esperá o usá el bypass.

### No puedo entrar como alumno

- **"Auth session missing":** cookies expiraron. Andá a `/login` de nuevo.
- **Google OAuth da error:** tu cuenta está en `ADMIN_EMAIL_ALLOWLIST` (por diseño, admin no puede entrar como alumno). Usá otra cuenta.

### La UI se ve rota

- **Pantalla en blanco / "Hydration error":** abrí DevTools → Console → reportame qué dice. Probable: extensions del browser (password managers) o caché vieja. Probá en ventana incógnito.
- **Gradientes no se ven:** estás en un browser viejo. Probá Chrome/Firefox/Edge actualizados.

### Los datos demo no aparecen

- **"0 eventos":** corriste `seed:demo:cleanup` y no re-corriste el seed. Corré `npm run seed:demo` de nuevo.
- **"permission denied" en seed:** falta `SUPABASE_SECRET_KEY` en `.env.local`. El seed usa service role, necesita esa key.

### Quiero ver el audit log

Andá a http://localhost:3000/admin/system/audit-log (con sesión admin). Filtros URL-driven, tabla con diff view expandible.

---

## 8. Tips de operación

- **Caché del browser puede jugarte en contra.** Si algo se ve raro, `Ctrl+Shift+R` (hard refresh) o usá ventana incógnito.
- **El dev server tiene hot reload.** Guardás un archivo → la página se refresca sola. Si no se refresca, mirá la terminal: a veces Next.js reporta un error de compilación y deja la pantalla en el último estado bueno.
- **No commitees `.env.local`.** Ya está en `.gitignore`. Si por error lo commiteás, rotá las API keys de inmediato.
- **El visual E2E con Playwright MCP** lo corro yo cuando querés. Avisame y abrimos el sitio, capturamos screenshots, y revisamos las 5 rutas clave (`/`, `/login`, `/dashboard`, `/admin`, `/admin/eventos`) en 25 min.

---

## 9. Dev login en production (para Mavis / Playwright / tests E2E)

> **Nuevo 2026-06-29.** El endpoint `/api/dev/login` ahora funciona también en production (gated solo por `DEV_ADMIN_SECRET`, que está en Vercel + `.env.local`). Esto permite que Mavis (el agente) testee en production sin browser interactivo.

### Login como admin

```powershell
$secret = (Get-Content .env.local | Select-String 'DEV_ADMIN_SECRET="([^"]+)"').Matches[0].Groups[1].Value
$body = @{ email = "david17891@gmail.com"; secret = $secret } | ConvertTo-Json
Invoke-WebRequest -Uri "https://qlick-three.vercel.app/api/dev/login" `
  -Method Post -Body $body -ContentType "application/json" `
  -UseBasicParsing -SessionVariable sv

# Cookies quedan en $sv, próximas requests con -WebSession $sv
Invoke-WebRequest -Uri "https://qlick-three.vercel.app/admin" -UseBasicParsing -WebSession $sv
```

Response: `{ "ok": true, "email": "...", "isAdmin": true, "redirectTo": "/admin" }`.

### Login como student (cualquier email, auto-crea el user)

```powershell
$body = @{ email = "mavis+test@qlick.app"; secret = $secret } | ConvertTo-Json
Invoke-WebRequest -Uri "https://qlick-three.vercel.app/api/dev/login" `
  -Method Post -Body $body -ContentType "application/json" `
  -UseBasicParsing -SessionVariable sv

Invoke-WebRequest -Uri "https://qlick-three.vercel.app/dashboard" -UseBasicParsing -WebSession $sv
```

Response: `{ "ok": true, "email": "...", "isAdmin": false, "redirectTo": "/dashboard" }`.

### Login como visitante (sin auth)

Sin llamar al endpoint. Solo navegar sin cookies:

```powershell
Invoke-WebRequest -Uri "https://qlick-three.vercel.app/" -UseBasicParsing  # 200
Invoke-WebRequest -Uri "https://qlick-three.vercel.app/dashboard" -UseBasicParsing -MaximumRedirection 0
# 307 → /login (correcto, no hay sesión)
```

### Seguridad

- El secret es la **única barrera**. No publicar. Si se compromete: rotar en `.env.local` + Vercel env vars simultáneamente.
- El endpoint **auto-crea usuarios** en Supabase auth.users. Útil para tests, no abusar en producción real.
- La sesión caduca según config de Supabase (default 1h access token, 7d refresh).

---

## 9. Referencias cruzadas

- `docs/DEV_LOGIN_BYPASS.md` — detalle del bypass dev (cómo funciona, seguridad, scripts).
- `docs/SMTP_SETUP.md` — setup de Resend (email transaccional).
- `docs/EVENTS_ADMIN_GUIDE.md` — manual operativo completo del panel admin de eventos.
- `docs/SEED-DEV.md` — qué inserta el seed y cómo limpiarlo.
- `docs/OPEN_ITEMS.md` — deuda técnica viva, bugs conocidos, próximos pasos.
- `docs/PRE_MERGE_CHECKLIST.md` — gate antes de mergear Fase 6 a `main`.
- `docs/ROADMAP.md` — visión general del proyecto, qué fase sigue.
