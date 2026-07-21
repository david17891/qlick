"use client";

import { useState } from "react";

type CheckoutButtonProps = {
  paquete: string;
  paqueteLabel: string;
  variant?: "primary" | "outline";
  fullWidth?: boolean;
  className?: string;
  children?: React.ReactNode;
};

const PACKAGE_DETAILS: Record<string, { price: string; description: string; bullets: string[] }> = {
  "mi-pagina": {
    price: "$2,500 MXN",
    description: "Tu página lista en 3-5 días.",
    bullets: [
      "2 páginas con tu información y contacto",
      "Diseño responsivo (celular y computadora)",
      "Botón de WhatsApp directo",
      "Tu dominio propio (.com o .mx)",
      "Aparece en Google (SEO básico)",
    ],
  },
  "mi-sitio": {
    price: "$5,500 MXN",
    description: "Tu sitio completo listo en 7-10 días.",
    bullets: [
      "5 páginas (inicio, sobre ti, servicios, galería, contacto)",
      "Diseño responsivo profesional",
      "Formulario que guarda mensajes + WhatsApp",
      "Google Maps embebido",
      "Google Analytics y Meta Pixel configurados",
      "Blog con 2 artículos base",
      "2 rondas de revisión",
    ],
  },
};

export function CheckoutButton({
  paquete,
  paqueteLabel,
  variant = "primary",
  fullWidth = false,
  className = "",
  children,
}: CheckoutButtonProps) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const details = PACKAGE_DETAILS[paquete];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/diseno-paginas/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paquete, email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No pudimos procesar la solicitud.");
        setSubmitting(false);
        return;
      }
      // En modo test redirigimos a /gracias?test=1
      if (data.redirect) {
        window.location.href = data.redirect;
        return;
      }
      setSubmitting(false);
    } catch {
      setError("Error de red. Inténtalo de nuevo.");
      setSubmitting(false);
    }
  }

  const baseStyle =
    "inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition";
  const variantStyle =
    variant === "primary"
      ? "bg-brand-500 text-white shadow-glow hover:bg-brand-600"
      : "border-2 border-brand-500 text-brand-500 hover:bg-brand-50";
  const widthStyle = fullWidth ? " w-full" : "";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${baseStyle} ${variantStyle} ${widthStyle} ${className}`}
      >
        {children ?? "Lo quiero"}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => !submitting && setOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="relative w-full max-w-lg overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-4 top-4 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 transition hover:bg-neutral-100"
              aria-label="Cerrar"
              disabled={submitting}
            >
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 6l12 12M6 18L18 6"
                />
              </svg>
            </button>

            <div className="px-6 py-7 sm:px-8 sm:py-9">
              <div className="mb-1 inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-900">
                Modo test
              </div>
              <h2 className="font-display text-2xl font-bold tracking-tight text-neutral-950">
                {paqueteLabel} · {details.price}
              </h2>
              <p className="mt-1 text-sm text-neutral-600">{details.description}</p>

              <ul className="mt-4 space-y-1.5 text-sm text-neutral-700">
                {details.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-2">
                    <svg
                      viewBox="0 0 20 20"
                      className="mt-0.5 h-4 w-4 flex-shrink-0 fill-brand-500"
                      aria-hidden="true"
                    >
                      <path d="M16.7 5.3a1 1 0 0 1 0 1.4l-7 7a1 1 0 0 1-1.4 0l-3-3a1 1 0 1 1 1.4-1.4L9 11.6l6.3-6.3a1 1 0 0 1 1.4 0Z" />
                    </svg>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>

              <form onSubmit={handleSubmit} className="mt-6 space-y-3">
                <input
                  type="text"
                  required
                  placeholder="Tu nombre"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                />
                <input
                  type="email"
                  required
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                />
                <input
                  type="tel"
                  required
                  placeholder="WhatsApp (10 dígitos)"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                />

                {error ? (
                  <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-60"
                >
                  {submitting
                    ? "Procesando…"
                    : `Continuar al pago · ${details.price}`}
                </button>
                <p className="text-center text-[11px] text-neutral-500">
                  Modo test: NO se procesará ningún cargo real. Esta pantalla
                  valida el flujo end-to-end.
                </p>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
