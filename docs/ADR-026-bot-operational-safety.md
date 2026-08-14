# ADR-026 — Controles operativos seguros del bot

Fecha: 2026-08-11

Se mantienen el motor actual y las reglas de confirmación existentes como
ruta de compatibilidad. Se añadieron tablas aditivas de jobs/telemetría sin
PII, pausa reversible para handoffs y bloqueo de QR/acceso antes de pago.

El seguimiento de pagos corre con `pg_cron`/`pg_net` cada 15 minutos en modo
`shadow`. No se activa `live` hasta que Meta apruebe las plantillas y se
configuren sus nombres reales. El secreto del endpoint vive en Vercel y Vault;
los artefactos históricos no se borran.
