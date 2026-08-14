# Recuperación de leads de información por WhatsApp

## Propósito

Recuperar de forma segura a las personas que escribieron algo como “hola, quiero más información”, recibieron una respuesta del bot y después dejaron de contestar, sin repetir la campaña ni mezclar el rescate con el flujo normal de conversaciones.

Este documento es la especificación operativa del rescate y debe mantenerse alineado con la tarjeta que se mostrará en `Conversaciones`.

## Estado actual

**Corte operativo 2026-08-09:** el rescate histórico permanece detenido (`lead_info_followup_mode=off`). El seguimiento separado de leads nuevos usa `lead_new_info_followup_mode` y solo acepta leads creados desde `lead_new_info_followup_since`, sin la etiqueta `recovery:info_historical`. Ningún envío proactivo ocurre fuera de 09:00–19:00 hora `America/Phoenix`.

Snapshot de producción del 2026-08-08, sin exponer nombres, teléfonos ni otros datos personales. La clasificación histórica ya fue ejecutada de forma idempotente:

| Hallazgo | Cantidad |
|---|---:|
| Leads cuyo inbound coincide con una solicitud de más información | 63 |
| Sin respuesta posterior a la información recibida | 45 |
| Sin consentimiento de marketing | 54 |
| En estado `info_requested` | 24 |
| En estado `new` pese a tener la señal en la conversación | 30 |
| Leads pausados | 2 |
| Leads con respuesta posterior | 18 |
| Leads con dos o más mensajes automáticos | 7 |
| Leads con dos o más mensajes automáticos que contienen “taller” | 1 |

Resultado de la cola `info_recovery_2026_08_v1` después del backfill:

| Estado de recuperación | Cantidad |
|---|---:|
| `eligible` — se puede enviar texto libre dentro de la ventana | 8 |
| `blocked_template_required` — fuera de ventana, detenido por ahora | 37 |
| `duplicate_review` — no se automatiza | 10 |
| `excluded` — pausa, registro completo, etapa avanzada o sin respuesta inicial | 10 |
| Total materializado | 65 |

De los 45 sin respuesta, 8 están dentro de las primeras 24 horas, 8 tienen entre 1 y 7 días y 29 tienen entre 8 y 30 días. La recuperación histórica no puede depender únicamente de `status` o `next_follow_up_at`: ambos campos están incompletos en los datos anteriores al rescate automático.

## Lo que ya existe

- El cron horario de `.github/workflows/lead-followup.yml` llama a `/api/cron/lead-followup`.
- `lead_info_followup_mode` es un switch independiente. Desde el 2026-08-09 está en `off` en producción para realizar primero una ronda manual; el bot conversacional y los seguimientos de registro/pago permanecen separados.
- `lead_new_info_followup_mode` es otro switch independiente para leads nuevos. Su alcance se corta por fecha de alta y excluye cualquier lead de la campaña histórica.
- Cuando se reactive, el rescate nuevo enviará como máximo un mensaje después de 3 horas y respetará pausa, opt-out, respuestas manuales y la ventana de servicio de WhatsApp. Mientras esté en `off`, la cola solo sirve para revisión.
- Una respuesta afirmativa, un nombre, un correo o nombre + correo ya pueden entrar al cierre de inscripción sin repetir el mensaje completo de campaña.
- Al completar el correo, el flujo existente confirma por WhatsApp y correo.
- La migración `20260808120000_lead_recovery_campaigns.sql` agrega una cola idempotente y auditable por `(lead_id, campaign_key)`.
- El backfill histórico detecta la señal en la conversación, clasifica cada lead y actualiza CRM con `conversation:info_requested`, `recovery:info_historical` o `recovery:template_required` según corresponda.
- `Conversaciones` muestra la cola de rescate y permite actualizar la clasificación; actualizarla no envía mensajes.
- Los duplicados automáticos quedan en `duplicate_review`, aun cuando después haya existido una respuesta, para evitar otro envío automático y conservar el caso para revisión.
- Se conserva la señal `referral` de Meta en el mensaje entrante. Solo cuando existe una entrada de campaña compatible y el negocio respondió dentro de 24 horas se reconoce la ventana gratuita ampliada de 72 horas; el resto de los históricos se bloquea fuera de la ventana de servicio.

## Lo que falta

1. **Ronda manual actual:** revisar primero los casos de `duplicate_review`, los 8 `sent` históricos y cualquier caso priorizado por Revisión humana. Abrir WhatsApp, leer el contexto completo y registrar resultado, causa y mejora del bot.
2. **Plantilla futura:** aprobar una plantilla antes de recuperar históricos que estén fuera de 24 horas y no tengan una señal de entrada de campaña de 72 horas. Por decisión actual, no se usan plantillas.
3. **Auditoría de entrega:** completar en la cola el `sent_at`, proveedor y resultado final de cada envío; el job ya persiste la campaña al enviar.
4. **Reactivación controlada:** solo pasar a `shadow` y después a `live` cuando la ronda manual confirme que el copy y la cadencia no saturan a los leads.

## Plan de recuperación

### Fase 0 — Clasificación histórica sin envíos

Crear un clasificador histórico idempotente que produzca una lista de candidatos sin mandar WhatsApp. La señal mínima será:

- inbound con solicitud de información;
- outbound posterior del bot con la información inicial;
- ninguna respuesta posterior del lead;
- no existe rescate histórico enviado para la campaña;
- no está pausado, dado de baja ni en una etapa terminal.

El preview deberá mostrar cantidades por etapa y ventana, nunca PII en logs:

- `service_24h`: puede usar texto libre;
- `free_entry_72h`: puede usar texto libre solo con referral de campaña compatible y respuesta empresarial dentro de las primeras 24 horas;
- `template_required`: requiere template aprobado y queda detenido por ahora;
- `duplicate_review`: no se envía automáticamente;
- `already_replied`: fuera del rescate;
- `paused_or_opted_out`: fuera del rescate.

### Fase 1 — Ronda manual antes de automatizar

La fase activa es humana. El operador debe priorizar:

- casos con dos o más mensajes automáticos (`duplicate_review`);
- leads que recibieron un rescate histórico (`sent`) pero no han vuelto a responder;
- casos donde el último mensaje del lead indique intención, pago o una pregunta pendiente;
- casos del evento actual separados de los del evento anterior.

El contacto se hace individualmente desde el chat, con contexto visible. Después se registra el resultado en **Revisión humana**. No se usa una campaña masiva ni se manda un segundo mensaje a quienes ya estén saturados.

### Fase 2 — Recuperar automáticamente la ventana abierta

Procesar primero los candidatos dentro de 24 horas, en lotes pequeños y con tope global. El mensaje debe ser breve y de cierre:

> Hola [nombre] 👋
>
> Si ya quieres avanzar, puedo ayudarte a inscribirte por aquí. Respóndeme “sí” y te pido solo tu nombre y correo para dejar tu registro listo.

Después del envío, el lead queda en espera de respuesta. No se debe enviar un segundo rescate si responde, si un humano interviene o si el bot ya continuó el registro.

### Fase 3 — Recuperar históricos fuera de la ventana abierta

No se envía texto libre directamente. Primero se debe crear y aprobar una plantilla de WhatsApp, revisar su categoría, variables, costo y consentimiento aplicable, y probarla con un número interno. Hasta que eso ocurra, los históricos fuera de la ventana abierta quedan en `blocked_template_required`, no en una cola de envío.

### Fase 4 — Operación continua

El scheduler puede procesar solicitudes nuevas mediante `lead_new_info_followup_mode`, con máximo de dos intentos no idénticos, detención por respuesta/intervención y horario local 09:00–19:00. El panel muestra por separado `Info nuevos` y `Rescate histórico`; el operador puede detener cualquiera sin desactivar el bot conversacional normal.

## Reglas de no duplicación

- Una campaña histórica usa una clave estable, por ejemplo `info_recovery_2026_08_v1`.
- La combinación `(lead_id, campaign_key)` es única.
- Antes de enviar se verifica que no exista outbound posterior al mensaje de información ni intervención manual.
- Si el lead responde, el candidato pasa a `replied` y no vuelve a la cola.
- Los casos con dos o más mensajes automáticos se conservan para análisis y no reciben otro mensaje histórico hasta resolver la deduplicación.

## Criterios de éxito

- Cero envíos duplicados por campaña.
- Cero envíos a leads pausados u opt-out.
- Cero texto libre fuera de la ventana de servicio.
- Cada envío tiene un registro de campaña, copy y resultado.
- Una respuesta “sí” llega al registro y no vuelve a la campaña.
- El administrador puede ver y pausar el proceso desde `Conversaciones`.
