# Plantilla de Contexto del Bot — Qlick

> **Qué necesita el bot saber en cada turno para responder al máximo.**
> Documento de auditoría + referencia para onboarding.
>
> Última revisión: 2026-07-04 (feat/funnel-survey-scoring).

---

## Resumen

El bot engine (`src/lib/whatsapp/bot-engine.ts:processInboundMessage`) carga **5 fuentes de contexto** en cada turno antes de generar la respuesta. La suma es lo que el LLM (DeepSeek Flash/Pro) tiene disponible para responder bien.

```
┌─────────────────────────────────────────────────────────────┐
│  Contexto total del bot por turno                            │
├─────────────────────────────────────────────────────────────┤
│  [A] EVENTO ACTIVO   ─── 1 query: events WHERE published    │
│  [B] CATÁLOGO        ─── 1 query: events (todos published)  │
│  [C] MEMORIA CORTA   ─── 1 query: lead_whatsapp_conversations│
│  [D] MEMORIA LARGA   ─── 1 query: lead_profile              │
│  [E] OVERRIDES MANUALES ─ 1 query: bot_manual_context        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
              System prompt + tools → LLM → respuesta
```

**5 queries por turno, ~250-500ms p95.** Aceptable en Vercel serverless (max 10s). Optimización posible: cache de eventos en memoria por 30s (Redis o variable module-level).

---

## [A] Evento activo individual

**Loader:** `src/lib/ai/event-context-loader.ts:loadActiveEventContext(slug?)`

**Query:**
```sql
SELECT id, slug, title, description, starts_at, ends_at, location, requires_name
FROM events
WHERE status = 'published'
  AND (slug = ? OR starts_at = MIN(starts_at))
LIMIT 1
```

**Devuelve:**
```typescript
interface ActiveEventContext {
  id: string;
  slug: string;
  title: string;
  description: string | null;       // ← aquí van precio, cupo, modalidad, etc.
  startsAt: Date;
  endsAt: Date | null;
  location: string;
  humanStartsAt: string;            // "6 de julio, 18:00 hrs"
  humanDuration: string;            // "2 horas"
  promptBlock: string;              // bloque formateado para system prompt
  source: "db" | "env" | "placeholder";
  requiresName: boolean;            // si true, bot pide nombre ANTES del email
}
```

**`promptBlock` se ve así:**
```
=== EVENTO ACTIVO ===
Nombre: IA y Marketing Básico
Fecha y hora: 6 de julio, 18:00 hrs
Duración: 2 horas
Lugar: Ciudad de México

Detalles:
Cupo limitado a 50 personas. Costo: $499 MXN. Modalidad presencial.
======================
```

**FALLBACK:** si DB no responde o no hay evento publicado → env vars (`EVENT_NAME`, `EVENT_DATE`, `EVENT_LOCATION`, `EVENT_DURATION`). Idealmente nunca debería caer al fallback en prod.

**GAP identificado:** `description` carga TODO (precio, cupo, modalidad) como texto libre. El bot tiene que parsear esto mentalmente. **Mejora futura:** columnas dedicadas `price_mxn`, `modality`, `capacity`, `requires_payment` en `events` (migration).

---

## [B] Catálogo completo de eventos

**Loader:** `loadAllActiveEvents()`

**Query:**
```sql
SELECT id, slug, title, description, starts_at, ends_at, location, requires_name
FROM events
WHERE status = 'published'
ORDER BY starts_at ASC
```

**`promptBlock` (vía `formatEventsListBlock`):**
```
=== CATALOGO DE EVENTOS PUBLICADOS ===
Hay 3 eventos activos.

[1] IA y Marketing Básico
    Slug: ia-marketing-basico
    Fecha: 6 de julio, 18:00 hrs · 2 horas
    Lugar: Ciudad de México
    Detalles: Costo: $499 MXN

[2] Marketing Digital Avanzado
    Slug: marketing-digital-avanzado
    ...

INSTRUCCIONES PARA TI (LLM):
- Cuando el lead pregunte 'que eventos tienen?' lista los [1], [2], [3].
- Cuando pregunte sobre UNO especifico, identifica por numero/fecha/lugar/titulo.
- Si no puedes identificar, pregunta 'Cual te interesa: [1], [2] o [3]?'.
===================================
```

**Usado en:** intents `register` (muestra lista), `interactive_event_yes` (muestra detalle).

**FALLBACK:** array vacío (sin fallback — el bot muestra placeholder, NO inventa eventos).

**GAP:** no hay filtro por fecha futura. Si tienes 50 eventos pasados en `status='published'`, todos aparecen. **Mejora:** cambiar query a `WHERE status = 'published' AND ends_at > NOW()` (eventos que aún no terminaron).

---

## [C] Memoria corta (últimos N mensajes)

**Loader:** `src/lib/ai/conversation-window.ts:loadConversationWindow(phone, N=8)`

**Query:**
```sql
SELECT * FROM lead_whatsapp_conversations
WHERE phone_normalized = ?
ORDER BY created_at DESC
LIMIT 8
```

**Devuelve:**
```typescript
interface ConversationWindow {
  messages: Array<{
    id: string;
    direction: "inbound" | "outbound";
    body: string;
    message_type: string;
    metadata: Record<string, unknown>;
    created_at: string;
  }>;
  leadPhone: string;
  windowSize: number;
}
```

**Usado en:** system prompt del LLM cuando intent === "question" (preguntas abiertas). Le da al bot el contexto de los últimos 8 turnos para responder coherentemente.

**GAP identificado (G-3 histórico):** el bot antes no usaba bien este contexto — repetía saludos. Resuelto parcialmente con:
- `agent-prompts.ts` líneas 53-61: `isFirstMessage=false` → NO saludar
- `agent-prompts.ts` líneas 221-230: recordatorio crítico si hay historial
- `safety-net.ts`: post-process strip de 6 patrones redundantes
- 27 tests en `tests/whatsapp-safety-net.test.mjs`

**Pero falta:** el LLM aún tiene tendencia a generar "gracias por escribir a Qlick" en cada turno. El system prompt desalienta pero no garantiza. Workaround actual: el safety-net strippea el residuo.

---

## [D] Memoria larga del lead

**Loader:** `src/lib/ai/lead-profile.ts:loadLeadProfile(supabase, lead.id)`

**Query:**
```sql
SELECT summary, messages_since_summary, last_summary_at
FROM lead_profile
WHERE lead_id = ?
```

**Devuelve:**
```typescript
interface LeadProfile {
  summary: string;                // resumen cumulativo 1-2 frases
  messagesSinceSummary: number;   // counter
  lastSummaryAt: Date | null;
}
```

**Uso:** inyectado en system prompt para que el bot recuerde contexto entre sesiones (separado de los últimos 8 mensajes).

**Regeneración:** cada `SUMMARY_EVERY` mensajes, `regenerateSummary` se dispara en background para actualizar `summary`.

**GAP identificado:** el campo `summary` solo tiene texto plano. Campos prometidos en la migration (`interests`, `objections`, `next_action`, `lead_score`) NO se implementaron aún. Mejora futura.

---

## [E] Overrides manuales del operador

**Loader:** `src/lib/bot/manual-context.ts:loadManualContext()`

**Query:**
```sql
SELECT key, value, priority FROM bot_manual_context
ORDER BY priority DESC
```

**Llaves conocidas:**
- `tone_override` → "Hoy más formal"
- `event_override_date` → override de fecha
- `event_override_location` → override de lugar
- `event_override_notes` → notas extra del evento
- `compliance_notes` → "+18" o regulación obligatoria
- `extra_notes` → notas libres
- `persona_name` → "Sofía" vs "Qlick Assistant"
- `persona_style` → estilo conversación

**`promptBlock` se ve así:**
```
=== INSTRUCCIONES MANUALES DEL OPERADOR ===

[TONE]
- tone override: Hoy más formal por deuil nacional

[COMPLIANCE]
- compliance notes: Solo +18, pedir verificar edad
================
```

**Uso:** permite al admin "tunear" el bot sin redeploy. Cambias el tono, agregas compliance, modificas la fecha del evento desde el panel admin.

---

## Lo que el bot tiene en su system prompt (resumen)

```
[SYSTEM PROMPT DEL LLM]

Eres Qlick, asistente de Qlick Marketing Integral.
Tu trabajo: ayudar a leads a registrarse a eventos y responder preguntas.

[PERSONA]
{agent-profile.businessName, businessDescription, tone, servicesOrCourses}

[EVENTO ACTIVO]
{nombre, fecha, lugar, duración, detalles}

[CATÁLOGO DE EVENTOS]
{lista numerada si hay varios}

[INSTRUCCIONES MANUALES DEL OPERADOR]
{overrides del admin si hay}

[MEMORIA DEL LEAD]
{summary cumulativo del lead}

[CONVERSACIÓN RECIENTE]
{últimos 8 mensajes}

[GUARDRAILS]
{reglas duras: no PII, no descuentos, no inventar info}
```

---

## Gaps identificados (para mejorar al máximo)

| Gap | Severidad | Impacto | Esfuerzo |
|---|---|---|---|
| `description` parsea precio/cupo como texto | 🟡 Media | Bot no puede extraer precio de forma fiable | 1 día (migration + parser) |
| Catálogo incluye eventos ya pasados | 🟡 Media | Lista confusa si hay 50 eventos viejos | 30 min (filtro WHERE) |
| `lead_profile` no tiene `interests/objections` | 🟡 Media | Memoria larga solo texto plano | 1 día (migration + regen logic) |
| LLM aún genera saludos redundantes | 🟠 Alta (UX) | UX tonta en mensajes no-iniciales | Ya mitigado con safety-net (23 tests) |
| No hay cache de eventos | 🟢 Baja | 5 queries por turno, ~300ms | 30 min (variable module) |
| No hay contexto del staff que atiende al lead | 🟢 Baja | Bot no sabe si es lead nuevo o recurrente | 2h (unir auth_users + lead) |
| No hay histórico de compras/inscripciones | 🟡 Media | Bot no sabe si el lead ya compró un curso | 1 día (query course_access) |

---

## Cómo auditar si el bot está rindiendo bien

**Señales de contexto insuficiente:**
1. Lead hace pregunta específica ("¿cuánto cuesta?") y bot responde genérico → falta precio en `description`
2. Bot dice "Hola David, gracias por escribir..." en mensaje 5 → memoria corta no se usa bien (FIX ya aplicado)
3. Bot no sabe qué evento le interesa al lead → falta identidad del lead en catálogo
4. Bot alucina datos que no existen → falta guardrail o info en contexto
5. Latencia > 2s → queries de contexto lentas, falta cache

**Señales de contexto suficiente:**
1. Lead pregunta "el segundo evento" → bot identifica por número
2. Lead retoma conversación al día siguiente → bot recuerda contexto (lead_profile.summary)
3. Bot adapta tono cuando operador cambia override → manual context funciona
4. Bot no repite saludos → memory + safety-net activos

---

## TL;DR para el admin que crea un evento

Para que el bot rinda al máximo cuando un lead pregunta:

1. **`title`** claro (sin emojis raros, dice QUÉ es)
2. **`description`** completo:
   - Modalidad (presencial/virtual)
   - Precio (si aplica)
   - Cupo
   - Requisitos especiales (certificado, +18, etc.)
3. **`starts_at` y `ends_at`** correctos (para que `humanDuration` calcule bien)
4. **`location`** con dirección o ciudad
5. **`requires_name`** si el evento emite certificado

Eso es lo que el bot va a tener disponible para responder. Lo que NO pongas en estos campos, el bot no lo va a inventar (gracias a los guardrails).