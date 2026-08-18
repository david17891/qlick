# Comprobantes OXXO/transferencia — operación

El pago con tarjeta continúa usando Stripe y no cambia. El bot de cierre solo
agrega una ruta manual para quien elija depósito en OXXO o transferencia.
Las formas equivalentes (“depósito”, “transferencia”, “SPEI”, “OXXO”, “número
de tarjeta para depositar” y preguntas de dónde/cómo pagar) muestran el mismo
instructivo.

1. El bot muestra los datos de depósito desde configuración de servidor
   (`MANUAL_PAYMENT_CARD_NUMBER`, banco y beneficiario), con el número
   publicado de esta campaña como fallback. Nunca se envía al LLM.
2. La persona responde `LISTO` y puede adjuntar una foto o PDF del recibo.
3. Meta se persiste primero; el archivo se descarga con el token del servidor y
   se guarda en el bucket privado `whatsapp-media`. Se valida tamaño y SHA-256.
4. Se crea un registro en `event_manual_payment_claims` con estado `review` y
   se envía un aviso por Brevo al equipo. El bot aclara que aún no hay pago,
   QR ni acceso confirmado.
5. El administrador consulta `GET /api/admin/events/:id/manual-payment-claims`.
   Para aprobar debe vincular la confirmación y el monto real con
   `POST .../manual-payment-claims` (`action=approve`). La ruta reutiliza el
   registro manual existente, actualiza `partial`/`paid_manual`, genera o
   reutiliza el QR y entrega el pase por email una sola vez.
6. Si no coincide, se usa `action=reject`; no se habilita acceso.

## Promoción de dos personas

Un comprobante manual se recibe como una sola revisión. Para una compra de la
promoción de dos personas, el administrador debe vincular o crear las dos
confirmaciones y aprobar cada asistente con el importe que corresponda; cada
persona conserva su propio QR y certificado. No se debe marcar la segunda
persona como pagada automáticamente solo porque comparte el comprobante.

Los registros y archivos tienen RLS sin permisos para `anon`/`authenticated`;
la operación usa exclusivamente `service_role`. Repetir el webhook o la misma
foto no crea un segundo comprobante porque la clave es el `whatsapp_message_id`.

Si se cambia la cuenta, se debe sobrescribir `MANUAL_PAYMENT_CARD_NUMBER` en
producción. No debe ponerse como `NEXT_PUBLIC_*`, ni en prompts, logs o
fixtures.
