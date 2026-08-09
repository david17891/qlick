# Auditoría de organización y uso del CRM

Fecha de revisión inicial: 2026-08-08. Actualización operativa: 2026-08-08 después de la limpieza y la puesta en marcha de Revisión humana. Fuente: Supabase Production, mediante consultas agregadas; no se exponen nombres, correos, teléfonos, mensajes ni referencias de pago en los reportes.

## Resumen ejecutivo

El CRM sí recibe y conserva conversaciones reales. La organización base quedó corregida: los leads tienen responsable, la cola de tareas de prueba está cerrada y los handoffs huérfanos fueron resueltos. La deuda operativa restante es humana: leer los contextos, clasificar la causa probable de no respuesta y convertir esos hallazgos en mejoras del bot.

## Estado observado

| Área | Evidencia | Lectura |
|---|---:|---|
| Leads | 222 | Datos operativos conservados en Supabase |
| Leads sin responsable | 0 | Todos tienen responsable autorizado |
| Tareas abiertas | 0 | No quedan tareas ficticias abiertas |
| Tareas vencidas | 0 | Cola de prueba cerrada sin borrar historial |
| Leads estancados sin tarea abierta | 0 | La condición operativa quedó despejada |
| Conversaciones WhatsApp | 1,545 | Historial real conservado |
| Interacciones internas | 0 | El equipo no está dejando actividad manual en `lead_interactions` |
| Notas internas | 0 | No existe contexto comercial persistido en `crm_notes` |
| Handoffs | 12 válidos pendientes | 0 huérfanos pendientes |
| Duplicados por email/teléfono | 0 filas duplicadas | No hay duplicado exacto detectable en la tabla de leads |
| Marketing pendiente (etiqueta interna) | 179 | No deben entrar automáticamente a campañas; no es evidencia de rechazo |

Distribución actual: 220 leads de WhatsApp y 2 manuales. Los 179 correos sintéticos fueron limpiados y ahora son correo pendiente (`NULL`); no se borraron leads ni conversaciones.

## Riesgos

1. **Alto — revisión humana:** los casos de último mensaje entrante, pago/registro o silencio prolongado requieren lectura contextual antes de un rescate.
2. **Medio — calidad de contexto:** las notas e interacciones internas empiezan en cero; la nueva sección registra cada decisión para que el trabajo no dependa de memoria.
3. **Medio — etiqueta interna:** `consent_to_contact=false` se muestra como “Marketing pendiente”; no demuestra rechazo. Debe mantenerse separado de campañas automáticas sin impedir la evaluación operativa caso por caso.
4. **Medio — mejora del bot:** la causa probable debe agruparse semanalmente para corregir copy, fechas, pagos y transferencias.

## Decisiones aplicadas

- Cursos, alumnos, inscripciones y pagos LMS se retiran de la navegación operativa mientras el producto educativo no exista.
- La limpieza del LMS es una acción independiente y confirmada; elimina catálogo y dependencias LMS, no usuarios globales de Auth.
- Los pagos LMS actuales fueron identificados como referencias Stripe de prueba y tienen una limpieza separada.
- Los pagos de eventos y servicios no se borran en bloque. Solo se ofrece limpieza para pagos de eventos identificados como prueba por simulador, referencia de prueba, metadata de simulación o evento marcado como prueba.
- Los leads no tienen hard delete desde el CRM: el botón existente archiva de forma lógica y conserva evidencia de consentimiento/auditoría.

## Plan operativo recomendado

El plan histórico de organización ya fue aplicado. La cola vigente está documentada y operable en `docs/CRM_HUMAN_REVIEW.md`.

## Implementación aplicada en el panel

- El Centro de operación CRM muestra métricas reales de responsables, segmentos, tareas, marketing pendiente, WhatsApp, actividad interna y handoffs.
- La sección `Revisión humana` muestra la cola priorizada, los últimos seis mensajes, la causa probable y el registro de mejora para el bot.
- La tabla de leads incorpora el segmento `Comerciales`/`Eventos`; el segmento de evento se deriva de `source=event` y no de texto libre.
- En modo real se muestran los responsables autorizados por `ADMIN_EMAIL_ALLOWLIST` y se puede asignar o liberar un lead desde su detalle.
- La cola de tareas permite marcar como resuelta, reprogramar individualmente o reprogramar la cola vencida a mañana. Estas acciones no borran filas y escriben `admin_audit_log`.
- El detalle del lead ya permite registrar notas e interacciones internas; esas superficies son las destinadas a elevar los contadores que hoy están en cero.
- La operación completa está descrita en `docs/CRM_OPERATING_MODEL.md`.

### P0 — dejar el CRM trabajable (cerrado)

- Asignar responsable por lote, empezando por `new`, `contacted`, `info_requested`, `interested` y `payment_pending`.
- Resolver o cancelar las 266 tareas vencidas; si se decide conservarlas, usar la reprogramación confirmada y auditada de la cola.
- Crear una vista “Sin responsable”, otra “Vencidos” y otra “Marketing pendiente (etiqueta interna)”.
- Separar claramente leads de eventos de leads comerciales de WhatsApp.

### P1 — mejorar el registro de trabajo (activo en Revisión humana)

- Registrar cada llamada, correo, nota o decisión en `lead_interactions`.
- Usar `crm_notes` para contexto persistente; la conversación de WhatsApp no sustituye una nota comercial.
- Reparar o revisar los 28 handoffs huérfanos.
- Revisar el clasificador de intención y medir sus valores reales antes de usar la intención como KPI.

### P2 — automatización controlada (pendiente de resultados humanos)

- Generar tareas solo con fecha y responsable definidos.
- Automatizar rescate únicamente para leads con consentimiento o dentro de la ventana operativa correspondiente.
- Añadir métricas por etapa: nuevos, contactados, interesados, pago pendiente, inscritos y perdidos, siempre con denominador visible.

## Herramientas disponibles

- `scripts/audit-admin-state.mjs`: auditoría agregada reproducible.
- `/admin?tab=mantenimiento`: lectura del diagnóstico y limpieza confirmada de datos LMS/prueba.
- `/admin?tab=crm`: operación de leads y conversaciones.
- `/admin/system/audit-log`: revisión de acciones administrativas.
- `/api/admin/leads/[id]` con `DELETE`: archivado lógico individual; no hard delete.
