# Sprint 2 — Bot v2: Diseño del Asistente Comercial Qlick

**Fecha de diseño:** 2026-07-10
**Rama de trabajo:** `feat/bot-v2`
**Status:** Borrador para revisión de David. CERO código tocado todavía.
**Predecesor:** Sprint 1 cerrado (`docs/BOT_CONTEXT_DESIGN.md`, commits
`9c606de` + merges previos con fix de captura, opener y order-independent).
**Aprobación de partida:** Decisión F + 3 mejoras de David en sesión
2026-07-09 nocturna + 7 respuestas de costo/latencia/MUST-HAVE/volumen/idioma/tono/edge-cases.

> **TL;DR.** El Sprint 1 ya metió contexto del evento y ventana de conversación
> al system prompt. El Sprint 2 sube la vara: el bot deja de sonar a bot,
> gana un Método Socrático Comercial para vender como asesor de Paul Velázquez,
> expone UNA herramienta atómica consolidada para extraer nombre + email, y
> cumple una latencia <2.5s con cero reintentos al LLM. Todo verificado por
> tests de aceptación antes de tocar `main`.

---

## 1. Estado actual verificado (no asumir, leer)

Verificado en `feat/bot-v2` con sweep de archivos antes de diseñar:

| Pieza | Estado actual | Archivo |
|---|---|---|
| System prompt base con identidad Qlick | ✅ Existe, con perfil/tone/courses | `src/lib/ai/agent-prompts.ts:41-172` |
| Inyección de contexto del evento activo | ✅ Existe vía `activeEvent.promptBlock` | `src/lib/ai/agent-prompts.ts:133-168` |
| Inyección de catálogo multi-evento | ✅ Existe vía `eventsListBlock` | `src/lib/ai/agent-prompts.ts:91-132` |
| Inyección de ventana de conversación | ✅ Existe vía `conversationWindow` | `src/lib/ai/agent-prompts.ts:221-231` |
| Catálogo de "lo que NO debes inventar" | ✅ Existe (precios, amenidades, fecha) | `src/lib/ai/agent-prompts.ts:108-122, 146-158` |
| Helper `isValidHumanName` | ✅ Existe, robusto | `src/lib/whatsapp/bot-engine.ts:509-531` |
| Helper `extractEmailFromText` | ✅ Existe | `src/lib/whatsapp/email-extract.ts` |
| Helper `extractNameAndEmailTogether` | ✅ Existe | `src/lib/whatsapp/bot-engine.ts:552-589` |
| Provider DeepSeek Flash + Pro escalado | ✅ Existe, latencia ~1.2-1.8s típicamente | `src/lib/ai/deepseek-provider.ts` |
| Guardrails `validateAgentReply` | ✅ Existe, filtra descuentos/gratis/confirmaciones | `src/lib/ai/guardrails.ts:110-124` |
| Safety-net post-proceso | ✅ Existe, strippea saludos redundantes | `src/lib/whatsapp/safety-net.ts` |
| **Function-calling (tools)** | ❌ NO existe. `agent-provider.ts` no soporta `tools`/`tool_choice`. | — |
| **Tool `extract_and_save_contact_info`** | ❌ NO existe como tool consolidada. Hay 6+ helpers regex separados. | — |
| **Método Socrático Comercial en prompt** | ❌ NO existe. El prompt actual NO enseña técnica de venta natural. | — |
| **Tests de aceptación del agente** | ❌ NO existe. Solo tests de captura determinista. | — |

**Conclusión:** el andamiaje (contexto, ventana, helpers, guardrails, deepseek)
ya está. Lo que el Sprint 2 añade es la **inteligencia comercial del prompt** y la
**consolidación de la captura** vía tool atómica.

---

## 2. Tres mejoras arquitectónicas innegociables (de David)

> Estas tres mejoras son regla dura. Cualquier implementación que las rompa es
> motivo de rollback inmediato, sin discusión.

### Mejora #1 — Eliminar la barrera post-proceso con reintentos al LLM

**Problema que evita:** Si después de que el LLM genera respuesta le metemos un
post-procesador que escanea y rechaza, Vercel nos da timeout. WhatsApp espera
respuesta en <5s; con un retry del LLM estamos en 6-10s, garantizadamente fuera
de ventana.

**Decisión:**
- El contexto factual (`activeEvent.promptBlock` con nombre, fecha, lugar,
  duración, descripción, reglas del evento) ya está pre-inyectado en el
  system prompt antes de cada llamada. Esto es ground truth.
- El prompt prohíbe terminantemente contradecir ese bloque.
- El flujo de `suggest_reply` resuelve en **1 sola pasada** (≤1.5s típico).
- **NO** se reintenta al LLM dentro del mismo turno por post-procesamiento.
- Si la respuesta viene vacía o rompe guardrails, fallback a texto fijo
  determinista (no al LLM).

**Implementación esperada (en código posterior, no en este sprint):**
- En `deepseek-provider.ts:run()`: el `for` de `MAX_ATTEMPTS=2` actual cubre
  errores de red/5xx, no errores de validación. Documentamos con un FIX-2026-07-10
  que NO escala a Flash→Pro cuando falla por `validateAgentReply`.
- El fallback actual de línea 343 (`"Disculpa, tengo un problema tecnico..."`)
  se mantiene como red de seguridad, pero afinamos el copy para que NO diga
  "tengo un problema tecnico" (suena a bot).

### Mejora #2 — Consolidar la captura en 1 Tool Atómica

**Problema que evita:** Hoy la captura es un pipeline de 6+ regex deterministas
(`isValidHumanName`, `extractEmailFromText`, `matchInscriptionIntent`,
`extractNameAndEmailTogether`, etc.). El LLM casi no interviene en captura, y eso
es OK para intents cerrados, PERO pierde flexibilidad cuando el lead da
nombre+email en una sola línea O datos con ruido.

**Decisión:**
- Implementar function-calling real en `deepseek-provider.ts` (DeepSeek es
  OpenAI-compatible, soporta `tools` en la API v1).
- Exponer UNA sola tool consolidada: `extract_and_save_contact_info`.
- El LLM, durante `suggest_reply`, PUEDE llamar la tool cuando detecte
  datos del lead en su mensaje. El backend ejecuta la tool → persiste
  en `public.leads` → devuelve ack al LLM → LLM redacta respuesta final.
- El pipeline determinista actual **NO se elimina**, queda como red de
  seguridad para casos donde la tool falla o no se llama.

**Schema propuesto para la tool (diseño, no código):**

```typescript
{
  type: "function",
  function: {
    name: "extract_and_save_contact_info",
    description: "Guarda nombre completo y/o email del lead en la base. " +
      "Llama SOLO cuando el lead haya dicho explícitamente nombre completo " +
      "O email, dentro de su último mensaje. NO llames si solo es apellido, " +
      "apodo, o dato incompleto.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Nombre completo del lead. Solo si dijo 'me llamo X' " +
            "o equivalente. 2-100 chars, sin emojis, sin placeholders."
        },
        email: {
          type: "string",
          description: "Email del lead. Solo si dijo literalmente 'es X@Y' " +
            "o similar. Validar formato XX@YY.ZZ antes de mandar."
        }
      },
      additionalProperties: false
    }
  }
}
```

**Implementación interna de la tool (single backend call):**
1. Recibe `(name?, email?)`.
2. Si `name`: corre `isValidHumanName`. Si pasa, hace UPDATE a `public.leads`
   (normaliza split `name → first_name + last_name` cuando se agregue el split
   en Fase 4; mientras tanto, full name).
3. Si `email`: corre regex `EMAIL_RE` + lowercase + trim. Si pasa, UPDATE.
4. Devuelve `{ saved_name?, saved_email?, error_name?, error_email? }`.
5. Si ambos vienen juntos (`extractNameAndEmailTogether` matchea primero), la
   tool los procesa en una sola transacción.
6. Latencia esperada: 80-180ms (UPDATE a Supabase + validate). Bien dentro del
   budget de 1.5s.

**Tool execution loop:**
- 1 sola iteración. El LLM emite el tool_call en la primera llamada; el backend
  ejecuta la tool; el resultado se inyecta en un mensaje `role: "tool"`; el LLM
  redacta la respuesta final en una SEGUNDA llamada interna, todo dentro del
  mismo turno.
- Si la 2ª llamada falla, devolvemos el resultado de la 1ª con un wrapper
  genérico. NO escalamos a Pro.

### Mejora #3 — Inyectar el Método Socrático Comercial de Qlick

**Problema que evita:** El bot actual responde como servicio al cliente, no
como vendedor cálido. La regla "responde lo que preguntan, después ofrece
registrar" suena a call-center.

**Decisión:** Reescribir las secciones relevantes del system prompt para que
el LLM aprenda el Método Socrático Comercial. Se aplica SOLO a la tarea
`suggest_reply`. Los intents cerrados (welcome, register, provide_email) NO
tocan al LLM (siguen funcionando como templates deterministas).

**Estructura del Método Socrático Comercial Qlick (3 pasos):**

```
Paso 1 — EMPATÍA + VALOR PRINCIPAL:
  "Cuando alguien pregunta por el evento, NO leas lista. Habla como
  platicarías con un conocido en café: '¡Hola! Claro que sí, es una
  masterclass en vivo el [fecha] donde aprenderás [beneficio tangible].
  Incluye [X] y [Y].'"
  
  Reglas:
    - 1-3 oraciones máximo
    - Cero emojis (o max 1 si el lead lo usa)
    - Empieza DIRECTO con la respuesta, sin "¡Hola!"
    - Datos verídicos SOLAMENTE del bloque EVENTO ACTIVO

Paso 2 — HOOK CONVERSACIONAL (pregunta humana):
  "Después del valor, lanza una pregunta que invite a contar más sobre
  su contexto: 'Cuéntame, ¿tienes algún negocio en mente al que te
  gustaría aplicarle IA o eres consultor/emprendedor?'"
  
  Reglas:
    - La pregunta es INVITACIÓN, no interrogatorio
    - Conecta con el perfil del lead (si se conoce)
    - Da 2 opciones si el lead parece nuevo ("o eres consultor/emprendedor")

Paso 3 — CAPTURA INVISIBLE (cuando el lead comparte contexto):
  "Cuando responda 'Tengo una tienda de ropa', muestra entusiasmo
  genuino ('¡Qué buenísimo rubro para aplicar IA!') y da el paso
  natural a la captura:
  
  'Para apartarte tu lugar, enviarte tu constancia y pasarte el
  link de Zoom, ¿me das tu nombre completo y tu mejor correo?'"
  
  Reglas:
    - El POR QUÉ precede al QUÉ (registro explicado, no exigido)
    - 1 sola captura por turno (nombre primero, email después)
    - Si el lead comparte solo nombre → email en turno siguiente
    - Si el lead comparte email suelto → validar y agradecer
```

**Lo que el prompt prohíbe (anti-bot):**
- Listas con viñetas de beneficios
- Mensajes de más de 3 oraciones en respuesta a pregunta libre
- "Te paso más detalles", "¿qué te gustaría saber?" sin contexto
- Preguntar nombre+email+teléfono+empresa+rubro TODO de golpe
- Confirmaciones de pago, descuentos, accesos gratuitos
- Emojis más de 1 por mensaje
- "Hola" como opener cuando ya hay historial de 1+ turno

---

## 3. Diseño del System Prompt v2 (parche quirúrgico)

**Regla:** NO reescribo el prompt completo. Hago **3 patches** mínimos sobre
`agent-prompts.ts` para no romper lo que ya funciona (Sprint 1).

### Patch 1 — Sección "Personalidad" en `buildSystemPrompt` (línea 54)

Antes:
```typescript
`Personalidad:`,
isFirstMessage
  ? `- Saluda al lead por su nombre (si lo conoces y NO es un placeholder como "Por confirmar") en este primer mensaje.`
  : `- ⚠️⚠️⚠️ NO es el primer mensaje. Tu respuesta DEBE empezar DIRECTO...`,
`- Eres paciente, nunca apuras al usuario.`,
`- Si no entiendes algo, preguntas con amabilidad en vez de inventar.`,
...
```

Después: agregar bloque `MÉTODO COMERCIAL` que condicione TODO el tono:

```typescript
`MÉTODO COMERCIAL (OBLIGATORIO, solo aplica en suggest_reply):`,
`Cuando alguien pregunta por el evento o muestra interés:`,
`- Paso 1 (Empatía + Valor): empieza con UN dato verdadero del bloque EVENTO ACTIVO (nombre, fecha, duración, lugar o un beneficio si está en Detalles). Sé breve, como platicarías con un conocido en un café.`,
`- Paso 2 (Hook conversacional): después del valor, lanza UNA pregunta humana sobre el contexto del lead: 'cuéntame, ¿tienes algún negocio en mente...?' o 'o estás emprendiendo algo nuevo?'. La pregunta es invitación, no interrogatorio.`,
`- Paso 3 (Captura invisible): solo cuando el lead comparta contexto (rubro, proyecto, situación), conecta con entusiasmo genuino y avanza a: 'Para apartarte tu lugar, enviarte tu constancia y pasarte el link, ¿me das tu nombre completo y tu mejor correo?'. EL POR QUÉ VA ANTES DEL QUÉ.`,
``,
`LO QUE JAMÁS DEBES HACER (regla dura):`,
`- Listas con viñetas de beneficios. Eso es marketing, no conversación.`,
`- Pedir nombre+email+teléfono+empresa+rubro todos juntos. UN dato por turno.`,
`- Confirmar pagos, accesos, descuentos o promociones no autorizadas.`,
`- Prometer descuentos que no estén en EVENTO ACTIVO.detalles.`,
`- Empezar respuesta con 'Hola' cuando ya hay historial.`,
`- Mandar 4+ oraciones en respuesta a una pregunta libre.`,
```

### Patch 2 — Instrucción de `suggest_reply` en `buildTaskPrompt` (línea 244)

Antes:
```typescript
suggest_reply:
  "Redacta una respuesta corta (máx 2 párrafos, ≤500 chars) para enviar al lead.\n" +
  "- Tono amable, cálido, mexicano.\n" +
  "- Si hay EVENTO ACTIVO en el contexto y el mensaje del lead es sobre ese evento, ÚSALO.\n" +
  ...
```

Después:
```typescript
suggest_reply:
  "Aplica el MÉTODO COMERCIAL del system prompt OBLIGATORIAMENTE. " +
  "Estructura: Valor → Hook → (eventual) Captura. " +
  "Redacta una respuesta para enviar al lead.\n" +
  "- Tono amable, cálido, mexicano. Tuteo. Sin emojis excesivos (max 1).\n" +
  "- Si hay EVENTO ACTIVO en el contexto y el mensaje del lead es sobre ese evento, ÚSALO con datos verídicos del bloque. NO INVENTES precio, expositor, temario, dirección, cupos, amenities.\n" +
  "- Si falta info, NO improvises: '[Lo que sabes] + Aún no tengo [X] confirmado, lo reviso y te paso.'\n" +
  "- Si el lead comenta algo de su contexto (rubro, proyecto, motivación): responde con entusiasmo genuino, conectalo con el evento, y solo después avanza a solicitar nombre+email con la fórmula 'Para apartarte tu lugar y [beneficio], ¿me das tu nombre completo y tu mejor correo?'.\n" +
  "- Si el lead ya dio nombre o email SOLO (no ambos), captura el dato restante cuando sea natural, sin exigir.\n" +
  "- Si el lead dice 'no me interesa', 'baja', 'stop' → opt_out inmediato, no argumentes.\n" +
  "- NO confirmes pagos, accesos, descuentos. NO menciones 'tengo un problema técnico'. NO empieces con 'Hola' si hay historial.\n" +
  "- Máximo 3 oraciones en respuesta a pregunta libre. ≤500 chars."
```

### Patch 3 — Sección de comportamiento por catálogo (líneas 91-132 y 133-168)

Antes:
```typescript
`=== COMPORTAMIENTO CON EL CATALOGO DE EVENTOS ===`,
`Cuando el lead pregunta sobre un evento:`,
`- Si el mensaje es GENERICO ('que eventos tienen?', ...): lista los [1], [2], [3] con nombre, fecha, lugar, duracion, precio...`,
...
```

Después: mantener las reglas de "NO inventar" (que sí funcionan) pero **agregar
al inicio** la regla del Método Socrático cuando el lead pregunta sobre UNO
específico:

```typescript
`Si pregunta sobre UNO específico ('el de CDMX', 'el del 12 de julio'):
NO leas lista. Aplica Método Socrático:
  (1) Platica el dato clave del evento (Paso 1 — Valor)
  (2) Hook conversacional humano (Paso 2)
  (3) No pidas registro en este turno; deja que el lead reaccione
La lista de [1], [2], [3] SOLO aplica cuando el mensaje es genérico.`
```

---

## 4. Diseño de Tests de Aceptación

**Regla de oro del runner (de memoria, 2026-07-09):** `node --experimental-strip-types --test`
NO resuelve path aliases `@/lib/...`. Si el test importa `.ts` con aliases, no corre
silenciosamente. Por lo tanto, los nuevos tests `.test.mjs` NO importan código `.ts`
directamente; instancian strings del prompt y validan por **string matching**.

### Suite nueva: `tests/whatsapp-bot-v2-socratic-method.test.mjs`

**Caso 1 — El prompt contiene los 3 pasos del Método Socrático:**
```javascript
const prompt = buildSystemPrompt(profile, mockActiveEvent, false, undefined);
assertContains(prompt, "Paso 1 (Empatía + Valor)");
assertContains(prompt, "Paso 2 (Hook conversacional)");
assertContains(prompt, "Paso 3 (Captura invisible)");
assertContains(prompt, "el POR QUÉ va antes del QUÉ", true /* insensitive */);
```

**Caso 2 — El prompt prohíbe listas con viñetas:**
```javascript
const prompt = buildSystemPrompt(profile, mockActiveEvent, false, undefined);
assertContains(prompt, "Listas con viñetas de beneficios");
assertContains(prompt, "Eso es marketing, no conversación");
```

**Caso 3 — La instrucción de `suggest_reply` menciona Método Comercial:**
```javascript
const taskPrompt = buildTaskPrompt("suggest_reply", mockContext);
assertContains(taskPrompt, "Método Comercial", true);
assertContains(taskPrompt, "Valor → Hook → (eventual) Captura");
assertContains(taskPrompt, "EL POR QUÉ va antes del QUÉ", true);
```

**Caso 4 — El prompt NO introduce información de precios por defecto:**
```javascript
const prompt = buildSystemPrompt(profile, noDetailsEvent, false, undefined);
assertNotContains(prompt, "GRATIS|gratis");
assertNotContains(prompt, "PROMOCION|promoción");
```

### Suite nueva: `tests/whatsapp-bot-v2-tool-atomic.test.mjs`

**Caso 1 — La tool se declara UNA sola vez en el sistema:**
```javascript
import { getAgentTools } from "../src/lib/ai/agent-tools.ts";
const tools = getAgentTools();
const extracted = tools.filter((t) => t.function.name === "extract_and_save_contact_info");
assertEqual(extracted.length, 1, "debe haber solo UNA tool consolidada");
```

**Caso 2 — La tool declara los 2 parámetros esperados:**
```javascript
const tool = tools.find((t) => t.function.name === "extract_and_save_contact_info");
assertEqual(tool.function.parameters.properties.name.type, "string");
assertEqual(tool.function.parameters.properties.email.type, "string");
assertEqual(tool.function.parameters.additionalProperties, false);
assertEqual(tool.function.parameters.required, undefined);  // ambos opcionales
```

**Caso 3 — El backend de la tool valida con `isValidHumanName`:**
```javascript
import { executeExtractAndSave } from "../src/lib/ai/tool-executors/extract-contact.ts";
const result = await executeExtractAndSave(
  { name: "asdf", email: "x@y.com" },
  { leadId, supabase: mockSupabase }
);
assertEqual(result.error_name, "nombre inválido");
assertEqual(result.saved_email, "x@y.com");
```

**Caso 4 — Tool execution loop: 1 sola iteración:**
```javascript
import { runWithToolLoop } from "../src/lib/ai/deepseek-provider.ts";
const result = await runWithToolLoop("suggest_reply", mockContext, mockTools);
assertEqual(result.toolCallsCount, 1, "máximo 1 tool_call por turno");
```

### Suite nueva: `tests/whatsapp-bot-v2-acceptance.test.mjs` (E2E simulado)

Esta suite simula la experiencia de WhatsApp inyectando inputs al sistema
completo (mocking DeepSeek) y validando el comportamiento observable.

**Caso A — Lead pregunta costo, no hay precio en Detalles:**
- Input: `"¿cuánto cuesta?"`
- Setup: evento sin `description` en DB.
- Expectativa: el prompt inyectado NO contiene precio ficticio. La respuesta
  del LLM contiene "aún no tengo el precio confirmado".
- Verificación: assertContains(respuesta, "aún no tengo el precio", true).

**Caso B — Lead pregunta horario:**
- Input: `"¿a qué hora es?"`
- Setup: evento con `humanStartsAt = "11 de julio, 10:00 hrs"`.
- Expectativa: la respuesta contiene "10:00" y "11 de julio".
- Verificación: regex match.

**Caso C — Bot NO alucina "incluye coffee break":**
- Input: `"¿qué incluye?"`
- Setup: evento sin descripción, sin reglas de amenidades.
- Expectativa: la respuesta NO menciona "coffee break", "snack", "lunch".
- Verificación: cada palabra prohibida como NOT match.

**Caso D — Captura atómica de nombre + email en un solo mensaje:**
- Input: `"Me llamo Juan Pérez, juan@gmail.com"`
- Expectativa: la tool `extract_and_save_contact_info` se llama UNA vez con
  ambos parámetros. Después del tool execution, el lead en DB tiene
  `first_name="Juan"`, `last_name="Pérez"`, `email="juan@gmail.com"`.
- Verificación: query a Supabase mock devuelve los valores esperados.

**Caso E — Latencia total <2.5s en simulación:**
- Input: 10 mensajes con dificultad creciente.
- Expectativa: la mediana de latencia total (carga de contexto + LLM call +
  tool execution + persistencia + envío) es <2.5s.
- Verificación: `performance.now()` al inicio y al final, assert <2500ms.

**Caso F — Bot NO intenta resolver problemas de pago solo:**
- Input: `"Quiero pagar pero mi tarjeta fue rechazada"`
- Expectativa: la tool `escalate_to_human` se llama. NO se intenta cobrar,
  NO se confirma nada.
- Verificación: tool ejecutada con `reason="pago_rechazado"`, NO mensaje
  contiene "confirmo tu pago".

**Caso G — Opt-out inmediato:**
- Input: `"baja, ya no me interesa"`
- Expectativa: la tool `opt_out_lead` se llama. Respuesta corta y respetuosa
  (≤1 oración).
- Verificación: tool ejecutada con `phone_normalized`, mensaje <150 chars.

---

## 5. Plan de implementación (sub-sprints)

David dijo "diseña… antes de tocar código". Estos sub-sprints son la ruta
de implementación esperada una vez aprobado el diseño. NO se empiezan hasta
que David apruebe este documento.

### Sub-sprint 2A — Función tool consolidada (1-2 horas)

**Scope:**
- `src/lib/ai/agent-tools.ts` (nuevo): exporta `getAgentTools(): Tool[]`.
- `src/lib/ai/tool-executors/extract-contact.ts` (nuevo): ejecuta la tool.
- Test: `tests/whatsapp-bot-v2-tool-atomic.test.mjs`.

**Acceptance:**
- Tools se declaran UNA vez. Schema correcta. Validación interna con helpers
  existentes (`isValidHumanName`, `EMAIL_RE`).
- Tool idempotente: si el lead ya tiene el dato, NO lo duplica.

**Riesgo:** bajo. Reutiliza código existente.

### Sub-sprint 2B — System Prompt v2 (3-4 horas)

**Scope:**
- 3 patches a `src/lib/ai/agent-prompts.ts` (los del §3).
- Test: `tests/whatsapp-bot-v2-socratic-method.test.mjs`.

**Acceptance:**
- Los 3 patches aplicados sin romper lo que ya funciona (Sprint 1).
- Tests de aceptación pasan.
- Cero nuevos TODOs en código de producto.

**Riesgo:** medio. La cantidad de prompt puede alterar comportamiento en
casos edge. Mitigación: 3 patches mínimos, no reescritura.

### Sub-sprint 2C — Function-calling en DeepSeek provider (4-6 horas)

**Scope:**
- `src/lib/ai/deepseek-provider.ts`: añadir `tools` al payload, manejar
  `tool_calls` en la respuesta, ejecutar las tools declaradas, inyectar
  resultados como `role: "tool"` en una 2ª llamada interna.
- `src/lib/ai/agent-tools.ts` (de 2A) ya provee las tools.
- Test: `tests/deepseek-function-calling.test.mjs` (mocked HTTP).

**Acceptance:**
- Latencia del loop completo <2.5s en `Caso E` de §4.
- Si la tool falla, fallback graceful sin reintentos al LLM.
- Solo 1 tool_call permitido por turno.

**Riesgo:** medio-alto. Cambia la arquitectura core del provider. Mitigación:
feature flag `DEEPSEEK_TOOLS_ENABLED=false` por default hasta validar en
staging. Si rompe, revert en 1 commit.

### Sub-sprint 2D — Integración bot-engine + E2E tests (3-4 horas)

**Scope:**
- `src/lib/whatsapp/bot-engine.ts`: integrar las tools en el flujo
  `intent=question`. La tool se ejecuta DESPUÉS del LLM y ANTES de enviar
  la respuesta al lead.
- Test: `tests/whatsapp-bot-v2-acceptance.test.mjs`.

**Acceptance:**
- Latencia E2E <2.5s en simulación (Caso E).
- Tests A-G pasan todos.
- Edge cases manejados: tool fallida, lead sin contexto, multi-evento.

**Riesgo:** bajo una vez 2A/2B/2C verdes. Mitigación: feature flag.

### Cronología esperada

| Día | Sub-sprints | Validación |
|---|---|---|
| 1 (mañana) | 2A + 2B | tests unitarios verdes |
| 2 | 2C + 2D | tests E2E verdes |
| 3 | staging: WhatsApp sandbox con David | smoke test |
| 4 | deploy controlado a `feat/bot-v2` | QA manual |

---

## 6. Riesgos y rollbacks

| Riesgo | Probabilidad | Mitigación | Rollback |
|---|---|---|---|
| Latencia >2.5s con tool loop | Media | Tests E2E antes de merge; feature flag `DEEPSEEK_TOOLS_ENABLED` | Desactivar flag, vuelve a flujo sin tool |
| LLM alucina datos | Baja (ground truth pre-inyectado) | Tests A-C de §4 + guardrails actuales | El guardrail sigue activo post-tool |
| Tool execution excede 500ms | Baja | UPDATE Supabase simple; mocked en tests | Si >500ms, mover a queue asíncrono |
| Tool ejecutada cuando no debe | Baja | Tool description explícita + prompt refuerza | Validar con caso de prueba dedicado |
| Patch de prompt rompe tests existentes | Media | Aplicar patches con diff mínimo; correr `npm test` | `git revert` del commit 2B |
| Bug en multi-evento | Baja | Modo catálogo ya testeado (Sprint 1) | Mantener behavior de `eventsListBlock` |

**Hard-fail gate antes de shipping:**
- `npm run type-check` ✅
- `npm run lint` ✅
- `npm test` ✅ (incluyendo los 3 archivos nuevos del Sprint 2)
- `npm run build` ✅
- Smoke test contra WhatsApp sandbox con número de David ✅

---

## 7. Decisiones abiertas para David

Ninguna obligatoria (el diseño cubre las 7 preguntas). Pero Opcionales:
1. ¿Quieres que el Sprint 2 entregue los 4 sub-sprints completos antes
   de test en sandbox, o ir mergeando por sub-sprint?
2. ¿Mantener la feature flag `DEEPSEEK_TOOLS_ENABLED` en producción al
   activarlo, o quitar cuando ya estemos tranquilos?
3. ¿Qué umbral de "promedio de mensajes por día" usamos para decidir si
   reentrenar el prompt? (Empíricamente, después de 200 conversaciones
   con baja tasa de conversión por turno, considerar patch v3).

---

## 8. References

- `docs/BOT_CONTEXT_DESIGN.md` — Sprint 1 cerrado.
- `docs/BOT_MANUAL_CONTEXT.md` — Manual de operación del bot.
- `docs/AI_AGENT_GUARDRAILS.md` — Reglas duras del agente.
- `docs/HOW-TO-RUN.md` — Setup + comandos.
- `data/PROJECT-LOG.md` — Log append-only de cambios.
- Branch: `feat/bot-v2`.
- HEAD actual: `eb6dc30 docs(open-items): ...` (limpio para empezar).
