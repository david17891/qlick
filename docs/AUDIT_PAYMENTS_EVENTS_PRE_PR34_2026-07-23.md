# Auditoría de pagos, eventos y servicios — pre-merge PR34

Fecha: 2026-07-23  
Alcance: Stripe Checkout, webhooks test/live, eventos/masterclasses, servicios, confirmaciones/QR, notificaciones, Supabase RLS, Vercel Production y documentación.

## Dictamen

PR34 es necesario y acotado: versiona los tres índices únicos que requiere `upsert(..., onConflict: 'stripe_session_id')`. El DDL ya fue aplicado en Supabase Production y el PR conserva esa corrección de forma reproducible.

El flujo de eventos queda **GO técnico condicionado** para un lanzamiento controlado después de integrar esta auditoría. No se debe activar todo el catálogo en live: sólo un evento controlado, con webhook live confirmado y un procedimiento de conciliación.

## Hallazgos corregidos

1. **Terminales de evento sin ledger.** `checkout.session.async_payment_failed` y `checkout.session.expired` sólo registraban pagos de cursos. Ahora registran/actualizan `event_payments` (`failed`/`cancelled`) y no degradan un pago que ya esté `approved`.
2. **Refund incompleto.** Un `charge.refunded` revocaba `event_access`, pero podía dejar `event_confirmations.payment_status='paid'`. Ahora la confirmación pasa a `revoked` junto con el acceso.
3. **Discrepancia de monto mal clasificada.** Un pago de evento con monto alterado se insertaba en `payments` con `course_id=NULL`. Ahora se conserva en `event_payments` como terminal fallido, con monto esperado/real en `metadata`; los cursos mantienen `suspicious_amount_discrepancy`.
4. **Fallos de servicios sin actualización.** `payment_intent.payment_failed` ahora actualiza `service_orders` y deja evento de timeline.
5. **PII en logs.** Se eliminaron emails de los logs del webhook; sólo queda si el email estaba presente.
6. **Copy engañoso.** La página pública de pago de evento mostraba “Entrada pagada” antes del checkout; ahora muestra “Evento”.
7. **Servicios live controlados.** El payment-link de servicios recibe `mode` explícito. Queda en `test` por defecto y sólo usa live con `STRIPE_SERVICE_PAYMENT_MODE=live` en Production.

## Evidencia ejecutada

- `npm run type-check`: PASS.
- `npm run lint`: PASS.
- Suite focalizada de pagos/webhooks/servicios: 73/73 PASS.
- Gate determinista de CI (`npm run test:ci`): 1,479/1,479 PASS. Se separaron diez suites E2E que requieren Supabase/DeepSeek/WhatsApp reales; quedan para smoke/E2E con secretos explícitos.
- Smoke seguro Production: crear Checkout de prueba 200; webhook sin firma 400; firma falsa 401.
- E2E backend sintético firmado: checkout pagado, idempotencia, OXXO pendiente, async success, disputa, refund y service order; cleanup verificado sin filas sintéticas persistentes.
- Suite completa: 1488 PASS, 3 fallos preexistentes de aislamiento de fixtures CRM (`confirmation` ausente y teléfono duplicado); no son fallos de pagos.
- Vercel Production: deployment READY; las variables `STRIPE_SECRET_KEY`, `STRIPE_SECRET_KEY_LIVE`, `STRIPE_WEBHOOK_SECRET` y `STRIPE_WEBHOOK_SECRET_LIVE` existen como secretas.

## Riesgos/pendientes antes de cobrar de forma general

- Registrar y verificar el endpoint live de Stripe en `https://www.qlick.digital/api/webhooks/stripe`; conservar también el endpoint test si se necesitan ambos modos.
- Activar `event_rules.payment_mode='live'` sólo para un evento controlado y hacer un cargo real pequeño; confirmar webhook, `event_payments`, `event_confirmations`, `event_access`, email QR y WhatsApp.
- Definir operación de OXXO: confirmación diferida al siguiente día hábil, vencimiento y política de no reembolso. Stripe documenta que OXXO no admite refunds.
- Decidir cuándo habilitar servicios live (`STRIPE_SERVICE_PAYMENT_MODE=live`) y probar un pedido de importe bajo; cursos siguen en test por diseño.
- Revisar periódicamente los avisos Supabase de funciones con `search_path` mutable, índices sin uso y RLS sin políticas. Las tablas críticas de ledger son service-role-only o tienen políticas de propietario/admin; no se abrió acceso anónimo.
- Mejorar la resolución de usuarios guest cuando el volumen supere 1,000 usuarios (hoy usa `listUsers` paginado).
- Actualizar el API version de Stripe en una ventana separada, con pruebas de compatibilidad; no mezclarlo con el cambio a live.
- Corregir los tres fixtures CRM que aún hacen fallar `npm test` completo local (no afectan el gate de pagos, pero sí deben quedar aislados o reparados en el siguiente sprint).

## Criterio de merge

Mergear PR34 junto con la corrección de código de esta auditoría sólo con CI verde, revisión del diff y confirmación de que no se añadieron secretos. El cambio de live se realiza después del merge, desde Stripe/Vercel, no desde el código.
