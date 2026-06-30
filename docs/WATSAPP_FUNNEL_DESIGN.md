# WhatsApp Funnel Design — Bot Conversacional

> Documento canónico del flujo. Diseñado para la conferencia del 6 de julio de 2026
> pero aplica a cualquier evento del pipeline.

## Stack

| Componente | Implementación | Estado |
|---|---|---|
| **Provider WhatsApp** | Meta Cloud API v20.0 (Graph API) | Real (`src/lib/whatsapp/providers/meta-cloud-api-provider.ts`) |
| **Webhook HTTP** | `/api/whatsapp/webhook` | Get (verify) + Post (messages + status) |
| **Bot engine** | Custom en Next.js | `src/lib/whatsapp/bot-engine.ts` (718 líneas) |
| **LLM** | DeepSeek V4-Flash via `getActiveAgentProvider()` | Real (`src/lib/ai/deepseek-provider.ts`) |
| **Fallback** | Mock heurístico si falta `DEEPSEEK_API_KEY` | Demo friendly |
| **Persistencia** | Supabase service role (RLS bypass) | 3 tablas: `event_qr_tokens`, `lead_whatsapp_conversations`, `lead_consent_log` |
| **Compliance** | LFPDPPP via `lead_consent_log` | Append-only |
| **Guardrails** | `validateAgentReply()` filtra respuestas LLM | Prohibido: descuentos, gratis, confirmaciones de pago |

## Diagrama de flujo

```
Usuario escribe "Hola" en WhatsApp
       │
       ▼
Meta envía POST /api/whatsapp/webhook
       │
       ├─ GET  → handshake (verify_token)
       │
       └─ POST → valida firma HMAC si WHATSAPP_WEBHOOK_SECRET
              │
              ├─ parsea con handleWebhookPayload (InComingWhatsAppMessage[])
              │
              ├─ persiste inbound en lead_whatsapp_conversations (idempotente por wamid)
              │
              └─ fire-and-forget → bot-engine.processInboundMessage
                                  │
                                  ├─ normalizePhone(message.from) → +52XXXXXXXXXX
                                  ├─ findOrCreateLead (Supabase o demo mode)
                                  ├─ isFirstMessage = created
                                  ├─ detectIntent (regex determinista)
                                  │     │
                                  │     ├─ opt_out > register_palabra > register_frase >
                                  │     │  provide_email > greeting(if first→welcome) >
                                  │     │  welcome(if first) > question
                                  │     │
                                  │     └─ retorna BotIntent
                                  │
                                  ├─ buildResponsePlan(intent, lead)
                                  │     │
                                  │     ├─ welcome/greeting → template `conf_bienvenida`
                                  │     ├─ register → template `conf_info_evento`
                                  │     ├─ opt_out → texto "no te contacto más"
                                  │     ├─ provide_email →
                                  │     │     1. update lead.email + consent_to_contact=true
                                  │     │     2. persist consent en lead_consent_log
                                  │     │     3. generate QR token en event_qr_tokens
                                  │     │     4. template `conf_confirmacion_registro` con URL QR
                                  │     └─ question → LLM (DeepSeek con guardrails) o fallback
                                  │
                                  ├─ provider.send({to, body, templateName?, templateLanguage?})
                                  │
                                  ├─ persist outbound en lead_whatsapp_conversations
                                  ├─ markWhatsAppStatus (contactado o lost)
                                  └─ touch lead (last_contacted_at + summary)
```

## Intenciones (BotIntent) — orden de detección

```ts
function detectIntent(body, isFirstMessage) → BotIntent:
  text = body.trim()
  if text === '' → "question"

  // Señales fuertes — ganan siempre, incluso en primer mensaje.
  if OPT_OUT_RE.test(text)        → "opt_out"
  if REGISTER_RE.test(text)       → "register"
  if REGISTER_PHRASE_RE.test(text)→ "register"
  if EMAIL_RE.test(text)          → "provide_email"

  // Greeting — primer mensaje → welcome; posteriores → greeting.
  if GREETING_RE.test(text):
    return isFirstMessage ? "welcome" : "greeting"

  // Texto libre — primer mensaje → welcome; posterior → question (LLM).
  if isFirstMessage → "welcome"
  return "question"
```

### Regex (deterministas, sin LLM)

```ts
OPT_OUT_RE          = /^(no|cancelar|baja|stop|unsubscribe)/i
REGISTER_RE         = /^(s[ií]|confirmo|inscribirme|registrarme|quiero|me interesa)/i
REGISTER_PHRASE_RE  = /\b(quiero\s+inscribirme|me\s+interesa\s+(inscribirme|el\s+curso|el\s+evento|saber\s+m[aá]s)|inscribirme\s+al?\s+evento|c[oó]mo\s+me\s+inscribo)\b/i
EMAIL_RE            = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
GREETING_RE         = /^(hola|hi|buenos|buenas|informaci[oó]n|info|menu|men[uú])/i
```

Frases de register con anclas relajadas (`REGISTER_PHRASE_RE`) cubren casos como
"Hola, quiero inscribirme" o "Me interesa saber más". Palabras sueltas como
"quiero" o "me interesa" aisladas NO clasifican como register — se quedan en
`question` para que el LLM las procese.

## Compliance LFPDPPP

### Captura de consentimiento

Solo cuando el lead responde con `provide_email`:

```sql
UPDATE leads
SET email = $email, consent_to_contact = true
WHERE id = $leadId;

INSERT INTO lead_consent_log (lead_id, phone_normalized, consent_granted,
                              consent_source, consent_text, metadata)
VALUES (..., true, 'whatsapp_bot', <disclosure_text>, ...);
```

Texto del disclosure que se muestra al lead:

> "Acepto recibir información comercial de Qlick Marketing Integral por
> WhatsApp. Puedo revocar este consentimiento en cualquier momento
> respondiendo 'baja'."

### Opt-out

Si `intent = "opt_out"`:

- `whatsapp_status` → `lost`
- `lead_whatsapp_log` registra el cambio
- El bot NO responde más al teléfono ese lead

## 7 plantillas de WhatsApp — copy aprobado para Meta

Las 7 plantillas están redactadas con el lenguaje factual que Meta aprueba (no promesas,
variables numéricas, categorizadas como Utility). El socio las carga en Meta siguiendo
`docs/PARTNER_META_SETUP.md` § 4.

### 1. `conf_bienvenida` (UTILITY) — Primer saludo

**Header:** Texto — `¡Hola! 👋`

**Body:**

```
¡Hola {{1}}! Bienvenido/a a Qlick.
Soy el asistente virtual de Qlick Marketing. Te puedo ayudar con todo sobre la conferencia "{{EVENT_NAME}}":
📅 Fecha y hora
📍 Lugar y cómo llegar
🎯 Qué vas a aprender
❌ Si querés cancelar
Para continuar, necesito que me digas tu nombre completo y email. Al seguir, aceptás nuestro Aviso de Privacidad: https://qlick.mx/privacidad
Escribí "menu" en cualquier momento para ver las opciones.
```

**Footer:** `Qlick — Marketing integral con IA`

**Buttons:**
- Quick Reply: `📅 Ver fecha y lugar`
- Quick Reply: `🎯 Temario`
- Quick Reply: `✅ Inscribirme`

**Variable `{{1}}`:** nombre del lead (si ya lo tenemos del ad click ID, si no, genérico).

**Compliance:** link a `/privacidad` incluido.

### 2. `conf_info_evento` (UTILITY) — Cuando preguntan "¿de qué se trata?"

**Header:** Sin header.

**Body:**

```
📚 Conferencia: {{EVENT_NAME}}
📅 Fecha: {{EVENT_DATE}}
🕐 Hora: {{EVENT_TIME}} hrs (México)
📍 Lugar: {{EVENT_LOCATION}}
⏱️ Duración: {{EVENT_DURATION}}
🎯 Temario:
• Fundamentos de IA aplicada a marketing
• Herramientas prácticas que podés usar hoy
• Casos de uso reales con resultados medibles
• Q&A en vivo con el conferencista
🎁 Es GRATIS y los lugares son limitados (50 asistentes).
¿Querés que te reserve un lugar? Respondé "Sí" o escribí "menu" para más opciones.
```

**Footer:** `Qlick — Conferencia gratuita`

**Buttons:**
- Quick Reply: `✅ Sí, inscríbame`
- Quick Reply: `🎯 Ver temario completo`

### 3. `conf_confirmacion_registro` (UTILITY) — Cuando confirma + incluye QR

**Header:** Sin header.

**Body:**

```
✅ ¡Listo, {{1}}! Tu lugar está reservado.
📋 Detalles:
• Conferencia: {{EVENT_NAME}}
• Fecha: {{EVENT_DATE}}
• Hora: {{EVENT_TIME}} hrs
• Lugar: {{EVENT_LOCATION}}
🎫 Tu código de acceso (QR):
{{5}}
Mostralo en la entrada el día del evento. Es personal e intransferible.
📍 Cómo llegar: https://maps.google.com/?q={{EVENT_LOCATION_ENCODED}}
¿Necesitás algo más? Escribí "menu" para opciones o "BAJA" si querés cancelar.
```

**Footer:** `¡Nos vemos el {{EVENT_DATE}}!`

**Buttons:**
- URL: `📍 Cómo llegar` (Maps)
- Quick Reply: `📅 Agregar a calendario`
- Quick Reply: `❌ Cancelar`

**Variable `{{5}}`:** URL del QR único (`https://qlick.mx/check-in/{token}`).

### 4. `conf_recordatorio_24h` (UTILITY) — Día antes

**Header:** Texto — `⏰ Mañana es la conferencia`

**Body:**

```
Hola {{1}} 👋
Te recordamos que mañana tenés la conferencia "{{EVENT_NAME}}".
📅 {{EVENT_DATE}} a las {{EVENT_TIME}} hrs
📍 {{EVENT_LOCATION}}
🎫 Tu QR de acceso: {{5}}
Tips:
• Llegá 15 min antes para registro
• Traé una identificación
• El estacionamiento es gratuito
¿Venís? Respondé "Sí" para confirmar o "No" si no podés.
```

**Footer:** `¡Nos vemos mañana!`

**Buttons:**
- Quick Reply: `✅ Confirmo que voy`
- Quick Reply: `❌ No puedo ir`

### 5. `conf_recordatorio_1h` (UTILITY) — 1 hora antes

**Header:** Texto — `🔔 Empezamos en 1 hora`

**Body:**

```
{{1}}, ¡ya casi empezamos! 🚀
📍 Estás en: {{EVENT_LOCATION}}
🎫 Tu QR: {{5}}
Te esperamos en recepción. Cualquier duda, escribinos acá.
```

**Footer:** Sin footer.

**Buttons:**
- URL: `📍 Abrir en Maps`

### 6. `conf_post_conferencia` (UTILITY) — 2-4 horas después

**Header:** Sin header.

**Body:**

```
Gracias por asistir, {{1}} 🙏
Esperamos que te haya servido la conferencia "{{EVENT_NAME}}".
📂 Material de la conferencia: {{2}}
Nos encantaría tu feedback (30 seg):
{{3}}
Si querés seguir aprendiendo sobre marketing con IA, tenemos un curso completo. ¿Te cuento? Respondé "Sí" o "No, gracias".
```

**Footer:** `Qlick — Gracias por tu tiempo`

**Buttons:**
- URL: `📂 Descargar material` (Google Drive)
- URL: `📝 Dejar feedback` (Typeform o similar)
- Quick Reply: `✅ Sí, contame del curso`
- Quick Reply: `❌ No, gracias`

**Variables:** `{{1}}` nombre, `{{2}}` URL material, `{{3}}` URL encuesta.

### 7. `conf_reenviar_qr` (UTILITY) — Si el lead pide reenviar

**Header:** Sin header.

**Body:**

```
Hola {{1}}, acá está tu QR de acceso:
🎫 {{5}}
Mostralo en la entrada. Si no te funciona, escribinos y te ayudamos.
```

**Footer:** Sin footer.

**Buttons:**
- URL: `🎫 Ver QR completo`

## Plantilla de variables (env vars runtime)

Todas las plantillas usan env vars para que se actualicen sin redeploy:

```bash
EVENT_NAME         # default: "IA y Marketing Básico"
EVENT_DATE         # default: "6 de julio"
EVENT_TIME         # default: "10:00"
EVENT_LOCATION     # default: "Ciudad de México"
EVENT_DURATION     # default: "2 horas"
```

Lecutura en `bot-engine.ts → getActiveEvent()`.

## Edge cases manejados

| Caso | Comportamiento |
|---|---|
| Phone no normalizable | `ok: false`, `intent: "question"`, sin lead |
| Sin Supabase configurado | Demo mode: lead sintético, encuentra/crea en memoria, no persiste |
| Sin WHATSAPP_CLOUD_* | Provider retorna `demo: true`, no envía nada |
| Sin DEEPSEEK_API_KEY | Mock heurístico, mensajes genéricos |
| Webhook sin firma (prod) | 401 "Falta X-Hub-Signature-256" |
| Webhook con firma inválida | 401 "Firma inválida" |
| Webhook con WHATSAPP_WEBHOOK_SECRET vacío | Warning en log, NO valida (dev friendly) |
| Wamid duplicado (re-entrega de Meta) | 23505 silencioso, idempotente |
| Template rechazado por Meta | Provider devuelve error, bot cae a texto libre (ventana 24h) o no responde |
| QR con phone duplicado para mismo evento | Idempotente: reutiliza token existente no-checkado |
| QR expirado (>6h post-evento) | API retorna 410 Gone |

## Modo sugerencia (LLM)

El bot **nunca envía respuestas del LLM sin filtrar**. `validateAgentReply()` revisa
contra `guardrails.ts` y reemplaza contenido prohibido (descuento, gratis, confirmación
de pago) con fallback genérico.

`task = "suggest_reply"` siempre marca `needsReview: true` aunque el bot envíe la
respuesta (la revisión humana sigue siendo opcional o requerida según decisión de
producto).

## Migración a Meta real

Desde mock hasta tokens reales solo requiere cambiar 5 env vars:

| Env var | Mock value (no-op) | Real value |
|---|---|---|
| `WHATSAPP_CLOUD_PHONE_NUMBER_ID` | (vacío) | `<phone-id>` |
| `WHATSAPP_CLOUD_ACCESS_TOKEN` | (vacío) | `<system user token>` |
| `WHATSAPP_CLOUD_API_VERSION` | `v20.0` | (default) |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | (vacío) | (cualquier string random) |
| `WHATSAPP_WEBHOOK_SECRET` | (vacío) | (app secret) |

Sin cambios de código. La migración de socio con cuenta verificada toma ~1 hora
total (configurar App + WABA + comprar número + aprobar plantillas).

## Métricas (cómo medimos éxito)

| Métrica | Cómo se mide |
|---|---|
| CTR (Click-to-WhatsApp) | Meta Marketing API → campaigns insights |
| CPL (cost per lead) | spend / leads_count (atribución cruzada) |
| Bot intent distribution | query sobre `lead_whatsapp_conversations.message_type` |
| Conversión (lead → registrado) | `event_confirmations` count por source=whatsapp |
| Show-up rate | `event_attendees.checked_in_at` count / confirmados |
| Ópticos | `lead_consent_log` (consentimientos otorgados) |

Las métricas de campañas viven en `/admin/eventos/[id]?view=campaigns` (CampaignsTab).
