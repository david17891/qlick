"use client";

/**
 * Modal para revocar un pago manual. Sprint pagos-manuales (2026-07-15).
 *
 * Misma UX que RegisterManualPaymentModal. Pide solo el motivo (texto
 * libre) y al submit hace POST a /api/admin/events/[id]/revoke-payment.
 */

import { useState } from "react";
import { Card, Button, Textarea, Field } from "@/components/ui";

interface ModalProps {
  eventId: string;
  confirmationId: string;
  confirmationName: string;
  onCancel: () => void;
  onSuccess: () => void;
}

export function RevokeManualPaymentModal({
  eventId,
  confirmationId,
  confirmationName,
  onCancel,
  onSuccess,
}: ModalProps) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (reason.trim().length < 3) {
      setError("El motivo debe tener al menos 3 caracteres.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/admin/events/${eventId}/revoke-payment`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmationId, reason: reason.trim() }),
        },
      );
      const data: { ok: boolean; error?: string; note?: string } =
        await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? `Error ${res.status}`);
        setSubmitting(false);
        return;
      }
      setTimeout(() => onSuccess(), 400);
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
          <h3 className="text-lg font-bold text-ink mb-1">Revocar pago</h3>
          <p className="text-xs text-ink-muted mb-4">
            Confirmado: <strong>{confirmationName}</strong>. El pago
            registrado quedara en status &quot;revoked&quot; y el
            event_access activo se desactivara.
          </p>

          <form onSubmit={handleSubmit} className="space-y-3">
            <Field
              label="Motivo de la revocacion"
              htmlFor="revoke-reason"
              hint="Visible en el audit log. Ej: 'Voucher falso', 'Devolucion parcial', etc."
            >
              <Textarea
                id="revoke-reason"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={submitting}
                placeholder="Voucher falso / Devolucion / etc."
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

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={submitting}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="bg-red-600 hover:bg-red-700"
              >
                {submitting ? "Revocando..." : "Revocar pago"}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
