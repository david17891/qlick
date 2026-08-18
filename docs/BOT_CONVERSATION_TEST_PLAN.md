# Plan de batería conversacional del bot

## Objetivo

Validar que cada respuesta resuelva la pregunta actual, conserve el contexto
del evento y nunca capture datos, confirme pagos, emita QR o derive a un humano
por una clasificación accidental.

La batería se ejecuta con un número sintético limpio desde el panel de
administración. No se usan contactos reales ni pagos reales.

## Errores internos que originaron la batería

- `dos personas` se clasificó como `persona` y activó un handoff al asesor.
- Preguntas de sede/fecha recibieron información de pago en lugar de CANACO y
  la fecha del evento.
- El modelo llegó a decir “pago en puerta”, condición que no existe en el
  flujo vigente.
- Se repitieron nombre y correo después de haber sido capturados.
- Algunas respuestas incluyeron Markdown roto (`**`) o respuestas genéricas de
  asesor sin resolver la duda.
- El modo global podía volver a `super_executive_v2`; las reglas críticas no
  deben depender de que `closing` esté seleccionado.
- Las consultas de servicios mostraban el catálogo automático cuando la
  operación requería contacto humano directo.

## Batería funcional

| Grupo | Mensajes sintéticos | Debe ocurrir |
|---|---|---|
| Inicio | `hola`, `quiero información` | Contexto completo, CANACO, fecha, promoción y `/promo`; sin captura en cierre |
| Contenido | `¿en qué consiste?`, `¿qué incluye?` | Cuatro pilares y constancia; una respuesta breve |
| Fecha/sede | `¿dónde es y cuándo?` | 20 de agosto, 16:00, CANACO, San Luis Río Colorado |
| Equipo | `¿puedo llevar laptop?`, `¿se puede con celular?` | Ambos son posibles; laptop opcional |
| Promo | `¿hay promoción para dos personas?` | $1,500 total, apartado $200, `/promo`; no handoff accidental |
| Apartado | `¿puedo apartar con $200 para dos personas?` | $200 para ambas personas y enlace directo |
| Pago | `¿cómo puedo pagar?`, `¿qué pasa con el saldo?` | Solo condiciones oficiales; nunca “pago en puerta”, “QR listo” o “lugar asegurado” |
| Servicios | `servicios`, `busco publicidad`, `quiero una agencia` | Solo contacto directo del asesor; no catálogo ni pregunta de giro |
| Humano | `quiero hablar con un asesor`, botón `Hablar con asesor` | Enlace oficial; handoff sin duplicar mensajes |
| Contexto | `hola` → `sí` → `David` → `correo` → `¿qué incluye?` | No cambiar de dominio ni volver a pedir datos ya capturados |
| Ambigüedad | `ok`, `gracias`, `va`, `no sé` | Interpretar según la pregunta anterior; no iniciar registro nuevo |
| Seguridad | `dame mi QR`, `ya pagué`, `confírmame` sin webhook | No confirmar ni emitir acceso; enviar `/promo` o asesor |
| Media | audio sin transcripción, sticker, imagen no inspeccionada | Pedir texto o derivar; no inventar el contenido |
| Operación | mensaje duplicado/reintento | Una sola salida por clave idempotente; conservar causa de entrega |
| Opt-out | `baja`, `no me escriban` | Confirmar baja y detener seguimientos |

## Secuencia de ejecución

1. Borrar únicamente el número sintético desde **Configuración Bot → Olvidar
   todo**.
2. Ejecutar los grupos en orden, esperando la respuesta antes del siguiente
   mensaje; repetir promoción y pago después de cualquier despliegue.
3. Guardar texto, hora, modo global y resultado visible; no guardar teléfonos,
   nombres ni correos en fixtures.
4. Repetir la batería con `closing`, `super_executive_v2` y `human_first` sin
   cambiar las reglas comerciales.
5. Revisar el panel para confirmar que no se creó registro, pago, QR o acceso
   cuando la batería era solo informativa.

## Puertas de aceptación

- 0 nombres/correos repetidos después de captura.
- 0 cambios de dominio por `sí`, `ok` o `gracias`.
- 0 “pago en puerta”, confirmaciones, accesos o QR antes de pago verificado.
- 0 derivaciones erróneas de `dos personas` a asesor.
- 100% de consultas de servicios con contacto directo.
- 0 Markdown roto, pensamientos internos o afirmaciones sobre contenido no
  inspeccionado.
- 0 duplicados por mensaje/hito y 100% de fallos definitivos bloqueando
  seguimientos.
- El texto visible no supera tres frases, salvo el catálogo oficial de la
  promoción, y mantiene español mexicano neutral.

## Resultado de la pasada actual

La última pasada real verificó saludo, información, temario, fecha/sede,
laptop/celular, promoción de dos personas, apartado, pago, asesor y servicios.
El caso de servicios quedó corregido globalmente y probado con el modo activo
`super_executive_v2`.
