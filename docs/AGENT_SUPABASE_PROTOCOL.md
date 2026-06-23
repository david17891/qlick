# Protocolo del Agente — Supabase

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

## 4. Ejecutar advisors después de DDL

Después de cualquier DDL, el agente ejecuta los advisors de Supabase
(security + performance) y reporta hallazgos en el commit/doc.

```text
herramienta MCP: supabase_list_advisors
CLI equivalente: npx supabase inspect db ... (según la métrica)
```

No se "silencian" advisors sin justificación documentada. Si un advisor marca
"RLS disabled" en una tabla, **bloquea** el avance a datos reales.

---

## 5. Documentar cada acción MCP/CLI

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

## 6. Mantener fallback demo hasta validar la migración real

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

## 7. Secretos

- **Nunca** commitear claves (`.env.local` está en `.gitignore`).
- **Nunca** poner claves en `NEXT_PUBLIC_*` (excepto URL y publishable key).
- **Nunca** importar `src/lib/supabase/admin.ts` desde un Client Component.
- **Nunca** imprimir valores de claves en logs, responses ni documentación.
- Si se detecta una fuga (clave en git, en log, en URL): rotar inmediatamente y
  documentar el incidente.

---

## 8. Privacidad / RLS / Aviso de privacidad

Bloqueadores duros para capturar datos reales de clientes/leads/alumnos:

1. RLS (Row Level Security) activo en todas las tablas con datos personales.
2. Políticas explícitas por rol.
3. **Aviso de privacidad publicado** (LFPDPPP — México).
4. Consentimiento explícito en formularios (ya existe en `/contacto`).

Hasta cumplir 1–4, **no** se capturan datos reales. El CRM y el formulario
siguen en modo demo.

---

## 9. Resumen — qué puede y qué no puede hacer el agente

| Acción | ¿Agente solo? |
| ------ | :-----------: |
| Leer advisors | ✅ |
| Leer config del proyecto | ✅ |
| Ejecutar `SELECT` de diagnóstico | ✅ |
| Escribir migración SQL en disco | ✅ |
| Aplicar migración a DB local (`supabase db push` local) | ⚠️ con cuidado |
| Aplicar migración a remoto/producción | ❌ requiere aprobación |
| Crear proyecto / branch / plan | ❌ requiere aprobación |
| DDL destructivo | ❌ requiere aprobación |
| Rotar claves | ❌ requiere aprobación |
| Cambiar políticas RLS existentes | ❌ requiere aprobación |
| Subir claves al repo | ❌ prohibido siempre |

---

## Referencias

- Bootstrap de conexión: `docs/SUPABASE_CONNECTION_BOOTSTRAP.md`
- Runbook MCP: `docs/SUPABASE_MCP_RUNBOOK.md`
- Env vars en Vercel: `docs/VERCEL_ENV_SETUP.md`
- Decisiones previas: D-003, D-004, D-014 en `docs/DECISIONS.md`
- Aviso de privacidad y consentimiento: ya parcial en `/contacto` y
  `docs/CONTACT_AND_WHATSAPP_STRATEGY.md`
