"use client";

/**
 * Modal para que el admin registre un pago manual de un confirmado.
 * Sprint pagos-manuales (2026-07-15) + sprint event-payment-progress
 * (2026-07-24 v3).
 *
 * El modal ahora recibe el `progress` derivado del ledger (via helper
 * `event-payment-progress`) y calcula las opciones válidas:
 *
 *   - `paid_full`        : el padre no debe abrir este modal; aqui
 *                          retornamos `null` defensivamente.
 *   - `partial_paid`     : solo "Registrar saldo" con default = balance
 *                          pendiente en centavos (correccion #4 v3).
 *   - `unpaid`           : "Apartado" (si el evento lo permite) o
 *                          "Pago completo".
 *   - `pending_verification` / `disputed` / `needs_reconciliation` /
 *     `revoked` / `refunded` / `failed`: solo "Pago completo" (admin
 *     tiene que decidir caso por caso). El monto maximo es el
 *     saldo cobrable real.
 *
 * El submit hace POST a /api/admin/events/[id]/register-manual-payment
 * con `paymentPurpose` en el body (correccion #2 v3). La API valida
 * paymentPurpose + amountMXN > 0.
 *
 * Privacidad: client UI sin PII expuesta; los nombres y telefonos
 * ya vienen en props. El modal no agrega ni deriva PII.
 */

import { useEffect, useMemo, useState } from "react";
import { Card, Button, Input, Textarea, Field } from "@/components/ui";

type Method = "card" | "oxxo" | "spei" | "cash" | "transfer";
type PaymentPurpose = "reservation" | "balance" | "full";

const METHODS: Array<{ value: Method; label: string; needsVoucher: boolean }> = [
  { value: "cash", label: "Efectivo en puerta", needsVoucher: false },
  { value: "transfer", label: "Transferencia manual (BBVA, etc.)", needsVoucher: false },
  { value: "card", label: "Tarjeta (datáfono en puerta)", needsVoucher: false },
  { value: "oxxo", label: "OXXO (voucher)", needsVoucher: true },
  { value: "spei", label: "SPEI (CLABE o referencia)", needsVoucher: true },
];

interface ProgressInfo {
  /**
   * Estado derivado (helper event-payment-progress).
   * Si el padre no lo pasa, default = "unpaid" (comportamiento legacy).
   */
  progress?:
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
  /** Centavos cobrados. */
  collectedCentavos?: number;
  /** Centavos pendientes cobrables. */
  balanceDueCentavos?: number;
  /**
   * El evento permite apartado? Si es true, el modal muestra la opcion
   * "Apartado" en estado unpaid.
   */
  reservationEnabled?: boolean;
  /** Apartado configurado (centavos). */
  reservationAmountCentavos?: number;
}

interface ModalProps {
  eventId: string;
  confirmationId: string;
  confirmationName: string;
  defaultAmount: number; // MXN
  progressInfo?: ProgressInfo;
  onCancel: () => void;
  onSuccess: (result: {
    paymentId?: string;
    paymentStatus?: string;
  }) => void;
}

function formatMXN(centavos: number): string {
  const pesos = centavos / 100;
  return pesos.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  });
}

export function RegisterManualPaymentModal({
  eventId,
  confirmationId,
  confirmationName,
  defaultAmount,
  progressInfo,
  onCancel,
  onSuccess,
}: ModalProps) {
  const progress = progressInfo?.progress ?? "unpaid";
  const collectedCentavos = progressInfo?.collectedCentavos ?? 0;
  const balanceDueCentavos = progressInfo?.balanceDueCentavos ?? 0;
  const reservationEnabled = progressInfo?.reservationEnabled === true;
  const reservationAmountCentavos = progressInfo?.reservationAmountCentavos ?? 0;

  // Opciones válidas segun el progress (correccion #2 v3).
  const validPurposes: PaymentPurpose[] = useMemo(() => {
    if (progress === "paid_full") return []; // no debe estar abierto
    if (progress === "partial_paid") return ["balance"];
    if (progress === "unpaid") {
      const out: PaymentPurpose[] = ["full"];
      if (reservationEnabled) out.push("reservation");
      return out;
    }
    // pending_verification / disputed / needs_reconciliation / revoked /
    // refunded / failed / not_required: admin decide caso por caso;
    // permitimos "full" para casos de Pago completo y "balance" si
    // hay saldo cobrable.
    const out: PaymentPurpose[] = [];
    if (balanceDueCentavos > 0) out.push("balance");
    out.push("full");
    return out;
  }, [progress, reservationEnabled, balanceDueCentavos]);

  // Default segun progress.
  const defaultPurpose: PaymentPurpose = validPurposes[0] ?? "full";

  // Default amount segun el purpose y el progress.
  function defaultAmountForPurpose(purpose: PaymentPurpose): number {
    if (purpose === "reservation") {
      // El caller ya paso el amount en MXN. Si hay reservationAmountCentavos,
      // usar ese valor; si no, caer al default del caller.
      if (reservationAmountCentavos > 0) {
        return reservationAmountCentavos / 100;
      }
      return defaultAmount;
    }
    if (purpose === "balance") {
      return balanceDueCentavos > 0 ? balanceDueCentavos / 100 : defaultAmount;
    }
    // full: el saldo total menos lo cobrado (si es cero, bloquear).
    if (collectedCentavos > 0) {
      const remaining = Math.round((defaultAmount * 100 - collectedCentavos)) / 100;
      return remaining > 0 ? remaining : defaultAmount;
    }
    return defaultAmount;
  }

  const [paymentPurpose, setPaymentPurpose] = useState<PaymentPurpose>(defaultPurpose);
  const [method, setMethod] = useState<Method>("cash");
  const [voucherInput, setVoucherInput] = useState("");
  const [amountMXN, setAmountMXN] = useState(String(defaultAmountForPurpose(defaultPurpose)));
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Si cambia el purpose, reescribir el monto default.
  useEffect(() => {
    setAmountMXN(String(defaultAmountForPurpose(paymentPurpose)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentPurpose]);

  const currentMethod = METHODS.find((m) => m.value === method)!;
  const needsVoucher = currentMethod.needsVoucher;

  // Si el progress es paid_full o no hay opciones válidas, el modal
  // no debe estar abierto. Defensa.
  if (validPurposes.length === 0) {
    return (
      <div
        role="alert"
        className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      >
        <Card className="p-6 max-w-md w-full">
          <h3 className="text-lg font-bold text-ink mb-2">No se puede registrar otro pago</h3>
          <p className="text-sm text-ink-muted mb-4">
            Este confirmado ya está liquidado o no requiere pago.
          </p>
          <div className="flex justify-end">
            <Button type="button" onClick={onCancel}>Cerrar</Button>
          </div>
        </Card>
      </div>
    );
  }

  const purposeLabel: Record<PaymentPurpose, string> = {
    reservation: "Apartado",
    balance: "Saldo",
    full: "Pago completo",
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/admin/events/${eventId}/register-manual-payment`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            confirmationId,
            method,
            paymentPurpose,
            voucherInput: needsVoucher ? voucherInput.trim() : null,
            amountMXN: Number(amountMXN) || 0,
            notes: notes.trim() || null,
          }),
        },
      );
      const data: {
        ok: boolean;
        paymentId?: string;
        paymentStatus?: string;
        error?: string;
        note?: string;
      } = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? `Error ${res.status}`);
        setSubmitting(false);
        return;
      }
      if (data.paymentStatus === "pending_verification") {
        setSuccess(
          "Quedó en 'pendiente de verificación'. El voucher no se validó contra Stripe; revisa la nota y contacta al cliente.",
        );
      } else {
        setSuccess("Pago registrado.");
      }
      setTimeout(() => {
        onSuccess({ paymentId: data.paymentId, paymentStatus: data.paymentStatus });
      }, 600);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label="Cerrar modal"
        onClick={() => !submitting && onCancel()}
        className="fixed inset-0 bg-ink/60 z-[60] cursor-default"
      />
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-0 z-[70] flex items-center justify-center p-4 pointer-events-none"
      >
        <Card className="p-6 max-w-md w-full pointer-events-auto">
          <h3 className="text-lg font-bold text-ink mb-1">Registrar pago manual</h3>
          <p className="text-xs text-ink-muted mb-1">
            Confirmado: <strong>{confirmationName}</strong>
          </p>
          {progress !== "unpaid" && (
            <p className="text-xs text-ink-muted mb-4">
              Progreso actual: <strong>{progress}</strong>
              {collectedCentavos > 0 && (
                <>
                  {" "}
                  · Cobrado: <strong>{formatMXN(collectedCentavos)}</strong>
                </>
              )}
              {balanceDueCentavos > 0 && (
                <>
                  {" "}
                  · Saldo: <strong>{formatMXN(balanceDueCentavos)}</strong>
                </>
              )}
            </p>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            {/* Tipo de pago (correccion #2 v3). */}
            <Field
              label="Tipo de pago"
              htmlFor="pay-purpose"
              required
              hint={
                validPurposes.length === 1
                  ? `Según el progreso (${progress}), solo "${purposeLabel[validPurposes[0]]}" es válido.`
                  : "Selecciona el propósito del pago."
              }
            >
              <select
                id="pay-purpose"
                value={paymentPurpose}
                onChange={(e) => setPaymentPurpose(e.target.value as PaymentPurpose)}
                disabled={submitting || validPurposes.length === 1}
                className="w-full rounded-xl border border-brand-100 bg-white px-4 py-3 text-ink focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              >
                {validPurposes.map((p) => (
                  <option key={p} value={p}>
                    {purposeLabel[p]}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Método de pago" htmlFor="pay-method" required>
              <select
                id="pay-method"
                value={method}
                onChange={(e) => setMethod(e.target.value as Method)}
                disabled={submitting}
                className="w-full rounded-xl border border-brand-100 bg-white px-4 py-3 text-ink focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              >
                {METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Field>

            {needsVoucher && (
              <Field
                label={
                  method === "oxxo"
                    ? "Voucher OXXO (16 dígitos)"
                    : method === "spei"
                      ? "CLABE (18 dígitos) o número de referencia (8-12 dígitos)"
                      : "Token de pago"
                }
                htmlFor="pay-voucher"
                hint="Si lo tienes, validamos contra Stripe API. Si no, lo registramos como 'admin confirmed' sin validación."
              >
                <Input
                  id="pay-voucher"
                  value={voucherInput}
                  onChange={(e) => setVoucherInput(e.target.value)}
                  placeholder={method === "oxxo" ? "1234567890123456" : "012345678901234567"}
                  disabled={submitting}
                />
              </Field>
            )}

            <Field
              label="Monto (MXN)"
              htmlFor="pay-amount"
              required
              hint={
                paymentPurpose === "reservation" && reservationAmountCentavos > 0
                  ? `Apartado configurado: ${formatMXN(reservationAmountCentavos)}`
                  : paymentPurpose === "balance" && balanceDueCentavos > 0
                    ? `Saldo pendiente: ${formatMXN(balanceDueCentavos)}`
                    : `Default = ${defaultAmount.toFixed(2)} (precio del evento).`
              }
            >
              <Input
                id="pay-amount"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.50"
                value={amountMXN}
                onChange={(e) => setAmountMXN(e.target.value)}
                disabled={submitting}
              />
            </Field>

            <Field
              label="Notas (opcional)"
              htmlFor="pay-notes"
              hint="Visible en el audit log. Ej: 'Comprobante por WhatsApp' o 'Cobro en puerta'."
            >
              <Textarea
                id="pay-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={submitting}
                placeholder="Comprobante por WhatsApp / Cobro en puerta / etc."
              />
            </Field>

            {error && (
              <div
                role="alert"
                className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800"
              >
                {error}
              </div>
            )}
            {success && (
              <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">
                {success}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={submitting}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Registrando..." : "Confirmar pagado"}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
