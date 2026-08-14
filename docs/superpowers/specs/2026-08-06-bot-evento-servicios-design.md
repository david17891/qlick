# Diseño: Bot de Evento y Servicios

**Fecha:** 2026-08-06  
**Estado:** Diseño aprobado para planificación técnica  
**Alcance inicial:** Captación de leads para `Kickstart de Meta Ads` sin alterar el funnel activo de eventos.

## 1. Objetivo

El bot debe conservar el funcionamiento actual del funnel de eventos y, en paralelo, atender consultas comerciales sobre servicios de Qlick.

La primera campaña nueva se enfocará en `Kickstart de Meta Ads`: videos con IA para el paquete de arranque, videos comerciales de producción real para opciones superiores y administración de campañas cuando el cliente autorice el acceso.

El bot no cerrará técnicamente el servicio ni pedirá datos de producción. Su responsabilidad será:

- Explicar el servicio y sus paquetes con información factual.
- Compartir el enlace correcto del catálogo.
- Detectar la necesidad comercial.
- Capturar el lead y la preferencia de contacto.
- Crear el seguimiento interno.
- Entregar el caso al equipo vendedor.

## 2. Límites No Negociables

### Evento

- No cambiar el registro, las confirmaciones, pagos, QR, encuestas, recordatorios ni accesos del evento.
- Mantener `info` como señal del flujo de evento salvo que exista un disparador inequívoco de campaña de servicios.
- No degradar el estado comercial de un lead inscrito, asistente o alumno cuando también solicite un servicio.
- Si el lead vuelve a decir `Inscribirme`, retomar el evento correcto sin mezclarlo con el interés comercial.

### Servicios

- No obligar a la persona a registrarse en el evento.
- No crear una cita ni confirmar un horario.
- No pedir accesos de Meta, presupuesto, materiales, actores, locaciones ni requisitos de producción en WhatsApp.
- No prometer clientes, ventas, conversiones ni resultados garantizados.
- No inventar precios, paquetes, tiempos o entregables.
- La inversión publicitaria de Meta siempre es adicional al precio del servicio.

### Seguridad operativa

- El flujo tendrá un kill switch `bot_services_enabled`.
- Si el catálogo o CRM no está disponible, el bot responderá con una salida honesta y compartirá el enlace; no inventará información ni bloqueará el funnel del evento.
- No se leerán, copiarán ni registrarán credenciales de Vercel, GitHub, DeepSeek, Supabase o API Box en el código, documentación o logs.
- Las migraciones serán aditivas. No se utilizarán `DROP`, borrados masivos ni cambios destructivos.

## 3. Enrutamiento Conversacional

### Entrada general

El menú general conserva las opciones de eventos y agrega servicios sin eliminar `Próximos eventos`.

En una conversación de evento específica, las opciones recomendadas son:

- `Inscribirme`
- `Servicios`
- `Hablar con un asesor`

En un menú general con evento activo, las opciones recomendadas son:

- `Info del evento`
- `Próximos eventos`
- `Servicios`

### Campaña Meta

La campaña usará un mensaje prellenado específico, no la palabra genérica `info`. La frase canónica recomendada es:

> Hola, quiero información de videos y publicidad en Meta.

El detector aceptará variaciones naturales, pero `info` por sí sola seguirá entrando al flujo de evento para no romper campañas actuales.

La campaña entrará directamente al contexto `Kickstart de Meta Ads` y compartirá:

`https://qlick.digital/servicios/kickstart-meta-ads`

### Ambigüedad

- Con contexto de evento, `¿qué incluye?` se interpreta primero como pregunta del evento.
- Con contexto de servicio, `¿qué incluye?` se interpreta como pregunta del paquete.
- Sin contexto suficiente, el bot preguntará una sola vez:

> ¿Te refieres a la información del evento o a nuestros servicios de marketing?

### Cambio de tema

El estado de evento y el estado de servicio se conservan en paralelo, pero de forma silenciosa. El bot solo cambia de tema cuando la persona lo pide o selecciona la opción correspondiente. No hará venta cruzada invasiva.

## 4. Flujo de Servicios

1. Detectar el disparador de campaña o una consulta explícita sobre servicios, videos, publicidad, paquetes o Meta Ads.
2. Enviar una explicación corta del servicio y el enlace al catálogo.
3. Responder preguntas de paquete usando el catálogo dinámico: objetivo, entregables, tiempos, precio e inversión publicitaria separada.
4. Detectar la necesidad expresada sin forzar un formulario.
5. Pedir el nombre una sola vez si no existe.
6. Capturar automáticamente el teléfono normalizado de WhatsApp.
7. Preguntar opcionalmente:

> ¿Hay algún día u horario en el que te sea más cómodo que te contactemos?

8. Guardar el horario como guía interna de texto libre. No es una cita ni se valida contra calendario.
9. Crear o reutilizar un lead por teléfono.
10. Crear un registro de interés de servicio.
11. Marcar el lead como `interested` cuando sea nuevo o esté en una etapa temprana. Nunca degradar estados de evento avanzados.
12. Crear una tarea CRM pendiente para contacto.
13. Enviar una notificación interna por correo con el contexto necesario.
14. Confirmar al usuario:

> Registramos tu solicitud y nos pondremos en contacto contigo a la brevedad.

La solicitud entrante de información de servicios se considera base para contacto comercial. El bot debe respetar cualquier opt-out posterior.

## 5. Modelo de Datos

### Lead existente

Se conserva un único lead por teléfono normalizado. El lead puede tener simultáneamente:

- Interés en uno o más eventos.
- Uno o más intereses de servicios.
- Conversaciones y tareas independientes.

Los tags se usarán para segmentación y trazabilidad, pero no serán la única fuente de verdad del interés comercial.

### `lead_service_interests`

Se agregará una tabla relacionada con `leads`, con una fila por solicitud comercial relevante.

Campos funcionales:

- `id`
- `lead_id`
- `service_id` y `service_slug`
- `variant_id` y `variant_slug` opcionales
- `category`
- `need_summary`
- `preferred_contact_time` opcional
- `source`
- `campaign_key` opcional
- `consent_basis`
- `status`
- `source_message_id` único cuando provenga de WhatsApp
- `created_at`
- `updated_at`

Estados de interés:

- `detected`
- `contacted`
- `qualified`
- `won`
- `lost`

El `source_message_id` evita duplicar intereses y tareas cuando Meta reenvía un webhook.
La fuente del lead será `facebook_ads` cuando exista una clave de campaña de Meta y `whatsapp` en los demás casos.

### Email opcional

Los leads de servicios de WhatsApp no estarán obligados a entregar correo. Se hará compatible la columna `leads.email` para permitir `NULL` en este flujo, sin usar direcciones sintéticas.

Si falta el nombre, se conserva el placeholder operativo existente `Por confirmar` únicamente para satisfacer la visualización del CRM. No se interpreta ni se persiste el texto del usuario como nombre si no cumple la validación de nombre.

El registro del evento conserva su regla actual: antes de completar el registro que requiere email, el bot debe capturarlo y validarlo.

### Tareas y notificación

Cada interés de servicio con intención de contacto genera:

- Una tarea pendiente asociada al lead.
- La referencia opcional al registro `lead_service_interests` para mantener trazabilidad estructurada.
- Una descripción con servicio, necesidad, horario preferido y campaña.
- Una notificación interna de nuevo lead comercial.

La tarea se considera operativa para el mismo día de creación, pero ese plazo no se promete al usuario.

## 6. Catálogo Canónico Inicial

La base de datos es la fuente de verdad para página, bot y CRM. El contenido publicado actual se actualizará antes de activar la campaña.

### Básico: Arranque con IA

- Precio: `$3,500 MXN`.
- Entrega: `5 a 7 días`.
- Cliente ideal: pequeño emprendedor que nunca ha pagado publicidad y quiere probar su primera campaña con una inversión inicial contenida.
- Entregables base: hasta 3 imágenes publicitarias, 2 videos cortos generados con IA de 10 a 20 segundos, configuración de campaña, lanzamiento y reporte inicial.
- No incluye inversión publicitaria.
- No incluye optimización mensual continua.

### Recomendado: Videos comerciales

- Precio: `$12,000 MXN`.
- Entrega inicial: `7 a 14 días`.
- Entregables base: producción de videos comerciales, piezas gráficas y lanzamiento de una campaña inicial.
- Optimización recomendada: 30 días con revisión semanal.
- La producción puede usar al cliente, su equipo o colaboradores disponibles, según la planeación creativa aprobada.
- No se prometen actores pagados.
- No incluye inversión publicitaria.

### Premium: Contenido y crecimiento

- Precio: `$18,000 MXN`.
- Entrega inicial: `7 a 14 días`.
- Entregables base: 8 a 10 videos comerciales, sesión de fotos, landing page, capacitación, auditoría interna y reunión de revisión.
- Optimización recomendada: 30 días.
- La administración posterior a esos 30 días se cotiza como servicio mensual independiente.
- No incluye inversión publicitaria.

### Administración de Meta Ads

- Qlick puede administrar la cuenta si el cliente autoriza el acceso.
- El cliente conserva la responsabilidad del presupuesto publicitario.
- El vendedor cierra el alcance final, accesos, materiales, ubicación, grabación y cualquier producción adicional.
- Traslados, locaciones especiales, actores pagados y producción fuera del alcance local se cotizan aparte.

## 7. Contexto Compartido por Modos

El catálogo y las reglas comerciales se inyectarán en todos los modos:

- `socratic_autopilot_v2`
- `socratic_no_tools_v1`
- `super_executive`
- `super_executive_v2`
- `human_first`

Las diferencias entre modos serán de tono, estructura y estrategia conversacional. Los siguientes elementos serán comunes:

- Catálogo factual.
- Inversión de Ads separada.
- Regla de no inventar.
- Regla de no prometer cita ni resultados.
- Captura de interés de servicios.
- No venta cruzada invasiva.
- Escalación y entrega a humano.

La captura CRM no dependerá de que el modo tenga tools de DeepSeek activadas. El motor determinista conservará los datos y creará el seguimiento.

El simulador recibirá el mismo catálogo y contexto para que sus resultados sean representativos de producción.

## 8. Rollout y Rollback

### Preparación

- Mantener el bundle Git de respaldo fuera del repositorio.
- Generar respaldo de Supabase antes de aplicar DDL.
- Verificar el catálogo actual y la migración propuesta.
- No tocar el vault global de API Box.

### Activación gradual

1. Publicar cambios de catálogo y contexto sin activar el flujo comercial.
2. Aplicar migraciones aditivas con el protocolo Supabase del repositorio.
3. Ejecutar pruebas unitarias, integración y matriz de modos.
4. Activar `bot_services_enabled` solo para probar el disparador de Meta.
5. Ejecutar un smoke test sintético de evento y otro de servicios.
6. Revisar lead, interés, tarea, correo y conversación.
7. Mantener monitoreo manual de las primeras conversaciones.

### Rollback

- Apagar `bot_services_enabled` para detener solo el flujo de servicios.
- Mantener activo el funnel de eventos.
- Corregir o revertir código únicamente después de revisar logs sin PII.
- No revertir migraciones destructivamente; las migraciones son compatibles hacia adelante.

## 9. Criterios de Calidad

El cambio se considera listo cuando:

- El evento conserva sus pruebas actuales y sus smoke tests de producción.
- Las cinco variantes de bot responden con el catálogo de servicios.
- Una consulta de paquete incluye precio y alcance real.
- Una consulta sobre inversión distingue honorarios de Ads.
- Una consulta ambigua no elige el producto equivocado.
- Un lead de servicio sin email se guarda sin placeholder.
- Un lead con evento y servicio no se duplica ni pierde su estado de evento.
- Un webhook reenviado no duplica interés, tarea ni correo.
- La notificación interna contiene contexto suficiente para llamar.
- `npm test`, `npm run type-check`, `npm run lint` y `npm run build` pasan.
- El kill switch fue probado.

## 10. Fuera de Alcance Inicial

- Reserva automática de calendario.
- Integración con Google Calendar.
- Cobro automático de servicios desde WhatsApp.
- Generación automática de cotizaciones.
- Compra o contratación de actores.
- Promesas de rendimiento publicitario.
- Sustitución del funnel de eventos.
