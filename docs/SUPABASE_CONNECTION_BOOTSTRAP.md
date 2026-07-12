# Supabase Connection Bootstrap — Qlick Marketing Integral

**Fecha original:** 2026-06-23
**Última actualización:** 2026-07-11 — **camino canónico de DDL es Management API** (no pooler, no host directo). Ver §4 actualizada y `docs/AGENT_SUPABASE_PROTOCOL.md` §11.
**Rama:** `feature/supabase-connection-bootstrap` (bootstrap inicial) + estado actual en `main` con proyecto Supabase `ugpejblymtbwtsoiykyj` operativo.
**Estado actual:** proyecto Supabase creado, conectado, con migrations aplicadas. Bot, CRM, eventos, auth y Supabase reales. Los mocks siguen disponibles como fallback demo (ver §7 de `AGENT_SUPABASE_PROTOCOL.md`).

---

## 1. ¿Qué es esta mini fase?

Es **solo la preparación controlada** para conectarse a Supabase en una fase
posterior. Se añade:

- Las **dependencias** mínimas (`@supabase/supabase-js`, `@supabase/ssr`).
- Los **clientes** Supabase (browser, server, admin) con separación estricta de
  secretos.
- Una capa de **configuración y health-check** que no rompe el build aunque no
  haya proyecto Supabase todavía.
- La **estructura `supabase/`** (migraciones versionadas, seed, config).
- **Documentación** de protocolo del agente, runbook MCP y env vars de Vercel.

> Principio rector: el build debe seguir pasando y la app debe seguir siendo
> 100% demo, **incluso si ninguna variable Supabase está configurada**.

---

## 2. Qué NO implementa todavía

| ❌ No hecho al 2026-06-23 | Estado actual (2026-07-11) |
| ---------- | ------- |
| Reemplazar mocks del LMS | ✅ Real con `lms-payments-expert` (v0.9.0+). |
| Reemplazar mocks del CRM | ✅ Real con persistencia + LVR/SLA/Heat + agente IA (v0.9.0+). |
| Crear proyecto Supabase | ✅ Creado: `ugpejblymtbwtsoiykyj` (región `us-east-1`, plan Free). |
| Crear schema/tablas reales | ✅ ~24 tablas operativas (ver `docs/STATUS.md` §"🗄️ Database"). |
| Ejecutar migraciones | ✅ Vía Management API (`scripts/apply-migration-management.mjs`). Pooler y host directo están rotos. |
| Auth real | ✅ Supabase Auth con magic link + allowlist (D-018). |
| RLS activo | ✅ Service role en handlers admin; publishable key respeta RLS. |
| Subir claves | Solo `.env.example` con valores vacíos. **Cambió:** `.env.local` tiene `SUPABASE_PROJECT_REF` y `SUPABASE_ACCESS_TOKEN` para que Mavis pueda correr DDL. |
| Service role en cliente | Prohibido (ver §6). |
| Cambios grandes de UI | Sprint 7 cerrado con 4 críticas + 7 medias + 1 baja resueltas. |

Esta capa **no toca** `src/lib/data/*`, `src/lib/crm/*`, ni componentes
existentes. Es aditiva.

---

## 3. Cómo se conectará Supabase al proyecto

```
┌─────────────────────────────────────────────────────────────┐
│  Next.js (App Router)                                        │
│                                                              │
│  Componente cliente ──► supabase/client.ts  (publishable)    │
│  Server Component    ──► supabase/server.ts  (publishable)   │
│  Route Handler /     ──► supabase/admin.ts   (secret,        │
│  Server-only action                                server)    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │  Supabase Postgres  │   ← se crea en Fase 1
              │  (RLS obligatorio)  │
              └─────────────────────┘
```

La firma pública de `src/lib/data/*` (mocks) **no cambia** cuando llegue la
migración. Los clientes creados aquí son los que consumirán esos datos reales.

### Flujo de activación gradual (futura Fase 1)

1. Crear proyecto Supabase (con aprobación de costo).
2. Volcar env vars (`URL`, `publishable_key`, `secret_key`, `project_ref`).
3. Escribir migraciones iniciales en `supabase/migrations/`.
4. Activar **RLS** en cada tabla.
5. Migrar `src/lib/data/*` uno a uno (LMS primero, CRM después).
6. Cambiar `NEXT_PUBLIC_AUTH_MODE=supabase`.

Hasta el paso 6, el modo demo permanece activo.

---

## 4. Cinco vías para operar Supabase (Management API es la canónica para DDL desde Mavis)

Son **cinco vías distintas** de operar Supabase. La fase bootstrap usó **configuración de código**; el camino canónico para que Mavis ejecute DDL/migrations desde sesión es **Management API**.

| Vía | Qué es | Cuándo se usa | Estado Qlick (2026-07-11) |
| --- | ------ | ------------- | ------------------------- |
| **Management API** | `POST https://api.supabase.com/v1/projects/{ref}/database/query` con `SUPABASE_ACCESS_TOKEN`. Ejecuta SQL real (DDL+DML) en un solo batch. | **Camino canónico para DDL desde Mavis.** Ver `docs/AGENT_SUPABASE_PROTOCOL.md` §11. | ✅ Operativo. `scripts/apply-migration-management.mjs` lo usa. |
| **MCP** | Model Context Protocol server (`supabase-mcp`). Permite al agente listar proyectos, generar types, leer advisors. | Si se quiere automatizar más allá de DDL (ej. inspeccionar schema desde el agente). | ⏸️ No usado. Preferimos Management API (más simple). |
| **CLI** (`supabase`) | Herramienta local para migraciones, push de schema, login. | Desarrollo local con DB local. | ⚠️ `npx supabase db push` da 401 con token actual. No funciona en Qlick. |
| **Dashboard** | UI web de Supabase (table editor, SQL editor, auth, advisors). | Inspección visual, fallback final. | ✅ Operativo. SQL Editor es el **último recurso** cuando Management API falla. |
| **Código** (`@supabase/supabase-js`, `@supabase/ssr`) | Clientes en Next.js que leen/escriben la DB. | Runtime de la app. | ✅ Operativo. `SUPABASE_SECRET_KEY` + `SUPABASE_PROJECT_REF`. |

> El camino `pg` + pooler (`scripts/exec-sql.mjs`) **ya no funciona** en Qlick (pooler DNS intermitente, password drift). NO usar. Usar siempre Management API.

---

## 5. Riesgos de seguridad

| Riesgo | Mitigación aquí |
| ------ | --------------- |
| **Filtrar `secret_key`/service_role al navegador.** | `supabase/admin.ts` valida `typeof window === 'undefined'` y lanza en cliente. Tipado con marker. |
| **Commitear `.env.local`.** | `.gitignore` ya lo excluye. Solo se versionan `.env.example` con valores vacíos. |
| **Build roto por falta de env vars.** | `health.ts` valida presencia sin lanzar; los clientes lanzan solo cuando se invocan. |
| **`NEXT_PUBLIC_*` expone claves sensibles.** | Solo `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` son públicas. La `secret_key` nunca tiene prefijo `NEXT_PUBLIC_`. |
| **RLS desactivado en tablas reales.** | Documentado como bloqueador: nada de datos reales hasta RLS + aviso de privacidad. |
| **Datos reales sin consentimiento.** | Bloqueador explícito (regla del proyecto y LFPDPPP). |
| **Crear proyecto/branch con costo sin autorización.** | `AGENT_SUPABASE_PROTOCOL.md` lo prohíbe. |

---

## 6. Variables necesarias

Definidas en `.env.example` (valores vacíos). Resumen:

| Variable | Pública | Dónde se usa | Propósito |
| -------- | :-----: | ------------ | --------- |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | cliente + server + admin | URL del proyecto. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ✅ | cliente + server | Clave publishable (anon/publishable). Respeta RLS. |
| `SUPABASE_SECRET_KEY` | ❌ | admin (server-only) | Clave secreta/service role. **Solo servidor.** Bypassa RLS. |
| `SUPABASE_PROJECT_REF` | ❌ | scripts + Management API + CLI | Ref del proyecto (`ugpejblymtbwtsoiykyj`). **Público**, pero `vercel env pull` lo deja `""` — validar manualmente. |
| `SUPABASE_ACCESS_TOKEN` | ❌ | **Management API** | Token personal de David con scope sobre el proyecto. 44 chars, prefix `sbp_`. Creado en `https://supabase.com/dashboard/account/tokens`. **NO** committeable. |
| `SUPABASE_DB_PASSWORD` | ❌ | LEGACY (pooler/host directo) | Drift contra el real de Supabase. NO usar para DDL desde Mavis. Mantener solo si se necesita restaurar la conexión directa. |
| `NEXT_PUBLIC_APP_URL` | ✅ | redirects de auth | URL canónica de la app. |

### Notas de nomenclatura

- **`publishable_key`** es el nombre moderno de la vieja `anon_key`. Equivalente
  en funcionalidad; respeta RLS.
- **`secret_key`** ≡ `service_role_key`. **Bypassa RLS.** Por eso solo se usa
  server-side y jamás en un componente cliente.
- El `.env.example` anterior usaba `NEXT_PUBLIC_SUPABASE_ANON_KEY` /
  `SUPABASE_SERVICE_ROLE_KEY`. Se mantienen como **alias legacy** comentados para
  no romper setups previos, pero los clientes nuevos leen los nombres
  estandarizados.

### Regla dura

> Ningún archivo importado por un Client Component puede importar
> `supabase/admin.ts`. El ESLint/TS no lo fuerza automáticamente; el archivo
> lanza en runtime si se invoca en el navegador, y el protocolo del agente
> (§AGENTS) lo reafirma.

---

## 7. Flujo recomendado para agentes (camino canónico: Management API)

Ver `docs/AGENT_SUPABASE_PROTOCOL.md` (resumen) — **§11 es la sección crítica** que cualquier MAVIS debe leer antes de intentar correr SQL:

1. **Nunca** crear recursos cloud con costo sin aprobación explícita.
2. **Nunca** ejecutar DDL destructivo sin aprobación.
3. Trabajar con **migraciones versionadas** (`supabase/migrations/`).
4. Ejecutar **advisors** después de cualquier DDL.
5. **Documentar** cada acción Management API/CLI en el commit o doc.
6. **Mantener fallback demo** hasta que la migración real esté validada.
7. Si Management API falla (token 401, endpoint no disponible) → fallback a SQL Editor del dashboard. **NO improvisar** con pooler o host directo (están rotos). El tiempo "30 seg vs 30 min" de la memory legacy aplica solo aquí.

### Validar el setup antes de cualquier DDL

Cualquier MAVIS que arranque con el workspace debe correr esta validación ANTES de tocar SQL:

```bash
# 1. .env.local debe tener SUPABASE_PROJECT_REF y SUPABASE_ACCESS_TOKEN poblados:
Select-String -Path .env.local -Pattern "^SUPABASE_(PROJECT_REF|ACCESS_TOKEN)"

# 2. El token debe responder 200 a GET /v1/projects/{ref}:
node -e "fetch('https://api.supabase.com/v1/projects/'+process.env.SUPABASE_PROJECT_REF,{headers:{Authorization:'Bearer '+process.env.SUPABASE_ACCESS_TOKEN}}).then(r=>console.log('tokenStatus='+r.status))"

# 3. SELECT 1 read-only debe funcionar:
node --env-file=.env.local scripts/apply-migration-management.mjs scratch/test-supabase-conn.sql --dry-run
# (crear scratch/test-supabase-conn.sql con: SELECT 1 AS ok, current_database() AS db;)
```

Si alguno falla, consultar `docs/AGENT_SUPABASE_PROTOCOL.md` §11 §"Triggers runtime" antes de improvisar.

---

## 8. Próxima fase — Supabase Real Foundation

Cuando se apruebe avanzar, el orden recomendado es:

1. **Crear proyecto Supabase** (Free tier o pago, confirmado por el usuario).
2. **Volcar env vars** en `.env.local` y en Vercel (ver `VERCEL_ENV_SETUP.md`).
3. **Migraciones iniciales** en `supabase/migrations/`:
   - Schema de `User`, `Instructor`, `Course`, `Module`, `Lesson`, `Enrollment`,
     `LessonProgress`, `Payment`, `Coupon`, `Certificate`.
   - Tablas CRM: `Lead`, `LeadInteraction`, `CRMNote`, `CRMTask`,
     `Conversation*`, `Appointment`.
4. **RLS obligatorio** en cada tabla.
5. **Aviso de privacidad** publicado antes de capturar datos reales.
6. **Generar TypeScript types** (`supabase gen types typescript`).
7. Migrar `src/lib/data/*` → queries Supabase (misma firma pública).
8. Auth: reemplazar `mock-auth` por Supabase Auth (misma interfaz — D-004).
9. Cambiar `NEXT_PUBLIC_AUTH_MODE=supabase`.
10. Validar advisors de seguridad/performance.

> Antes de este punto, **no hay datos reales** de clientes, leads ni alumnos.

---

## 9. Referencias

- Clientes: `src/lib/supabase/` (`client.ts`, `server.ts`, `admin.ts`,
  `config.ts`, `health.ts`, `index.ts`).
- Diagnóstico: `/admin/system/supabase` y `src/lib/supabase/health.ts`.
- Estructura DB futura: `supabase/` (`README.md`, `migrations/`, `seed.sql`,
  `config.example.toml`).
- Protocolo del agente: `docs/AGENT_SUPABASE_PROTOCOL.md`.
- Runbook MCP: `docs/SUPABASE_MCP_RUNBOOK.md`.
- Env vars en Vercel: `docs/VERCEL_ENV_SETUP.md`.
- Validador local: `npm run check:supabase` (`scripts/check-supabase-env.mjs`).
- Decisiones previas relevantes: D-003 (sin ORM en MVP), D-004 (auth mock),
  D-014 (CRM demo) en `docs/DECISIONS.md`.
