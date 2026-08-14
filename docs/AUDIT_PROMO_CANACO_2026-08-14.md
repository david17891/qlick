# Auditoría de funcionamiento — promoción CANACO `/promo`

**Fecha:** 2026-08-14  
**Evento:** `desarrollo-estructura-curso-canaco` — Los 4 Pilares de un Negocio que Vende  
**Producción:** `https://www.qlick.digital` / `https://qlick.digital`  
**Commit auditado:** `00123a0` (`main`, checkout limpio)

## Resultado ejecutivo

La página pública y la base de datos están operativas. La promoción está aislada del checkout normal: una persona conserva el precio de $1,000 MXN y la promoción usa una orden única de dos plazas por $1,500 MXN, con apartado de $200 MXN. El acceso compartido se habilita por webhook firmado de Stripe y el QR admite como máximo dos check-ins.

La campaña todavía no debe considerarse validada de extremo a extremo con un cobro promocional real: producción no tiene órdenes promocionales y no se creó ningún cargo para esta auditoría. Sí se validaron las capas de código, seguridad, base de datos, webhook, reembolso y check-in mediante pruebas y simulaciones.

**Política confirmada para esta promoción:** el enlace de pago es el único paso previo; el QR, la confirmación y el acceso se envían únicamente cuando el webhook verifica $200 MXN o el pago completo.

## Evidencia ejecutada

| Capa | Resultado | Evidencia |
|---|---:|---|
| Landing del evento | OK | HTTP 200; muestra promoción, precio individual y CANACO |
| `/promo` | OK | HTTP 200; muestra 2 personas por $1,500, apartado $200 y opción individual |
| Webhook sin firma | OK | HTTP 400; no procesa Stripe sin `stripe-signature` |
| Cron sin credencial | OK | HTTP 401; no ejecuta seguimiento sin secreto |
| QR inexistente | OK | HTTP 404 |
| Migraciones | OK | 55 tablas, 51 columnas y todas las definiciones revisadas presentes en producción |
| RLS | OK | `anon` no puede leer `event_promo_orders` ni `event_promo_order_participants` |
| Configuración Vercel | OK | Producción tiene proveedor Stripe y secretos live/test registrados; los valores no se exponen |
| Pruebas promocionales enfocadas | OK | 32/32 |
| Suite CI no externa | OK | 1,708/1,708 |
| Simulación de funnel | OK | 3/3 escenarios, 34 aserciones |
| E2E histórica WhatsApp → Stripe | **Falla por discrepancia de contrato** | Espera cero QR/email antes del pago; el modo híbrido vigente sí envía QR provisional y bloquea el check-in |

La E2E fallida no representa un cobro perdido ni un acceso indebido: detecta que el fixture histórico esperaba el flujo estricto para todo evento, mientras algunos registros históricos de producción conservan QR provisionales. La promoción nueva queda definida en modo estricto: no envía su QR antes del webhook.

## Estado real de Supabase

Consulta de solo lectura al evento publicado, sin exponer nombres, correos ni teléfonos:

- 19 confirmaciones: 1 `confirmed`/`paid` y 18 `payment_pending`/`pending`.
- 7 filas en `event_payments`: 1 `approved` por $1,000 MXN, 1 `pending`, 4 `cancelled` y 1 `failed`.
- 0 órdenes promocionales creadas hasta el momento.
- 19 tokens QR históricos: 14 activos ligados a pendientes, 1 activo ligado al pagado, 3 activos sin confirmación y 1 revocado. Los pendientes no pueden pasar check-in: el endpoint exige pago/apartado verificado.
- 128 registros de correo `qr_pass`: 124 exitosos y 4 fallidos. No se generó ningún correo promocional durante la auditoría.
- De los 18 pendientes, 18 tienen teléfono y 17 tienen correo válido. La herramienta administrativa puede preparar un enlace individual de `/promo` para cada uno, sin enviar automáticamente ni cambiar su estado.

## Flujo verificado

### Registro individual

El formulario normal crea o reutiliza `event_confirmations`, conserva la fila histórica y dirige al checkout individual. El pago se registra en `event_payments`; solo el webhook firmado actualiza el estado, crea acceso y permite QR/check-in.

### Promoción de dos personas

`event_promo_orders` mantiene una sola orden y `event_promo_order_participants` mantiene hasta dos plazas. El pago promocional se enlaza por `promo_order_id`; el webhook valida importe y propósito, es idempotente por sesión/evento y llama a `settlePromoOrder`. Un apartado deja la orden en `partial`; el pago completo la deja en `paid`. El QR compartido se crea con `max_check_ins=2`. Reembolsos revocan la orden, las confirmaciones y el QR.

### Pendientes históricos

En **Pagos → Preparar promoción**, el administrador obtiene links individuales de WhatsApp para los pendientes con teléfono. El texto no afirma pago, confirmación, lugar apartado ni QR listo. Al abrir `/promo`, la persona vuelve a capturar sus datos; el servicio de confirmaciones deduplica por correo o teléfono y reutiliza la confirmación pendiente. La segunda persona puede quedar sin nombre y asignarse después.

## Riesgos y acciones recomendadas

### Resuelto 2026-08-14 — restringir el endpoint promocional al evento autorizado

La ruta quedó limitada al slug autorizado `desarrollo-estructura-curso-canaco`; el checkout individual no cambia.

### Alto — separar el QR histórico del QR promocional

Actualmente existen QR provisionales históricos para pendientes y el servidor bloquea el check-in hasta que exista pago/apartado verificado. Para la promoción no se reutiliza ese comportamiento: `sendPromoRegistrationEmail` solo envía el enlace y `sendPromoPassEmail` se llama después de `settlePromoOrder`. Los históricos deben permanecer bajo revisión separada para no revocar ni reenviar nada accidentalmente.

### Resuelto 2026-08-14 — correo después de liquidar una orden parcial

La deduplicación ahora incluye orden, destinatario y estado (`partial`/`paid`). El QR sigue siendo el mismo, pero el pago total genera un pase actualizado y un comprobante nuevo.

### Resuelto 2026-08-14 — entrega al segundo participante

El webhook envía el mismo pase compartido y comprobante a cada correo válido asociado a la orden, con una sola notificación por orden/estado/destinatario.

### Medio — tokens QR históricos sin confirmación

Hay 3 tokens activos sin `confirmation_id`. El check-in de un evento pagado los bloquea, pero conviene clasificarlos y resolverlos o revocarlos mediante una operación administrativa auditada; no borrarlos automáticamente.

### Medio — reconciliación de pagos no cobrados

Hay 1 intento `pending`, 4 cancelados y 1 fallido en el ledger. El panel correctamente excluye cancelados/fallidos de “Pagos confirmados”, pero el intento pendiente requiere revisión en Stripe para saber si debe esperar un webhook diferido o marcarse expirado.

### Bajo — continuidad de pendientes

El enlace público no lleva un identificador de confirmación. La deduplicación funciona cuando la persona reingresa el mismo correo o teléfono, pero hay una fricción innecesaria y no hay prellenado. En una siguiente iteración puede añadirse un token de invitación firmado, sin exponer PII ni permitir modificar otra confirmación.

## Puerta de salida para lanzar la promoción

Antes de enviar el video a los inscritos:

1. Alinear la E2E con la política promocional estricta y mantener separados los QR históricos.
2. Restringir `/api/promo/checkout` al evento CANACO.
3. Ejecutar un pago **Stripe test** con datos sintéticos y webhook firmado, incluyendo: apartado, duplicado, liquidación, reembolso y dos check-ins.
4. Confirmar en el panel que la orden aparece una sola vez, que ambas plazas se reflejan y que el QR no permite un tercer acceso.
5. Revisar los 3 QR sin confirmación y el pago pendiente histórico.
6. Probar manualmente un pendiente real con la herramienta de WhatsApp, sin activar campaña masiva ni enviar video automáticamente.

No se realizaron cargos, envíos de WhatsApp, envíos de video ni cambios destructivos durante esta auditoría.

## Cierre de implementación — 2026-08-14

La auditoría se convirtió en cambios productivos sin tocar registros
históricos: el checkout promo solo acepta el evento CANACO; Stripe conserva la
confirmación por webhook y el cron durable de Supabase reconsulta cada 15
minutos las sesiones pendientes para cubrir OXXO/SPEI. Una sesión no pagada
sigue pendiente y no genera QR ni acceso.

Al verificarse el apartado de $200 o el pago total, la orden actualiza las dos
confirmaciones nombradas, crea un QR compartido con dos usos y envía a cada
participante con correo válido el pase y un comprobante Qlick. El checkout
también solicita el recibo automático de Stripe mediante `receipt_email`.

Validación final: migración aditiva aplicada, E2E sintética de dos personas
pasada (webhook firmado, idempotencia y limpieza), type-check, lint, build,
audit:voseo y smoke público 200/401 correctos. La suite histórica mantiene
fallas conocidas de flujos antiguos; no bloquean esta promoción estricta.

## Revisión posterior — actualización de liquidación

- **Cerrado:** la entrega de pase promocional ahora usa una clave de
  idempotencia por orden, destinatario y estado (`partial`/`paid`). Así, el
  mismo webhook no duplica correos, pero una liquidación posterior sí envía la
  actualización de pase total verificado.
- **Cerrado:** el pase y comprobante se envían a cada participante con correo
  válido; el QR sigue siendo uno compartido y limitado a dos accesos.
- **Migración aplicada:** `20260814150000_event_email_dedupe_key.sql`, aditiva,
  nullable y sin reescribir logs históricos.
- **Prueba:** apartado → webhook duplicado → liquidación → webhook duplicado,
  con dos participantes y ocho correos esperados, pasó en E2E sintética.

Los tres QR históricos sin confirmación y el intento de pago pendiente siguen
sin cambios y requieren revisión administrativa separada; no se revocaron ni
marcaron automáticamente.
