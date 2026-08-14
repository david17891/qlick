# ADR-032 — Confirmado significa pago o apartado verificado

- **Fecha:** 2026-08-10
- **Decisión:** En eventos de pago, `event_confirmations.registration_status`
  solo es `confirmed` cuando el ledger tiene pago completo, pago manual
  verificado o apartado mínimo verificado. La captura sin pago queda en
  `payment_pending`; conserva seguimiento comercial, pero no QR, acceso,
  check-in, encuesta ni broadcasts de asistentes.
- **Motivo:** evita prometer asistencia antes de una señal financiera real y
  mantiene un limbo comercial explícito para convertir la intención en pago.
- **Alternativas descartadas:** tratar toda captura como confirmada mezcla
  ventas con asistencia; borrar la fila hasta pagar pierde seguimiento y
  trazabilidad.
- **Reversibilidad:** la proyección es reversible por estado y los QR se
  revocan sin borrar; el ledger, las migraciones previas y los registros
  históricos se conservan.
