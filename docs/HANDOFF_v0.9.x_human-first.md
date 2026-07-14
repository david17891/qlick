# Handoff v0.9.x — Modo `human_first` + Simulador Real

**Fecha de cierre:** 2026-07-14
**Rama:** `feat/human-first-mode` (no mergeado a main)
**PR base sugerido:** contra `main` después de review de David
**Tests:** 1320/1320 verde · type-check 0 · lint 0/0 · build OK

## TL;DR

Sprint de 4 PRs atómicos que agregó el 4to modo del bot (`human_first`, LLM-first opt-in) y un modo "Real" en el simulador con personas sintéticas. El modo `human_first` bypasa la capa de intents rígida y deja que el LLM controle el flow conversacional. El simulador Real ejecuta `processInboundMessage` completo contra leads sintéticos persistidos en la DB.

## Archivos del sprint (resumen)

### Nuevos (5)
- `supabase/migrations/20260714100000_leads_simulation_source.sql` (64 líneas)
- `src/lib/whatsapp/synthetic-leads.ts` (294 líneas) — helper de personas sintéticas
- `src/app/api/admin/bot/synthetic-leads/route.ts` (134 líneas) — CRUD con auth admin
- `src/app/api/admin/bot/simulate/real/route.ts` (234 líneas) — ejecuta motor real
- `tests/human-first-mode.test.mjs` (494 líneas, 27 tests)
- `tests/synthetic-leads-helper.test.mjs` (112 líneas, 8 tests)
- `tests/api-admin-bot-simulate-real.test.mjs` (257 líneas, 11 tests)

### Modificados (4)
- `src/lib/admin/system-settings-server.ts` — SSOT + type guard para `human_first`
- `src/lib/ai/agent-prompts.ts` — `buildHumanFirstPrompt` (~150 líneas)
- `src/lib/ai/deepseek-provider.ts` — dispatch en `pickSystemPromptForMode`
- `src/lib/ai/simulator-schema.ts` — VALID_MODES extendido
- `src/lib/ai/simulator.ts` — type alias con FIXME
- `src/lib/ai/simulation/massive-matrix-generator.ts` — TODO documentado
- `src/lib/whatsapp/bot-engine.ts` — helper `resolveIntent` + 4 call sites + 1 lectura de modo
- `src/components/admin/BotConfigTab.tsx` — 4ta ModeTarjeta
- `src/components/admin/BotSimulatorTab.tsx` — toggle Sandbox/Real + banner + lista
- `src/app/api/admin/bot/mode/route.ts` — mensaje de error
- `src/app/api/admin/bot/stats/route.ts` — comentario
- `src/app/api/admin/bot/simulate/route.ts` — comentario
- `data/PROJECT-LOG.md` — 4 entries
- `docs/STATUS.md` — sprint v0.9.x al inicio
- `docs/BOT_CONTEXT_DESIGN.md` — sección del 4to modo

## Lo que el admin puede hacer AHORA

1. **Activar el modo `human_first`:** ir a `/admin/bot` → click en la tarjeta `🧪 Modo Human-First` → los nuevos mensajes bypasean los interactive buttons.

2. **Probar el simulador en modo Real:** ir a `/admin/bot` → pestaña "Laboratorio" → toggle a "🔴 Real" → crear persona sintética → mandarle mensajes → ver el flow completo con telemetría.

3. **Limpiar las personas sintéticas:** botón "🗑️ Limpiar todo" en el simulador → borrado en cascada automático.

## Riesgos identificados + mitigaciones aplicadas

| Riesgo | Mitigación |
|--------|-----------|
| Personas sintéticas en DB de prod | `simulation_source='admin_lab'` + filtro SQL |
| Phone sintético en Meta | Meta rechaza (status 400), loggeado en metadata |
| Auto-desconexión del modo Real | 30 min sin actividad |
| Borrado accidental de sintéticos | `window.confirm()` + `{ confirm: true }` en body |
| Loops accidentales | Rate limit 100 turnos/lead |
| Authorization | `requireAdmin` en todos los endpoints |
| LLM invoca tools inexistentes | Auditoría pre-commit removió `send_interactive_button` |

## Deuda técnica anotada (NO fixée en este sprint)

- 4 declaraciones duplicadas del type `BotMode`/`BotGlobalMode` (marcadas con `// FIXME:`). Refactor para sprint aparte.
- `massive-matrix-generator.ts` no incluye `human_first` en su `ContextKey`. Documentado con TODO.
- El provider outbound SIEMPRE falla en el modo Real (phone no existe en Meta). Esperado y loggeado, pero el telemetría muestra `errorMessage` en vez de un OK. Mejora futura: provider mock que simule éxito.
- `BotSimulatorTab` creció mucho (426 líneas agregadas). Refactor a sub-componentes pendientes.

## Próximos pasos sugeridos (sprint siguiente)

1. **Review + merge a `main`** de la rama `feat/human-first-mode`.
2. **Experimentar** con el modo `human_first` activado en `/admin/bot` con un lead real. Esta semana no hay evento, así que el modo `NO_ACTIVE_EVENTS_MODE` está activo. Es el momento perfecto.
3. **Si los resultados son buenos** → promover `human_first` a default + depreciar los 3 modos anteriores.
4. **Si quieres que el modo `human_first` también pueda mandar interactive buttons** → implementar la tool `send_interactive_button` (schema + executor + dispatch en agent-prompts). Documentado como TODO en `buildHumanFirstPrompt`.
5. **Refactor de la duplicación de types** → crear `src/lib/ai/bot-mode.ts` con solo el type, importado por los 4 archivos. Cambio pequeño, sin riesgo.
6. **Refactor del `BotSimulatorTab`** → extraer el panel del modo Real a `BotSimulatorRealPanel.tsx` y el Sandbox a `BotSimulatorSandboxPanel.tsx`. Componente principal queda como wrapper con tabs.

## Lecciones aprendidas

- **Auditoría pre-commit es ORO.** El primer borrador del PR #1 mencionaba una tool inexistente (`send_interactive_button`). Si no lo hubiera detectado, el LLM habría intentado invocarla y roto el flow en producción. La auditoría arregló 2 problemas críticos + 4 menores antes del merge.
- **El helper `loadSyntheticLeads` debe declararse ANTES de los useEffect que lo usan.** TypeScript marca "used before declaration" si no. Patrón: declarar los callbacks con `useCallback` en la parte superior del componente, antes de los efectos.
- **El endpoint `/api/admin/bot/synthetic-leads` con `DELETE { confirm: true }` es un patrón reutilizable** para operaciones destructivas. Cualquier endpoint admin que borre datos debería requerir confirmación explícita.
- **El phone `+5255555555XX` (rango mexicano ficticio) es rechazado por Meta** sin generar ruido. Útil para testing sin afectar producción.
- **El `email qlick.test` (TLD reservado por RFC 2606)** nunca llega a un inbox real. Útil para crear identidades sintéticas sin PII.

## Contacto

Cualquier duda sobre el sprint, revisar:
- `data/PROJECT-LOG.md` (entries 2026-07-14 ~00:55, 01:10, 01:55, 02:20, 02:30)
- `docs/STATUS.md` (sección "Sprint v0.9.x")
- `docs/BOT_CONTEXT_DESIGN.md` (sección "Sprint v0.9.x")
- Los 4 PR commits en `feat/human-first-mode`
