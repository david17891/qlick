# Bot Context Design — ventanas de contexto dinámicas

**Fecha**: 2026-06-30
**Status**: Implementado, listo para probar (no deployado a producción)

## Objetivo

El bot de WhatsApp debe poder responder con consciencia de:

1. **Qué evento está activo** (nombre, fecha, hora, lugar, descripción)
2. **Qué se ha dicho antes** en esta conversación (memoria corta)
3. **Tono amable y cálido** consistente con la marca Qlick

Antes de esta implementación, el bot:
- Usaba `EVENT_NAME` env var con placeholder ("IA y Marketing Básico")
- No tenía memoria de la conversación (cada mensaje era independiente)
- El system prompt no inyectaba contexto del evento

## Cambios implementados

### Archivos nuevos

| Path | Función |
|---|---|
| `src/lib/ai/event-context-loader.ts` | Carga el evento activo desde Supabase. Fallback a env vars si no hay DB o no hay publicado. Devuelve `ActiveEventContext` con bloque listo para prompt. |
| `src/lib/ai/conversation-window.ts` | Carga los últimos N mensajes (inbound + outbound) del lead desde `lead_whatsapp_conversations`. Default 8, max 20. |

### Archivos modificados

| Path | Cambio |
|---|---|
| `src/lib/ai/agent-provider.ts` | `AgentContext` ahora incluye `activeEvent?` y `conversationWindow?` (opcionales, backwards-compatible). |
| `src/lib/ai/agent-prompts.ts` | `buildSystemPrompt` inyecta bloque del evento. `buildTaskPrompt` inyecta ventana cronológica. Tono más amable/mexicano. |
| `src/lib/ai/index.ts` | Exporta las nuevas funciones y tipos. |
| `src/lib/whatsapp/bot-engine.ts` | En `intent=question`: carga contexto (event + window) en paralelo y lo pasa al agent provider. |

## Cómo funciona el flow ahora

```
Lead escribe "Hola, ¿a qué hora es la conferencia?"
   ↓
webhook recibe → processInboundMessage()
   ↓
detectIntent() → "greeting" (primer mensaje) o "question" (ya nos conoce)
   ↓
buildResponsePlan({ intent: "question", ... })
   ↓
Promise.all([
  loadActiveEventContext(),       // lee DB events
  loadConversationWindow(phone)   // lee últimos N mensajes
])
   ↓
agent.run("suggest_reply", {
  ...,
  activeEvent,         // ← NUEVO
  conversationWindow   // ← NUEVO
})
   ↓
buildSystemPrompt(profile, activeEvent)
  → incluye bloque "=== EVENTO ACTIVO ==="
  → con tono amable, cercano, mexicano
   ↓
buildTaskPrompt("suggest_reply", context)
  → incluye historial cronológico
  → incluye recordatorio del evento al final
   ↓
DeepSeek / mock-agent genera respuesta
   ↓
validateAgentReply() (guardrails)
   ↓
provider.send() → WhatsApp
```

## Ejemplo de system prompt generado

```text
Eres Qlick Assistant, asistente conversacional de Qlick Marketing Integral.
Qlick ofrece cursos de marketing digital, automatizaciones y eventos especializados.

Atiendes en horario: Lun-Vie 9:00-18:00 (Centro MX).
Tono: amable, cálido, MUY amable, cálido y cercano. Idioma: español de México.

Personalidad:
- Saludas con calidez, usas el nombre del lead si lo sabes.
- Eres paciente, nunca apuras al usuario.
- Si no entiendes algo, preguntas con amabilidad en vez de inventar.
- ...

LO QUE PUEDES HACER:
- Responder preguntas sobre cursos y eventos
- Agendar inscripciones
...

=== EVENTO ACTIVO ===
Nombre: Conferencia Marketing Digital 2026
Fecha y hora: 6 de julio de 2026, 01:00 hrs (UTC)
Duración: 2 horas
Lugar: Ciudad de México
======================

CUANDO EL LEAD PREGUNTE POR EL EVENTO:
- Usa la información del bloque "EVENTO ACTIVO" de arriba.
- NO inventes fechas, lugares ni horarios. Si no está en el bloque, di "aún no tengo ese detalle, pero te lo confirmo".
...
```

## Ejemplo de task prompt con ventana

```text
Lead: María López
Curso de interés: Marketing Digital
Resumen previo: interesada en evento de julio

=== HISTORIAL DE CONVERSACIÓN ===
[20:15] lead: Hola, buenas tardes
[20:15] bot: Hola María, bienvenida a Qlick. ¿Te interesa info del evento?
[20:16] lead: Sí, por favor
[20:16] bot: Con gusto. El evento es "Conferencia Marketing Digital 2026" el 6 de julio. ¿Te gustaría registrarte?
[20:18] lead: A qué hora es?
=================================

>>> ÚLTIMO MENSAJE DEL LEAD (al que tienes que responder): "A qué hora es?"

Tarea: Redacta una respuesta corta (máx 2 párrafos, ≤500 chars) para enviar al lead.
- Tono amable, cálido, mexicano.
- Si hay EVENTO ACTIVO en el contexto y el mensaje del lead es sobre ese evento, ÚSALO.
- ...

Recordatorio: el evento activo es "Conferencia Marketing Digital 2026" el 6 de julio de 2026, 01:00 hrs (UTC). Úsalo cuando sea relevante.
```

## Cómo probar

### Local (sin deploy)

```bash
# 1. Verificar type-check
npm run type-check

# 2. Crear evento en Supabase con status='published'
# (manual desde dashboard, o seed script)

# 3. Probar el loader
node --input-type=module -e "
import { loadActiveEventContext } from './src/lib/ai/event-context-loader.ts';
const ctx = await loadActiveEventContext();
console.log(JSON.stringify(ctx, null, 2));
"
```

### Producción (cuando David vuelva)

1. David vuelve del descanso
2. Revisamos juntos este código
3. Ajustamos lo que no guste (tono, formato de fechas, etc.)
4. **NO deployamos todavía** — David decide
5. Cuando esté OK: `vercel deploy --target production --yes`
6. Activamos Live Mode en Meta
7. David escribe desde WhatsApp → ve el bot responder con contexto

## Pendientes (no críticos)

- [ ] Script para crear evento de prueba en Supabase (status='published')
- [ ] Tests unitarios para `loadActiveEventContext` y `loadConversationWindow`
- [ ] UI admin para previsualizar el prompt que verá el LLM
- [ ] Métricas: cuántas conversaciones llegan al LLM con contexto completo

## Riesgos

- **Latencia**: agregar 2 queries a Supabase al procesar cada mensaje. Mitigado con `Promise.all`. Si DB está lenta, fallback graceful a `undefined`.
- **Costo LLM**: prompts más largos = más tokens. Mitigado por guardrails y ventana de 8 mensajes (no 50).
- **Stale context**: si un evento se actualiza, el bot no se entera hasta el siguiente mensaje. Aceptable para MVP.

## Sprint v0.9.x (2026-07-14) � Cuarto modo human_first (LLM-first opt-in)

### Resumen

Se agreg� un 4to modo opt-in al bot: human_first. Cuando est� activo, el LLM controla todo el flow conversacional (sin capa de intents r�gida que intercepte). Se mantienen opt_out (LFPDPPP) y provide_email (captura de datos) como gates deterministas.

### Diferencia vs los 3 modos anteriores

| Modo | System prompt | Tools | Capa de intents |
|------|---------------|-------|-----------------|
| socratic_autopilot_v2 | uildSystemPrompt | S� | Activa (welcome/greeting/register/opt_out/provide_email/question) |
| socratic_no_tools_v1 | uildSystemPrompt | **No** | Activa |
| super_executive | uildSuperExecutivePrompt | S� | Activa |
| human_first (NUEVO) | uildHumanFirstPrompt | S� | **Bypaseada** (solo opt_out + provide_email como gates) |

### Flujo del modo human_first

`
Lead escribe mensaje
  ?
bot-engine.ts: processInboundMessage()
  ?
Check bot_paused_global ? abort
  ?
Check bot_paused_for_lead ? abort
  ?
Check mustEscalateToHuman ? escalate a humano
  ?
Lee bot_global_mode (cach� 30s)
  ?
resolveIntent(body, isFirstMessage, isHumanFirstMode)
  ?
Si human_first=true:
  - OPT_OUT_RE.test(body) ? opt_out (gate legal, sin LLM)
  - EMAIL_RE.test(body) ? provide_email (gate de captura, sin LLM)
  - cualquier otra cosa ? question (LLM con buildHumanFirstPrompt + tools)
Si human_first=false:
  - detectIntent() original (regresi�n 0)
  ?
case "question" ? LLM responde con buildHumanFirstPrompt
  ?
Tool loop: extract_and_save_contact_info, add_event_guest
  ?
Provider intenta mandar a WhatsApp
  ?
Persiste en lead_whatsapp_conversations
`

### P�rdida esperada en human_first

- **No hay interactive buttons** de welcome/greeting/register. El LLM responde con texto plano.
- El LLM no puede enviar interactive buttons ad-hoc (no existe la tool send_interactive_button).
- Trade-off documentado en uildHumanFirstPrompt.

### C�mo activar el modo

1. Ir a /admin/bot, secci�n "Modo del Bot".
2. Click en la tarjeta "?? Modo Human-First (LLM-first opt-in)".
3. Esperar 30 segundos (cach� del provider).
4. Los nuevos mensajes del lead bypasean los interactive buttons.

### Simulador modo Real (paridad 1-a-1 con producci�n)

El simulador en /admin/bot (pesta�a "Laboratorio") ahora tiene un toggle Sandbox/Real. En modo Real:
- Creas una persona sint�tica (phone +52555555XX, email qlick.test).
- Le mandas mensajes ? el simulador ejecuta processInboundMessage directamente.
- El provider outbound falla (phone no existe en Meta) � eso es esperado.
- Auto-desconexi�n a los 30 min sin actividad.

Ver docs/STATUS.md y data/PROJECT-LOG.md (entries 2026-07-14) para m�s detalle.
