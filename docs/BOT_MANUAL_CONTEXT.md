# Manual Bot Context — overrides editables por el operador

**Fecha**: 2026-06-30
**Status**: Backend listo (CRUD + integración con bot engine). UI admin: Fase 2.

## Objetivo

Permitir que David (o un operador) **modifique el contexto del bot sin tocar código**. Por ejemplo:

- "El evento se movió al 8 de julio por lluvia" → `event_override_date`
- "Hoy el tono debe ser ultra formal" → `tone_override`
- "Recordar que es solo para mayores de 18" → `compliance_notes`
- "Agregar nota sobre el coffee break" → `extra_notes`
- "El bot se llama Sofía" → `persona_name`

## Cambios implementados

### Nuevos archivos

| Path | Función |
|---|---|
| `supabase/migrations/20260630164900_bot_manual_context.sql` | Tabla `bot_context_overrides` + función SQL `get_active_bot_overrides()`. |
| `src/lib/bot/context-store.ts` | CRUD: `listBotOverrides`, `loadActiveOverrides`, `upsertBotOverride`, `updateBotOverride`, `deleteBotOverride`. |
| `src/lib/bot/manual-context.ts` | Wrapper tipado: `loadManualContext()`, `applyEventOverrides()`, `composeSystemPrompt()`. |

### Archivos modificados

| Path | Cambio |
|---|---|
| `src/lib/whatsapp/bot-engine.ts` | En `intent=question`: carga manual context en paralelo y aplica overrides al evento antes de enviar al LLM. |

## Esquema de la tabla

```sql
public.bot_context_overrides (
  id              uuid primary key,
  bot_name        text default 'qlick-bot',    -- futuro: multi-bot
  context_key     text not null,                -- 'tone_override', 'event_override_date', etc.
  context_value   text not null,
  priority        int  default 100,            -- menor = más prioritario
  enabled         boolean default true,
  expires_at      timestamptz,                  -- null = permanente
  created_at, updated_at,
  updated_by      text,                         -- email del operador
  unique (bot_name, context_key)
)
```

## Llaves semánticas conocidas (convención)

| Key | Uso | Ejemplo |
|---|---|---|
| `tone_override` | Modifica el tono del bot | "Hoy más formal por evento corporativo" |
| `event_override_date` | Override fecha del evento | "8 de julio por lluvia" |
| `event_override_location` | Override lugar del evento | "Plaza Inn, Salón B (antes era Centro)" |
| `event_override_notes` | Notas extra del evento | "Coffee break incluido a las 19:00" |
| `compliance_notes` | Info regulatoria | "Solo mayores de 18. Pedir ID al llegar." |
| `extra_notes` | Notas libres | "Hoy atendemos también consultas sobre el curso A" |
| `persona_name` | Nombre del bot | "Sofía" (default: "Qlick Assistant") |
| `persona_style` | Estilo conversación | "Directo y al grano" |

Cualquier otra key es válida (se inyecta como "OTROS").

## Cómo funciona el flow

```
Lead escribe → processInboundMessage
  ↓
detectIntent → "question"
  ↓
buildResponsePlan (case "question"):
  Promise.all([
    loadActiveEventContext(),     // lee evento de DB
    loadConversationWindow(...),  // últimos 8 mensajes
    loadManualContext("qlick-bot") // overrides manuales activos
  ])
  ↓
applyEventOverrides(event, manualContext)  // fecha/lugar overridden
  ↓
agent.run("suggest_reply", {
  activeEvent,                    // con overrides aplicados
  conversationWindow,
  conversationSummary: manualContext.promptBlock  // inyectado al prompt
})
  ↓
LLM genera respuesta usando TODO el contexto
```

## Ejemplo de bloque manual en el prompt

```text
=== INSTRUCCIONES MANUALES DEL OPERADOR ===

[EVENTO]
- event override date: 8 de julio por lluvia
- event override location: Plaza Inn, Salón B

[COMPLIANCE]
- compliance notes: Solo mayores de 18. Pedir ID al llegar.

[PERSONALIDAD]
- persona name: Sofía

=============================================
```

## Cómo usar HOY (sin UI, vía SQL)

Desde el dashboard de Supabase, table editor:

```sql
-- Cambiar fecha del evento
INSERT INTO public.bot_context_overrides (bot_name, context_key, context_value, updated_by)
VALUES ('qlick-bot', 'event_override_date', '8 de julio por lluvia', 'david@qlick.mx')
ON CONFLICT (bot_name, context_key) DO UPDATE
  SET context_value = EXCLUDED.context_value, updated_at = now();

-- Cambiar nombre del bot
INSERT INTO public.bot_context_overrides (bot_name, context_key, context_value, updated_by)
VALUES ('qlick-bot', 'persona_name', 'Sofía', 'david@qlick.mx')
ON CONFLICT (bot_name, context_key) DO UPDATE
  SET context_value = EXCLUDED.context_value, updated_at = now();

-- Desactivar override
UPDATE public.bot_context_overrides
SET enabled = false
WHERE bot_name = 'qlick-bot' AND context_key = 'event_override_date';

-- Borrar override
DELETE FROM public.bot_context_overrides
WHERE bot_name = 'qlick-bot' AND context_key = 'event_override_date';
```

## UI Admin (Fase 2, post-6 jul)

Pendiente construir:

- `/admin/bots` → lista de bots (por ahora 1)
- `/admin/bots/qlick-bot` → ver contexto manual + preview del prompt generado
- `/admin/bots/qlick-bot/edit` → CRUD de overrides con form
- `/api/admin/bots/[bot]/context` (GET/PUT) → endpoint para el form

## Próximos pasos cuando David vuelva

1. Aplicar la migración SQL a Supabase (`20260630164900_bot_manual_context.sql`)
2. Probar inserts manuales desde el dashboard
3. Verificar que el bot usa los overrides en respuestas reales (después de Live Mode)
4. Planear UI admin para Fase 2

## Riesgos

- **Sin UI hoy**: David tiene que usar SQL directo o esperar UI. Aceptable para 6 jul (puede editar manualmente si surge cambio de último momento).
- **Override siempre gana**: si está enabled y no expirado, sobrescribe el evento. Si David escribe dos overrides contradictorios, hay que revisar prioridades.
- **Costo LLM**: el prompt crece ~200 tokens con el bloque manual. Aún dentro del budget.