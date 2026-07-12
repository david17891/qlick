# HANDOFF — Sprint v0.9.6 Bot Simulator (Laboratorio IA)

> **Rama:** `feat/fase-17-1-bot-simulator`
> **Commits:** 2 commits atómicos (backend, frontend) + 1 commit de docs
> **PR:** abierto a `main` (link en `data/PROJECT-LOG.md` entrada `2026-07-12 02:30`)
> **Fecha:** 2026-07-12 02:30 Phoenix
> **Estado:** ✅ Validado local + suite 1198/1198 + type-check 0 + lint 0/0 + build OK

---

## 🎯 Qué cambió

Cierra la **Torre de Control del Bot de WhatsApp** con un **Laboratorio de Pruebas & Simulador IA** dentro del panel admin (`/admin?tab=bot → 🧪 Laboratorio`). David puede:

- Probar respuestas del bot en **modo sandbox** (sin enviar a Meta Cloud API, sin consumir cupo, sin afectar contadores).
- **Override de modo** desde la UI (Socrático v1, Socrático v2, Súper Ejecutivo) sin redeploy.
- Ver **telemetría completa** del turno: modo activo, costo USD, tokens (prompt/completion/total), intención clasificada, tools ejecutadas, reglas de oro inyectadas, evento activo.
- Simular con **lead ficticio** (memoria pura) o **lead del CRM** (UUID, hidrata perfil).
- Respetar o ignorar la **pausa per-lead** (`bot_paused_for_lead`).
- Probar el comportamiento de las **Reglas de Oro** sin que entren al bot real.

**Antes:** cualquier prueba de comportamiento requería enviar un WhatsApp real a un número de prueba (gastaba cupo Meta) o leer logs de producción (sin control de inputs).

**Ahora:** un panel admin dedicado con chat sandbox, telemetría en tiempo real y costo acumulado de sesión.

---

## 🛡️ Garantías de aislamiento (verificadas por 13 tests)

| Regla dura | Test | Estado |
|---|---|---|
| Cero llamadas al provider de WhatsApp | T1.1, T2.1 | ✅ |
| Cero llamadas a `persistConversation` | T1.2 | ✅ |
| Cero llamadas a `findOrCreateLead` | T1.3, T2.2 | ✅ |
| Cero llamadas a `recordDeepseekUsage` | T1.4 | ✅ |
| Cero llamadas a `incrementRuleUsage` | T1.5 | ✅ |
| Cero `provider.send` | T1.6 | ✅ |
| El endpoint solo delega al simulador | T3.1 | ✅ |
| El simulador ejecuta el LLM con override de modo | T4, T5, T6 | ✅ |
| El simulador corta el flow con bot pausado | T7 | ✅ |
| Validación de payload (8 casos) | S1.1-S1.8 | ✅ |
| Estructura del route (handlers, auth, status codes) | S2.1-S2.4 | ✅ |

**Total nuevos: 25 tests** sobre baseline de 1173 → **1198/1198 verde**.

---

## 📁 Archivos del cambio

### Nuevos (4 archivos)

| Path | Propósito | Líneas |
|---|---|---|
| `src/lib/ai/simulator.ts` | Entry point puro `simulateConversationTurn` (server-only). Bypasea `pickSystemPromptForMode` via `systemPromptOverride`. Cero imports prohibidos. | ~270 |
| `src/lib/ai/simulator-schema.ts` | `parseSimulateRequest` (validación de payload manual, sin Zod). Testeable en aislamiento. | ~140 |
| `src/app/api/admin/bot/simulate/route.ts` | Endpoint POST/GET. Auth admin + checkSupabaseConfig + validación + delega al simulador. | ~120 |
| `src/components/admin/BotSimulatorTab.tsx` | UI pantalla dividida: chat sandbox + controles superiores + Rayos X del Cerebro. | ~430 |

### Modificados (4 archivos)

| Path | Cambio |
|---|---|
| `src/lib/ai/agent-provider.ts` | + `systemPromptOverride?: string` en `AgentContext` (cambio aditivo, backward compatible). + `AgentUsage` interface + `usage?` opcional en `AgentResult`. |
| `src/lib/ai/deepseek-provider.ts` | `pickSystemPromptForMode` respeta `context.systemPromptOverride` si está presente. `wrapRawAsAgentResult` popula `usage` con tokens + costo calculado. |
| `src/components/admin/BotConfigTab.tsx` | Sub-pestañas (⚙️ Configuración / 🧪 Laboratorio). +30 líneas. |
| `data/PROJECT-LOG.md` | Entrada append-only con el cierre del sprint. |

### Tests (2 archivos nuevos)

| Path | Tests | Propósito |
|---|---|---|
| `tests/bot-simulator-isolation.test.mjs` | 13 tests (T1.1-T7) | Aislamiento estático + runtime con mocks profundos. |
| `tests/api-admin-bot-simulate-route.test.mjs` | 12 tests (S1.1-S2.4) | Validación de payload (schema puro) + estructura del route. |

---

## 🧪 Validación corrida

```
npm run type-check   OK (0 errors, sin `any` nuevos)
npm run lint         OK (0 warnings, 0 errors)
npm test             OK 1198/1198 (+25 desde v0.9.5)
npm run build        OK (/api/admin/bot/simulate listado en el manifest)
```

---

## 🚀 Lo que David puede hacer ya en producción (post-merge + deploy)

1. **Probar el comportamiento del bot sin gastar cupo Meta**:
   - Login admin → `/admin` → tab "Bot" → click en "🧪 Laboratorio (Simulador)".
   - Seleccionar modo (BD actual o override), escribir un mensaje en el chat sandbox.
   - El bot responde con el LLM real (DeepSeek) y muestra la telemetría en el panel derecho.
   - El costo en USD se acumula en la cabecera de la sesión.

2. **Validar cambios de prompt antes de mergear**:
   - Si cambias el system prompt en `agent-prompts.ts`, antes de commit, abre el simulador y prueba con el modo Override para ver el efecto inmediato.

3. **Probar con un lead real del CRM**:
   - En "👤 Lead" seleccionar "Lead del CRM (UUID)" y pegar el UUID del lead.
   - El simulador hidrata el `LeadProfile` (resumen persistente, mensaje count) sin escribir nada.
   - Si el lead tiene `bot_paused=true`, el simulador respeta la pausa (a menos que marques "☑️ Ignorar pausa per-lead").

4. **Probar las Reglas de Oro sin afectar el bot real**:
   - Crear reglas nuevas en ⚙️ Configuración → CRUD Reglas de Oro.
   - Volver a 🧪 Laboratorio, abrir el panel "🧠 Reglas de Oro Inyectadas (N)".
   - Verificar que las reglas nuevas entran en el top 8 por prioridad en el prompt real.

5. **Validar el kill-switch de outbound y la pausa global**:
   - En ⚙️ Configuración, cambiar el tope diario a 5.
   - En 🧪 Laboratorio, el costo de cada turno sigue acumulándose en `usage.estimatedCostCents` (es el costo real de DeepSeek, no del kill-switch). El kill-switch afecta a outbound auto_enviados, no al simulador.

---

## 🏛️ Decisiones arquitectónicas (resumen)

- **Opción B (refactor mínimo)**: nuevo entry point `simulateConversationTurn` sin tocar `processInboundMessage`. Riesgo bajo vs opción A (flag `isSimulation` disperso en 12+ call sites).
- **`systemPromptOverride` en `AgentContext`**: cambio aditivo de 4 líneas. Permite que el simulador inyecte un prompt precomputado sin que el provider lea DB. Backward compatible (todos los callers existentes pasan `undefined`).
- **`AgentUsage` en `AgentResult`**: campo opcional con `promptTokens`, `completionTokens`, `totalTokens`, `costCents`, `model`. El wrapper `wrapRawAsAgentResult` lo popula desde `raw` con `calculateDeepseekCostUsdCents` (mismo cálculo que `recordDeepseekUsage`).
- **Tests con flag global `__simTestState`**: workaround para el límite de Node 22 `mock.module` (no se puede re-mockear un módulo ya mockeado). El `before()` mockea una sola vez; los tests cambian el flag global para alternar comportamiento.
- **Schema extraído a `simulator-schema.ts`**: los tests del schema se hacen sin HTTP ni mocks. El route.ts lo importa y mapea errores a 400.
- **Override de modo sin `bot_global_mode` en DB**: el simulador resuelve el modo localmente (`modeOverride ?? readSystemSetting(KEY_BOT_GLOBAL_MODE)`) y construye el prompt con la función pura correspondiente.

---

## ⚠️ Riesgo operacional

- **Override UI vs DB**: el simulador usa el override sin persistirlo. El toggle del Torre de Control (sprint v16 hotfix #3) sí persiste. Hay 2 paths paralelos. Riesgo bajo (documentado en el código).
- **`AgentUsage` ignora `supabase` en el provider**: el simulador no pasa `supabase` al context, así que el path 2C (tool loop) corre en modo demo (las tools no persisten). Comportamiento correcto.
- **Costo real del LLM**: cada turno cuesta tokens. 100 simulaciones = 100 turnos de DeepSeek. La UI muestra el costo acumulado.
- **Sin migraciones**: no toca schema. Cero riesgo de drift.

---

## 🔗 PR y trazabilidad

- **Rama:** `feat/fase-17-1-bot-simulator` desde `main` (HEAD `0ccdabc` post-merge PR #20).
- **PR:** abierto a `main`. 2 commits atómicos + 1 commit de docs.
- **Traza por sprint:** `data/PROJECT-LOG.md` entrada `2026-07-12 02:30`.
- **Snapshot vivo:** `docs/STATUS.md` (próxima actualización tras merge).

---

## 📚 Documentación relacionada

- `docs/HANDOFF_v0.9.5_TORRE_CONTROL_BOT_V16.md` — sprint anterior (Torre de Control).
- `data/PROJECT-LOG.md` — log append-only de todos los sprints.
- `docs/AGENT_SUPABASE_PROTOCOL.md` — protocolo de acceso a Supabase (incluye el patrón de endpoints dedicados).
- `src/lib/ai/agent-prompts.ts` — los 3 system prompts (Socrático v1, Socrático v2, Súper Ejecutivo).
- `src/lib/ai/deepseek-provider.ts` — la resolución de modo (override vs DB).

---

## 🎁 Estado de `main` post-merge

- ✅ Bot V2 + Tool Calling (sprint 2)
- ✅ Torre de Control con persistencia real (sprint v0.9.5)
- ✅ CRM con conversaciones + IA agent (v0.9.0)
- ✅ Cert email batch con Brevo (v0.9.2)
- ✅ Cierre-eventos-virtuales con UPSERT attendee + promote lead (v0.9.3)
- ✅ CI verde + GitHub Secrets (v0.9.4)
- ✅ **v0.9.6 Bot Simulator (este sprint)**

**Listo para pilotaje real con el bot corriendo + simulador en producción.**
