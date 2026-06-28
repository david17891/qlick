# Dev Login Bypass — `POST /api/dev/admin-session`

> **Estado:** DEV ONLY. Este endpoint **NO existe en producción** (devuelve
> 404 cuando `NODE_ENV === "production"`).

## Por qué existe

El flujo normal de admin en Qlick es magic link (`/admin/login` →
enlace por email → `/auth/callback`). Para producción es el camino correcto,
pero tiene dos problemas prácticos durante el desarrollo:

1. **Rate limit del plan free de Supabase**: 2 emails/hora. Mata la iteración
   en dev (un solo test E2E que recargue la página ya gasta uno).
2. **No es automatizable**: Playwright/curl no pueden "abrir el email y hacer
   click en el enlace" sin un buzón instrumentado (Mailtrap/Mailosaur) que
   añade fricción y costo.

Este endpoint existe **solo para que un script pueda autenticarse como admin
sin intervención humana**. La sesión resultante es indistinguible de una
sesión real (mismas cookies de Supabase vía PKCE).

## Cómo funciona

```
┌─────────────────┐       ┌──────────────────────┐       ┌────────────────┐
│ Script Playwright│──POST─▶│ /api/dev/admin-session│──use service_role──▶│ Supabase Auth │
│  (curl/Node/MCP) │       │                      │       │   Admin API    │
└─────────────────┘       └──────────────────────┘       └────────────────┘
         │                          │                            │
         │                          │  1. Valida NODE_ENV ≠ prod │
         │                          │  2. Valida secret           │
         │                          │  3. Valida email en allowlist│
         │                          │  4. Crea/actualiza user con │
         │                          │     password aleatorio      │
         │                          │                            │
         │◀──{email, password}──────│                            │
         │                          │                            │
         │  signInWithPassword()    │                            │
         │──POST /auth/v1/token─────│───────────────────────────▶│
         │                          │                            │
         │◀── Set-Cookie: sb-... ───│                            │
         │                          │                            │
         │  GET /admin              │                            │
         │  Cookie: sb-...          │                            │
         │──▶ middleware valida sesión + allowlist ──▶ OK     │
```

### Reglas duras (todas en `src/app/api/dev/admin-session/route.ts`)

| Gate | Condición | Si falla |
|---|---|---|
| 1 | `NODE_ENV !== "production"` | 404 silencioso |
| 2 | `DEV_ADMIN_SECRET` configurado en `.env.local` | 404 |
| 3 | `secret` del body coincide con `DEV_ADMIN_SECRET` | 403 |
| 4 | `email` está en `ADMIN_EMAIL_ALLOWLIST` | 403 |

Después: `supabase.auth.admin.createUser()` con password aleatorio. Si el user
ya existe, hace `updateUserById()` con el nuevo password (idempotente).

## Configuración

### 1. Generar el secret (una sola vez)

```bash
# Linux/macOS/Git Bash
openssl rand -hex 32

# Windows PowerShell
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
[BitConverter]::ToString($bytes).Replace('-','').ToLower()
```

### 2. Agregar a `.env.local` (NUNCA commitear)

```bash
# Copiar desde .env.example si no existe:
# DEV_ADMIN_SECRET=""
DEV_ADMIN_SECRET="<el-valor-que-generaste>"

# El email admin ya debe estar en el allowlist:
ADMIN_EMAIL_ALLOWLIST="david17891@gmail.com"
```

### 3. Reiniciar el dev server

```bash
# Si usas next dev, Ctrl+C y volver a arrancar.
npm run dev
```

## Uso desde scripts

### A) Script standalone (Node, devuelve JSON por stdout)

`tests/playwright/dev-login.mjs` — corre `node tests/playwright/dev-login.mjs`
y escribe a stdout:

```json
{"ok":true,"email":"david17891@gmail.com","password":"dev-...","userId":"...","note":"..."}
```

Útil desde cualquier runner (Playwright MCP, bash, otro script Node).

### B) Desde un test Playwright (Node + @playwright/test)

```js
import { test, expect } from "@playwright/test";

test("admin dashboard es accesible tras login dev", async ({ page, request }) => {
  // 1. Obtener credenciales.
  const res = await request.post("/api/dev/admin-session", {
    data: {
      email: "david17891@gmail.com",
      secret: process.env.DEV_ADMIN_SECRET,
    },
  });
  const { email, password } = await res.json();

  // 2. Login real con PKCE (setea cookies en el context).
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');

  // 3. Ya estás autenticado. Ir al admin.
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin/);
  await expect(page.getByText(/Panel|Pedidos|Eventos/i)).toBeVisible();
});
```

### C) Desde Playwright MCP (lo que uso yo)

```bash
# 1. Pedir credenciales
node tests/playwright/dev-login.mjs

# Output: {"ok":true,"email":"david17891@gmail.com","password":"dev-..."}

# 2. Login programático via MCP
# browser_evaluate con:
#   await window.supabase.auth.signInWithPassword({
#     email: "david17891@gmail.com",
#     password: "dev-..."
#   })
```

(En la práctica, lo más limpio es el flujo `A` + `B`: un test que ya hace el
login internamente y deja las cookies listas para el resto de flows.)

## Seguridad

### ¿Por qué es seguro si el endpoint existe?

- En producción (`NODE_ENV=production`) el primer gate falla y devuelve 404.
  El endpoint **no existe** para el público, igual que si nunca se hubiera
  deployado.
- El segundo gate (`DEV_ADMIN_SECRET` ausente) es una segunda red de seguridad:
  si por error se deploya con `NODE_ENV=production` pero el secret quedó
  configurado por error, sigue devolviendo 404 si no hay secret.
- El allowlist limita qué emails pueden usar el bypass. No es un backdoor
  abierto, es un backdoor a usuarios que **ya son admin**.
- El password es aleatorio por request (`crypto.randomUUID()` × 2). No es
  reusable: cada llamada genera uno nuevo.

### ¿Y si se filtra el `DEV_ADMIN_SECRET`?

- Solo afecta a dev (prod devuelve 404 igual).
- Un atacante con `DEV_ADMIN_SECRET` puede impersonar admins en dev y ver/modificar
  datos demo. En el peor caso, ensucia la DB. **No hay datos reales de clientes
  en el entorno demo.**
- Rotación: regenerar el secret y reiniciar el dev server invalida sesiones
  previas. Los users en `auth.users` siguen existiendo pero con passwords
  distintos a los que el atacante pudiera haber capturado.

### ¿Por qué no en producción?

- Porque entonces tendrías un endpoint que crea admins sin flujo de auth real.
- Si necesitas algo similar en prod (staging con datos reales), es preferible
  magic link + un buzón instrumentado, o SSO con el IdP de la empresa.

## Limitaciones conocidas

- El password se rota **cada vez que llamas al endpoint**. Si lo usas en un
  test y luego vuelves a llamar, el segundo test necesita las credenciales
  nuevas.
- El rate limit del signInWithPassword NO está protegido (Supabase tiene el
  suyo propio, ~5/min). Para tests masivos, esperá 1s entre logins.
- El endpoint crea el user con `email_confirm: true`. En dev está bien; en
  prod jamás debe existir este endpoint.

## Tests

`tests/playwright/dev-login.test.mjs` — test E2E que demuestra el patrón:
1. POST al endpoint.
2. signInWithPassword.
3. GET /admin.
4. Verifica que llega al panel (no a /admin/login).
5. Screenshot.

## Changelog

- 2026-06-28: creado (`docs/DEV_LOGIN_BYPASS.md`). Endpoint pre-existente
  (`src/app/api/dev/admin-session/route.ts`) desde v0.6.0; faltaba la doc.