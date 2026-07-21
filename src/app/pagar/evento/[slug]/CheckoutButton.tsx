"use client";

/**
 * Botón de checkout para el flujo real (Stripe / Mercado Pago) de un EVENTO.
 *
 * Espejo de `/pagar/[courseSlug]/CheckoutButton.tsx`, pero:
 *   - Recibe `eventSlug` en vez de `courseSlug`.
 *   - Envía `productKind: "event"` en el body del fetch (migration
 *     20260714230000 + refactor de `/api/payments/create-checkout`).
 *   - El redirect post-pago va a `/pagar/[eventSlug]/exito`.
 *
 * Misma lógica de redirect que la versión de curso:
 *   - OK + provider real → redirect a `result.redirectUrl` (Stripe Checkout).
 *   - mock provider → router.push("/dashboard?paid=mock") (legacy).
 *   - alreadyPaid → router.push("/eventos/[slug]?paid=already").
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

type MethodKind = "card" | "oxxo" | "spei";

interface CheckoutButtonProps {
  eventSlug: string;
  eventTitle: string;
  amountMxn: number;
  /**
   * FIX 2026-07-18 (sprint atribución de pagos, David "el link de
   * pago es generico, como se relaciona con el cliente"): si la
   * página lo conoce (vía `?confirmation=xxx` en la URL), lo
   * pasamos al checkout para que el webhook atribuya el cargo a
   * esa confirmation (no por email del customer de Stripe).
   */
  confirmationId?: string | null;
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
  eventSlug,
  eventTitle,
  amountMxn,
  confirmationId,
}: CheckoutButtonProps) {
  const router = useRouter();
  const [method, setMethod] = useState<MethodKind>("card");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCheckout() {
    setLoading(true);
    setError(null);
    try {
      // FIX 2026-07-17 (bug 7): antes NO se pasaban successUrl/cancelUrl,
      // asi que el provider usaba el default `${slug}/exito` que
      // apunta a `/pagar/[courseSlug]/exito` (ruta de CURSO, no evento).
      // Stripe redirigia al flow de curso, que mandaba a /dashboard.
      // Ahora pasamos URLs explicitas a la pagina de exito del EVENTO.
      const baseUrl = window.location.origin;
      const res = await fetch("/api/payments/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: eventSlug,
          productKind: "event",
          method,
          successUrl: `${baseUrl}/pagar/evento/${eventSlug}/exito?session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${baseUrl}/pagar/evento/${eventSlug}?cancelled=1`,
          // FIX 2026-07-18: pasar confirmationId al API para
          // que lo serialice a `metadata.confirmation_id` en
          // el Checkout Session. El webhook lo lee PRIMERO
          // para atribuir el cargo a la confirmation correcta.
          ...(confirmationId ? { confirmationId } : {}),
        }),
      });
      const data: CreateCheckoutResponse = await res.json();

      if (!res.ok || !data.ok) {
        if (data.alreadyPaid) {
          router.push(`/eventos/${eventSlug}?paid=already`);
          return;
        }
        setError(data.error ?? `Error ${res.status} iniciando el pago.`);
        return;
      }

      // Mock provider: vuelve al evento (no hay dashboard específico
      // para eventos; el bot / admin confirman asistencia después).
      if (data.provider === "mock") {
        router.push(`/eventos/${eventSlug}?paid=mock`);
        return;
      }

      // Stripe: redirigir a Checkout hosted page.
      if (data.flow === "redirect" && data.redirectUrl) {
        window.location.href = data.redirectUrl;
        return;
      }

      // Manual (transferencia/OXXO): mostrar instrucciones inline.
      if (data.flow === "manual") {
        setError(
          data.instructions ??
            "Tu método de pago requiere acción manual. Revisá tu email.",
        );
        return;
      }

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
        Pagás <strong>${amountMxn} MXN</strong> por tu entrada a{" "}
        <strong>{eventTitle}</strong>. Elige tu método y te llevamos a la
        página de pago segura.
      </p>

      {/* Selector de método (mismo patrón visual que course). */}
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
        {loading ? "Redirigiendo..." : "Pagar entrada"}
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
