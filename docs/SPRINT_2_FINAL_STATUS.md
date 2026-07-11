# Sprint 2 Bot v2 — Estado Final de Cierre

**Fecha de cierre:** 2026-07-10
**PRs abiertos en GitHub:**
- PR #8 (`feat/bot-v2` → main) — Sprint 2 code: 916 tests verde
- PR #9 (`feat/bot-v2-admin-toggle` → main) — Sprint 2.1 toggle admin: 925 tests verde
**Migración Supabase aplicada por David:** 2026-07-10 (fila seedeada verificada: `value=false`)

## 1. Resumen ejecutivo

El Sprint 2 cerró la primera iteración del **Motor IA Socrático y Captura
de Leads v2** del bot de WhatsApp de Qlick. En orden cronológico:

| Sub-sprint | Commit | Qué entrega | Tests añadidos |
|---|---|---|---|
| Diseño | `165e45d` | `docs/SPRINT_2_BOT_V2_DESIGN.md` (mejoras + tests aceptación A-G) | — |
| **2A** Tool atómica | `cb4322e` | `agent-tools.ts` + `tool-executors/extract-contact.ts` | +36 |
| **2B** System prompt v2 | `103f483` | 3 patches mínimos al prompt (Método Socrático) | +21 |
| **2C** Function-calling | `70567d0` | `runWithToolLoop` + Kill Switch `DEEPSEEK_TOOLS_ENABLED` | +21 |
| **2D** Integración bot-engine | `ab1c072` | Cableado `leadId` + `supabaseForTool` en el contexto del agente | +14 |
| **2.1** Toggle admin | `7e9f60e` | Tabla `system_settings` + UI toggle iOS en `/admin/system/bot-v2` | +9 |
| TOTAL | 6 commits | 7 archivos nuevos | **+101 tests** |

**Acumulado `feat/bot-v2`: 824 tests → 925 tests** (incluyendo los del Sprint 1).

## 2. Estado del toggle en producción

```
┌────────────────────────────────────────────────────────────────┐
│  system_settings.deepseek_tools_enabled                        │
│  ─────────────────────────────────────────────────────────────  │
│  • DB seeded con `false` (Sprint 1 behavior por default)       │
│  • RLS habilitado (policies aplicadas vía Bloque 2)            │
│  • Trigger updated_at activo                                    │
│  • Toggle UI: APAGADO (puede prenderse desde                  │
│    /admin/system/bot-v2 sin redeploy)                          │
└────────────────────────────────────────────────────────────────┘
```

El bot actualmente corre en **modo Sprint 1** (single-shot DeepSeek,
captura determinista por regex). Para activar el v2, David hace clic en
el switch desde `/admin/system/bot-v2`. La caché de 30s asegura que el
siguiente mensaje del bot use el valor nuevo.

## 3. Variables de entorno en Vercel

Comando de inspección: `vercel env ls`

```
DEEPSEEK_API_KEY               Production + Preview
DEEPSEEK_TOOLS_ENABLED         Preview (true, id 4aur1fUBTYvQWfzv)
                               Production: NO seteada (David la controla desde el panel)
BOT_V2_ENABLED                 NO EXISTE. Era abreviación mental de la anterior
                               según decisión del propio David el 2026-07-10.
                               NO requiere código adicional.
```

## 4. Fallback chain del flag (resolución en runtime)

Orden de prioridad que usa `deepseek-provider.ts:run()` para resolver
si el tool loop está activo:

```
1. DB system_settings.deepseek_tools_enabled
   └─ Caché in-memory TTL 30s (~5ms cold, 0ms hot)
   └─ Si DB falla (red/timeout) → sigue al paso 2 con el valor previo

2. Env var DEEPSEEK_TOOLS_ENABLED=true
   └─ Compatibilidad con deploy legacy

3. Default OFF → comportamiento Sprint 1 (single-shot, captura por regex)
   └─ Default SRE: si alguien deploya sin configurar NADA, el bot
      corre como Sprint 1 (probado, conocido, sin riesgo).
```

`isDeepseekToolsEnabled()` (sin args, sync) sigue exportada y retorna
boolean — la usan los tests del Sprint 2 y `deepseek-switch.test.mjs`.

## 5. Riesgo residual + plan de monitoreo (200 conversaciones)

David aprobó (sesión 2026-07-09): evaluar la tasa de conversión de
captura nombre+email a las **200 conversaciones reales**. Si está por
debajo del 40%, se itera el prompt en un Sprint 3.

Métricas a observar (no se trackearon automáticamente en este sprint):

- **Conversión captura**: `leads` actualizados por el tool / total de
  turnos en modo v2.
- **Latencia real**: distribución p50/p95/p99 del provider.run en
  producción (Vercel logs no las trackean automáticamente — alertar
  si p99 > 4000ms).
- **Alucinaciones del LLM**: si `validateAgentReply` rechaza
  respuestas por "descuento" o "prohib", es señal de drift del prompt.
- **2ª llamada 5xx**: loggear frecuencia. Si >5%, considerar mover
  el cache LLM a un tier superior o re-evaluar el provider.

Plan de revisión sugerido: tras **50**, **100** y **200** conversaciones
v2 activas, capturar transcripts de conversaciones donde NO hubo
captura automática y leer 5-10 al azar para identificar patrones.

## 6. Commits + línea de tiempo

```
2026-07-10 02:36Z  Migración system_settings aplicada por David en prod
2026-07-10 02:24Z  Sprint 2.1 toggle admin commiteado (7e9f60e)
2026-07-10 02:08Z  Sprint 2D integracion bot-engine commiteado (ab1c072)
2026-07-10 01:50Z  Sprint 2C function-calling commiteado (70567d0)
2026-07-10 01:47Z  Sprint 2C diseño aprobado (commit docs)
2026-07-10 01:28Z  Sprint 2B system prompt socratico commiteado (103f483)
2026-07-10 00:46Z  Sprint 2A tool atomica consolidada commiteada (cb4322e)
2026-07-10 00:08Z  Diseño Sprint 2 aprobado por David (165e45d)
```

## 7. Out-of-scope explícito (no entra al sprint)

- Multi-tool paralelo (varios tool_calls paralelos en 1 turno).
- Streaming de respuesta.
- Métricas p50/p95/p99 por turno.
- Alertas Brevo/Slack cuando tool_exec_failures > 5%.
- Persistencia de `transcript.jsonl` para análisis post-Sprint 3.

## 8. Cómo verificar el toggle en la UI (lista de David)

1. Esperar merge de PR #9 a `main` (cuando tú decidas) + deploy de Vercel.
2. Visitar `/admin/system/bot-v2` (autenticado como admin).
3. Verificar el switch en **⚪ APAGADO** (estado inicial = `false`).
4. Click → switch pasa a **🟢 ACTIVADO** instantáneamente.
5. Enviar un mensaje de WhatsApp al bot desde otro teléfono.
6. El bot usa ahora el tool loop (respuesta más humana, +tool call).
7. Click otra vez para apagar → comportamiento Sprint 1 inmediato
   (cache 30s aplica el cambio en el siguiente turno).

## 9. Próximos pasos sugeridos (David)

- **Inmediato:** merge PR #9 → main cuando quieras. Deploy automático.
- **Post-merge:** clic en el toggle desde `/admin/system/bot-v2`.
- **A 50 conv v2:** revisar primeros transcripts.
- **A 200 conv v2:** decidir si iterar (Sprint 3) o mantener.
