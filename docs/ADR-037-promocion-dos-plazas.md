# ADR-037 — Promoción de cierre con orden compartida de dos plazas

- **Fecha:** 2026-08-13
- **Decisión:** El enlace `/promo` ofrece dos personas por $1,500 MXN con
  apartado de $200 MXN, además del checkout normal de una persona por $1,000
  MXN. La promoción usa una sola orden/pago y un QR con dos check-ins.
- **Motivo:** Maximizar conversión sin duplicar cargos ni romper los registros
  y pagos históricos. El segundo participante puede asignarse después, pero no
  se crea una identidad ficticia.
- **Seguridad:** Solo un webhook firmado y confirmado crea acceso/QR; los
  reembolsos revocan ambos accesos. La campaña por video queda separada y no
  se dispara sin aprobación.
- **Cómo revertir:** Desactivar el enlace `/promo` y dejar de ofrecer la
  opción promocional; el checkout normal, el ledger y los registros existentes
  permanecen intactos.
