"use client";

/**
 * Modal para que el admin registre un pago manual de un confirmado.
 * Sprint pagos-manuales (2026-07-15).
 *
 * Misma UX que el resto de los modales del admin (ConfirmDeleteEventModal,
 * StatusChangeConfirm): overlay semitransparente + panel centrado con
 * inputs. Patron visual del design system de Qlick (Card + Button + Input).
 *
 * Campos:
 *   - method (dropdown): card | oxxo | spei | cash | transfer
 *   - voucherInput (opcional, visible solo si method lo amerita)
 *   - amountMXN (default = defaultAmount)
 *   - notes (opcional)
 *
 * El submit hace POST a /api/admin/events/[id]/register-manual-payment
 * y muestra feedback inline (success o error). Al success, llama
 * `onSuccess(result)` para que el padre refresque la lista.
 */

import { useState } from "react";
import { Card, Button, Input, Textarea, Field } from "@/components/ui";

type Method = "card" | "oxxo" | "spei" | "cash" | "transfer";

const METHODS: Array<{ value: Method; label: string; needsVoucher: boolean }> = [
  { value: "card", label: "Tarjeta (datáfono en puerta)", needsVoucher: false },
  { value: "oxxo", label: "OXXO (voucher)", needsVoucher: true },
  { value: "spei", label: "SPEI (CLABE o referencia)", needsVoucher: true },
  { value: "cash", label: "Efectivo en puerta", needsVoucher: false },
  { value: "transfer", label: "Transferencia manual (BBVA, etc.)", needsVoucher: false },
];

interface ModalProps {
  eventId: string;
  confirmationId: string;
  confirmationName: string;
  defaultAmount: number;
  onCancel: () => void;
  onSuccess: (result: {
    paymentId?: string;
    paymentStatus?: string;
  }) => void;
}

export function RegisterManualPaymentModal({
  eventId,
  confirmationId,
  confirmationName,
  defaultAmount,
  onCancel,
  onSuccess,
}: ModalProps) {
  const [method, setMethod] = useState<Method>("cash");
  const [voucherInput, setVoucherInput] = useState("");
  const [amountMXN, setAmountMXN] = useState(String(defaultAmount));
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const currentMethod = METHODS.find((m) => m.value === method)!;
  const needsVoucher = currentMethod.needsVoucher;

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
      // Feedback: si quedo pending_verification (voucher fallo contra
      // Stripe), avisamos al admin. Si quedo paid, OK.
      if (data.paymentStatus === "pending_verification") {
        setSuccess(
          "Quedo en 'pendiente de verificacion'. El voucher no se valido contra Stripe; revisa la nota y contacta al cliente.",
        );
      } else {
        setSuccess("Pago registrado.");
      }
      // Damos un tick para que el admin vea el feedback antes del refresh.
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
      {/* Overlay encima del drawer/modal context (mas opaco). */}
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
          <h3 className="text-lg font-bold text-ink mb-1">Confirmar pagado</h3>
          <p className="text-xs text-ink-muted mb-4">
            Confirmado: <strong>{confirmationName}</strong>
          </p>

          <form onSubmit={handleSubmit} className="space-y-3">
            <Field label="Metodo de pago" htmlFor="pay-method" required>
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
                    ? "Voucher OXXO (16 digitos)"
                    : method === "spei"
                      ? "CLABE (18 digitos) o numero de referencia (8-12 digitos)"
                      : "Token de pago"
                }
                htmlFor="pay-voucher"
                hint="Si lo tienes, validamos contra Stripe API. Si no, lo registramos como 'admin confirmed' sin validacion."
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
              hint={`Default = ${defaultAmount.toFixed(2)} (precio del evento).`}
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
