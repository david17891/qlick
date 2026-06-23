# Setup de variables de entorno en Vercel — Qlick Marketing Integral

**Fecha:** 2026-06-23
**Audiencia:** operador humano que administra el deploy en Vercel.

Este doc explica cómo configurar las variables de entorno en Vercel para los
tres entornos (Production, Preview, Development) y qué falta hasta tener el
proyecto Supabase real.

---

## 1. Dónde se configuran

Vercel → proyecto **`qlick`** → **Settings → Environment Variables**.

Cada variable se crea con:
- **Name** (exactamente como en `.env.example`).
- **Value**.
- **Environments:** Production, Preview, Development (marcar los que apliquen).
- **Type:** plain text, salvo secretos → **Sensitive** (Vercel oculta el valor
  tras guardarlo y no se puede leer de vuelta, solo sobreescribir).

URL directa: https://vercel.com/dashboard → proyecto `qlick` → Settings →
Environment Variables.

---

## 2. Variables Supabase (por entorno)

### Production

| Variable | Tipo | Sensitiva | Ejemplo |
| -------- | ---- | :-------: | ------- |
| `NEXT_PUBLIC_SUPABASE_URL` | Plain | no | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Plain | no | `eyJhbGci...` (publishable/anon) |
| `SUPABASE_SECRET_KEY` | **Sensitive** | **sí** | `eyJhbGci...` (service role) |
| `SUPABASE_PROJECT_REF` | Plain | no | `<uuid>` |
| `NEXT_PUBLIC_APP_URL` | Plain | no | `https://qlick-three.vercel.app` |

### Preview (deploy previews de PRs)

Mismas variables que Production, pero:

- `NEXT_PUBLIC_APP_URL` = la URL de preview (Vercel la genera por deploy; usar
  una estable solo si configuraste un alias de preview fijo).
- Para Supabase: idealmente un **proyecto/branch de Supabase distinto** al de
  Production. Si no hay, reutilizar las mismas claves **solo mientras no haya
  datos reales**.

### Development (usado por `vercel dev` local)

Mismas variables que Production, con:

- `NEXT_PUBLIC_APP_URL=http://localhost:3000`.

> Recomendado: usar `.env.local` para desarrollo (ver §4). Las env vars de
> Development en Vercel solo importan si corres `vercel dev`.

---

## 3. publishable key vs secret key — diferencia crítica

| | publishable key | secret key (service role) |
| ---------- | --------------- | ------------------------- |
| Nombre moderno | publishable | secret / service role |
| Equivalente legacy | anon key | service_role_key |
| Prefijo | `NEXT_PUBLIC_` ✅ | `NEXT_PUBLIC_` ❌ **prohibido** |
| ¿Respeta RLS? | ✅ sí | ❌ **no**, la bypassa |
| ¿Llega al navegador? | ✅ sí (intencional) | ❌ nunca |
| Dónde se usa | cliente + server components | server-only (`admin.ts`) |
| Sensitiva en Vercel | no (es pública) | **sí** |

**Regla dura:** la `secret_key` jamás debe llevar prefijo `NEXT_PUBLIC_`. Si la
vees en el bundle del navegador, es un incidente: rotar de inmediato.

En este repo:

- `src/lib/supabase/client.ts` usa **publishable** (`createBrowserClient`).
- `src/lib/supabase/server.ts` usa **publishable** (`createServerClient`).
- `src/lib/supabase/admin.ts` usa **secret** y valida `typeof window === 'undefined'`.

---

## 4. No subir `.env.local`

`.env.local` está en `.gitignore`. **Nunca** lo commitees. Si necesitas
compartir valores con otra persona, hazlo por un canal seguro (no por chat en
texto plano) o, mejor, que cada uno los saque del Dashboard de Supabase.

En Vercel, las variables se introducen directamente por la UI; no hay archivo
`.env.local` que subir.

---

## 5. Qué falta hasta tener el proyecto Supabase real

Antes de llenar las variables Supabase en Vercel necesitas:

1. **Crear el proyecto Supabase** (con aprobación de costo — ver
   `docs/AGENT_SUPABASE_PROTOCOL.md` §1).
2. Obtener del Dashboard:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`.
   - publishable key → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
   - secret key → `SUPABASE_SECRET_KEY`.
   - Project ref → `SUPABASE_PROJECT_REF`.
3. Llenar las variables en Vercel (§2).
4. **Redeploy** para que el build/runtime las tome.
5. Verificar con el panel interno:
   - Visitar `https://qlick-three.vercel.app/admin/system/supabase` → debe
     decir **Configurado** (sin revelar secretos).
6. Validar advisors y RLS antes de cualquier dato real.

> Mientras tanto, las variables pueden quedarse **vacías** en Vercel: la app
> corre en modo demo y el build pasa. Es lo que ocurre hoy (junio 2026).

---

## 6. Checklist rápido

```
[ ] Existe proyecto Supabase aprobado.
[ ] NEXT_PUBLIC_SUPABASE_URL        → Production + Preview + Development
[ ] NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY → Production + Preview + Development
[ ] SUPABASE_SECRET_KEY (Sensitive) → Production (+ Preview si aplica)
[ ] SUPABASE_PROJECT_REF            → Production + Preview + Development
[ ] NEXT_PUBLIC_APP_URL             → Production: url de prod
                                      Preview:    url de preview
                                      Development: http://localhost:3000
[ ] Redeploy realizado.
[ ] /admin/system/supabase muestra "Configurado".
[ ] RLS + aviso de privacidad antes de capturar datos reales.
```

---

## 7. Rotación de claves

Si una clave se filtra (commiteada, en log, en URL):

1. Supabase Dashboard → Project Settings → API → **Reset** (publishable o
   service role según corresponda).
2. Actualizar el valor en Vercel (Settings → Environment Variables).
3. Redeploy.
4. Actualizar `.env.local` local.
5. Documentar el incidente.

> La publishable key se filtra al navegador por diseño; rotarla tiene menor
> urgencia (respeta RLS), pero igual debe rotarse si se abusa de ella.

---

## Referencias

- Bootstrap de conexión: `docs/SUPABASE_CONNECTION_BOOTSTRAP.md`
- Protocolo del agente: `docs/AGENT_SUPABASE_PROTOCOL.md`
- Runbook MCP: `docs/SUPABASE_MCP_RUNBOOK.md`
- Variables plantilla: `.env.example`
- Validador local: `npm run check:supabase`
