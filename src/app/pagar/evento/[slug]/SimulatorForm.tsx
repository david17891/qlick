"use client";

/**
 * Formulario de simulación de pago para un EVENTO (dev only).
 *
 * Espejo de `/pagar/[courseSlug]/SimulatorForm.tsx`, pero:
 *   - Recibe `eventSlug` en vez de `courseSlug`.
 *   - Envía `productKind: "event"` y `eventSlug` en el body del fetch
 *     (migration 20260714230000 + refactor de `/api/dev/simulate-webhook`).
 *   - El redirect post-pago va a `/eventos/[slug]?paid=ok` (no hay
 *     dashboard de eventos; el evento público es la landing canónica).
 *
 * Botones: "Pago exitoso / rechazado / pendiente" → grantEventAccess
 * para el primero, otros 2 quedan en DB sin grant.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

type EventKind = "paid" | "failed" | "pending";
type MethodKind = "card" | "oxxo" | "spei";

interface SimulatorFormProps {
  eventSlug: string;
  eventTitle: string;
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
  eventSlug,
  eventTitle,
  amountMxn,
}: SimulatorFormProps) {
  const router = useRouter();
  const [method, setMethod] = useState<MethodKind>("card");
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
          eventSlug,
          productKind: "event",
          event,
          method,
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
      // Si el pago fue aprobado y se activó el access, redirigir al evento.
      if (data.accessGranted) {
        setTimeout(() => {
          router.push(`/eventos/${eventSlug}?paid=ok`);
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
        Paga <strong>${amountMxn} MXN</strong> por tu entrada a{" "}
        <strong>{eventTitle}</strong>. Como aún no integramos el provider
        real, elige método y simulación:
      </p>

      {/* Selector de método (mismo patrón visual que el de curso). */}
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase text-ink-muted mb-2">
          Método de pago
        </p>
        <div className="flex flex-wrap gap-2">
          {(["card", "oxxo", "spei"] as MethodKind[]).map((m) => (
            <label
              key={m}
              className={`flex items-center gap-2 cursor-pointer rounded-md border-2 px-3 py-2 text-sm transition ${
                method === m
                  ? "border-brand-500 bg-brand-50"
                  : "border-brand-100 bg-white hover:bg-brand-50/50"
              }`}
            >
              <input
                type="radio"
                name="method"
                value={m}
                checked={method === m}
                onChange={() => setMethod(m)}
                className="accent-brand-500"
              />
              <span className="font-medium text-ink capitalize">
                {m === "card" ? "Tarjeta" : m === "oxxo" ? "OXXO" : "SPEI"}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Botones de evento (mismo patrón visual que el de curso). */}
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
            <p className="text-xs mt-2">Redirigiendo al evento...</p>
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
