# Supabase Connection Bootstrap — Qlick Marketing Integral

**Fecha:** 2026-06-23
**Rama:** `feature/supabase-connection-bootstrap`
**Base:** `main` @ `d3fc093` (tag `v0.2.0-qlick-lms-crm-demo`)
**Estado:** capa de conexión lista. **Sin proyecto Supabase creado todavía.**
**Sin datos reales.** Toda la app sigue operando con los mocks.

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

| ❌ No hecho | Por qué |
| ---------- | ------- |
| Reemplazar mocks del LMS | Pendiente de Fase 1 (Supabase Real Foundation). |
| Reemplazar mocks del CRM | Idem. El CRM sigue devolviendo `demo: true`. |
| Crear proyecto Supabase | Requiere confirmación explícita (posible costo). |
| Crear schema/tablas reales | Las migraciones quedan vacías (placeholders). |
| Ejecutar migraciones | Pendiente de aprobación + proyecto existente. |
| Auth real | `NEXT_PUBLIC_AUTH_MODE` sigue en `mock`. |
| RLS activo | Se documenta, pero no hay tablas todavía. |
| Subir claves | Solo `.env.example` con valores vacíos. |
| Service role en cliente | Prohibido (ver §6). |
| Cambios grandes de UI | Solo un panel interno de diagnóstico (`/admin/system/supabase`). |

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

## 4. MCP vs CLI vs Dashboard vs código

Son **cuatro vías distintas** de operar Supabase. Esta fase usa solo
**configuración de código**; las otras tres se documentan en
`docs/SUPABASE_MCP_RUNBOOK.md`.

| Vía | Qué es | Cuándo se usa | Costo |
| --- | ------ | ------------- | ----- |
| **MCP** | Model Context Protocol server (`supabase-mcp`). Permite al agente listar proyectos, generar types, leer advisors. | Cuando hay un proyecto y se quiere automatizar desde el agente. | El del proyecto subyacente. |
| **CLI** (`supabase`) | Herramienta local para migraciones, push de schema, login. | Desarrollo local con DB local o remoto. | Gratis. |
| **Dashboard** | UI web de Supabase (table editor, SQL editor, auth, advisors). | Inspección visual, operaciones puntuales. | Según plan. |
| **Código** (`@supabase/supabase-js`, `@supabase/ssr`) | Clientes en Next.js que leen/escriben la DB. | **Lo único que añade esta fase.** | El de las queries del runtime. |

> Esta mini fase **no requiere** MCP, CLI ni Dashboard: el código compila sin
> proyecto. Se deja documentado el día que se necesiten.

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
| `SUPABASE_SECRET_KEY` | ❌ | admin (server-only) | Clave secreta/service role. **Solo servidor.** |
| `SUPABASE_PROJECT_REF` | ❌ | runbooks MCP/CLI | Ref del proyecto (para CLI/MCP). |
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

## 7. Flujo recomendado para agentes

Ver `docs/AGENT_SUPABASE_PROTOCOL.md` (resumen):

1. **Nunca** crear recursos cloud con costo sin aprobación explícita.
2. **Nunca** ejecutar DDL destructivo sin aprobación.
3. Trabajar con **migraciones versionadas** (`supabase/migrations/`).
4. Ejecutar **advisors** después de cualquier DDL.
5. **Documentar** cada acción MCP/CLI en el commit o doc.
6. **Mantener fallback demo** hasta que la migración real esté validada.
7. Si no hay MCP/credenciales → dejar **instrucciones manuales** (no improvisar).

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
