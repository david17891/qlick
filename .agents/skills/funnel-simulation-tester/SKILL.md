---
name: funnel-simulation-tester
description: Playbook and instructions for running automated and interactive simulations of the dynamic survey and CRM promotion funnel, verifying success metrics, and auto-repairing bugs.
---

# Playbook de Simulación y Pruebas del Funnel Comercial (Qlick)

Este instructivo guía a los agentes de IA (y desarrolladores) para ejecutar simulaciones automatizadas e interactivas del funnel de Qlick, detectar fallas en la lógica conversacional o de datos, aplicar correcciones automáticas (self-healing) e iterar hasta cumplir las métricas de éxito.

---

## 1. Métricas de Éxito del Funnel (Criterio de Parada)

Para declarar que la implementación del funnel dinámico y motor de promoción está 100% lista para producción, una simulación debe cumplir las siguientes **5 métricas de éxito** en **3 flujos completos consecutivos** (MQL, Hot, Cold/Warm) sin intervenciones manuales de corrección de código:

| Métrica | Dimensión | Criterio de Aceptación |
|---|---|---|
| **M1** | **Integridad Conversacional** | El bot de WhatsApp completa la encuesta interactiva (5 preguntas) sin bucles de estado, finalizando con `survey_completed: true` en los metadatos de la conversación. |
| **M2** | **Precisión de Calificación** | El score final en base de datos coincide exactamente con la suma de pesos de las opciones seleccionadas en el JSON del `survey_config` del evento. |
| **M3** | **Cumplimiento Legal** | Si el lead responde afirmativamente a la opción con el flag `isConsent`, se invoca `promoteSurveyToLead` creándolo en la tabla `leads` con su email/teléfono de forma inmediata. |
| **M4** | **Motor de Promoción** | El lead avanza al estado correcto (`qualified` o `contacted`) y se inserta una tarea en `crm_tasks` con la prioridad (`high`/`medium`/`low`) y fecha límite correspondientes. |
| **M5** | **Outbound y Alertas** | Se registra la acción en `admin_audit_log`, se despacha el mensaje de seguimiento (`followUps`) al chat del lead y se gatilla el correo de alerta al administrador (Brevo) si el score es $\ge 40$. |

---

## 2. Protocolo de Simulación Paso a Paso

El agente simulador debe ejecutar los siguientes pasos de forma secuencial:

### Paso 1: Configurar el Escenario en Base de Datos
1. Crear o seleccionar un evento de prueba en la tabla `events`.
2. Actualizar el campo `events.survey_config` con una encuesta personalizada de prueba que contenga:
   - Preguntas buttons y text (incluyendo flags `isConsent` e `isBusinessDescription`).
   - Pesos específicos en las opciones de respuesta.
   - Mensajes de follow-up personalizados (`followUps`) con la variable `{{1}}`.

### Paso 2: Ejecutar el Flujo Conversacional (WhatsApp)
*El simulador puede correr esto de forma automatizada mediante scripts de test, o de forma **interactiva** interactuando directamente en el chat con David:*

* **Modo Interactivo**:
  1. El agente imprime en consola el mensaje que el bot enviaría al teléfono del usuario (ej: *"¿Qué tan claro te quedó el contenido del evento? [Muy claro] [Claro] [Confuso]"*).
  2. El agente se detiene y solicita la respuesta al usuario (David) con una pregunta directa.
  3. El agente procesa la respuesta introducida por David y avanza al siguiente paso del wizard.

* **Modo Automatizado**:
  1. El simulador invoca directamente el handler del bot (`bot-engine.ts`) simulando las respuestas de entrada de WhatsApp para cada paso de la encuesta.

### Paso 3: Validar Estado en Base de Datos (Supabase)
Una vez completada la última pregunta, el simulador debe realizar las siguientes consultas SQL/PostgREST en la base de datos de pruebas para validar las métricas:
1. Buscar en `event_surveys` que se haya guardado el registro con la configuración del evento.
2. Verificar en `leads` que el lead se haya creado/promovido si se dio consentimiento.
3. Validar que `leads.status` sea `qualified` (si score $\ge 60$) o `contacted` (si score $40$-$59$).
4. Verificar que en `crm_tasks` exista la tarea asignada con el debido vencimiento.
5. Comprobar que en `admin_audit_log` exista el registro `lead_hot_promotion` con el payload del lead calificado.

### Paso 4: Validar el Endpoint Web
1. Generar un link con un `survey_token` válido para el evento de prueba.
2. Hacer un fetch simulando el POST de `/api/submit-survey` enviando un payload con las respuestas dinámicas.
3. Verificar que el token cambie a estado `used` y se dispare la misma lógica de promoción y scoring.

### Paso 5: Validar el Cron de Recordatorios
1. Crear un asistente (`event_attendees`) que no tenga encuesta completada.
2. Ejecutar de forma manual el trigger del cron `/api/cron/survey-reminders`.
3. Validar en logs que se haya despachado la invitación de WhatsApp y registrado en `event_reminder_log`.

---

## 3. Bucle de Auto-Reparación (Self-Healing Loop)

Si en cualquiera de los pasos de validación una aserción falla (ej: el score calculado es incorrecto o la tarea CRM no se insertó):

```
┌─────────────────────────────────────────────────────────┐
│              Simulación detecta un fallo                │
└───────────────────────────┬─────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│ 1. Localizar el archivo responsable (ej: scoring.ts)    │
├─────────────────────────────────────────────────────────┤
│ 2. Analizar el flujo de datos y logs de error           │
├─────────────────────────────────────────────────────────┤
│ 3. Corregir el código manteniendo compatibilidad        │
├─────────────────────────────────────────────────────────┤
│ 4. Ejecutar tests unitarios (npm test)                  │
└───────────────────────────┬─────────────────────────────┘
                            │
            ┌───────────────┴───────────────┐
            ▼ (¿Tests fallan?)              ▼ (¿Tests pasan?)
  [Volver a corregir código]       [Reiniciar simulación desde Paso 1]
```

El agente simulador **no debe detenerse** al primer fallo; debe aplicar el ciclo de auto-reparación, documentar el cambio realizado en `data/PROJECT-LOG.md` y reiniciar el protocolo de simulación hasta lograr que los 3 escenarios de prueba pasen limpios.
