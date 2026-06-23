# Reporte de implementación — CRM + WhatsApp + Agente IA

**Fecha:** 2026-06-23
**Rama:** `feature/qlick-crm-whatsapp-agent`
**Resumen:** foundation del CRM con UI completa, abstracciones de WhatsApp y agente
IA, todo en modo demo. Sin backend, sin APIs reales conectadas.

---

## 1. Qué se hizo (completo y funcional en demo)

### Tipos de dominio
- `src/types/crm.ts` — 17 tipos: `Lead`, `LeadStatus` (9), `LeadSource` (9),
  `LeadIntent` (9), `LeadInteractionChannel` (7), `AppointmentStatus` (5) +
  `AppointmentType`, `SalesOwner`, `LeadInteraction`, `CRMNote`, `CRMTask`,
  `Conversation`/`ConversationMessage`, `Appointment`, `AIAgentProfile`,
  `AIAgentSuggestion`, `WhatsAppProviderConfig`, `CRMOverview`, `PipelineStage`.
- Re-export en `src/types/index.ts`.

### Datos mock
- `src/lib/data/crm-data.ts` — 15 leads ficticios, 3 owners, 9 interacciones,
  3 notas, 8 tareas (vencidas + próximas), 3 conversaciones con mensajes,
  6 citas, perfil IA, 6 sugerencias IA, 3 proveedores WhatsApp.
- Fechas deterministas sobre `BASE_DATE = 2026-06-23`.
- Nombres inventados, teléfonos `+52XXXXXXXXXX`, emails `@example.com` (no PII).

### Servicios CRM (`src/lib/crm/`)
- `crm-service.ts` — lecturas reales + `createLeadFromContactForm` y
  `changeLeadStatus` (ambas `demo: true`).
- `lead-utils.ts` — labels, tonos, `calculateLeadResponseRisk`.
- `pipeline-utils.ts` — etapas y `calculateConversionRate`.
- `agent-utils.ts` — perfil IA + sugerencias + plantillas por intención.
- `appointments.ts` — citas y próximas.
- `index.ts` — barrel.

### WhatsApp manual
- `src/lib/contact/whatsapp.ts` — 10 intents, `buildWhatsAppMessage`,
  `getWhatsAppConfigStatus`. Retrocompatible.
- `WhatsAppButton` extendido: `name`, `courseTitle`, `customMessage`.

### Arquitectura WhatsApp oficial (`src/lib/whatsapp/`)
- `providers/whatsapp-provider.ts` — contrato `WhatsAppProvider`.
- `manual-wa-provider.ts` — activo (click-to-chat).
- `meta-cloud-api-provider.ts` — stub.
- `bsp-provider.ts` — stub.
- `webhooks/types.ts`, `verify.ts`, `handler.ts` — placeholders seguros.
- `index.ts` — registry + `getActiveWhatsAppProvider`.

### Agente IA (`src/lib/ai/`)
- `agent-provider.ts` — contrato + `AgentTask`.
- `mock-agent-provider.ts` — activo, heurísticas deterministas.
- `openrouter-provider.ts` — stub.
- `agent-prompts.ts` — system + task prompts.
- `guardrails.ts` — `classifyIntentHeuristic`, `recommendCourseHeuristic`,
  `mustEscalateToHuman`, `validateAgentReply`.
- `index.ts` — registry + `getActiveAgentProvider`.

### UI CRM (`src/components/crm/`)
- `CRMView.tsx` — 7 secciones (Resumen, Pipeline, Leads, Conversaciones,
  Calendario, Agente IA, WhatsApp) con banner "demo".
- `LeadDetailDrawer.tsx` — drawer con datos, riesgo, 6 botones WhatsApp, cambio de
  estado (demo), historial, notas, conversación, sugerencias IA, citas.
- `index.ts` — exports.

### Integraciones
- Pestaña **CRM** en `AdminView.tsx` (renderiza `<CRMView />`).
- `ContactForm.tsx` — campo curso de interés + checkbox de consentimiento
  obligatorio + llamada a `createLeadFromContactForm`.
- `/contacto` — nota de privacidad/consentimiento.

### Documentación
- `CRM_STRATEGY.md`, `WHATSAPP_AI_AGENT_STRATEGY.md`,
  `WHATSAPP_OFFICIAL_INTEGRATION_PLAN.md`, `AI_AGENT_GUARDRAILS.md`, este reporte.
- ROADMAP, DECISIONS (D-014/D-015/D-016) y README actualizados.

---

## 2. Qué quedó preparado (stub / placeholder, no funcional)

| Componente | Estado | Para activar |
| ---------- | ------ | ------------ |
| `metaCloudApiProvider` | Stub | Completar `send()` + endpoint webhook + plantillas Meta |
| `bspProvider` | Stub | Elegir BSP, completar `send()` |
| `openrouterAgentProvider` | Stub | Configurar OpenRouter, mantener `needsReview` |
| `webhooks/handler.ts` | Placeholder | Crear `/api/webhooks/whatsapp` cuando haya backend |
| `crmContactProvider` | Stub (ya existía) | Integrar HubSpot/Zoho/propio |
| `Appointment.externalCalendarId` | Reservado | Google Calendar sync futuro |

---

## 3. Qué falta (no incluido en esta fase)

- **Persistencia:** Supabase (Fase 1). Hoy todo es en memoria.
- **WhatsApp Cloud API real:** plantillas, opt-in, ventana 24h (ver plan oficial).
- **Agente IA con LLM real:** OpenRouter u otro, manteniendo guardrails.
- **Aviso de privacidad** publicado antes de capturar datos reales.
- **Autoenvío:** fuera de alcance. El agente siempre sugiere; un humano envía.
- **Reportes/analítica** avanzados del CRM.

---

## 4. Validación

| Check | Estado |
| ----- | ------ |
| `npm run type-check` | ✅ verde |
| `npm run lint` | ✅ verde |
| `npm run build` | ✅ (ver Paso 13) |
| `npm run audit:links` | ✅ (ver Paso 13) |

---

## 5. Reglas respetadas

- Stack fijo: Next 14.2.35 · React 18.3.1 · TS 5.5.3 · Tailwind 3.4.6.
- Sin Supabase, pagos reales, video pro, WhatsApp API real, OpenRouter, Meta, BSPs
  (D-003/004/005/006).
- WhatsApp solo `wa.me`; no se inventan números ni URLs de grupo.
- Marca: sobre fondos oscuros, `BrandLockup variant="dark"` (no PNG `white/*`, D-012).
- Todo lo "demo" etiquetado explícitamente; las escrituras devuelven `demo: true`.
- Agente IA siempre en modo sugerencia (`needsReview`); guardrails prohíben
  confirmar pagos/accesos/descuentos.
- Calendario sin Google Calendar; `externalCalendarId` reservado.

---

## 6. Referencias rápidas

- Tipos: `src/types/crm.ts`
- Datos: `src/lib/data/crm-data.ts`
- Servicios: `src/lib/crm/`
- WhatsApp: `src/lib/whatsapp/`, `src/lib/contact/whatsapp.ts`
- Agente IA: `src/lib/ai/`
- UI: `src/components/crm/`
- Estrategia: `docs/CRM_STRATEGY.md`, `docs/WHATSAPP_AI_AGENT_STRATEGY.md`
- Guardrails: `docs/AI_AGENT_GUARDRAILS.md`
- Plan oficial: `docs/WHATSAPP_OFFICIAL_INTEGRATION_PLAN.md`
- Decisiones: `docs/DECISIONS.md` (D-014, D-015, D-016)
