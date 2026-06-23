# Estrategia de WhatsApp + Agente IA — Qlick Marketing Integral

**Fecha:** 2026-06-23
**Estado:** Foundations de WhatsApp y Agente IA en modo demo. El agente opera en
**modo sugerencia** (siempre con revisión humana). WhatsApp solo click-to-chat
(`wa.me`). Sin APIs externas conectadas.

---

## Resumen ejecutivo

Se añaden dos capas al CRM: (1) una **abstracción de proveedor de WhatsApp** que
hoy usa click-to-chat manual y deja preparados los stubs para la Cloud API oficial
y un BSP, y (2) un **Agente IA** que sugiere respuestas, clasifica intención y
recomienda cursos — siempre proponiendo, nunca enviando. Ambas siguen el mismo
patrón de abstracción que pagos, video y contacto (D-005/D-013/D-015/D-016).

El principio rector es **bajo riesgo primero**: nada se automatiza de punta a punta
hasta que haya guardrails, opt-in y un backend.

---

## 1. Capa de WhatsApp — `src/lib/whatsapp/`

```
src/lib/whatsapp/
├── providers/
│   ├── whatsapp-provider.ts        # Contrato WhatsAppProvider
│   ├── manual-wa-provider.ts       # ACTIVO: click-to-chat wa.me
│   ├── meta-cloud-api-provider.ts  # STUB: Cloud API de Meta
│   └── bsp-provider.ts             # STUB: Business Solution Provider
├── webhooks/
│   ├── types.ts                    # Payloads de la Cloud API
│   ├── verify.ts                   # Verificación del webhook de Meta
│   └── handler.ts                  # Handler placeholder seguro
└── index.ts                        # Registry + getActiveWhatsAppProvider()
```

### Proveedores

| Proveedor | Estado | Qué hace |
| --------- | ------ | -------- |
| `manual_wa` | **Activo** | Construye enlaces `wa.me` con mensaje pre-escrito. No envía nada automáticamente. |
| `meta_cloud_api` | Stub | Placeholder para la WhatsApp Business Cloud API de Meta. |
| `bsp` | Stub | Placeholder para un BSP (p. ej. 360dialog, Twilio, MessageBird). |

`getActiveWhatsAppProvider()` devuelve el activo (hoy `manual_wa`). En el futuro
puede leerse de `NEXT_PUBLIC_WHATSAPP_PROVIDER`.

### Contrato

```ts
interface WhatsAppProvider {
  readonly name: WhatsAppProviderName;
  readonly displayName: string;
  readonly active: boolean;
  readonly stub: boolean;
  send(request: WhatsAppSendRequest): Promise<WhatsAppSendResult>;
}
```

El `manual_wa` no implementa envío outbound real: su `send()` devuelve
`{ ok, demo: true }`. Los stubs de Cloud API/BSP devuelven error controlado hasta
que se implementen.

### Webhooks

`verify.ts` y `handler.ts` son **placeholders seguros**: tipos y firma de la
verificación de Meta (`hub.mode`/`hub.verify_token`), pero el handler aún no
procesa mensajes reales. No hay endpoint `/api/webhooks/whatsapp` todavía.

---

## 2. WhatsApp manual (click-to-chat) — `src/lib/contact/whatsapp.ts`

Extendido para el CRM. Define **10 intents** con plantillas y personalización de
nombre+curso:

`sales`, `support`, `enroll`, `group`, `payment_reminder`, `follow_up`,
`course_interest`, `welcome_student`, `schedule_call`, `reactivation`.

`buildWhatsAppMessage(intent, { name, courseTitle, customMessage })` arma el texto.
`getWhatsAppConfigStatus()` lee las env vars públicas y dice qué falta configurar.
`<WhatsAppButton>` ahora acepta `name`, `courseTitle` y `customMessage`.

> **Sin inventar números.** Si `NEXT_PUBLIC_WHATSAPP_SALES_NUMBER` etc. están
> vacíos, los botones se muestran deshabilitados ("próximamente"). Ver
> `docs/CONTACT_AND_WHATSAPP_STRATEGY.md`.

---

## 3. Agente IA — `src/lib/ai/`

```
src/lib/ai/
├── agent-provider.ts      # Contrato AIAgentProvider + AgentTask
├── mock-agent-provider.ts # ACTIVO: heurísticas deterministas, sin LLM
├── openrouter-provider.ts # STUB: para modelos reales vía OpenRouter
├── agent-prompts.ts       # System + task prompts
├── guardrails.ts          # Reglas duras (ver AI_AGENT_GUARDRAILS.md)
└── index.ts               # Registry + getActiveAgentProvider()
```

### Tareas del agente (`AgentTask`)

`classify_intent`, `suggest_reply`, `summarize_conversation`, `detect_urgency`,
`detect_payment_pending`, `recommend_course`, `escalate_to_human`.

### Modo sugerencia (regla no negociable)

Todo `AgentResult` lleva `needsReview: true`. **El agente nunca envía mensajes.**
Devuelve propuestas que un humano revisa y envía por WhatsApp manual (`wa.me`).
La UI de conversaciones lo deja explícito: *"Revisa antes de enviar. El agente IA
no envía mensajes automáticamente."*

### Proveedor activo

`mockAgentProvider` es determinista (sin llamada a LLM): usa las heurísticas de
`guardrails.ts` y las plantillas de `agent-utils.ts`. Sirve como baseline y para
QA reproducible. `openrouterAgentProvider` es un stub para modelos reales.

---

## 4. Flujo de punta a punta (estado actual)

```
Lead escribe (web/WhatsApp/ads)
        │
        ▼
createLeadFromContactForm  ──►  CRM (demo, no persiste)
        │
        ▼
Agente IA (mock):
  • classifyIntentHeuristic  ──►  LeadIntent
  • recommendCourseHeuristic ──►  curso sugerido (o null)
  • mustEscalateToHuman      ──►  { escalate, reason }
  • getAgentReplyTemplate    ──►  borrador (needsReview)
        │
        ▼
Humano revisa en la UI (Conversaciones / Drawer)
        │
        ▼
WhatsApp manual (wa.me) con buildWhatsAppMessage(intent)
```

El agente clasifica y propone; el humano decide y envía. No hay envío autónomo.

---

## 5. Ruta a producción (ordenado por riesgo)

1. **Backend + persistencia** (Fase 1): guardar leads y conversaciones en Supabase.
2. **Opt-in y aviso de privacidad** antes de cualquier mensajería outbound.
3. **WhatsApp Cloud API** (ver `WHATSAPP_OFFICIAL_INTEGRATION_PLAN.md`): plantillas
   aprobadas, ventana de 24h, verificación de Meta.
4. **Agente IA con LLM real** (OpenRouter o similar): mantener `needsReview` hasta
   tener métricas de seguridad; solo entonces considerar autoenvío acotado.
5. **Autoenvío (futuro lejano):** solo para intents de bajo riesgo (bienvenida,
   recordatorio) y con guardrails + logging.

---

## 6. Reglas de marca y datos

- No se inventan números de WhatsApp ni URLs de grupo.
- Sobre fondos oscuros, nunca PNG `white/*`; usar `BrandLockup variant="dark"`
  (D-012).
- El CRM demo no debe usarse con datos reales sin backend y aviso de privacidad.

---

## Referencias

- `src/lib/whatsapp/` — proveedores y webhooks.
- `src/lib/contact/whatsapp.ts` — intents y helper click-to-chat.
- `src/lib/ai/` — agente IA y guardrails.
- `docs/WHATSAPP_OFFICIAL_INTEGRATION_PLAN.md` — plan de la Cloud API.
- `docs/AI_AGENT_GUARDRAILS.md` — reglas del agente.
- `docs/CONTACT_AND_WHATSAPP_STRATEGY.md` — capa de contacto (D-013).
