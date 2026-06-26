"use client";

/**
 * Formulario de simulación de pago (Fase C — dev only).
 *
 * En producción este componente se reemplaza por el flujo real del provider
 * (Stripe Elements, MercadoPago Checkout Pro, Conekta widget, etc.). Por ahora
 * expone 3 botones que llaman al endpoint dev con distintos eventos:
 *
 * - "Simular pago exitoso" → POST { event: 'paid' } → grantAccess
 * - "Simular pago rechazado" → POST { event: 'failed' }
 * - "Simular pago pendiente" → POST { event: 'pending' }
 *
 * El endpoint devuelve el resultado; acá mostramos feedback al usuario.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

type EventKind = "paid" | "failed" | "pending";

interface SimulatorFormProps {
  courseSlug: string;
  courseTitle: string;
  amountMxn: number;
}

interface SimulateResponse {
  ok: boolean;
  paymentId: string;
  status: "pending" | "approved" | "rejected" | "refunded" | "cancelled";
  accessGranted: boolean;
  message: string;
}

export function SimulatorForm({
  courseSlug,
  courseTitle,
  amountMxn,
}: SimulatorFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<EventKind | null>(null);
  const [result, setResult] = useState<SimulateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function simulate(event: EventKind) {
    setLoading(event);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/dev/simulate-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseSlug,
          event,
          method: "card",
          amountMxn,
        }),
      });
      const data: SimulateResponse = await res.json();
      if (!res.ok) {
        setError(data.message ?? `Error ${res.status}`);
        setLoading(null);
        return;
      }
      setResult(data);
      // Si el pago fue aprobado y se activó el acceso, redirigir al dashboard.
      if (data.accessGranted) {
        setTimeout(() => {
          router.push("/dashboard?paid=ok");
        }, 1200);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div>
      <p className="text-sm text-ink-muted mb-4">
        Pagás <strong>${amountMxn} MXN</strong> por <strong>{courseTitle}</strong>.
        Como aún no integramos el provider real, elegí cómo querés simular el pago:
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button
          type="button"
          disabled={loading !== null}
          onClick={() => simulate("paid")}
          className="rounded-lg border-2 border-emerald-500 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {loading === "paid" ? "Procesando..." : "✓ Pago exitoso"}
        </button>
        <button
          type="button"
          disabled={loading !== null}
          onClick={() => simulate("failed")}
          className="rounded-lg border-2 border-red-500 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {loading === "failed" ? "Procesando..." : "✗ Pago rechazado"}
        </button>
        <button
          type="button"
          disabled={loading !== null}
          onClick={() => simulate("pending")}
          className="rounded-lg border-2 border-amber-500 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {loading === "pending" ? "Procesando..." : "⏳ Pago pendiente"}
        </button>
      </div>

      {result && (
        <div
          className={`mt-4 rounded-lg border p-4 text-sm ${
            result.accessGranted
              ? "border-emerald-300 bg-emerald-50 text-emerald-800"
              : result.status === "rejected"
                ? "border-red-300 bg-red-50 text-red-800"
                : "border-amber-300 bg-amber-50 text-amber-800"
          }`}
        >
          <p className="font-semibold">{result.message}</p>
          <p className="text-xs mt-1 opacity-75">
            payment_id: <code>{result.paymentId.slice(0, 8)}...</code> · status:{" "}
            <code>{result.status}</code> · access:{" "}
            <code>{result.accessGranted ? "true" : "false"}</code>
          </p>
          {result.accessGranted && (
            <p className="text-xs mt-2">Redirigiendo al dashboard...</p>
          )}
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-semibold">Error</p>
          <p className="text-xs mt-1">{error}</p>
        </div>
      )}
    </div>
  );
}
