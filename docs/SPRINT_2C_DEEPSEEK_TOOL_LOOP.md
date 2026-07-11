# Sprint 2 — Sub-sprint 2C: Diseño del Tool Loop en DeepSeek Provider

**Fecha:** 2026-07-10
**Rama:** `feat/bot-v2`
**Estado:** Borrador para revisión de David. CERO código tocado todavía.
**Predecesores:** Sub-sprint 2A (tool atómica + tests verde, commit `cb4322e`)
y 2B (system prompt v2, commit `103f483`).

---

## 0. TL;DR

Refactorizar `src/lib/ai/deepseek-provider.ts` para que soporte
function-calling nativo de DeepSeek (OpenAI-compatible en
`/v1/chat/completions`). El nuevo `run()` detecta si la 1ª llamada al
LLM viene con `finish_reason="tool_calls"`, ejecuta la tool localmente
vía `executeExtractAndSaveContact()` (del 2A), inyecta el resultado
como mensaje `role: "tool"`, y hace **exactamente una segunda
llamada** para obtener la redacción final en lenguaje natural. Si en
esa 2ª llamada el LLM emite OTRA tool_call, **se aborta** el loop
y se devuelve un fallback humano.

Feature flag `DEEPSEEK_TOOLS_ENABLED` envuelve el loop completo:
- En producción con flag ON: comportamiento 2C (1 tool call + 1 final).
- En dev sin flag o flag explícita OFF: comportamiento Sprint 1 idéntico.

Latencia objetivo E2E <2.5s preservada vía timeouts estrictos por
llamada (1.5s c/u), tools ya implementada (2A, ~200ms), y salida
cortas en la 2ª vuelta (`max_tokens=250`).

---

## 1. Loop de tool calling — pseudocódigo y flujo

### 1.1 Diagrama del flujo completo

```
         ┌─────────────────────────────────────────────┐
         │ runWithToolLoop(task, context)             │
         │   feature flag: DEEPSEEK_TOOLS_ENABLED     │
         └──────────────────────┬──────────────────────┘
                                │
                                ▼
                  ┌───────────────────────────┐
                  │ ¿DEEPSEEK_TOOLS_ENABLED?  │
                  └─────┬────────────────┬────┘
                  OFF (default)        ON
                        │               │
                        ▼               ▼
            ┌──────────────────┐  ┌─────────────────────────┐
            │ CallDeepSeekV1   │  │ CallDeepSeekV1 (tools)  │
            │ 1 sola llamada,  │  │ 1ª llamada              │
            │ sin tools, igual │  │ payload INCLUYE tools   │
            │ a Sprint 1.      │  │ timeout 1.5s            │
            └─────────┬────────┘  └──────────┬──────────────┘
                      │                      │
                      └──────────┬───────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │ ¿ finish_reason =       │
                    │   "tool_calls" ?        │
                    └────┬─────────────────┬──┘
                      sí │                 │ no
                         ▼                 ▼
        ┌─────────────────────────────┐   │
        │ Parsear tool_call          │   │
        │ (1 sola tool, primera)     │   │
        └────────────┬────────────────┘   │
                     │                    │
                     ▼                    │
        ┌────────────────────────────┐    │
        │ Ejecutar tool localmente   │    │
        │ executeExtractAndSave(     │    │
        │   input, ctx               │    │
        │ )    timeout: 800ms       │    │
        └─────┬────────────────┬─────┘    │
       OK    │             ERROR│         │
             ▼                ▼           │
    ┌──────────────────┐  ┌──────────────┐ │
    │ Ack: tool msg    │  │ Ack: error   │ │
    │ role:"tool"      │  │ role:"tool"  │ │
    │ con tool_call_id │  │ tool_call_id │ │
    └────────┬─────────┘  └──────┬───────┘ │
             │                   │         │
             └────────┬──────────┘         │
                      ▼                    │
      ┌────────────────────────────────┐   │
      │ CallDeepSeekV2 — 2ª y ÚLTIMA   │   │
      │ - SIN tools en payload         │   │
      │ - max_tokens=250               │   │
      │ - timeout 1.5s                 │   │
      │ - incluye historial            │   │
      │   system+user+assistant+tool   │   │
      └─────┬──────────────────┬───────┘   │
         OK │              ERROR│           │
            ▼                  ▼            │
    ┌──────────────┐   ┌──────────────────┐ │
    │ content =    │   │ Fallback final:  │ │
    │ bot response │   │ combinamos 1ª    │ │
    │              │   │ respuesta + ack  │ │
    │              │   │ de tool (si OK)  │ │
    │              │   │ + suffix humano  │ │
    └──────┬───────┘   └────────┬─────────┘ │
           │                    │           │
           └──────────┬─────────┘           │
                      ▼                     │
            ┌──────────────────────┐         │
            │ stripGreetingIfHasHist│         │
            │ safety-net (Sprint1) │         │
            └──────────┬───────────┘         │
                       │                     │
                       ▼                     ▼
                ┌────────────────────────────────┐
                │ Provider.send() → WhatsApp     │
                │ valida con validateAgentReply  │
                └────────────────────────────────┘
```

### 1.2 Esquema del payload OpenAI-compatible

Para la 1ª llamada (cuando la flag está ON):

```jsonc
POST https://api.deepseek.com/v1/chat/completions
{
  "model": "deepseek-chat",                              // Flash primero
  "messages": [
    { "role": "system", "content": "<system_prompt_v2>" },
    { "role": "user",   "content": "<task_prompt>" }
  ],
  "temperature": 0.7,
  "max_tokens": 500,
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "extract_and_save_contact_info",
        "description": "<description completa del 2A>",
        "parameters": { /* ToolParameterSchema del 2A */ }
      }
    }
  ],
  // Nota: NO usamos tool_choice. El LLM decide cuándo llamar.
  // Forzar tool_choice rompería respuestas conversacionales.
}
```

Para la 2ª llamada (después del tool execution):

```jsonc
{
  "model": "deepseek-chat",
  "messages": [
    { "role": "system",    "content": "<system_prompt_v2>" },
    { "role": "user",      "content": "<task_prompt>" },
    { "role": "assistant", "content": null,
      "tool_calls": [{                              // emitido en 1ª vuelta
        "id": "call_abc123",
        "type": "function",
        "function": {
          "name": "extract_and_save_contact_info",
          "arguments": "{\"name\":\"Juan\",\"email\":\"j@g.com\"}"
        }
      }]
    },
    { "role": "tool", "tool_call_id": "call_abc123",  // resultado del ejecutor
      "content": "{\"ok\":true,\"saved_name\":\"Juan\",\"saved_email\":\"j@g.com\"}" }
  ],
  "temperature": 0.5,                                  // más determinista
  "max_tokens": 250,                                    // respuesta corta
  // tools: NO se incluyen — el LLM NO debe emitir otra tool aquí.
}
```

### 1.3 Pseudocódigo del loop (TypeScript-flavoured)

```typescript
const TOOL_LOOP_MAX_CALLS = 2;             // duro: nunca más
const TOOL_LOOP_TIMEOUT_MS = 1500;         // por llamada a DeepSeek
const TOOL_EXEC_TIMEOUT_MS = 800;          // para executeExtractAndSaveContact
const TOOL_REPLY_MAX_TOKENS = 250;         // 2ª llamada, salida corta

async function runWithToolLoop(
  task: AgentTask,
  context: AgentContext,
): Promise<AgentResult> {

  // ── Gate SRE — si la flag está OFF, comportamiento Sprint 1 ──
  if (!isDeepseekToolsEnabled()) {
    return runOneShot(/* sin tools */);
  }

  // ── 1ª llamada CON tools ──
  const firstTurn = await callDeepSeekV1({
    task, context,
    tools: getAgentTools(),                  // del 2A
    timeoutMs: TOOL_LOOP_TIMEOUT_MS,
    includeTools: true,
  });

  // ── Si el LLM no emitió tool_call, terminamos aquí (camino feliz) ──
  if (!firstTurn.toolCall) {
    return firstTurn.withoutToolCall();     // 1 sola llamada = 1.2s típico
  }

  // ── Sí hubo tool_call: ejecutar y luego 2ª llamada ──
  const toolCall = firstTurn.toolCall;       // solo el primero, garantía
  
  // Ejecutar tool con timeout duro
  const toolResult = await runWithTimeout(
    () => executeExtractAndSaveContact(
      toolCall.arguments,
      { leadId: context.leadId, supabase: context.supabase }
    ),
    TOOL_EXEC_TIMEOUT_MS
  );

  // 2ª llamada: corta, sin tools, redacta respuesta final humana
  const secondTurn = await callDeepSeekV2({
    task, context,
    history: [
      { role: "assistant", tool_calls: [toolCall] },
      { role: "tool", tool_call_id: toolCall.id,
        content: JSON.stringify(toolResult) }
    ],
    maxTokens: TOOL_REPLY_MAX_TOKENS,
    timeoutMs: TOOL_LOOP_TIMEOUT_MS,
    includeTools: false,                    // NO permitir otro tool_call
  });

  // Si la 2ª llamada falló, ensamble final con el resultado del tool
  if (!secondTurn.ok) {
    const fallback = composeFallback(firstTurn, toolResult);
    return { ...fallback, needsReview: false, note: "[2C fallback] ..." };
  }

  return secondTurn;
}
```

### 1.4 Garantías duras del loop

| Garantía | Implementación |
|---|---|
| **Máximo 2 llamadas a la red por turno** | `TOOL_LOOP_MAX_CALLS = 2` constante; el loop no incrementa más un contador. |
| **Si 2ª llamada también emite tool_call → se ignora silenciosamente** | La 2ª llamada se hace `includeTools: false`. Si DeepSeek respondiera con tool_call de todos modos (no debería), se descarta y se usa el `content` final. |
| **Timeout por llamada de 1.5s** | `AbortController` con `setTimeout(abort, 1500)`. Si expira, devuelve fallback. |
| **Timeout de tool execution de 800ms** | `Promise.race` con un `setTimeout` que rechaza. Si pasa, devuelve tool result `ok: false` con `note: "tool timeout"`. |
| **No afecta al path `summarize_conversation` u otros tasks que NO usan tools** | El feature flag y el loop solo se activan cuando `task === "suggest_reply"`. Para los demás, llamada única sin tools. |

---

## 2. Kill Switch SRE — `DEEPSEEK_TOOLS_ENABLED`

### 2.1 Lectura de la flag

```typescript
function isDeepseekToolsEnabled(): boolean {
  // Default OFF por seguridad SRE.
  // Si la var no está definida o tiene un valor distinto de "true",
  // el sistema corre en modo Sprint 1 (sin tools).
  // Para activar en producción: Vercel env vars → DEEPSEEK_TOOLS_ENABLED=true
  return process.env.DEEPSEEK_TOOLS_ENABLED === "true";
}
```

**Justificación del default OFF:** Si alguien hace deploy a un
entorno donde la flag no está seteada, queremos comportamiento
demostrado (Sprint 1) por default, no algo nuevo y no probado. La
flag se activa EXPLÍCITAMENTE en producción.

### 2.2 Comportamiento por entorno

| Entorno | `DEEPSEEK_TOOLS_ENABLED` | Comportamiento |
|---|---|---|
| Vercel producción | `"true"` | Tool loop activo. Tools pueden emitirse. 1 tool call + 1 final = hasta 2 llamadas. |
| Vercel staging / preview | `"false"` o no seteada | Modo Sprint 1. 1 sola llamada sin tools. |
| Local dev | no seteada | Modo Sprint 1. Mismo que staging. |
| Vercel producción degradada | cambiamos a `"false"` desde el panel | Cambio aplica en ~10s cuando Vercel rolling-restart el container. Mientras tanto, el container sigue con la flag vieja hasta el próximo cold start. |

### 2.3 Plan de rollback instantáneo (ya documentado antes)

David aprobó mantener el flag en producción al activarlo (sesión
2026-07-09). El flujo de rollback es:

1. Operador: `vercel env rm DEEPSEEK_TOOLS_ENABLED production` o
   cambiar a `false` desde el panel.
2. Vercel: detecta cambio de env var → rolling-restart containers
   en ~10s.
3. Runtime: `isDeepseekToolsEnabled()` retorna `false` → comportamiento
   Sprint 1 idéntico al de 6 días atrás.
4. Verificación: el siguiente turno del bot ya NO intenta tool_call.

El único trade-off: el reinicio del container es ~10s, no 0ms.
Aún así es muchísimo más rápido que `git revert` + `vercel --prod`
(de 2 a 5 minutos). La diferencia entre 10s y 0s no es relevante para
protección contra degradación de API de DeepSeek a escala de eventos
(3,000 leads/día).

---

## 3. Resiliencia y degradación elegante

### 3.1 Escenario A — Tool call con JSON malformado o args inválidos

**Causa típica:** El LLM emite algo como:
```json
{"name":"extract_and_save_contact_info","arguments":"{ malformed"}
```
o
```json
{"arguments": {"foo":"bar"}}   // falta el `name` esperado
```

**Detección:** `JSON.parse(arguments)` lanza, o los campos no
matchean el schema.

**Manejo:**
1. El ejecutor `executeExtractAndSaveContact` ya es defensivo:
   valida campos uno a uno (nombre con `isValidHumanNameLocal`, email
   con regex).
2. Si los args no matchean (p.ej. faltan), el ejecutor devuelve
   `{ ok: false, error_name: "...", error_email: "..." }`.
3. La 2ª llamada recibe el resultado del tool como `role: "tool"`
   y redacta una respuesta humana adaptativa:
   `Parece que algo se cortó. ¿Me regalas tu nombre completo y tu correo?`
4. NO se aborta el loop. NO se rompe la promesa. El lead recibe
   una respuesta útil.

**Caso patológico** (JSON inválido a nivel sintáctico):
1. Intentamos `JSON.parse(arguments)`. Si lanza, capturamos.
2. Devolvemos al LLM un ack con error: `{ ok: false, error: "args_parse_failed" }`.
3. La 2ª llamada redacta algo como `Hubo un problema al guardar tus datos.
   ¿Me los repites?`.
4. Si esto pasa >5% de turnos → indicio de drift del prompt; alertar
   al admin por Brevo/Slack (futuro, fuera del 2C).

**Garantía:** nunca se cae el loop. Siempre se redacta una respuesta
humana o un fallback de seguridad.

### 3.2 Escenario B — Tool execution > 400ms o error de Supabase

**Causa típica:** UPDATE a `public.leads` tarda 1.5s por Supabase
congestionado, o la red tiene un blip.

**Detección:** `Promise.race` con `setTimeout(reject, 800)`.
Si el tool tarda >800ms, se rechaza con `tool_exec_timeout`.

**Manejo:**
1. Si timeout: el resultado al LLM es `{ ok: false, error: "timeout",
   note: "tool execution exceeded 800ms" }`.
2. La 2ª llamada redacta: `Tuve una demora técnica. ¿Me confirmas tu
   nombre y correo para guardar tus datos?`.
3. **Si el UPDATE en sí falló por 5xx de Supabase** (no por timeout):
   el ejecutor ya captura el error y devuelve `{ ok: false,
   persisted: false, note: "Error al persistir en Supabase (42P01)" }`.
4. La 2ª llamada aplica el mismo fallback humano.
5. **Si el timeout total del loop amenaza el SLA de 2.5s**, ver
   escenario C — la red de seguridad externa actúa.

**Métricas que importan** (no se miden en el 2C, se loggean a Vercel):
- `tool_exec_duration_ms` por turno (p50, p95, p99).
- `tool_exec_failures_total` por código de error.
- Estas alimentan la decisión "¿iteramos el 2C?" después de 200
  conversaciones (umbral ya aprobado).

### 3.3 Escenario C — 2ª llamada a DeepSeek falla por red o 5xx

**Causa típica:** DeepSeek tiene un outage justo cuando estamos
redactando la respuesta final tras un tool_call exitoso.

**Detección:** `callDeepSeekV2` retorna `{ ok: false, error: "..." }`.
El catch de la red o el status 5xx se manejan en
`callDeepSeekTier` (código ya existente).

**Manejo — respuesta de fallback sin sonar a bot:**

Caso C.1: La 1ª llamada NO tenía `tool_call` (camino simple) —
ya está manejado en `deepseek-provider.ts:343` con copy:
> "Disculpa, tengo un problema técnico. ¿Me repetis la pregunta?"

FIX 2026-07-10 (mejora #3 de David): este copy SÍ suena a bot. En
el 2C lo reemplazamos por uno más humano y contextual al evento:

```typescript
const FALLBACK_MESSAGES = {
  withEvent:
    "Se me fue el hilo un momento. ¿Te puedo ayudar con la info del " +
    "evento o prefieres que siga en otro momento?",
  withoutEvent:
    "Se me fue el hilo un momento. Cuéntame en qué te puedo ayudar " +
    "y con gusto te echo la mano."
};

function pickFallback(activeEvent: ActiveEventContext | undefined): string {
  if (activeEvent && activeEvent.source !== "no_events") {
    return FALLBACK_MESSAGES.withEvent;
  }
  return FALLBACK_MESSAGES.withoutEvent;
}
```

Caso C.2: La 1ª llamada SÍ tenía `tool_call` y se ejecutó OK,
pero la 2ª falla — esto es el caso interesante. El lead YA
quedó registrado en DB (tool ejecutó). La 2ª llamada solo iba a
redactar el copy. Construimos el mensaje en cliente:

```typescript
if (!secondTurn.ok && toolResult.ok) {
  // Tool se ejecutó OK pero la 2ª llamada falló.
  // Tenemos el lead guardado — usemos eso para redactar humano.
  const name = toolResult.saved_name?.split(" ")[0] ?? "";
  return {
    ok: true,
    content: name
      ? `Listo ${name}, ya te tengo registrado. En un momento te paso los detalles.`
      : `Listo, ya te tengo registrado. En un momento te paso los detalles.`,
    needsReview: false,
    note: "[2C] Tool OK + 2ª call failed → fallback humano desde resultado del tool"
  };
}

if (!secondTurn.ok && !toolResult.ok) {
  // Doble falla. El lead NO quedó registrado.
  // Devolver fallback honesto. El admin/operador puede ver el log
  // y contactar al lead manualmente.
  return {
    ok: true,
    content: pickFallback(activeEvent),
    needsReview: true,           // admin debe revisar
    note: "[2C] Tool failed + 2ª call failed → fallback neutro"
  };
}
```

**Garantía:** el bot NUNCA suena a "tengo un problema técnico" en
su copy de salida. El copy de fallback es contextual y humano.

---

## 4. Estrategia de pruebas con mocks

### 4.1 Mocking de `fetch` global

Hoy `deepseek-provider.ts:217` usa `fetch(DEEPSEEK_API_URL, ...)`
directo. Para testearlo sin pegarle a `api.deepseek.com`, vamos a
mockear `globalThis.fetch` con un `mock.fn()` que devuelva respuestas
pre-canned.

**Helper de mock (test-only):**

```javascript
// tests/helpers/deepseek-fetch-mock.mjs
export function makeDeepseekFetchMock(responses) {
  const calls = [];
  let idx = 0;
  const mock = async (url, init) => {
    calls.push({ url, init: JSON.parse(init?.body ?? "{}") });
    if (idx >= responses.length) {
      throw new Error("Mock exhausted");
    }
    const r = responses[idx++];
    return new Response(JSON.stringify(r.body), {
      status: r.status ?? 200,
      headers: { "content-type": "application/json" }
    });
  };
  return { mock, calls };
}

export function setupDeepseekFetchMock(mockFn) {
  const prev = globalThis.fetch;
  globalThis.fetch = mockFn;
  return () => { globalThis.fetch = prev; };   // restore
}
```

### 4.2 Casos del test `tests/deepseek-function-calling.test.mjs`

#### Caso 1 — Sin tool call: 1 sola llamada a DeepSeek

- Mock devuelve respuesta estándar (sin `tool_calls`).
- Expectativa: `fetch` se llama **exactamente 1 vez**.
- Verificación: `mock.calls.length === 1`. El resultado tiene el
  `content` del mock. NO hay role "tool" en messages.

#### Caso 2 — Con tool call: 2 llamadas a DeepSeek, tool ejecutado

- Mock 1ª llamada: `finish_reason: "tool_calls"`, emite
  `{ name: "extract_and_save_contact_info",
     arguments: '{"name":"Juan","email":"j@g.com"}' }`.
- Mock 2ª llamada: `finish_reason: "stop"`, content: `"¡Listo Juan!"`.
- Setup: `leadId: "L1"`, mockSupabase acepta UPDATE.
- Expectativa:
  - `fetch` se llama **exactamente 2 veces**.
  - El ejecutor `executeExtractAndSaveContact` se llamó UNA vez
    (verificable vía spy o mock del ejecutor).
  - La 2ª llamada tiene `messages.length === 4`
    (system + user + assistant con tool_calls + tool).
  - La 2ª llamada NO incluye `tools` en el payload.
  - Resultado final.ok === true y content coincide con el mock.
- Verificación adicional: `max_tokens` de la 2ª llamada === 250
  (≤256 por economía de tokens en respuesta corta).

#### Caso 3 — Tool emite JSON malformado (Escenario A)

- Mock 1ª llamada: argumentos rotos `"arguments": "{ malformed"`.
- Setup: ejecutor real (no mock) intentará parsear.
- Expectativa:
  - 2 llamadas a `fetch`.
  - Tool executor devuelve `{ ok: false, error: "args_parse_failed" }`
    (o equivalente manejado).
  - 2ª llamada redacta respuesta que NO contiene "problema técnico".
  - Loop completo termina OK.

#### Caso 4 — Tool execution > 800ms (Escenario B)

- Mock del ejecutor con un delay artificial de 1.2s.
- Expectativa:
  - Tool devuelve `{ ok: false, note: "tool execution timeout" }`.
  - 2ª llamada igual se ejecuta.
  - Loop total termina <2.5s (el timeout corto protege el SLA).

#### Caso 5 — 2ª llamada a DeepSeek falla (Escenario C con tool OK)

- Mock 1ª llamada OK con tool_call.
- Mock 2ª llamada: status 503, network error.
- Setup: ejecutor acepta UPDATE.
- Expectativa:
  - Loop NO lanza excepción.
  - El resultado.ok === true (gracias al fallback).
  - El contenido es humano (no contiene "problema técnico").
  - Log incluye `note: "[2C] Tool OK + 2ª call failed"`.

#### Caso 6 — Feature flag OFF

- `process.env.DEEPSEEK_TOOLS_ENABLED = "false"`.
- Mock 1ª llamada: NO debería incluir `tools` en payload.
- Setup: el LLM emite un tool_call en la respuesta (estamos testeando
  el filtro, no el LLM).
- Expectativa:
  - Solo 1 llamada a `fetch`.
  - Payload NO contiene `tools`.
  - Resultado final es el `content` de la 1ª llamada.
  - El tool_call de la respuesta **se descarta** (modo Sprint 1).

#### Caso 7 — Latencia total <2.5s

- Mock con delays artificiales bajos (DeepSeek "rápido", tool "rápida").
- Setup: `leadId` válido, `DEEPSEEK_TOOLS_ENABLED=true`.
- Expectativa: `Date.now() - start < 2500ms`.

#### Caso 8 — Contador de iteraciones

- Mock patológico: 1ª llamada emite tool_call, 2ª llamada también
  emite tool_call (debería ser imposible con `tools` vacío).
- Expectativa: El loop NO hace una 3ª llamada. Logs muestran
  `tool_call ignored on 2nd turn`.
- Verificación: `mock.calls.length === 2` aunque la 2ª respuesta
  tuviera tool_call.

### 4.3 Verificación de tiempo

Cada uno de los 8 casos mide con `performance.now()` o `Date.now():

```javascript
const start = Date.now();
const result = await runWithToolLoop("suggest_reply", ctx);
const elapsed = Date.now() - start;
assert.ok(elapsed < 2500, `E2E took ${elapsed}ms — debe ser <2500`);
```

---

## 5. Plan de implementación

### 5.1 Archivos a tocar

| Archivo | Cambio |
|---|---|
| `src/lib/ai/deepseek-provider.ts` | Refactor mayor: soportar tools, timeouts de 1.5s, flag-gating, fallback humano. |
| `tests/deepseek-function-calling.test.mjs` | NUEVO. 8 casos (ver §4). |
| `tests/helpers/deepseek-fetch-mock.mjs` | NUEVO. Helper compartido de mock fetch. |
| `data/PROJECT-LOG.md` | Entrada append-only del Sub-sprint 2C. |
| `docs/OPEN_ITEMS.md` | Marcar como cerrado el ítem "function-calling no implementado". |

### 5.2 Orden de implementación

1. **Helper `tests/helpers/deepseek-fetch-mock.mjs`** (15 min).
2. **Test del Caso 1 (sin tool_call, baseline)** (30 min).
3. **Refactor del provider con tool loop + flag** (3-4 horas).
4. **Tests 2-8** sobre el refactor (1-2 horas).
5. **Validación**: type-check, lint, full test suite (15 min).

### 5.3 Criterios de aceptación (David los pidió explícitamente)

- [ ] `npm test`: 881/881 + 8 nuevos = 889/889 verde.
- [ ] `npm run type-check`: 0 errores.
- [ ] `npm run lint`: 0 warnings/errors.
- [ ] `npm run build`: build de producción exitoso.
- [ ] Mock test confirma loop termina en exactamente 1 o 2 llamadas, nunca 3.
- [ ] Mock test confirma E2E <2.5s con delays simulados.
- [ ] Mock test confirma `DEEPSEEK_TOOLS_ENABLED=false` → 1 sola llamada.
- [ ] Fallback copy NO contiene "problema técnico".

---

## 6. Riesgos y mitigación

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| Refactor rompe flash→pro escalation | Media | Mantener la lógica de `chooseTier(task, flashOutcome)` intacta. Tool loop solo se activa cuando `task === "suggest_reply"` (que ya va a Pro). |
| 2ª llamada excede latencia | Media | `max_tokens: 250` acorta respuesta. Timeout 1.5s aborta. |
| Tool call formatting no matchea DeepSeek | Baja | El schema JSON es idéntico al de OpenAI v1. Si DeepSeek lo rechaza, fallback inmediato sin tool. |
| Feature flag no aplica cambio inmediato | Baja | Vercel rolling-restart es ~10s. Aceptable por SRE. Doc explícito en `docs/OPEN_ITEMS.md`. |
| Tool se ejecuta con args del LLM que NO matchean la intención del lead | Baja | El ejecutor valida con `isValidHumanNameLocal` + regex email. Si falla, ack con error; el LLM en la 2ª llamada rectifica. |
| Bug en 2C llega a producción antes de los 200 turnos | Baja | Feature flag OFF por default. Activamos solo cuando David lo decida. |

---

## 7. Out-of-scope (NO entra en 2C)

- Multi-tool loops (varios tool_calls paralelos). Solo la primera.
- Streaming de respuesta. Mantenemos modo request/response.
- Persistencia de `transcript.jsonl` para análisis posterior.
- Métricas de drift por turno (p50/p95/p99).
- Alertas Brevo/Slack cuando tool_exec_failures > 5%.

Todo esto queda para Sprint 3+ si David quiere iterar después de
200 conversaciones reales.
