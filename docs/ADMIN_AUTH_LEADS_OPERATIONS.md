# Admin Auth + Leads Operations — Guía operativa

> **Versión:** v0.5.0 · **Rama:** `feature/admin-auth-leads-operations`
> **Estado:** verificado end-to-end en runtime (2026-06-25)

Esta guía reemplaza al handoff temporal (`docs/HANDOFF_v0.5.0_ADMIN_AUTH_LEADS.md`,
ahora histórico) como documentación operativa del feature. Si algo cambia
en el flujo, actualiza este documento.

---

## 1. Qué hace

Cuatro capacidades de admin sobre la app existente:

1. **Auth gate** — solo emails en `ADMIN_EMAIL_ALLOWLIST` pueden acceder a
   `/admin/*` y `/api/admin/*`.
2. **Real leads en CRM** — el panel admin muestra los leads reales de
   Supabase (no mock).
3. **Lead operations** — status, notas, tareas, audit log por lead.
4. **Login end-to-end** — magic link real vía Supabase Auth.

---

## 2. Configuración

### 2.1 Variables de entorno

Agregar a `.env.local` (ver `.env.example` para la lista canónica):

```bash
# Auth admin — server-only, comma-separated
ADMIN_EMAIL_ALLOWLIST=david17891@gmail.com,layerzero3dprint@gmail.com

# Las Supabase vars ya existían:
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
SUPABASE_PROJECT_REF=xxxxxxxxxxxx

# App URL — debe coincidir con la configurada en Supabase Dashboard
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 2.2 Supabase Dashboard

| Setting | Valor esperado |
|---------|---------------|
| Authentication → URL Configuration → Site URL | `http://localhost:3000` (dev) / tu dominio (prod) |
| Authentication → URL Configuration → Redirect URLs | `<appUrl>/auth/callback` |
| Authentication → Email Provider → Confirm email | ON |

### 2.3 Plan free — rate-limit importante

El plan free de Supabase tiene **2 emails/hora por IP** para magic links.
Cada intento consume 1 cuota (éxito o error). Para desarrollo iterativo
esto es restrictivo:

- Esperar ~1 hora entre intentos si te quedas sin cuota.
- Considerar un segundo email en el allowlist para alternar.
- En producción: subir a Pro ($25/mes) elimina la restricción y permite
  SMTP propio.

---

## 3. Flujo end-to-end

```
┌─────────────────────────────────────────────────────────┐
│ Navegador (Client Component)                             │
│                                                         │
│  /admin/login                                           │
│    ↓ clic "Enviar enlace mágico"                        │
│  requestMagicLinkClient() ← src/lib/auth/admin-auth-client.ts │
│    ↓ signInWithOtp (browser client, PKCE)               │
│    → Supabase envía email con magic link                │
│    → code_verifier se guarda en cookie del navegador    │
│                                                         │
│  /auth/callback?code=...                                │
│    ↓ exchangeCodeForSession(code)                       │
│    → Lee code_verifier de cookie (server-side)          │
│    → Setea cookies de sesión en el response             │
│    → Verifica allowlist                                 │
│    → Redirect a /admin o /admin/login?error=...         │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ Servidor (middleware + route handlers)                  │
│                                                         │
│  middleware.ts                                          │
│    - /admin/login → público                             │
│    - /admin/* → requiere sesión + allowlist             │
│    - /api/admin/* → igual, devuelve 401/403 JSON        │
│                                                         │
│  requireAdmin() (src/lib/auth/session.ts)               │
│    - Re-valida sesión + allowlist en cada handler       │
│    - Defensa en profundidad (middleware ya filtró)      │
└─────────────────────────────────────────────────────────┘
```

---

## 4. Archivos clave

| Archivo | Rol | Side |
|---------|-----|------|
| `middleware.ts` | Protege rutas admin, redirige si no hay sesión | Server |
| `src/lib/auth/admin-auth.ts` | Validación allowlist (`isAdminEmail`, `isAuthEnabled`) | Server |
| `src/lib/auth/session.ts` | `requireAdmin()` / `getCurrentAdmin()` — sesión + allowlist para handlers | Server |
| `src/app/auth/callback/route.ts` | Intercambia code por sesión, valida allowlist | Server (Route Handler) |
| `src/app/admin/login/page.tsx` | Formulario de magic link | Client |
| `src/lib/auth/admin-auth-client.ts` | `requestMagicLinkClient()` — `signInWithOtp` browser-side (PKCE) | Client |
| `src/app/actions/admin-auth.ts` | Server Action original (rate-limit message, idle) | Server |

### Lead operations

| Carpeta / archivo | Rol |
|-------------------|-----|
| `src/lib/crm/leads-admin-server.ts` | `updateLeadStatus` (service role) |
| `src/lib/crm/notes-server.ts` | `getLeadNotes`, `createCRMNote` |
| `src/lib/crm/tasks-server.ts` | `getLeadTasks`, `createCRMTask`, `updateTaskStatus` |
| `src/lib/crm/interactions-server.ts` | `getLeadInteractions`, `createLeadInteraction` |
| `src/lib/crm/audit-server.ts` | `logAdminAction` (best-effort) |
| `src/lib/crm/crm-rows.ts` | Tipos derivados de `supabase.ts` |
| `src/lib/crm/rows-mapper.ts` | snake → camelCase view types |
| `src/app/api/admin/leads/[id]/route.ts` | PATCH lead status |
| `src/app/api/admin/leads/[id]/notes/route.ts` | GET/POST notes |
| `src/app/api/admin/leads/[id]/tasks/route.ts` | GET/POST tasks |

---

## 5. Cómo agregar un nuevo admin

1. Agregar el email a `ADMIN_EMAIL_ALLOWLIST` en `.env.local`:
   ```bash
   ADMIN_EMAIL_ALLOWLIST=david17891@gmail.com,layerzero3dprint@gmail.com,nuevo@qlick.mx
   ```
2. Reiniciar el dev server (`npm run dev`) para que tome la nueva env var.
3. Pedirle al nuevo admin que visite `/admin/login` con su email.
4. Recibirá el magic link y al hacer clic entrará al panel.

En Vercel/prod: actualizar la env var en el dashboard del proyecto, redeploy.

---

## 6. Troubleshooting

### "El botón se queda en 'Enviando enlace...'"

No suele ser el bug que era (bug #5 cerrado, ver handoff). En orden de
probabilidad:

1. **Rate-limit del plan free** — espera 1h o usa otro email.
2. **HMR stale state** — reinicia el dev server limpio:
   ```powershell
   powershell -File scripts/kill-dev.ps1
   npm run dev
   ```
3. **Fetch colgando a Supabase** — abre F12 → Network, busca la request a
   `*.supabase.co/auth/v1/otp`. Si está pending forever, es tema de
   red/firewall local.

### "Aterricé en `/admin/login?error=forbidden`"

Sesión Supabase válida pero el email no está en `ADMIN_EMAIL_ALLOWLIST`.
Verifica el `.env.local` y reinicia el dev server.

### "Aterricé en `/admin/login?error=expired`"

El magic link expiró (>1h) o ya se usó. Pide otro desde el formulario.

### "Aterricé en `/admin/login?error=callback`"

Error técnico al intercambiar el code. Revisa la consola del navegador y
los logs del servidor (`console.error("[admin-auth] signInWithOtp falló",
{ code: error.code })`).

---

## 7. Reglas vigentes (no tocar)

De la rama y la historia del proyecto — estas áreas NO se modifican en
este feature:

- Pagos · WhatsApp API · OpenRouter
- Migrar LMS · radar web · webinar funnel
- Actualizar Next/React/Tailwind
- Audit fix --force
- Commitear `.env.local`
- Mergear a `main` sin OK explícito

---

## 8. Referencias

- `docs/HANDOFF_v0.5.0_ADMIN_AUTH_LEADS.md` — histórico del feature (cerrado).
- `docs/DECISIONS.md` (D-018) — decisión arquitectónica de auth admin.
- `docs/SUPABASE_CONNECTION_BOOTSTRAP.md` — capa de conexión Supabase.
- `docs/AGENT_SUPABASE_PROTOCOL.md` — protocolo del agente para Supabase.
- `middleware.ts` y `src/lib/auth/` — implementación.
