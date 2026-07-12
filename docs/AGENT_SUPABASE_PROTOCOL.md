# Protocolo del Agente — Supabase

> **Fuente canónica.** Este doc es la fuente de verdad para operar
> Supabase en Qlick (DDL, migraciones, advisors, secretos, RLS, datos
> reales). El índice cross-cutting para AI agents vive en
> `.harness/docs/project-standards.md` (§6 Supabase gate), y el scope del
> rein que opera Supabase en `.harness/reins/supabase-expert/agent.md`.
> Si hay conflicto, gana este doc.

**Fecha:** 2026-06-23
**Audiencia:** cualquier agente (humano o IA) que opere Supabase en este repo.

Reglas **no negociables** para operar Supabase de forma controlada. Están
pensadas para evitar costos sorpresa, destrucción de datos y exposición de
secretos.

---

## 1. Sin recursos cloud con costo sin aprobación

El agente **no** puede:

- Crear proyectos Supabase.
- Crear branches de Supabase.
- Cambiar de plan (Free → Pro) ni activar add-ons.
- Aprovisionar nada que genere un cargo recurrente o de un solo uso.

Sin una confirmación **explícita** del usuario en el hilo actual. La
aprobación en sesiones anteriores **no** extiende a la actual.

> Ante la duda, el agente se detiene, describe la acción y su costo, y espera.

---

## 2. Sin DDL destructivo sin aprobación

El agente **no** puede ejecutar, ni sugerir ejecutar, ninguna sentencia que
destruya datos o estructura sin aprobación explícita. Incluye:

- `DROP TABLE`, `DROP SCHEMA`, `DROP DATABASE`
- `TRUNCATE`
- `ALTER TABLE ... DROP COLUMN`
- `DELETE FROM ...` sin `WHERE` (o sobre producción)
- `db reset`, `migration repair`, `migration rm`

Operaciones idempotentes (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT
EXISTS`, `ALTER TABLE ... ADD COLUMN` con default) son aceptables dentro de una
migración **versionada** y con el respaldo del usuario.

---

## 3. Trabajar con migraciones versionadas

Todo cambio de schema va en:

```
supabase/migrations/YYYYMMDDHHMMSS_descripcion.sql
```

Reglas:

- **Una migración = un cambio atómico.** No apilar 10 cambios heterogéneos en
  un solo archivo.
- **Idempotente cuando sea posible** (`IF NOT EXISTS`, `IF EXISTS`).
- **Una vez aplicada a producción, no se edita.** Si hay que corregir, se añade
  una migración nueva. Editar una migración ya aplicada rompe la consistencia
  entre entornos.
- **SQL claro y comentado.** Cada migración lleva un header con propósito y
  referencia al ADR/ticket.

---

## 4. Verificar que las migrations están aplicadas a prod antes de cerrar el sprint

Una migration en el repo NO significa una migration en prod. El sprint
cierre-eventos-virtuales (2026-07-11) descubrió que la migration
`20260703180000_event_survey_tokens.sql` llevaba semanas commitada
pero nunca aplicada a prod. El código la asumía existente y los
tokens de encuesta se "perdía" silenciosamente hasta que el admin
UI empezó a fallar con `PGRST205`.

**Regla:** después de aplicar migrations a prod, **antes** de
declarar el sprint listo, correr:

```bash
node --env-file=.env.local scripts/audit-migrations-applied.mjs
```

El script parsea las migrations locales (`CREATE TABLE`, `ADD COLUMN`,
`CREATE INDEX`) y las cruza con el OpenAPI spec de PostgREST + introspección
de columnas. Reporta:

- **TABLAS pendientes** (CREATE TABLE en migration, no existe en prod)
- **COLUMNAS pendientes** (ADD COLUMN en migration, no existe en prod)
- **ÍNDICES** (no auditables vía PostgREST — ver `pg_indexes` en SQL Editor)

Si el script marca pendientes, **bloquea** el avance a features
nuevas hasta aplicar las migrations faltantes a prod.

**Hard-fail gate pre-merge a main:** un PR que introduce una
migration nueva debe pasar este audit. Si el script marca la
migration como pendiente, el merge queda bloqueado.

Disponible también como `npm run audit:migrations`.

---

## 5. Ejecutar advisors después de DDL

Después de cualquier DDL, el agente ejecuta los advisors de Supabase
(security + performance) y reporta hallazgos en el commit/doc.

```text
herramienta MCP: supabase_list_advisors
CLI equivalente: npx supabase inspect db ... (según la métrica)
```

No se "silencian" advisors sin justificación documentada. Si un advisor marca
"RLS disabled" en una tabla, **bloquea** el avance a datos reales.

---

## 6. Documentar cada acción MCP/CLI

Cada acción MCP/CLI que afecte el estado del proyecto se documenta en el commit
o en un doc `*_REPORT.md`, con:

- Herramienta/CLI usado.
- Proyecto afectado (ref).
- Parámetros (sin secretos).
- Resultado.
- Aprobación humana (sí/no, quién).
- Siguiente paso.

Ver plantilla en `docs/SUPABASE_MCP_RUNBOOK.md` §11.

---

## 7. Mantener fallback demo hasta validar la migración real

La app debe poder correr **sin Supabase** (modo demo) hasta que la migración
real esté validada de punta a punta:

- LMS migrado (al menos lectura).
- CRM migrado (lectura + escritura, con RLS).
- Auth real activo.
- Aviso de privacidad publicado.

Hasta entonces:

- `NEXT_PUBLIC_AUTH_MODE=mock` por defecto.
- Los mocks de `src/lib/data/*` siguen siendo la fuente de la app.
- `checkSupabaseConfig()` puede devolver `configured: false` sin que nada se
  rompa.

---

## 8. Secretos

- **Nunca** commitear claves (`.env.local` está en `.gitignore`).
- **Nunca** poner claves en `NEXT_PUBLIC_*` (excepto URL y publishable key).
- **Nunca** importar `src/lib/supabase/admin.ts` desde un Client Component.
- **Nunca** imprimir valores de claves en logs, responses ni documentación.
- Si se detecta una fuga (clave en git, en log, en URL): rotar inmediatamente y
  documentar el incidente.

---

## 9. Privacidad / RLS / Aviso de privacidad

Bloqueadores duros para capturar datos reales de clientes/leads/alumnos:

1. RLS (Row Level Security) activo en todas las tablas con datos personales.
2. Políticas explícitas por rol.
3. **Aviso de privacidad publicado** (LFPDPPP — México).
4. Consentimiento explícito en formularios (ya existe en `/contacto`).

Hasta cumplir 1–4, **no** se capturan datos reales. El CRM y el formulario
siguen en modo demo.

---

## 10. Resumen — qué puede y qué no puede hacer el agente

| Acción | ¿Agente solo? |
| ------ | :-----------: |
| Leer advisors | ✅ |
| Leer config del proyecto | ✅ |
| Ejecutar `SELECT` de diagnóstico | ✅ |
| Escribir migración SQL en disco | ✅ |
| Aplicar migración a DB local (`supabase db push` local) | ⚠️ con cuidado |
| Aplicar migración a remoto vía **Management API** (`apply-migration-management.mjs`) | ⚠️ con cuidado (ver §11) |
| Crear proyecto / branch / plan | ❌ requiere aprobación |
| DDL destructivo | ❌ requiere aprobación |
| Rotar claves | ❌ requiere aprobación |
| Cambiar políticas RLS existentes | ❌ requiere aprobación |
| Subir claves al repo | ❌ prohibido siempre |

---

## 11. Camino canónico para DDL: Management API de Supabase (validado 2026-07-11)

**El agente NO usa `scripts/exec-sql.mjs` (pooler) ni host directo con `SUPABASE_DB_PASSWORD`** — ambos caminos han estado rotos durante semanas. El camino canónico es la **Management API de Supabase**, ejecutada vía `scripts/apply-migration-management.mjs`.

### Por qué este camino (resumen del diagnóstico)

1. **Pooler** (`aws-0-us-west-1.pooler.supabase.com:6543`): `ENOTFOUND`. DNS intermitente conocido. NO usar.
2. **Host directo** (`db.{ref}.supabase.co:5432`): `SUPABASE_DB_PASSWORD` drift contra el real de Supabase. 3+ regeneraciones de David no propagaron. NO usar.
3. **Management API** (`https://api.supabase.com/v1/projects/{ref}/database/query`): funciona end-to-end con `SUPABASE_ACCESS_TOKEN`. Validado con `SELECT 1` y `CREATE TYPE`+`DROP TYPE` el 2026-07-11. **Este es el camino.**

### Requisitos en `.env.local`

| Variable | Tipo | Notas |
| -------- | :--: | ----- |
| `SUPABASE_PROJECT_REF` | público | Ref del proyecto (`ugpejblymtbwtsoiykyj`). **Trampa:** `vercel env pull` lo deja `""`. Validar manualmente. |
| `SUPABASE_ACCESS_TOKEN` | sensitive | 44 chars, prefix `sbp_`. Creado en `https://supabase.com/dashboard/account/tokens` con scope suficiente para `database/query`. **NO** es el `SUPABASE_SECRET_KEY` (publishable). |

`SUPABASE_DB_PASSWORD` queda LEGACY. NO se usa para DDL desde Mavis.

### Patrón de uso

```bash
# 1. Validar env vars y token (antes de cualquier DDL):
node -e "fetch('https://api.supabase.com/v1/projects/'+process.env.SUPABASE_PROJECT_REF,{headers:{Authorization:'Bearer '+process.env.SUPABASE_ACCESS_TOKEN}}).then(r=>console.log('tokenStatus='+r.status))"

# 2. Preview sin ejecutar:
node --env-file=.env.local scripts/apply-migration-management.mjs archivo.sql --dry-run

# 3. Aplicar a Supabase:
node --env-file=.env.local scripts/apply-migration-management.mjs archivo.sql
```

El script `scripts/apply-migration-management.mjs` ejecuta el SQL completo (DDL + DML + SELECT) en un solo batch via Management API. Soporta `DO $$ ... $$;`, multi-statement, `IF EXISTS` / `IF NOT EXISTS` / `ON CONFLICT DO NOTHING`. NO requiere DB password.

### Triggers runtime

- **Token 401**: regenerar `SUPABASE_ACCESS_TOKEN` en `https://supabase.com/dashboard/account/tokens` y actualizar las 3 ubicaciones (`.env.local`, `$env:User` Windows scope, `~/.mavis/api-box.env` vault).
- **`SUPABASE_PROJECT_REF=""`**: poblar manualmente. `vercel env pull` miente para esta var (no es sensitive, pero el pull inicial a veces la deja vacía).
- **SQL syntax error 400**: revisar la query. El endpoint valida SQL como cualquier cliente.
- **Timeout 500**: query muy larga (>5MB o >10s). Split en migrations más chicas.

### Anti-patterns explícitos

- ❌ `scripts/exec-sql.mjs` con pooler → `ENOTFOUND`.
- ❌ `scripts/exec-sql.mjs` con host directo → `28P01 password authentication failed`.
- ❌ `supabase db push` con token sin scope `sql:write` → 401.
- ❌ Regenerar `SUPABASE_DB_PASSWORD` esperando arreglar drift. El drift es entre la copia local y el real de Supabase.
- ❌ Pegar el `SUPABASE_ACCESS_TOKEN` en docs, logs o commits. La memory operativa dice "Tokens NO se 'queman' por chat".

### Cuándo SÍ usar SQL Editor del dashboard

Único caso: cuando **todo lo demás falla** (token revocado, Management API no disponible, DB password drift). Es el FALLBACK FINAL, no el camino principal. El tiempo "30 seg vs 30 min" sigue válido pero solo aplica a este caso.

### Diagnóstico si reaparece drift

Ver `memory/archive/qlick-supabase-2026-07-11.md` (Qlick) o la sección "Supabase Management API" en `~/.mavis/agents/mavis/memory/MEMORY.md` (cross-project) para el árbol de decisión completo.

---

## Referencias

- Bootstrap de conexión: `docs/SUPABASE_CONNECTION_BOOTSTRAP.md` (también actualizado para reflejar Management API)
- Runbook MCP: `docs/SUPABASE_MCP_RUNBOOK.md` (LEGACY — el camino principal ahora es Management API, no MCP)
- Env vars en Vercel: `docs/VERCEL_ENV_SETUP.md`
- Decisiones previas: D-003, D-004, D-014 en `docs/DECISIONS.md`
- Aviso de privacidad y consentimiento: ya parcial en `/contacto` y
  `docs/CONTACT_AND_WHATSAPP_STRATEGY.md`
- Memory operativa Mavis: `~/.mavis/agents/mavis/memory/MEMORY.md` §"Supabase Management API"
- Archivo histórico Qlick: `~/.mavis/agents/mavis/memory/archive/qlick-supabase-2026-07-11.md`
