# Modelo operativo del CRM

Fecha: 2026-08-08

## Principios

- `source=event` identifica operación de eventos: asistencia, confirmación y seguimiento relacionado con el evento.
- Cualquier otra fuente (`whatsapp`, `website`, `manual`, anuncios, referido, orgánico u otra) se considera comercial.
- Un lead puede tener conversaciones de WhatsApp con la etiqueta interna `marketing pendiente`. Esa etiqueta no significa que la persona haya rechazado contacto; solo indica que el CRM no tiene una captura explícita de consentimiento de marketing. No se envían campañas promocionales sin base válida; el equipo debe revisar el contexto antes de un rescate individual.
- Un lead sin responsable no tiene dueño operativo. El catálogo de responsables se deriva de `ADMIN_EMAIL_ALLOWLIST`; así no se asignan leads a cuentas sin acceso al panel.
- Las tareas no se borran para “limpiar” la cola. Se marcan resueltas/canceladas o se reprograman, y cada operación queda en `admin_audit_log`.

## Rutina diaria

1. Abrir `/admin?tab=crm` y revisar el Centro de operación CRM.
2. Atender primero `Sin responsable`, `Tareas vencidas` y `Estancados sin tarea`.
3. Usar el selector `Comerciales` o `Eventos` antes de trabajar la tabla; no mezclar asistentes de evento con oportunidades de venta.
4. Asignar el responsable desde el detalle del lead. Para repartir por lote, seleccionar leads y usar la acción de responsable existente.
5. Registrar una interacción para llamadas, correos o contactos manuales. Usar notas internas para contexto que el siguiente responsable necesita conservar.
6. Reprogramar tareas vencidas solo cuando exista un siguiente paso real. La acción masiva “Reprogramar a mañana” conserva las tareas y deja auditoría.
7. Revisar `Marketing pendiente (etiqueta interna)` antes de rescates o campañas. El seguimiento operativo permitido por una conversación activa no equivale a consentimiento de marketing.

## Estados y colas

| Cola | Criterio | Acción esperada |
|---|---|---|
| Sin responsable | `owner_id IS NULL` | Asignar a una cuenta autorizada |
| Vencida | `crm_tasks.status=pending` y `due_at < ahora` | Resolver, cancelar o reprogramar con motivo |
| Estancada | Lead `new/contacted`, más de 48 h sin interacción y sin tarea | Crear tarea con fecha y responsable |
| Evento | `source=event` | Trabajar como operación de evento, no como campaña comercial |
| Comercial | `source != event` | Calificar, informar, cerrar o perder |
| Marketing pendiente (etiqueta interna) | `consent_to_contact=false` | No incluir automáticamente en campañas; no interpretar como rechazo |
| Handoff huérfano | `handoff_requests.lead_id` es nulo o no existe en `leads` | Revisar y cerrar conservando la fila histórica |

## Contratos técnicos

- `GET /api/admin/crm/operations`: métricas agregadas del centro de operación.
- `GET /api/admin/crm/owners`: responsables autorizados, sin exponer la variable de entorno.
- `PATCH /api/admin/leads/[id]` con `{ ownerId }`: asignación individual auditada.
- `PATCH /api/admin/crm/tasks`: acciones sobre tareas pendientes (`completed`, `cancelled`, `reschedule`) en lote de hasta 500 filas.
- `/admin/system/audit-log`: evidencia de asignaciones y operaciones de cola.

## Límites intencionales

- No se asignan automáticamente los 921 leads a una sola persona: primero debe existir una decisión de reparto y responsables en la allowlist.
- No se purgan en bloque conversaciones, notas, handoffs o leads; el historial es parte de la trazabilidad.
- El contador de interacciones internas mide `lead_interactions`; los mensajes de WhatsApp se mantienen separados en `lead_whatsapp_conversations`.
