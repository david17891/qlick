# Estrategia de CRM — Qlick Marketing Integral

**Fecha:** 2026-06-23
**Estado:** Foundation lista en modo demo. Sin backend ni persistencia. Las
escrituras devuelven `demo: true` y no se guardan.

---

## Resumen ejecutivo

Qlick necesita un CRM para no perder leads que entran por la web, WhatsApp y
anuncios, y para que el equipo de ventas sepa a quién seguir, cuándo y cómo. Esta
fase entrega la **base funcional en modo demo**: tipos de dominio completos, datos
ficticios, servicios de lectura/escritura, una UI completa (kanban, tabla de leads,
conversaciones, calendario, agente IA y configuración WhatsApp) e integración del
formulario de contacto.

El CRM **no** está conectado a Supabase ni a un CRM externo (regla D-003/D-005).
La firma pública de los servicios está pensada para migrar a Supabase sin romper
la UI.

---

## Modelo de dominio

Definido en `src/types/crm.ts` (re-exportado en `src/types/index.ts`). Cubre:

| Entidad | Propósito |
| ------- | --------- |
| `Lead` | Persona interesada en un curso/servicio. |
| `LeadStatus` | 9 estados: `new`, `contacted`, `qualified`, `proposal_sent`, `payment_pending`, `enrolled`, `active_student`, `lost`, `churned`. |
| `LeadSource` | 9 orígenes: `website`, `whatsapp`, `facebook_ads`, `instagram_ads`, `referral`, `event`, `manual`, `organic`, `other`. |
| `LeadIntent` | 9 intenciones: `course_information`, `enroll_course`, `pricing`, `payment_help`, `group_access`, `support`, `schedule_call`, `course_recommendation`, `unknown`. |
| `LeadInteractionChannel` | 7 canales: `whatsapp`, `email`, `call`, `form`, `internal_note`, `ai_suggestion`, `system`. |
| `AppointmentStatus` / `AppointmentType` | Citas y seguimientos (5 estados, 6 tipos). |
| `SalesOwner` | Responsable de ventas (rol `sales`/`support`/`instructor`). |
| `LeadInteraction` / `CRMNote` / `CRMTask` | Historial, notas y tareas de seguimiento. |
| `Conversation` / `ConversationMessage` | Hilos de WhatsApp/claro con dirección y flag `aiSuggested`. |
| `AIAgentProfile` / `AIAgentSuggestion` | Configuración del agente y sus sugerencias. |
| `WhatsAppProviderConfig` | Estado de los proveedores de mensajería. |
| `CRMOverview` / `PipelineStage` | Agregados para el dashboard y el kanban. |

El campo `Appointment.externalCalendarId` queda reservado para una futura
sincronización con Google Calendar (no se usa en el MVP).

---

## Arquitectura

```
src/
├── types/crm.ts                      # 17 tipos del dominio
├── lib/
│   ├── data/crm-data.ts              # 15 leads, 3 owners, 9 interacciones, 3
│   │                                 # notas, 8 tareas, 3 conversaciones,
│   │                                 # 6 citas, perfil IA, 6 sugerencias, 3
│   │                                 # proveedores WhatsApp (datos ficticios)
│   └── crm/
│       ├── crm-service.ts            # Fachada: lecturas reales + escrituras demo
│       ├── lead-utils.ts             # Labels, tonos, cálculo de riesgo
│       ├── pipeline-utils.ts         # Etapas del pipeline + conversión
│       ├── appointments.ts           # Citas y próximas
│       ├── agent-utils.ts            # Perfil IA + sugerencias por lead
│       └── index.ts
└── components/crm/
    ├── CRMView.tsx                   # 7 secciones (A–G)
    ├── LeadDetailDrawer.tsx          # Drawer de detalle con 6 botones WhatsApp
    └── index.ts
```

### Capa de servicio — `src/lib/crm/crm-service.ts`

**Lecturas (reales sobre datos mock):**
`getLeads`, `getLeadById`, `getLeadsByStatus`, `getLeadsBySource`, `getSalesOwners`,
`getLeadInteractions`, `getLeadConversation`, `getConversations`, `getCRMOverview`,
`getUpcomingCRMTasks`, `getOverdueCRMTasks`, `getAppointments`, `getAIAgentProfile`,
`getAISuggestionsForLead`, `getWhatsAppProviders`.

**Escrituras (demo, `demo: true`, no persisten):**
`createLeadFromContactForm(input)` — llamado desde el formulario de `/contacto`.
`changeLeadStatus(leadId, nextStatus)` — cambio de estado desde el drawer.

Ambas registran en `console.info` para QA y devuelven `{ demo: true, note }` para
que la UI etiquete el resultado.

---

## Pipeline comercial

El kanban agrupa leads por `LeadStatus`. Las etapas están definidas en
`pipeline-utils.ts` con su etiqueta y tono. La conversión se calcula como
`enrolled / (enrolled + lost)` (simulada, sobre datos mock).

```
new → contacted → qualified → proposal_sent → payment_pending
                                                    ↓
                                              enrolled → active_student
   ↘ lost  ·  churned (ramas de salida)
```

### Cálculo de riesgo de respuesta

`calculateLeadResponseRisk(lead)` en `lead-utils.ts` marca leads en riesgo según:
tiempo desde el último contacto, tareas vencidas, estado estancado y pagos
pendientes. Devuelve `{ level: "low"|"medium"|"high", reasons: string[] }`.

---

## Integración con el formulario de contacto

`/contacto` ahora:

1. Pide **curso de interés** (select con los 4 cursos).
2. Requiere **consentimiento explícito** (checkbox obligatorio) para ser
   contactado por WhatsApp, llamada o correo.
3. Al enviar, además del `ContactProvider` (mock), llama a
   `createLeadFromContactForm` con `source: "website"`, `intent:
   "course_information"` y `consentToContact: true`.

La validación (`validateContactMessage`) rechaza el envío si
`consentToContact === false`. El éxito muestra: *"Lead registrado en modo demo.
En producción se guardará en el CRM y se asignará a ventas."*

---

## Dónde aparece el CRM en la UI

| Lugar | Qué se ve |
| ----- | --------- |
| `/admin` → pestaña **CRM** | `CRMView` con 7 sub-secciones. |
| `/admin` → "Próximas integraciones" (Fase 4) | Mención actualizada: la base del CRM ya está lista. |
| `/contacto` | Formulario con curso + consentimiento; nota de privacidad. |

Las 7 secciones de `CRMView`:
- **A. Resumen** — KPIs (leads, nuevos, contactados, pagos pendientes, inscritos,
  alumnos activos, conversión, vencidos) + próximas citas.
- **B. Pipeline** — kanban por estado con tarjetas de lead y badge de riesgo.
- **C. Leads** — tabla con 6 filtros (búsqueda, estado, fuente, curso, responsable,
  intención).
- **D. Conversaciones** — lista + panel de mensajes con sugerencia IA.
- **E. Calendario** — citas próximas (sin Google Calendar).
- **F. Agente IA** — perfil, acciones permitidas/prohibidas, reglas de escalamiento.
- **G. WhatsApp** — estado de configuración y proveedores.

---

## Reglas y restricciones (fase demo)

- **No persistir PII real.** Las escrituras solo loggean en consola; no se guarda
  nada. La nota de `/contacto` lo advierte.
- **Etiquetado explícito "demo".** Cada sección crítica lleva banner o badge.
- **No conectar Supabase** (D-003). La migración es por misma-firma, no por refactor.
- **Consentimiento obligatorio.** Ningún lead entra al CRM sin `consentToContact`.
- **Calendario sin Google Calendar.** `externalCalendarId` queda para el futuro.

---

## Ruta a producción

1. **Persistencia (Fase 1):** migrar `src/lib/data/crm-data.ts` a tablas Supabase
   con la misma forma. Los servicios no cambian de firma.
2. **CRM externo (opcional):** si se prefiere HubSpot/Zoho/Pipedrive, completar el
   stub `crmContactProvider.ts` (D-013) o exponer los leads por API.
3. **Webhooks entrantes:** los leads que entren por WhatsApp/ads deben crear leads
   con la fuente correcta (ver `src/lib/whatsapp/webhooks/`).
4. **Aviso de privacidad** publicado antes de capturar datos reales.

---

## Referencias

- `src/types/crm.ts` — tipos del dominio.
- `src/lib/crm/` — servicios.
- `src/components/crm/` — UI.
- `docs/WHATSAPP_AI_AGENT_STRATEGY.md` — agente IA y mensajería.
- `docs/AI_AGENT_GUARDRAILS.md` — reglas del agente.
- `docs/DECISIONS.md` D-014 — CRM en modo demo.
