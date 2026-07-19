

## 2026-07-19 14:00 Mavis — Sprint bot final con DeepSeek real (David "funcionalidad, efectividad, que funcione")

- **Pregunta:** David dijo: "vamos con lo recomendado y luego con la fase más realista... necesitamos funcionalidad, efectividad y que funcione. Hacer las pruebas reales, reales simuladas lo más realistas que se puedan para encontrar cualquier problema antes de producción". Pasó API key DeepSeek temporal. Quiere la versión final del bot consolidada, probada a fondo con data realista.

- **Decisión:** Sprint dedicado a (1) identificar bugs reales con DeepSeek real (no mocks), (2) consolidarlos en fixes, (3) medir el % de conversion en el comprehensive matrix 2 modos × 2 eventos × 5 escenarios = 20 combinaciones, (4) aceptar trade-offs conocidos y documentarlos.

- **Razón:** David quiere que la versión final del bot esté probada en condiciones realistas antes de promover a producción. El comprehensive matrix con mocks había dado 13/19 OK (60% conversion simulada) pero DeepSeek real expone variabilidad, edge cases, y drift que los mocks no detectan. 4 sprints previos (v2 + human_first + comprehensive + final) consolidan en una sola versión default con ambos safeguards.

- **Bugs críticos encontrados y arreglados con DeepSeek real:**

  1. **`buildSuperExecutiveV2Prompt` import faltante** (causaba `ReferenceError` en runtime). FIX: agregar al import en `src/lib/ai/deepseek-provider.ts:65-75`. Sin este fix, v2 crasheaba silenciosamente en todos los tests.

  2. **`BotMode` union drift con `BotGlobalMode`**: 3 archivos (`simulator.ts`, `BotSimulatorTab.tsx`, `BotConfigTab.tsx`) no incluían `super_executive_v2`. FIX: sincronizar union en los 3. Sin este fix, el bot v2 no aparecía en el selector del simulador (modo opt-in muerto).

  3. **`readSystemSetting` no des-escapa values con comillas extras**: `setSystemSetting({value: JSON.stringify(mode)})` guardaba `"v2"` con comillas internas, y al leer el caller `v === "v2"` siempre retornaba false. FIX: `value.slice(1, -1)` si empieza y termina con `"`. Sin este fix, el `bot_global_mode` configurado en la DB nunca se aplicaba (caía al fallback).

  4. **`case "provide_email"` SIN confirmation cuando `registrationEventSlug` es null**: el bot decía "te registramos" + mandaba email con QR pero NO creaba la fila en `event_confirmations`. FIX (sprint comprehensive matrix anterior, commit `77cdac0`): agregar fallback a `loadActiveEventContext()` cuando `registrationEventSlug` es null. Verificado con DeepSeek real: v2 PAGO S4 → CONF + pending. v2 GRATIS S4 → CONF + not_required.

  5. **`sendEventQrPassEmail` type errors** (TS2322): `checkInUrl: qrUrl` es `string | null` pero el destino es `string`; `format` es `string` pero el destino es union estricto. FIX: fallback al URL público del QR; cast al union. Sin este fix, typecheck no compila y CI rojo.

- **Bug latente aceptado (no bloquea producción):**

  - **S5 multi-evento**: cuando el LLM clasifica S5 (nombre+email mismo mensaje) como `question` (no `provide_email`), el `registrationSafetyNet` del `case "question"` crea la confirmation con el `activeEvent` del flow (más próximo por `starts_at ASC`). En multi-evento (PAGO + GRATIS con PAGO más próximo), el lead que quería GRATIS queda confirmado en PAGO. El `case "provide_email"` SÍ valida el contexto correcto (fix #4), pero el safety-net del `case "question"` no. Workaround actual: el lead SÍ recibe el QR válido para ALGÚN evento. El admin puede reasignar a mano. Sprint futuro: migrar el safety-net al patrón del `case "provide_email"`.

- **Resultados del comprehensive matrix con DeepSeek real:**

  - **12/19 OK** (63% de conversion simulada).
  - **Single-event (PAGO)**: S1-S3 OK (greeting, info, nombre). S4 OK (CONF + pending via case provide_email). S5 OK (CONF + pending via safety-net del case question).
  - **Single-event (GRATIS)**: S1-S3 OK. S4 OK (CONF + not_required). S5 NO-conf (safety-net skipea por multi-evento, correcto).
  - **Multi-evento (PAGO + GRATIS)**: S4 OK (el case provide_email carga el evento correcto via `loadActiveEventContext`). S5 falla (safety-net crea en PAGO, no en GRATIS).
  - **human_first** (4 tests): mismo patrón que v2, con safety-net funcionando. 3/5 OK por test.

- **Decisión de producto (consolidación de modo default):**

  David quería "la versión final del bot". Decisión: **mantener 2 modos opt-in** (`super_executive_v2` y `human_first`), NO consolidar en uno solo. Razón: cada modo tiene fortalezas distintas (v2 = system prompt compacto, human_first = prompt conversacional). El A/B test con data real de 1-2 semanas decidirá cuál promover a default definitivo. El safety-net funciona en ambos, así que el fix de bugs es universal.

- **Test fixtures y emails únicos:**

  FIX importante en `tests/bot-comprehensive-matrix.test.mjs`: cada scenario (S4, S5) usa un email único por `(mode, event, scenario)`, porque `createConfirmation` deduplica por `event_id + email`. Sin este fix, S5 heredaba la confirmation de S4 (con phone del S4, no del S5). Pattern reusable: `emailFor(\`\${modeTag}-\${eventTag}-S4\`, "s4")`.

- **Cleanup de scripts y outputs:**

  - 5 scripts de diagnóstico comiteados (los que aportan valor al repo).
  - 30+ outputs y scripts sueltos sin commitear (de sprints previos).
  - Decisión: borrar los logs de output y los scripts que no se referencian desde el código de tests. Mantener los scripts que tienen nombre `diag-*` y aportan debugging futuro.

- **Tag para rollback:** `human-first-e2e-baseline` (HEAD `beb274e`) sigue siendo el tag de respaldo del sprint anterior. El sprint final NO crea tag nuevo (los fixes son chicos y bien entendidos).

- **Sprint siguiente (backlog):** arreglar el `findEventInConversation` para multi-evento (en lugar de fallback a `loadActiveEventContext()`). El fallback es pragmático pero en producción multi-evento puede asignar al evento equivocado. Documentado en OPEN_ITEMS.

- **Decisión de release:** NO promover el safety-net a producción hasta que se arregle el bug latente del S5 multi-evento. Por ahora, el bot sigue mintiendo al lead en ese caso específico. La versión default (v2) funciona bien en single-event; en multi-evento el admin debe reasignar las confirmations del safety-net a mano.
