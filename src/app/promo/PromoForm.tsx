"use client";

import { useState } from "react";

type Mode = "promo" | "single";
type PaymentOption = "reservation" | "full";
type Method = "card" | "oxxo" | "spei";

export function PromoForm({ eventSlug }: { eventSlug: string }) {
  const [mode, setMode] = useState<Mode>("promo");
  const [paymentOption, setPaymentOption] = useState<PaymentOption>("reservation");
  const [method, setMethod] = useState<Method>("card");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const body = {
      mode,
      eventSlug,
      paymentOption,
      method,
      primary: {
        name: String(form.get("primaryName") ?? ""),
        email: String(form.get("primaryEmail") ?? ""),
        phone: String(form.get("primaryPhone") ?? ""),
      },
      secondary: {
        name: String(form.get("secondaryName") ?? ""),
        email: String(form.get("secondaryEmail") ?? ""),
        phone: String(form.get("secondaryPhone") ?? ""),
      },
    };
    try {
      const response = await fetch("/api/promo/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as { ok?: boolean; error?: string; redirectUrl?: string; flow?: string; instructions?: string; orderId?: string };
      if (!response.ok || !result.ok) {
        setError(result.error ?? "No se pudo continuar.");
        return;
      }
      if (result.redirectUrl) {
        window.location.href = result.redirectUrl;
        return;
      }
      if (result.flow === "manual") {
        setError(result.instructions ?? "Sigue las instrucciones de tu método de pago.");
        return;
      }
      window.location.href = `/promo/exito?order_id=${encodeURIComponent(result.orderId ?? "")}`;
    } catch {
      setError("No pudimos iniciar el proceso. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-ink">Reserva tu inscripción</h2>
        <p className="mt-1 text-sm text-ink-muted">Elige una opción, deja tus datos y continúa al pago.</p>
        <p className="mt-1 hidden text-xs text-ink-muted sm:block">El acceso y el QR se habilitan después de verificar el pago o apartado.</p>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-ink">Elige tu opción</legend>
        <label className="flex gap-3 rounded-lg border border-brand-300 bg-brand-50 p-3 text-sm">
          <input type="radio" checked={mode === "promo"} onChange={() => setMode("promo")} />
          <span><strong>2 personas · $1,500 MXN</strong><br /><span className="text-xs text-ink-muted">Apartado de $200 MXN o pago completo.</span></span>
        </label>
        <label className="flex gap-3 rounded-lg border border-slate-200 p-3 text-sm">
          <input type="radio" checked={mode === "single"} onChange={() => setMode("single")} />
          <span><strong>1 persona · $1,000 MXN</strong><br /><span className="text-xs text-ink-muted">Usa el checkout normal del evento.</span></span>
        </label>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-ink">Nombre completo *<input name="primaryName" required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="Nombre y apellido" /></label>
        <label className="text-sm font-medium text-ink">Correo de contacto *<input name="primaryEmail" type="email" required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="tu@correo.com" /></label>
        <label className="text-sm font-medium text-ink">Teléfono (opcional)<input name="primaryPhone" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="+52..." /></label>
      </div>

      {mode === "promo" && <details className="rounded-xl border border-slate-200 p-4">
        <summary className="cursor-pointer list-none text-sm font-semibold text-ink marker:hidden">
          Agregar segunda persona <span className="font-normal text-ink-muted">(opcional)</span>
        </summary>
        <p className="mt-2 text-xs text-ink-muted">Puedes dejarla pendiente y asignarla después. Si usa el mismo correo, indícalo o déjalo vacío.</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-ink">Nombre<input name="secondaryName" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="Pendiente de asignar" /></label>
          <label className="text-sm font-medium text-ink">Correo (opcional)<input name="secondaryEmail" type="email" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="Puede ser el mismo" /></label>
          <label className="text-sm font-medium text-ink">Teléfono (opcional)<input name="secondaryPhone" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="+52..." /></label>
        </div>
      </details>}

      {mode === "promo" && <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-ink">Forma de pago</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex gap-2 rounded-lg border border-slate-200 p-3 text-sm"><input type="radio" checked={paymentOption === "reservation"} onChange={() => setPaymentOption("reservation")} /> Apartar con $200 MXN</label>
          <label className="flex gap-2 rounded-lg border border-slate-200 p-3 text-sm"><input type="radio" checked={paymentOption === "full"} onChange={() => setPaymentOption("full")} /> Pagar $1,500 MXN</label>
        </div>
        <div className="flex gap-2 pt-1">
          {(["card", "oxxo", "spei"] as Method[]).map((item) => <label key={item} className="flex items-center gap-1 text-xs text-ink-muted"><input type="radio" checked={method === item} onChange={() => setMethod(item)} />{item === "card" ? "Tarjeta" : item.toUpperCase()}</label>)}
        </div>
      </fieldset>}

      <button disabled={loading} className="w-full rounded-lg bg-brand-600 px-5 py-3 font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
        {loading ? "Preparando..." : mode === "promo" ? paymentOption === "reservation" ? "Apartar las 2 plazas" : "Pagar promoción" : "Continuar con pago normal"}
      </button>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
    </form>
  );
}
