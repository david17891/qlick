"use client";

import { useState } from "react";

type LeadFormDemoProps = {
  demo: string;
  accentFocus?: string;
  serviceOptions?: readonly string[];
  buttonText?: string;
  successMessage?: string;
};

const ACCENT_DEFAULT = "#0284c7";

export function LeadFormDemo({
  demo,
  accentFocus = ACCENT_DEFAULT,
  serviceOptions,
  buttonText = "Enviar",
  successMessage = "Recibido. Te contactamos pronto.",
}: LeadFormDemoProps) {
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [service, setService] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !phone.trim()) {
      setError("Falta tu nombre o WhatsApp.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/diseno-paginas/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          service: service || undefined,
          demo,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No pudimos enviar. Inténtalo de nuevo.");
        setSubmitting(false);
        return;
      }
      setDone(true);
    } catch {
      setError("Error de red. Inténtalo de nuevo.");
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-5 text-sm text-neutral-700">
        ✓ {successMessage}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-5 space-y-3">
      <input
        type="text"
        required
        placeholder="Tu nombre"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none"
        style={{ borderColor: undefined }}
      />
      <input
        type="tel"
        required
        placeholder="WhatsApp (10 dígitos)"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none"
      />
      {serviceOptions && serviceOptions.length > 0 ? (
        <select
          value={service}
          onChange={(e) => setService(e.target.value)}
          className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none"
          style={{ borderColor: undefined }}
        >
          <option value="">Servicio de interés (opcional)</option>
          {serviceOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      ) : null}

      {error ? (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition disabled:opacity-60"
        style={{ backgroundColor: accentFocus }}
      >
        {submitting ? "Enviando…" : buttonText}
      </button>
      <p className="text-center text-xs text-neutral-500">
        Tus datos se guardan de forma segura. No los compartimos.
      </p>
    </form>
  );
}
