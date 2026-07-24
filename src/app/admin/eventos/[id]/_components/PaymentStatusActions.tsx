"use client";

/**
 * Acciones inline de pago para cada fila de confirmados. Sprint
 * pagos-manuales (2026-07-15) + sprint event-payment-progress
 * (2026-07-24 v3).
 *
 * Componente Client que decide qué botones mostrar según el
 * `progress` derivado del ledger (via helper event-payment-progress).
 * Ya NO depende solo de `confirmation.payment_status` (legacy).
 *
 * Reglas (correccion #2 v3):
 *   - `paid_full`         : badge "✓ Pagado" + botón "Revocar".
 *   - `partial_paid`      : badge "💰 Saldo" + botón "Registrar saldo".
 *                           El modal se pre-llena con `balanceDueCentavos`
 *                           y `paymentPurpose="balance"`.
 *   - `unpaid`            : botón "Confirmar pagado" (abre modal con
 *                           opciones Apartado / Pago completo segun
 *                           event_rules.reservation_enabled).
 *   - `pending_verification` / `disputed` / `needs_reconciliation` /
 *     `revoked` / `refunded` / `failed`: botón "Registrar pago" (admin
 *     decide caso por caso; el modal permite "balance" o "full").
 *   - `not_required`      : no se renderiza.
 *
 * Mantiene su propio state local para los modales (cual esta abierto).
 * Al success, llama a `router.refresh()` para que el server component
 * padre recargue los datos del evento.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RegisterManualPaymentModal } from "./RegisterManualPaymentModal";
import { RevokeManualPaymentModal } from "./RevokeManualPaymentModal";

export type EventPaymentProgress =
  | "not_required"
  | "unpaid"
  | "partial_paid"
  | "paid_full"
  | "pending_verification"
  | "failed"
  | "refunded"
  | "revoked"
  | "disputed"
  | "needs_reconciliation";

interface Props {
  eventId: string;
  confirmationId: string;
  confirmationName: string;
  defaultAmount: number; // MXN
  /** Progress derivado del ledger (helper event-payment-progress). */
  progress: EventPaymentProgress;
  /** Centavos cobrados (helper). */
  collectedCentavos: number;
  /** Centavos pendientes cobrables (helper). */
  balanceDueCentavos: number;
  /** Default amount en MXN (events.price_mxn). */
  defaultPriceMXN: number;
  /** Evento permite apartado? */
  reservationEnabled?: boolean;
  /** Apartado configurado (centavos). */
  reservationAmountCentavos?: number;
}

export function PaymentStatusActions({
  eventId,
  confirmationId,
  confirmationName,
  defaultAmount,
  progress,
  collectedCentavos,
  balanceDueCentavos,
  defaultPriceMXN,
  reservationEnabled,
  reservationAmountCentavos,
}: Props) {
  const router = useRouter();
  const [modalKind, setModalKind] = useState<"register" | "revoke" | null>(null);

  function refresh() {
    router.refresh();
  }

  // 'not_required' (evento free) no deberia mostrar este componente,
  // pero por defensa lo manejamos.
  if (progress === "not_required") return null;

  // paid_full: badge Pagado + boton Revocar.
  if (progress === "paid_full") {
    return (
      <>
        <span
          className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-semibold text-emerald-700"
          title="El acumulado del ledger cubre el total del evento"
        >
          ✓ Pagado
        </span>
        <button
          type="button"
          onClick={() => setModalKind("revoke")}
          className="text-[10px] text-red-600 hover:text-red-700 hover:underline"
        >
          Revocar
        </button>
        {modalKind === "revoke" && (
          <RevokeManualPaymentModal
            eventId={eventId}
            confirmationId={confirmationId}
            confirmationName={confirmationName}
            onCancel={() => setModalKind(null)}
            onSuccess={() => {
              setModalKind(null);
              refresh();
            }}
          />
        )}
      </>
    );
  }

  // partial_paid: solo "Registrar saldo".
  if (progress === "partial_paid") {
    return (
      <>
        <span
          className="inline-flex items-center gap-1 rounded-full bg-sky-50 border border-sky-200 px-2 py-0.5 text-[10px] font-semibold text-sky-700"
          title={`Acumulado: $${(collectedCentavos / 100).toLocaleString("es-MX")} MXN. Saldo: $${(balanceDueCentavos / 100).toLocaleString("es-MX")} MXN.`}
        >
          💰 Saldo ${(balanceDueCentavos / 100).toLocaleString("es-MX")} MXN
        </span>
        <button
          type="button"
          onClick={() => setModalKind("register")}
          className="text-[10px] text-brand-700 hover:text-brand-800 hover:underline"
        >
          Registrar saldo
        </button>
        {modalKind === "register" && (
          <RegisterManualPaymentModal
            eventId={eventId}
            confirmationId={confirmationId}
            confirmationName={confirmationName}
            defaultAmount={defaultAmount}
            progressInfo={{
              progress,
              collectedCentavos,
              balanceDueCentavos,
              reservationEnabled,
              reservationAmountCentavos,
            }}
            onCancel={() => setModalKind(null)}
            onSuccess={() => {
              setModalKind(null);
              refresh();
            }}
          />
        )}
      </>
    );
  }

  // unpaid, pending_verification, disputed, needs_reconciliation,
  // revoked, refunded, failed: boton "Confirmar pagado" (admin decide).
  // pending_verification agrega un badge "Pendiente" como antes.
  return (
    <>
      {(progress === "pending_verification" || progress === "disputed" || progress === "needs_reconciliation") && (
        <span
          className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-semibold text-amber-700"
          title={`Estado: ${progress}. Revisar antes de registrar otro pago.`}
        >
          ⏳ {progress === "pending_verification" ? "Pendiente" : progress === "disputed" ? "Disputa" : "Reconciliación"}
        </span>
      )}
      <button
        type="button"
        onClick={() => setModalKind("register")}
        className="inline-flex items-center gap-1 rounded-md bg-brand-500 text-white px-2 py-0.5 text-[10px] font-semibold hover:bg-brand-600 transition"
      >
        💳 {progress === "revoked" ? "Re-registrar" : "Confirmar pagado"}
      </button>
      {modalKind === "register" && (
        <RegisterManualPaymentModal
          eventId={eventId}
          confirmationId={confirmationId}
          confirmationName={confirmationName}
          defaultAmount={defaultAmount}
          progressInfo={{
            progress,
            collectedCentavos,
            balanceDueCentavos,
            reservationEnabled,
            reservationAmountCentavos,
          }}
          onCancel={() => setModalKind(null)}
          onSuccess={() => {
            setModalKind(null);
            refresh();
          }}
        />
      )}
    </>
  );
}
