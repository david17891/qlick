# Runbook MCP de Supabase — Qlick Marketing Integral

**Fecha:** 2026-06-23
**Estado:** documento de referencia. **No hay MCP conectado todavía.**
**Audiencia:** el agente y cualquier operador humano que use el
[Supabase MCP server](https://github.com/supabase/mcp-supabase).

> ⚠️ Toda acción con costo o destructiva requiere aprobación humana explícita
> (ver `docs/AGENT_SUPABASE_PROTOCOL.md`).

---

## 0. Qué es el MCP de Supabase

El MCP (Model Context Protocol) server de Supabase expone herramientas para que
un agente opere un proyecto Supabase: listar proyectos, ejecutar SQL, generar
types TypeScript, leer advisors, gestionar migraciones, etc.

Para activarlo en este repo haría falta:
1. Instalar/configurar el MCP server (`supabase-mcp`) en el entorno del agente.
2. Proveer credenciales (Personal Access Token o claves OAuth de Supabase).
3. Apuntar al project ref que se quiera operar.

**Este proyecto aún no tiene MCP configurado.** Lo siguiente son las
instrucciones para cuando se quiera habilitar.

---

## 1. Listar proyectos Supabase

```text
# Vía MCP (cuando esté configurado):
herramienta: supabase_list_projects

# Vía CLI equivalente:
npx supabase projects list
```

Salida esperada: nombre del proyecto, region, status y **project ref**.

> El `project ref` es el identificador único que se pone en `SUPABASE_PROJECT_REF`.

---

## 2. Seleccionar proyecto

```text
herramienta: supabase_get_project  (parámetro: projectId = SUPABASE_PROJECT_REF)
```

Esto fija el proyecto sobre el que operan las herramientas siguientes
(SQL, advisors, etc.).

> Regla: el agente **no cambia** de proyecto sin confirmación humana.

---

## 3. Confirmar costo antes de crear proyecto o branch

Acciones que **siempre** requieren aprobación explícita del usuario:

| Acción | Riesgo |
| ------ | ------ |
| Crear un proyecto nuevo | Puede salir del Free tier → costo. |
| Crear un branch de Supabase | Consumo adicional. |
| Cambiar el plan (Free → Pro) | Cargo recurrente. |
| Activar add-ons (Auth MFA, Point-in-time recovery) | Cargo recurrente. |

**Protocolo del agente:** antes de cualquiera de estas acciones, el agente debe:

1. Describir la acción y su costo esperado.
2. Esperar confirmación explícita del usuario.
3. Documentar la acción y la aprobación en el commit/doc.

> Si no hay confirmación, el agente **detiene** la operación y deja instrucciones
> manuales.

---

## 4. Obtener la Project URL

```text
Dashboard: Project Settings → API → Project URL
Formato:   https://<project-ref>.supabase.co
Env var:   NEXT_PUBLIC_SUPABASE_URL
```

Vía MCP/CLI no se "obtiene" como tal: se construye con el project ref.

---

## 5. Obtener la publishable key

```text
Dashboard: Project Settings → API → Project API keys → "anon/public" (publishable)
Env var:   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

> En la UI moderna de Supabase, la clave "anon" se llama **publishable key**.
> Equivalente funcional: pública, respeta RLS.

Vía MCP/CLI no se imprime directamente por seguridad; se consulta desde el
Dashboard o se rota con `supabase projects api-keys ...` (CLI autenticada).

---

## 6. Configurar env vars localmente

1. Copiar la plantilla:
   ```bash
   cp .env.example .env.local
   ```
2. Completar los valores Supabase en `.env.local`:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable>
   SUPABASE_SECRET_KEY=<secret>          # server-only
   SUPABASE_PROJECT_REF=<project-ref>
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```
3. Verificar:
   ```bash
   npm run check:supabase
   ```
   Debe pasar a "Configurado" sin imprimir secretos.
4. Reiniciar `npm run dev`.

> `.env.local` está en `.gitignore`. **Nunca** commitear valores reales.

---

## 7. Configurar env vars en Vercel

Ver `docs/VERCEL_ENV_SETUP.md` (detalle completo). Resumen:

1. Vercel → proyecto `qlick` → **Settings → Environment Variables**.
2. Añadir las mismas 5 variables, marcando los entornos (Production / Preview /
   Development).
3. **`SUPABASE_SECRET_KEY`**: marcar como **sensitive** (Vercel la oculta tras
   guardarla). NUNCA con prefijo `NEXT_PUBLIC_`.
4. Redeploy para que tome las nuevas variables.

---

## 8. Generar TypeScript types (si hay proyecto)

```bash
# Requiere CLI autenticada y proyecto linkado.
npx supabase link --project-ref <SUPABASE_PROJECT_REF>
npx supabase gen types typescript --linked > src/types/supabase.ts
```

Salida: un `src/types/supabase.ts` con los tipos del schema.

> Si el MCP está conectado, la herramienta equivalente genera los types sin
> pasar por la CLI. El destino sugerido es el mismo (`src/types/supabase.ts`).

`src/types/supabase.ts` **sí** se commitea (no contiene secretos, solo tipos).

---

## 9. Revisar advisors de seguridad/performance

```text
herramienta: supabase_list_advisors   (parámetro: projectId)
```

Los advisors cubren, entre otros:

- **Security:** RLS habilitado, claves expuestas, políticas abiertas, funciones
  con `search_path` inseguro.
- **Performance:** índices faltantes, queries lentas, tablas sin estadísticas.

**Protocolo del agente:** después de cualquier DDL (crear tabla, índice,
política), ejecutar advisors y reportar hallazgos en el commit.

> No "silenciar" advisors sin justificación documentada.

---

## 10. Acciones que requieren confirmación humana

Lista no exhaustiva (ver `AGENT_SUPABASE_PROTOCOL.md`):

- Crear/eliminar proyecto o branch.
- `db push`, `db reset`, `migration repair`, `migration list --linked` (lectura).
- Cualquier DDL destructivo (`DROP TABLE`, `TRUNCATE`, `ALTER ... DROP COLUMN`).
- Cambiar políticas RLS existentes.
- Rotar/crear claves (incl. service role).
- Cambiar el plan de billing.
- Borrar datos de producción (aunque sea "de prueba").

**Operaciones de solo lectura** que el agente puede hacer sin aprobación
adicional (siempre y cuando el proyecto ya exista):

- `supabase_list_projects`
- `supabase_get_project`
- `supabase_list_advisors`
- `supabase_execute_sql` con un `SELECT` de diagnóstico (sin `WRITE`)

---

## 11. Plantilla de bitácora MCP

Cada vez que se use MCP, dejar registro en el commit o en
`docs/CRM_IMPLEMENTATION_REPORT.md`-estilo:

```markdown
### Acción MCP — <fecha>
- Herramienta: <nombre>
- Proyecto: <ref>
- Parámetros: <resumen, sin secretos>
- Resultado: <éxito/fallo + resumen>
- Aprobación humana: <sí/no, quién>
- Siguiente paso: <acción derivada>
```

---

## 12. Si no hay MCP/credenciales

Si el agente no tiene MCP ni credenciales, **no improvisar**:

1. Dejar **instrucciones manuales** (este runbook + Dashboard).
2. Documentar qué se intentó y por qué no se pudo automatizar.
3. No pedirle al usuario claves en texto plano por chat; orientarlo a meterlas
   en `.env.local` / Vercel directamente.

---

## Referencias

- MCP Supabase: https://github.com/supabase/mcp-supabase
- Docs oficiales MCP: https://supabase.com/docs/guides/getting-started/mcp
- CLI: https://supabase.com/docs/reference/cli/introduction
- Protocolo del agente: `docs/AGENT_SUPABASE_PROTOCOL.md`
- Bootstrap de conexión: `docs/SUPABASE_CONNECTION_BOOTSTRAP.md`
