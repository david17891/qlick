"use client";

/**
 * Botón de checkout para el flujo real (Stripe / Mercado Pago).
 *
 * Reemplaza al SimulatorForm cuando `NEXT_PUBLIC_PAYMENT_PROVIDER !== "mock"`.
 * El selector de método + un único botón "Pagar ahora" que:
 *   1. Llama a `/api/payments/create-checkout` con `{ slug, method }`.
 *   2. Redirige a `result.redirectUrl` (Stripe Checkout hosted page).
 *   3. Muestra feedback inline si hay error.
 *
 * Tras el pago en Stripe:
 *   - Si OK → redirige a `/pagar/[slug]/exito?session_id=XXX` y el webhook
 *     ya habrá creado el grant (course_access). La página de éxito verifica.
 *   - Si cancela → vuelve a `/pagar/[slug]?cancelled=1`.
 *   - Si OXXO/SPEI → redirige a `?status=pending` con instrucciones.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

type MethodKind = "card" | "oxxo" | "spei";

interface CheckoutButtonProps {
  courseSlug: string;
  courseTitle: string;
  amountMxn: number;
}

interface CreateCheckoutResponse {
  ok: boolean;
  flow?: "redirect" | "embed" | "manual" | "inline";
  redirectUrl?: string;
  instructions?: string;
  paymentId?: string;
  externalReference?: string;
  status?: string;
  finalAmountMXN?: number;
  discountMXN?: number;
  method?: MethodKind;
  provider?: "stripe" | "mock" | "mercadopago" | "conekta";
  error?: string;
  alreadyPaid?: boolean;
}

export function CheckoutButton({
  courseSlug,
  courseTitle,
  amountMxn,
}: CheckoutButtonProps) {
  const router = useRouter();
  const [method, setMethod] = useState<MethodKind>("card");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCheckout() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/payments/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: courseSlug, method }),
      });
      const data: CreateCheckoutResponse = await res.json();

      if (!res.ok || !data.ok) {
        if (data.alreadyPaid) {
          // Si ya pagó, mandamos al dashboard.
          router.push("/dashboard?paid=already");
          return;
        }
        setError(data.error ?? `Error ${res.status} iniciando el pago.`);
        return;
      }

      // Mock provider responde inline — no redirige. Volvemos al dashboard.
      if (data.provider === "mock") {
        router.push("/dashboard?paid=mock");
        return;
      }

      // Stripe: redirigir a Checkout hosted page.
      if (data.flow === "redirect" && data.redirectUrl) {
        window.location.href = data.redirectUrl;
        return;
      }

      // Manual (transferencia/OXXO): mostrar instrucciones inline.
      if (data.flow === "manual") {
        // El provider ya devolvió `instructions`. Lo dejamos en el
        // componente padre (la página /pagar) si quiere mostrarlo arriba;
        // por ahora lo descartamos — Stripe Checkout siempre redirige.
        setError(
          data.instructions ??
            "Tu método de pago requiere acción manual. Revisá tu email.",
        );
        return;
      }

      // Embed o inline: no implementado todavía. Mensaje genérico.
      setError("Flow no soportado todavía. Probá con tarjeta.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <p className="text-sm text-ink-muted mb-4">
        Pagás <strong>${amountMxn} MXN</strong> por <strong>{courseTitle}</strong>.
        Elige tu método y te llevamos a la página de pago segura.
      </p>

      {/* Selector de método */}
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

      <button
        type="button"
        disabled={loading}
        onClick={handleCheckout}
        className="w-full rounded-lg bg-brand-600 px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
      >
        {loading ? "Redirigiendo..." : "Pagar ahora"}
      </button>

      <p className="mt-3 text-xs text-ink-muted text-center">
        Vas a ser redirigido a una página de pago segura. Tus datos de tarjeta
        nunca tocan nuestros servidores.
      </p>

      {error && (
        <div className="mt-4 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-semibold">Error</p>
          <p className="text-xs mt-1">{error}</p>
        </div>
      )}
    </div>
  );
}