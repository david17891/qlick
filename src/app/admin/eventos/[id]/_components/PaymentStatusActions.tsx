"use client";

/**
 * Acciones inline de pago para cada fila de confirmados. Sprint
 * pagos-manuales (2026-07-15).
 *
 * Componente Client que decide qué botones mostrar según el
 * `paymentStatus` actual del confirmado:
 *   - 'not_required' o 'pending' o 'pending_verification' o undefined:
 *     muestra "Confirmar pagado" (abre RegisterManualPaymentModal).
 *   - 'paid': muestra badge "✓ Pagado" + botón pequeño "Revocar"
 *     (abre RevokeManualPaymentModal).
 *   - 'revoked': muestra badge "✗ Revocado" + botón "Re-registrar"
 *     (abre RegisterManualPaymentModal con prefill).
 *
 * Mantiene su propio state local para los modales (cual esta abierto).
 * Al success, llama a `router.refresh()` para que el server component
 * padre recargue los datos del evento (confirmations, payments, etc).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RegisterManualPaymentModal } from "./RegisterManualPaymentModal";
import { RevokeManualPaymentModal } from "./RevokeManualPaymentModal";

type PaymentStatus =
  | "not_required"
  | "pending"
  | "pending_verification"
  | "paid"
  | "revoked"
  | undefined;

interface Props {
  eventId: string;
  confirmationId: string;
  confirmationName: string;
  defaultAmount: number;
  paymentStatus: PaymentStatus;
}

export function PaymentStatusActions({
  eventId,
  confirmationId,
  confirmationName,
  defaultAmount,
  paymentStatus,
}: Props) {
  const router = useRouter();
  const [modalKind, setModalKind] = useState<"register" | "revoke" | null>(
    null,
  );

  function refresh() {
    router.refresh();
  }

  // 'not_required' (evento free) no deberia mostrar este componente,
  // pero por defensa lo manejamos.
  if (paymentStatus === "not_required") return null;

  if (paymentStatus === "paid") {
    return (
      <>
        <span
          className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-semibold text-emerald-700"
          title="Pago confirmado"
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

  if (paymentStatus === "revoked") {
    return (
      <>
        <span
          className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[10px] font-semibold text-red-700"
          title="Pago revocado"
        >
          ✗ Revocado
        </span>
        <button
          type="button"
          onClick={() => setModalKind("register")}
          className="text-[10px] text-brand-700 hover:text-brand-800 hover:underline"
        >
          Re-registrar
        </button>
        {modalKind === "register" && (
          <RegisterManualPaymentModal
            eventId={eventId}
            confirmationId={confirmationId}
            confirmationName={confirmationName}
            defaultAmount={defaultAmount}
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

  // pending o pending_verification: ambos permiten confirmar/re-registrar.
  return (
    <>
      {paymentStatus === "pending_verification" && (
        <span
          className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-semibold text-amber-700"
          title="Pendiente de verificacion contra Stripe"
        >
          ⏳ Pendiente
        </span>
      )}
      <button
        type="button"
        onClick={() => setModalKind("register")}
        className="inline-flex items-center gap-1 rounded-md bg-brand-500 text-white px-2 py-0.5 text-[10px] font-semibold hover:bg-brand-600 transition"
      >
        💳 Confirmar pagado
      </button>
      {modalKind === "register" && (
        <RegisterManualPaymentModal
          eventId={eventId}
          confirmationId={confirmationId}
          confirmationName={confirmationName}
          defaultAmount={defaultAmount}
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
