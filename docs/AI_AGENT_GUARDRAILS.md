# Guardrails del Agente IA — Qlick Marketing Integral

> **Fuente canónica.** Este doc es la fuente de verdad para los guardrails
> del agente IA de CRM en Qlick (qué hace, qué NO hace, escalamiento,
> anti-alucinación, modo sugerencia). El índice cross-cutting para AI
> agents vive en `.harness/docs/project-standards.md` (§10 IA agent en
> CRM: modo sugerencia), y el scope del rein que opera el CRM y el
> agente en `.harness/reins/crm-expert/agent.md`. Si hay conflicto, gana
> este doc.

**Fecha:** 2026-06-23
**Estado:** Reglas implementadas en `src/lib/ai/guardrails.ts`. El agente opera en
**modo sugerencia** (`needsReview: true`) siempre.

> Estos guardrails aplican al proveedor mock (actual) **y** a cualquier LLM real
> futuro (OpenRouter u otro). Son reglas duras, no recomendaciones.

---

## Principio rector: sugerir, no confirmar

El agente IA **propone** respuestas y acciones; **nunca** confirma, niega ni
ejecuta nada que tenga consecuencia para el usuario (pagos, accesos, descuentos,
datos personales). Toda propuesta pasa por revisión humana antes de enviarse.

Esto reduce el riesgo de alucinaciones y de "commitments" no autorizados.

---

## Qué hace el agente (permitido)

- **Clasificar intención** del mensaje del lead (`classifyIntentHeuristic`).
- **Recomendar un curso** emparejando palabras clave con cursos conocidos. Si no
  hay coincidencia, devuelve `null` (no inventa).
- **Sugerir un borrador de respuesta** según la intención y el tono del negocio.
- **Resumir conversaciones** (tarea definida).
- **Detectar urgencia** y pagos pendientes (tareas definidas).
- **Proponer escalamiento** a humano (`escalate_to_human`).

Todas las salidas llevan `needsReview: true`.

---

## Qué NO hace el agente (prohibido)

Implementado en `validateAgentReply` (lista `FORBIDDEN_PHRASES`) y en el perfil IA
(`forbiddenActions`):

- ❌ **Confirmar pagos** ("pago aprobado", "confirmo tu pago").
- ❌ **Conceder accesos** ("te di acceso", "acceso listo").
- ❌ **Ofrecer descuentos o promociones** no autorizados ("descuento", "gratis",
  "promoción").
- ❌ **Prometer reembolsos** ("reembolso").
- ❌ **Inventar precios, fechas, requisitos o resultados** (anti-alucinación).
- ❌ **Pedir o confirmar datos sensibles** (tarjetas, contraseñas).
- ❌ **Enviarse por sí mismo**: el agente nunca envía mensajes. El humano lo hace.

Si una propuesta contiene una frase prohibida, `validateAgentReply` devuelve
`{ ok: false, reasons }` y la UI **no** debe ofrecerla sin editar.

---

## Escalamiento obligatorio a humano

`mustEscalateToHuman(message)` fuerza escalamiento (sin importar el LLM) en:

| Caso | Razón |
| ---- | ----- |
| Reembolso, queja, denuncia, jurídico | "Queja/reembolso/jurídico" |
| Pagos, transferencias, SPEI, OXXO, tarjeta, rechazo | "Pagos: requiere validación humana" |
| Errores, bugs, "no puedo", soporte | "Soporte técnico de plataforma" |
| Descuentos, promociones, "más barato" | "Descuento no autorizado" |
| Datos personales, privacidad, baja, eliminar datos | "Datos personales / privacidad" |

Ninguna de esas conversaciones debe cerrarse con una respuesta automática.

---

## Anti-alucinación

- **Solo recomienda cursos que existen** (`recommendCourseHeuristic` empareja contra
  la lista real del catálogo; si no hay match, `null`).
- **No cita precios** en las plantillas (los precios se confirman en el catálogo o
  con ventas).
- **Tono y hechos** vienen del `AIAgentProfile` (nombre, horario, descripción); el
  agente no inventa datos del negocio.
- Cuando llegue el LLM real, los prompts (`agent-prompts.ts`) restringen el alcance
  y piden citar solo la info del perfil.

---

## Datos personales y privacidad

- El agente **no pide** datos sensibles.
- Conversaciones y sugerencias del MVP **no se persisten** (modo demo).
- En producción, el tratamiento de datos queda sujeto al aviso de privacidad y al
  consentimiento (`consentToContact`) capturado en el formulario.

---

## Pagos y accesos

Regla absoluta: **el agente no confirma, concede ni revoca pagos ni accesos.**
Cualquier mención de pago → escalamiento a humano (`mustEscalateToHuman`). El
concesión real de acceso tras compra es responsabilidad del backend + webhook
(ver `docs/PAYMENTS_MEXICO_STRATEGY.md`), nunca del agente.

---

## Modo sugerencia en la UI

- En `CRMView` → Conversaciones: *"Revisa antes de enviar. El agente IA no envía
  mensajes automáticamente."*
- Cada sugerencia lleva la etiqueta "Sugerencia IA (demo)".
- El `AgentResult.needsReview` es siempre `true` en el MVP. Cambiarlo a `false`
  (autoenvío) sería una decisión de producto **separada**, con métricas de
  seguridad y logging, no un flag accidental.

---

## Referencias

- `src/lib/ai/guardrails.ts` — implementación de las reglas.
- `src/lib/ai/agent-prompts.ts` — system/task prompts.
- `src/lib/ai/agent-provider.ts` — contrato y `needsReview`.
- `src/lib/data/crm-data.ts` — `AIAgentProfile` con acciones permitidas/prohibidas.
- `docs/WHATSAPP_AI_AGENT_STRATEGY.md` — estrategia general.
