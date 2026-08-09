# Auditoría de datos del panel administrativo

## Decisión operativa

El panel administrativo no debe mezclar datos de demostración con datos reales. En producción, las vistas principales leen Supabase o muestran un estado vacío/pendiente; no sustituyen un error real por cifras mock.

## Estado por pestaña

| Pestaña | Fuente válida | Estado | Decisión |
|---|---|---|---|
| Resumen | CRM, eventos y pagos de Supabase | Real | Se muestran métricas agregadas reales de operación; el LMS ya no forma parte del resumen.
| Cursos | `courses`, `modules`, `lessons`, `enrollments` | Desactivado | El catálogo LMS quedó vacío y la pestaña fue retirada mientras no exista oferta educativa.
| Alumnos | Supabase Auth + `enrollments` | Desactivado | No se borraron usuarios globales de Auth; las inscripciones LMS fueron eliminadas.
| Inscripciones | `enrollments` + `courses` + Auth | Desactivado | La tabla quedó vacía como parte de la limpieza LMS.
| Pagos | `event_payments` + `event_confirmations` + `service_orders` | Real | Se eliminaron los 12 pagos LMS de prueba y 1 pago de evento identificado como prueba. Se conservaron pagos live/manuales y servicios.
| Servicios | `service_orders` | Real | La pestaña existente se conserva como operación de pedidos, contacto y seguimiento.
| CRM | `leads`, conversaciones, tareas e inteligencia de Supabase | Parcialmente real | Leads, pipeline, conversaciones, tareas e inteligencia son reales. Citas, responsables estáticos, sugerencias y perfil IA se marcan o se ocultan como referencia/demo.
| Próximas integraciones | Configuración y estado del sistema | Informativa | Se reemplazó el roadmap histórico por estado operativo y pendientes actuales.

## Snapshot de producción auditado después de la limpieza

- LMS: 0 cursos, 0 módulos, 0 lecciones, 0 inscripciones, 0 accesos y 0 pagos.
- Eventos: 4 registros; 2 publicados.
- Pagos: 8 registros en `event_payments`; 6 referencias Stripe live, 2 referencias manuales, 0 pagos identificados como prueba.
- Pedidos de servicios: 1.
- CRM: 921 leads, 2,048 conversaciones WhatsApp, 269 tareas abiertas y 266 vencidas.
- CRM: 0 interacciones internas, 0 notas, 921 leads sin responsable y 28 handoffs huérfanos.
- Usuarios globales de Auth: no se eliminaron.

Estas cantidades no se codifican en la interfaz: el snapshot se vuelve a consultar en cada carga administrativa.

## Reglas de presentación

1. Los IDs, nombres y montos del mock legacy no se usan en modo real.
2. `published` significa que existe un registro LMS publicado; no se traduce automáticamente a “curso vendido” o “curso activo comercialmente”.
3. Los pagos de eventos y servicios no se mezclan con el proveedor mock del catálogo LMS.
4. Las citas demo nunca aparecen junto con leads reales. Google Calendar permanece pendiente hasta que exista una integración persistida.
5. El proveedor mock solo queda para pruebas y simuladores, nunca como fuente del resumen productivo.
6. `/admin?tab=mantenimiento` muestra la auditoría y exige una frase exacta antes de cualquier limpieza.
