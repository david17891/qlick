# Plan integral de mejora de bots, captura y recuperación de leads

**Fecha:** 2026-08-08
**Estado:** Plan aprobado para implementación; sin cambios de producción en este documento
**Alcance:** bot conversacional de WhatsApp, seguimientos, recuperación, recordatorios de eventos, pagos/QR, encuestas, broadcasts, simulador y revisión humana
**Prioridad:** mantener el sistema actual funcionando durante toda la implementación

## Estado de implementación

- [x] **B-01 — Línea base:** métricas agregadas por persona + evento y corpus inicial de fallos reales para regresión.
- [x] **B-02 — Contrato persona–evento:** invariantes documentadas y pruebas sintéticas.
- [x] **B-03 — Schema aditivo:** `lead_event_journeys` y `lead_event_journey_transitions` aplicadas en Supabase con RLS y acceso backend-only.
- [x] **B-04 — Dual-write:** el motor actual registra el journey y las transiciones cuando ya existe un evento confiable; no cambia todavía la respuesta ni el modo de producción.
- [ ] **B-05 en adelante:** resolver evento compartido, modo shadow, idempotencia completa, canary y migración progresiva de automatizaciones.

La migración de B-03 se aplicó a producción el 2026-08-08. Las tablas iniciaron vacías y el dual-write se activó únicamente como telemetría aditiva.

## 1. Resultado esperado

Qlick debe tener un solo criterio operativo para todos sus bots:

> Una persona es un contacto global, pero su interés, registro, pago y asistencia pertenecen a cada evento.

El sistema debe conservar el historial completo de la persona sin confundir eventos. Una persona que asistió al evento anterior puede pedir información, registrarse, pagar y asistir al evento actual. Su asistencia anterior no debe cerrar ni adelantar automáticamente el nuevo embudo.

Al terminar este plan:

- cada mensaje nuevo quedará asociado a la persona y al evento correctos;
- cada relación `persona + evento` tendrá una etapa operativa inequívoca;
- el bot pedirá únicamente los datos faltantes;
- respuestas como “ok”, “listo” o “gracias” se interpretarán según el contexto;
- ningún bot repetirá la campaña completa sin que la persona lo solicite;
- fechas, horarios, precios, ubicaciones y enlaces saldrán de datos oficiales;
- registro, pago, QR, asistencia y encuesta serán independientes por evento;
- los bots no competirán entre sí ni enviarán dos respuestas al mismo mensaje;
- la revisión humana explicará la causa probable del fallo y alimentará pruebas futuras;
- cualquier activación podrá pausarse o revertirse sin interrumpir el sistema vigente.

## 2. Evidencia y línea base

La línea base usa datos de producción revisados el 2026-08-08. Las métricas de mensajes no deben confundirse con métricas de personas.

| Medida | Resultado observado |
|---|---:|
| Filas de conversaciones WhatsApp | 1,533 |
| Conversaciones todavía sin evento confiable | 227 |
| Filas todavía sin lead asociado | 65 |
| Leads asociados al evento actual | 72 |
| Mensajes asociados al evento actual | 318 |
| Leads del evento actual sin correo | 61 |
| Leads del evento actual con solicitud de información | 63 |
| Leads del evento actual con señal de inscripción | 12 |
| Leads del evento actual que enviaron correo | 9 |
| Leads del evento actual cuyo último mensaje es inbound | 3 |
| Leads del evento actual cuyo último mensaje es outbound | 69 |
| Leads con señal de inscripción pero sin correo | 3 |
| Duplicado outbound exacto y adyacente detectado | 1 |
| Grupos de texto outbound repetido | 6 grupos / 4 leads |
| Mensajes históricos con metadata de rescate | 9 de 1,533 |

La configuración observada al redactar este plan es:

- `bot_global_mode = super_executive_v2`;
- `lead_followup_mode = live`;
- `lead_info_followup_mode = live`;
- límite diario outbound configurado en 1,000;
- cero envíos de plantilla observados en el historial revisado.

Estas cifras son una línea base, no una tasa final de conversión. Hay conversaciones históricas incompletas, mensajes sin evento y filas sin lead. Las métricas nuevas se calcularán principalmente por `lead_id + event_id`.

## 3. Causas principales

### 3.1 Estado conversacional insuficiente

El flujo depende en varios puntos de metadata del último mensaje, especialmente `awaiting_field`. Esto permite continuar nombre → correo, pero no representa de forma completa la relación de la persona con cada evento.

Consecuencias observadas:

- el bot vuelve a ofrecer una inscripción ya realizada;
- interpreta una confirmación breve como una intención nueva;
- vuelve a pedir información que ya existe;
- mezcla registro, reserva y pago pendiente;
- un recordatorio o seguimiento puede reabrir indebidamente el flujo comercial.

### 3.2 Contexto centrado en “el evento activo”

El diseño anterior carga un evento activo y una ventana corta de conversación. Eso no basta cuando la misma persona participó en un evento anterior y ahora pregunta por uno nuevo.

El evento de una conversación debe resolverse con evidencia del mensaje, referral, botón, enlace, registro y relación previa. “Publicado” o “más reciente” será solamente un fallback controlado.

### 3.3 Respuestas breves sin semántica contextual

Mensajes como “ok”, “listo”, “sí”, “gracias” o “así es” no tienen una intención universal. Su significado depende de la última acción y del estado `persona + evento`.

Ejemplos:

- después de recibir QR: acuse de recibido;
- después de pedir correo: posible confirmación insuficiente, se debe volver a pedir el correo;
- después de enviar liga de pago: reconocimiento, no prueba de pago;
- después de preguntar si desea registrarse: aceptación del registro.

### 3.4 Datos oficiales expuestos al modelo

El caso revisado donde se respondió con un día de la semana incorrecto demuestra que el modelo no debe calcular ni reconstruir fechas. El texto visible debe formatearse desde una sola fuente de datos del evento.

### 3.5 Automatizaciones con límites funcionales superpuestos

El bot conversacional, el follow-up, el rescate, los recordatorios, los mensajes de pago y el wizard de encuestas escriben en el mismo canal. Sin una política compartida de control e idempotencia, pueden responder de forma válida individualmente pero incorrecta como conjunto.

### 3.6 Etiquetas internas confundidas con decisiones legales

“Marketing pendiente” o “sin consentimiento de marketing” es una etiqueta interna. No demuestra una negativa de la persona.

Se deben separar:

- consentimiento para marketing;
- conversación operativa dentro de la ventana de WhatsApp;
- referral que habilita una ventana aplicable;
- baja explícita u opt-out;
- pausa manual del bot;
- base válida para un mensaje transaccional.

Solo una baja explícita debe tratarse automáticamente como rechazo global. Las campañas promocionales seguirán requiriendo una base válida.

## 4. Modelo de dominio objetivo

### 4.1 Identidad global: persona

`leads` seguirá siendo la identidad canónica y deduplicada por teléfono normalizado y, cuando exista, por correo real.

Datos globales:

- nombre y teléfono normalizado;
- correo real o `NULL`;
- consentimiento y fuente de consentimiento;
- opt-out explícito y fecha;
- archivo/baja administrativa;
- pausa global del bot;
- responsable general, cuando aplique.

No se volverán a crear correos sintéticos o `@placeholder.local`.

### 4.2 Relación por evento: journey operativo

Se recomienda una fuente de verdad operativa nueva, provisionalmente llamada `lead_event_journeys`, con unicidad por `(lead_id, event_id)`.

Campos mínimos:

- `lead_id`;
- `event_id`;
- `relationship_stage`;
- `awaiting_field`;
- `conversation_control`;
- `last_intent`;
- `last_inbound_at`;
- `last_outbound_at`;
- `next_follow_up_at`;
- `follow_up_count`;
- `recovery_state`;
- `bot_mode` y `bot_version` de la última decisión;
- `created_at` y `updated_at`.

`lead_event_links` continuará como trazabilidad entre lead y registros concretos de eventos. No debe usarse como sustituto de la etapa operativa.

### 4.3 Estados separados, no un enum gigante

La situación de una persona en un evento se compondrá de ejes independientes:

**Etapa de relación**

`new → info_requested → interested → capturing → registered → attended | no_show | closed`

**Campo pendiente**

`none | name | email | registration_decision | payment_decision`

**Pago**

`not_required | pending | partial | paid | failed | refunded | disputed`

El estado real del pago debe seguir viniendo del ledger de pagos y sus webhooks, no de una frase del bot ni de la persona.

**Control de conversación**

`bot | human | paused`

Esto permite representar correctamente: “registrado al evento actual, pago pendiente, conversación en manos de un humano”.

### 4.4 Verdad transaccional

No se duplicarán hechos existentes:

- confirmación/registro: tabla canónica de confirmaciones del evento;
- pago: ledger de pagos y webhooks;
- QR/check-in: registro correspondiente del evento;
- asistencia: attendee/check-in;
- encuesta: tablas de encuestas;
- mensajes: `lead_whatsapp_conversations`;
- vínculo general: `lead_event_links`;
- journey: proyección operativa para decidir el siguiente paso.

## 5. Resolución del evento

Cada inbound pasará por un `EventContextResolver` común antes de decidir la respuesta.

Orden de evidencia, de mayor a menor confianza:

1. ID de evento incluido en botón interactivo o payload.
2. Referral de anuncio/campaña asociado a un evento.
3. Slug, liga, título o identificador explícito en el mensaje.
4. Confirmación, pago, QR o journey abierto del evento mencionado.
5. Evento de los mensajes inmediatamente anteriores de la misma conversación.
6. Único evento publicado compatible.
7. Pregunta aclaratoria cuando existan dos posibilidades razonables.

Reglas obligatorias:

- asistir al evento anterior no crea registro en el actual;
- preguntar por el evento actual crea o reabre su journey sin alterar el anterior;
- una persona puede tener varios journeys históricos y solo uno o más activos si realmente conversa sobre ellos;
- no se debe cambiar el evento de mensajes históricos con evidencia explícita;
- las nuevas conversaciones originadas por campaña deben alcanzar al menos 99% de asociación automática;
- si no existe evidencia suficiente, se conserva `related_event_id = NULL` y se solicita aclaración; nunca se inventa.

## 6. Motor compartido de decisiones

Todos los bots que envían WhatsApp compartirán seis componentes:

1. `ContactPolicy`: determina si se puede responder y por qué canal.
2. `EventContextResolver`: identifica el evento.
3. `JourneyProjector`: obtiene y actualiza el estado `persona + evento`.
4. `OfficialFactsLoader`: entrega hechos canónicos del evento y del pago.
5. `NextBestActionPolicy`: decide una sola acción permitida.
6. `OutboundGuard`: deduplicación, ventana, pausa, control humano y auditoría.

El LLM no elegirá libremente el estado ni confirmará hechos transaccionales. Podrá:

- clasificar preguntas abiertas;
- redactar una respuesta breve dentro del contrato elegido;
- resumir contexto para revisión humana;
- detectar una posible causa de abandono.

Las transiciones, captura de datos, pagos, fechas, ventanas, opt-out, handoff e idempotencia serán deterministas.

## 7. Política por bot

| Bot o automatización | Responsabilidad | Puede actualizar | No puede hacer |
|---|---|---|---|
| Conversacional inbound | Responder, aclarar, capturar y registrar | Journey, nombre/correo reales, handoff | Inventar hechos, confirmar pagos, reiniciar otro evento |
| Follow-up continuo | Retomar una etapa incompleta | `next_follow_up_at`, contador y recovery state | Mandar campaña completa o insistir tras respuesta |
| Recuperación histórica | Clasificar y rescatar casos autorizados | Estado de campaña y resultado | Texto libre fuera de ventana o envío masivo sin preview |
| Recordatorios de evento | Logística y asistencia | Estado de entrega del recordatorio | Cambiar etapa comercial o volver a vender |
| Pago y QR | Mensajes transaccionales idempotentes | Resultado de notificación | Inferir que “listo” significa pago |
| Encuestas | Flujo posterior al evento | Progreso de encuesta y asistencia validada | Reabrir captación comercial |
| Broadcast/admin | Campañas revisadas por operador | Registro de campaña/envío | Saltar opt-out, preview o límites |
| Simulador | Reproducir el motor con datos sintéticos | Sesión sintética | Escribir sobre leads reales |
| Revisión humana | Corregir clasificación y proponer mejora | Causa, outcome, pausa y tarea | Enviar automáticamente al guardar una revisión |

Solo una automatización tendrá derecho de respuesta por inbound. Las demás deberán comprobar el bloqueo de conversación antes de enviar.

## 8. Flujos conversacionales prioritarios

### 8.1 Solicitud de información

Respuesta objetivo:

- resumen breve y factual;
- una sola llamada a la acción;
- opción explícita de resolver una duda o registrarse;
- sin repetir el contenido completo en turnos posteriores.

### 8.2 Inscripción

- aceptar nombre y correo juntos o por separado;
- conservar un dato válido aunque el otro falte;
- pedir solamente el campo faltante;
- confirmar el correo cuando haya un typo probable;
- registrar de forma idempotente;
- no generar dos QR ni enviar dos confirmaciones por el mismo registro.

### 8.3 Respuestas “ok”, “listo”, “gracias” y “sí”

La respuesta se obtiene del estado previo:

| Contexto anterior | Interpretación | Siguiente acción |
|---|---|---|
| Se entregó información | Acuse neutro | Pregunta corta: duda o registro |
| Se preguntó si desea registrarse | Posible aceptación | Iniciar captura faltante |
| Se pidió nombre/correo | No contiene el dato | Repetir solo la solicitud pendiente |
| Se envió QR | Acuse de recibido | Confirmación corta; no repetir campaña |
| Se envió liga de pago | Acuse, no pago | Mantener pago pendiente |
| Humano intervino | Contexto humano | Bot permanece pausado |

### 8.4 Pago el día del evento

La política debe venir de la configuración oficial del evento. Si se permite:

- confirmar que la persona ya está registrada;
- explicar el saldo pendiente;
- registrar la preferencia operativa;
- no afirmar que el pago está realizado;
- escalar únicamente si existe una excepción que requiere decisión humana.

### 8.5 Persona que asistió a un evento anterior

Flujo obligatorio:

1. Resolver que el inbound corresponde al evento actual.
2. Reutilizar nombre, teléfono y correo reales de la persona.
3. Crear o recuperar el journey del evento actual.
4. No copiar `registered`, `paid` ni `attended` del evento anterior.
5. Personalizar, si aporta valor: “Qué gusto volver a saber de ti”.
6. Continuar desde la etapa real del evento actual.

## 9. Datos oficiales y anti-alucinación

`OfficialFactsLoader` será la única entrada permitida para:

- nombre y descripción del evento;
- fecha y día de la semana;
- hora y zona horaria;
- duración;
- sede y dirección;
- modalidad;
- precio, anticipo y saldo;
- política de pago en puerta;
- enlace de pago;
- enlace de check-in/QR;
- estado publicado, archivado o cancelado.

La fecha se formateará con código y timezone del evento. El modelo recibe el texto ya calculado y no debe reconstruir el día de la semana.

Si falta un dato oficial, la respuesta será: “Ese detalle todavía no está confirmado; lo revisamos y te avisamos”.

## 10. Idempotencia y prevención de colisiones

### 10.1 Inbound

- clave única por WAMID o identificador equivalente del proveedor;
- el mismo inbound puede persistirse nuevamente de forma segura, pero no procesarse dos veces;
- usar lock transaccional o claim atómico antes de generar respuesta.

### 10.2 Outbound

Cada intento debe tener una `idempotency_key` derivada de:

`bot + action + lead_id + event_id + triggering_message_id + campaign_key`

Antes de enviar:

- confirmar que no existe envío exitoso con la misma clave;
- comprobar que no llegó un inbound más reciente;
- comprobar pausa global, por lead y por journey;
- comprobar que el control no está en manos humanas;
- comprobar ventana y plantilla aplicable;
- comprobar que el estado transaccional no cambió.

### 10.3 Frecuencia

- una respuesta automática por inbound;
- un rescate por etapa y campaña;
- detener seguimiento ante cualquier respuesta del lead;
- no enviar follow-up si hubo respuesta manual posterior;
- no combinar recordatorio y rescate en una misma ventana sin prioridad explícita.

## 11. Revisión humana y aprendizaje

La revisión humana tendrá taxonomía obligatoria:

- estado o evento incorrecto;
- campaña repetida;
- respuesta duplicada;
- respuesta demasiado larga;
- fecha, hora, lugar o precio incorrecto;
- CTA ausente o confuso;
- captura de nombre/correo fallida;
- pago mal interpretado;
- handoff temprano, tardío o huérfano;
- consentimiento/etiqueta mal interpretado;
- baja intención;
- requiere excepción humana;
- otro, con explicación.

Cada caso guardará:

- evento;
- modo y versión del bot;
- estado antes/después;
- causa probable;
- respuesta esperada;
- outcome humano;
- si genera cambio de regla, copy, prompt o prueba.

Una mejora no pasa a producción solo por frecuencia. Primero se convierte en caso de regresión anonimizado y se valida contra la matriz completa.

## 12. Pruebas obligatorias

### 12.1 Corpus de regresión

Construir un corpus anonimizado a partir de conversaciones reales. Los fixtures versionados usarán datos sintéticos y dominios `example.com`; nunca PII.

Casos mínimos:

1. “Quiero más información”.
2. “Inscribirme”.
3. Nombre y correo juntos.
4. Nombre primero y correo después.
5. Correo primero y nombre después.
6. Pregunta intermedia mientras falta nombre o correo.
7. “Ok”, “listo”, “gracias”, “así es”.
8. Persona ya registrada.
9. Persona registrada con pago pendiente.
10. Persona pagada.
11. Persona que pagará el día del evento.
12. Persona que asistió al evento anterior y quiere el actual.
13. Dos eventos publicados o plausibles.
14. Mensaje con título/slug del evento anterior.
15. Fecha cerca de cambio de día o timezone.
16. Inbound duplicado del proveedor.
17. Dos workers procesando el mismo inbound.
18. Follow-up mientras llega una respuesta.
19. Intervención humana antes del envío.
20. Opt-out explícito.
21. Etiqueta interna “marketing pendiente” sin opt-out.
22. Lead sin correo.
23. Audio sin transcripción suficiente.
24. Queja, pago disputado, privacidad o soporte.
25. Recordatorio, encuesta y rescate coincidiendo.

### 12.2 Niveles de prueba

- unitarias para resolutor de evento, estados, ACKs, fechas e idempotencia;
- contract tests para cada bot y su permiso de mutación;
- integración con Supabase usando datos sintéticos;
- simulación completa con todos los modos disponibles;
- shadow sobre conversaciones reales sin envío;
- E2E de producción controlado con número interno antes del canary.

## 13. Métricas y criterios de aceptación

### Seguridad y exactitud

- 0 fechas o días de la semana incorrectos;
- 0 confirmaciones de pago sin ledger/webhook;
- 0 placeholders de correo;
- 0 mensajes enviados a opt-out explícito;
- 0 texto libre fuera de ventana sin base aplicable;
- 100% de outbound con fuente, versión, evento y motivo auditables.

### Operación

- ≥99% de asociación automática de evento para nuevos inbounds de campaña;
- ≥99% de inbounds válidos con respuesta o handoff registrado;
- 0 respuestas automáticas duplicadas por WAMID;
- 0 campañas completas repetidas sin solicitud explícita;
- 0 señales de inscripción vencidas sin respuesta o tarea humana;
- 100% de handoffs con lead y evento cuando exista evidencia.

### Embudo por persona + evento

Medir:

- información solicitada → intención de registro;
- intención → nombre capturado;
- nombre → correo real;
- correo → confirmación;
- confirmación → pago o acuerdo de pago;
- pago/confirmación → asistencia;
- rescate → respuesta;
- rescate → registro;
- opt-out y quejas como guardrails.

## 14. Estrategia de implementación sin interrupción

### Fase 0 — Congelar línea base y corpus

**Objetivo:** poder demostrar si mejora o empeora.

- exportar métricas agregadas por evento y journey;
- seleccionar conversaciones representativas y anonimizarlas;
- registrar los fallos conocidos como pruebas rojas;
- documentar flags y rollback actual;
- no modificar envíos.

**Salida:** dashboard/base de comparación y corpus de regresión.

### Fase 1 — Contratos y schema aditivo

**Objetivo:** introducir el modelo persona-evento sin reemplazar el flujo actual.

- agregar `lead_event_journeys` y auditoría de transiciones;
- agregar idempotency keys/claims donde falten;
- mantener `leads.status` y `awaiting_field` actuales por compatibilidad;
- implementar dual-write desde el motor existente;
- backfill en preview y luego idempotente, sin inventar evento.

**Rollback:** desactivar dual-write; el sistema actual continúa leyendo sus campos existentes.

### Fase 2 — Kernel compartido en modo sombra

**Objetivo:** calcular la decisión nueva sin enviarla.

- implementar `ContactPolicy`, `EventContextResolver`, `JourneyProjector`, `OfficialFactsLoader`, `NextBestActionPolicy` y `OutboundGuard`;
- comparar decisión actual vs decisión nueva;
- mostrar diferencias en revisión humana;
- corregir falsos positivos hasta alcanzar criterios.

**Rollback:** apagar el flag de shadow; sin efecto sobre mensajes reales.

### Fase 3 — Bot inbound en canary

**Objetivo:** resolver primero los errores de mayor impacto.

Orden:

1. asociación de evento;
2. fecha y hechos oficiales;
3. ACK contextual;
4. captura flexible de nombre/correo;
5. registro idempotente;
6. pago/QR contextual;
7. handoff con pausa.

Activar inicialmente para mensajes nuevos de un grupo controlado o porcentaje pequeño. Mantener el modo anterior disponible.

### Fase 4 — Follow-up y recuperación

**Objetivo:** adaptar los seguimientos al journey correcto.

- un mensaje por etapa;
- copy breve de siguiente mejor acción;
- detener ante inbound, humano, pago, registro o pausa;
- procesar primero ventanas abiertas;
- históricos fuera de ventana permanecen bloqueados sin plantilla;
- primera tanda revisada manualmente.

### Fase 5 — Bots auxiliares

Migrar al kernel compartido, en este orden:

1. pago y QR;
2. recordatorios de evento;
3. encuestas;
4. broadcast;
5. sugerencias IA y revisión humana.

Cada bot pasa contract tests antes de recibir permiso de envío.

### Fase 6 — Recuperación histórica controlada

- recalcular candidatos por persona + evento;
- excluir registrados, pagados, pausados, opt-out, duplicados e intervención humana;
- preview con conteos, nunca PII en logs;
- lote pequeño, observación y stop automático por guardrail;
- ampliar únicamente después de revisar respuesta, registro, opt-out y errores.

## 15. Backlog ejecutable y dependencias

| ID | Prioridad | Entregable | Depende de |
|---|---|---|---|
| B-01 | P0 | Corpus anonimizado y línea base por evento | — |
| B-02 | P0 | ADR persona global / journey por evento | B-01 |
| B-03 | P0 | Migration y tipos de `lead_event_journeys` | B-02 |
| B-04 | P0 | Dual-write y proyector de journey | B-03 |
| B-05 | P0 | `EventContextResolver` con niveles de confianza | B-02 |
| B-06 | P0 | `OfficialFactsLoader` y fecha canónica | B-02 |
| B-07 | P0 | Política de ACK contextual | B-04 |
| B-08 | P0 | Captura nombre/correo en cualquier orden | B-04 |
| B-09 | P0 | Idempotencia inbound/outbound y locks | B-03 |
| B-10 | P0 | Matriz de regresión de 25 casos | B-01, B-05..B-09 |
| B-11 | P1 | Kernel nuevo en shadow | B-04..B-10 |
| B-12 | P1 | Panel de diferencias y causas | B-11 |
| B-13 | P1 | Canary del bot inbound | B-11, B-12 |
| B-14 | P1 | Follow-up por journey | B-13 |
| B-15 | P1 | Recuperación por journey | B-14 |
| B-16 | P1 | Pago/QR sobre kernel compartido | B-13 |
| B-17 | P2 | Recordatorios sobre kernel compartido | B-16 |
| B-18 | P2 | Encuestas sobre kernel compartido | B-17 |
| B-19 | P2 | Broadcast con preview e idempotencia | B-17 |
| B-20 | P2 | Recuperación histórica gradual | B-15, B-19 |

Los modelos o agentes de implementación podrán tomar tareas distintas, pero no deben trabajar en paralelo sobre el mismo contrato sin que B-02 y B-03 estén cerradas. Cada tarea debe terminar con pruebas, documentación y evidencia de compatibilidad.

## 16. Flags y rollback

Flags mínimos recomendados:

- `bot_journey_dual_write_enabled`;
- `bot_event_resolver_shadow_enabled`;
- `bot_next_action_shadow_enabled`;
- `bot_inbound_v2_canary_percent`;
- `bot_followup_journey_enabled`;
- `bot_recovery_journey_enabled`;
- pausa global existente;
- pausa por lead y por journey.

Reglas de rollback:

- migraciones aditivas; no borrar columnas actuales durante el rollout;
- dual-read con preferencia configurable;
- el modo actual permanece disponible hasta cerrar el canary;
- un error de fecha, pago, duplicado u opt-out detiene automáticamente el canary;
- no usar `reset --hard`, drops ni limpieza masiva como mecanismo de reversión;
- restaurar envío con flags, no con cambios manuales en datos.

## 17. Definición de terminado

El plan se considera implementado cuando:

1. la persona conserva una sola identidad y múltiples journeys independientes;
2. un asistente anterior puede registrarse al evento actual sin heredar su estado anterior;
3. todos los bots resuelven contacto, evento y journey con el mismo kernel;
4. las 25 familias de regresión pasan en todos los modos soportados;
5. shadow y canary cumplen los criterios de aceptación;
6. follow-up y recuperación operan por etapa y evento;
7. revisión humana registra causa y mejora accionable;
8. existe monitoreo, pausa y rollback probado;
9. producción fue verificada con conversaciones controladas y URL real;
10. `docs/STATUS.md`, `docs/OPEN_ITEMS.md`, `docs/ROADMAP.md` y `data/PROJECT-LOG.md` quedan actualizados al cerrar cada fase.

## 18. Primera tarea recomendada

Ejecutar **B-01 + B-02** como un único paquete de diseño verificable:

1. congelar línea base por persona + evento;
2. construir fixtures sintéticos de los fallos reales;
3. aprobar el contrato de identidad, journey, pago y control conversacional;
4. definir transiciones e invariantes;
5. dejar pruebas rojas antes de modificar el motor.

Después, B-03 y B-04 pueden implementarse de forma aditiva sin interrumpir el bot actual.

## Referencias

- `docs/BOT_CONTEXT_DESIGN.md`
- `docs/WHATSAPP_LEAD_RECOVERY.md`
- `docs/CRM_OPERATING_MODEL.md`
- `docs/CRM_HUMAN_REVIEW.md`
- `docs/AI_AGENT_GUARDRAILS.md`
- `docs/BOT_REGISTRATION_RULE.md`
- `docs/EVENTS_FUNNEL_FOUNDATION.md`
- `docs/ACTIVATION_GRADUAL_BOT_GLOBAL_RULES.md`
- `docs/PLAN_ROLLBACK_BOT_GLOBAL_RULES.md`
- `src/lib/whatsapp/bot-engine.ts`
- `src/lib/cron/lead-followup.ts`
- `src/lib/cron/lead-recovery.ts`
- `src/lib/cron/event-reminders.ts`
- `src/lib/cron/survey-reminders.ts`
