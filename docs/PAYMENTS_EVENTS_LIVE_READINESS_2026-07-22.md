# Revisión de pagos y eventos — preparación para Stripe Live

**Fecha:** 2026-07-22  
**Alcance:** Stripe Checkout, webhook, pagos de eventos y la integración de pagos de servicios que comparte el mismo webhook.  
**Dictamen:** **NO-GO** para activar cobros reales hasta resolver los bloqueadores P0 de este documento.

## Resumen ejecutivo

La cuenta Stripe de Qlick está habilitada para cobrar y recibir payouts en live: no tiene requisitos pendientes, `charges_enabled` y `payouts_enabled` están activos, y Cards/OXXO están activos. No obstante, el código de aplicación todavía tiene fallas que pueden dejar acceso activo después de un reembolso, asociar el pago de un evento a la persona equivocada y no completar el flujo de links de pago de servicios.

El entorno productivo actual sigue creando Checkout Sessions de **prueba** para el flujo de cursos. Esto coincide con el diseño actual: los eventos pueden elegir `test` o `live` por `event_rules.payment_mode`, mientras que los cursos permanecen en test.

No se completó ningún checkout ni se realizó ningún cargo durante esta revisión. La única interacción de producción fue crear una sesión de prueba pendiente y verificar respuestas defensivas del webhook.

## Evidencia verificada

### Cuenta y plataforma

- La cuenta Stripe está activa para cobros y payouts live, sin requisitos actuales ni futuros pendientes.
- Tiene Cards y OXXO activos. El payout está configurado en modalidad **manual**: debe existir un responsable y rutina operativa para iniciarlos y conciliarlos.
- El perfil de negocio todavía no tiene configurados email ni URL de soporte, y no hay branding visual configurado. No bloquea técnicamente el cobro, pero debe completarse antes de abrir ventas.

### Despliegue productivo

Se verificó directamente contra `https://www.qlick.digital`:

| Prueba | Resultado |
| --- | --- |
| Crear checkout de un curso publicado | `200`, provider `stripe`, redirect a `checkout.stripe.com`, sesión **test** |
| Webhook sin `stripe-signature` | `400` |
| Webhook con firma falsa | `401` |

Esto confirma que la integración Stripe y la barrera de firma están activas en producción para test mode. No confirma que el endpoint live ni sus variables live estén configurados; el conector autorizado no expone el inventario de endpoints webhook y no se alteró esa configuración.

### Flujo que ya está construido

- Checkout hospedado de Stripe; no hay captura de tarjeta en Qlick.
- Validación de firma sobre el body crudo e idempotencia por evento Stripe.
- Validación exacta del monto antes de otorgar acceso.
- Registro separado en `event_payments`, relación a `event_access` y actualización de `event_confirmations.payment_status`.
- Soporte de eventos asíncronos de Checkout (OXXO/SPEI), fallos, disputas y reembolsos en el switch del webhook.
- Modo dual para eventos: `test` por defecto y `live` sólo si `event_rules.payment_mode === 'live'`.

## Bloqueadores P0

### P0-1 — Un reembolso o disputa no encuentra el pago y no revoca acceso

**Evidencia:** el webhook almacena `external_reference = session.id` al confirmar Checkout. En cambio, los handlers de `charge.refunded` y `charge.dispute.created` buscan por `charge.payment_intent` o por `charge.id`. Un `PaymentIntent` no es el `Checkout Session` que se guardó como referencia.

**Impacto:** tras un reembolso real, el handler devuelve `refund_no_payment`; el pago puede no pasar a `refunded` y el acceso al curso/evento puede continuar activo. Las disputas también pueden quedar sin trazabilidad en el admin.

**Archivos:**

- `src/app/api/webhooks/stripe/route.ts` — creación del pago y handlers de refund/dispute.

**Corrección requerida:** persistir y consultar una referencia común (recomendado: conservar tanto `session_id` como `payment_intent_id` en metadata o columnas explícitas), reconciliar filas históricas y añadir pruebas de Checkout completado → refund/dispute → estado y revocación de acceso.

### P0-2 — La atribución explícita de una confirmación de evento se pierde durante el grant

El primer bloque del webhook usa correctamente `metadata.confirmation_id` para crear `event_payments`. Más adelante, el bloque que llama `grantEventAccess`, actualiza `payment_status` y notifica vuelve a buscar la confirmación por el email que se usó en Stripe, ignorando ese `confirmation_id`.

**Impacto:** si una persona paga con otro email (por ejemplo, quien compra y quien asiste), el pago se registra contra una confirmación y el acceso, el estado y la notificación pueden aplicarse a otra. El código declara explícitamente que soporta este caso, pero la segunda búsqueda lo contradice.

**Archivos:**

- `src/app/api/webhooks/stripe/route.ts` — dos resoluciones distintas de `confLookup` dentro de `handleCheckoutCompleted`.

**Corrección requerida:** resolver una sola `confirmationId` validada para el evento y reutilizarla para pago, acceso, estado y notificación. Añadir un test con email de pagador distinto al email del asistente.

### P0-3 — Los links de pago de servicios no tienen handler de fulfillment

El endpoint admin genera correctamente un Checkout con `productRef.kind = 'service'`, pero el webhook no contiene ninguna rama `service`. Al recibir el pago lo trata como un caso no-curso/no-evento y no actualiza `service_orders` ni registra el evento de timeline prometido.

**Impacto:** un cliente puede pagar un link generado por el admin y el pedido permanecer pendiente, sin confirmación operativa fiable. Es una ruta de pagos ya expuesta por el panel admin.

**Archivos:**

- `src/app/api/admin/orders/[id]/payment-link/route.ts`
- `src/app/api/webhooks/stripe/route.ts`

**Corrección requerida:** crear una rama explícita para `service`, validar `orderId` y el importe contra la variante, actualizar sólo el pedido esperado de forma idempotente y registrar `payment_received`. Agregar una prueba de integración de ese flujo antes de habilitarlo para clientes.

### P0-4 — OXXO/SPEI pueden otorgar acceso antes de que el pago sea real

Stripe emite `checkout.session.completed` cuando el cliente termina el formulario de OXXO y recibe el voucher, pero el pago aún está pendiente. El webhook actual manda ese evento y `checkout.session.async_payment_succeeded` al mismo handler de fulfillment sin comprobar `session.payment_status`.

**Impacto:** un cliente podría obtener acceso, QR y notificaciones al generar un voucher o una transferencia pendiente, sin que Stripe haya recibido el dinero.

**Corrección requerida:** tratar el primer evento asíncrono como `pending` y no otorgar acceso. Sólo el evento de pago confirmado debe cambiar el registro a `approved`, otorgar acceso y enviar notificaciones. Las transiciones deben usar una referencia estable de la sesión, no el ID de cada webhook.

### P0-5 — El acceso creado por el bot no se completa de forma segura al pagar

El bot puede crear `event_access` con `confirmation_id` y sin `user_id` para el flujo de pago en puerta. Cuando Stripe confirma, `grantEventAccess` encuentra esa fila por confirmación, pero sólo cambia source/reason/payment; no vincula el `user_id` recién resuelto. El refund posterior depende de `user_id`, por lo que puede no revocar ese acceso.

**Impacto:** la sesión autenticada del comprador puede no reconocer su acceso y un refund puede dejar activo un pase asociado a la confirmación.

**Corrección requerida:** al promover el acceso existente, completar de forma segura `user_id` cuando esté ausente y hacer que la revocación pueda localizar el acceso por `payment_id` o `confirmation_id`, no sólo por usuario.

## Hallazgos P1

### P1-1 — La página de éxito de eventos consulta siempre Stripe test

`stripeProvider.getStatus()` crea el cliente sin modo, por lo que usa test. La página de éxito de evento lo llama con el `session_id` recibido. Una sesión `cs_live_*` no se podrá consultar y terminará como pendiente aunque el webhook sí haya otorgado acceso.

Además, las rutas de retorno para pendiente y reintento omiten el segmento `/evento/`, por lo que pueden caer en la ruta de curso en vez de volver al evento correcto.

**Archivos:**

- `src/lib/payments/stripe-provider.ts`
- `src/app/pagar/evento/[slug]/exito/page.tsx`

### P1-2 — Documentación y preflight usan el contrato de variables anterior

El código dual actual espera `STRIPE_SECRET_KEY_LIVE` y `STRIPE_WEBHOOK_SECRET_LIVE`, conservando las variables sin sufijo para test. Sin embargo, `scripts/verify-stripe-go-live.mjs` y partes de `docs/STRIPE_KYC_QLICK_MX.md` indican reemplazar `STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SECRET` por credenciales live.

**Impacto:** siguiendo el runbook actual, el evento marcado live falla al crear Checkout o el webhook live no verifica firma.

**Corrección requerida:** elegir y documentar un único modelo. Dado que el código ya permite test y live en paralelo, conservar el modelo dual y actualizar script, documentación y checklist de Vercel para validar ambas variables live.

### P1-3 — La última evidencia E2E de Stripe no está completamente verde

El artefacto de prueba de Stripe del 2026-07-17 valida 6 de 8 condiciones: confirmación, pago, acceso, relación de pago y usuario se completaron. Fallaron la generación de QR y el registro/notificación WhatsApp. El código fue modificado el 2026-07-20 para esperar las notificaciones en Vercel, pero no existe en el repositorio una repetición posterior de ese E2E que demuestre el resultado completo.

**Corrección requerida:** repetir el E2E en test mode tras los cambios, verificando QR/email/WhatsApp de extremo a extremo y sin datos personales reales.

### P1-4 — Se registra un prefijo de la clave Stripe en logs

En el manejo de error de creación de checkout se incluye un prefijo de `STRIPE_SECRET_KEY` en `console.error`. No debe registrarse ninguna parte de una clave secreta.

**Corrección requerida:** eliminar ese campo y, para diagnóstico, registrar sólo tipo de error, código y `requestId` de Stripe si está disponible.

### P1-5 — OXXO necesita política de reembolso no automática

OXXO está habilitado en la cuenta y es asíncrono; el webhook contempla correctamente la confirmación tardía. Stripe documenta que los pagos OXXO no admiten reembolso desde Stripe. El proceso operativo debe indicar crédito/devolución manual y la UI/admin no debe prometer un refund automático para ese método.

## Hallazgos P2 / mejora recomendada

- El provider fija `payment_method_types` por botón (`card`, `oxxo`, `customer_balance`). La guía actual de Stripe favorece métodos dinámicos configurados en Dashboard, lo que permite habilitar elegibles como OXXO o MSI sin desplegar código. Mantenerlo manual es posible, pero hay que justificarlo y probar cada método activo.
- La API Stripe está fijada a `2025-09-30.clover`. Mantener una versión fijada reduce cambios sorpresa; debe planearse una actualización compatible, no hacerse durante el flip a live.
- Las pruebas `stripe-dual-mode` y de nuevos handlers son mayormente estructurales: verifican texto, ramas y tipos, no el comportamiento real con Stripe/Supabase. Deben complementarse con pruebas de integración de los P0.

## Plan de salida a live

1. Corregir P0-1, P0-2 y P0-3 con pruebas de integración que fallen antes del fix y pasen después.
2. Resolver P1-1 y unificar P1-2 (variables, script y runbook).
3. Desplegar a preview y ejecutar en test mode:
   - tarjeta aprobada, fallida y 3DS si aplica;
   - OXXO emitido, confirmado y vencido;
   - pago de evento con `confirmation_id` y email de pagador distinto;
   - refund y disputa de curso y evento;
   - pago de servicio y transición del pedido.
4. Ejecutar `npm run type-check`, `npm run lint`, `npm test` y una build limpia. No se pudieron correr desde esta sesión porque el runner local de Windows no pudo crear procesos (`CreateProcessAsUserW`, error 1312); no se infiere que estén verdes.
5. En Vercel production, cargar y verificar las variables duales live, redeployar y registrar el endpoint live exacto con todos los eventos manejados.
6. Activar `payment_mode: 'live'` en un único evento controlado; no cambiar el modo de todo el catálogo.
7. Hacer un cargo real pequeño con consentimiento, verificar registro/acceso/QR/email/WhatsApp, y comprobar el refund ya corregido. Mantener monitoreo activo durante las primeras 24 horas.

## Actualización de implementación — 2026-07-22

Se aplicaron en código los bloqueadores principales del plan:

- `checkout.session.completed` sin `payment_status=paid` registra estado pendiente para OXXO/SPEI y no otorga acceso ni envía confirmación.
- `payments` y `event_payments` guardan Checkout Session, PaymentIntent, Charge y modo Stripe; refunds/disputes consultan esas referencias.
- La atribución de eventos valida `confirmation_id` contra el `event_id` cobrado y reutiliza esa misma confirmación al otorgar acceso.
- `grantEventAccess` enlaza el `user_id` resuelto cuando el acceso nació desde WhatsApp sin usuario de auth; la revocación acepta `payment_id`/`confirmation_id`.
- Los `service_orders` tienen fulfillment explícito en el webhook, `payment_status` separado del workflow CRM y evento de timeline `payment_received`.
- El estado de una sesión `cs_live_*` ya consulta el cliente Stripe live; las rutas de éxito/reintento de eventos conservan `/pagar/evento/`.
- El preflight `scripts/verify-stripe-go-live.mjs` valida el modelo dual test/live y no imprime PII ni prefijos de secretos.

También se agregó `tests/payments-events-live-hardening.test.mjs` y la migración `supabase/migrations/20260722120000_payments_events_live_hardening.sql`. La migración fue aplicada y verificada en Supabase el 2026-07-22 (historial remoto `20260722181647_payments_events_live_hardening`) y los tipos se regeneraron desde la base real. El estado operativo sigue siendo **NO-GO para cargos reales** hasta configurar/validar Vercel + webhook live y repetir el E2E con QR/email/WhatsApp.

## Conclusión

Stripe como cuenta está listo. La aplicación tiene una base sólida de Checkout, firma, idempotencia, validación de montos y acceso de eventos, pero no está a una simple modificación de variables de cobrar en live. La recomendación es mantener test mode hasta cerrar los tres P0 y repetir la evidencia E2E completa.
