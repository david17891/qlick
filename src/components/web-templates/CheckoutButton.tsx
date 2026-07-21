"use client";

import { useState } from "react";

type CheckoutButtonProps = {
  paquete: "esencial" | "negocio";
  paqueteLabel: string;
  variant?: "primary" | "outline";
  fullWidth?: boolean;
  className?: string;
  children?: React.ReactNode;
};

const PACKAGE_DETAILS: Record<string, { price: string; description: string; bullets: string[] }> = {
  esencial: {
    price: "$2,500 MXN",
    description: "Landing page profesional lista en 3-5 días.",
    bullets: [
      "1 página con hasta 5 secciones",
      "Diseño responsivo profesional",
      "WhatsApp + formulario de contacto",
      "SEO on-page básico",
      "1 ronda de revisión incluida",
    ],
  },
  negocio: {
    price: "$5,500 MXN",
    description: "Sitio completo de 5 páginas listo en 7-10 días.",
    bullets: [
      "Hasta 5 páginas (Inicio, Sobre nosotros, Servicios, Galería, Contacto)",
      "Diseño responsivo profesional",
      "WhatsApp + formulario + Google Maps",
      "SEO on-page completo + Analytics + Meta Pixel",
      "Blog inicial con 2 artículos",
      "2 rondas de revisión incluidas",
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
      const res = await fetch("/api/web/checkout", {
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
      ? "bg-[#0f4c4c] text-white shadow-md shadow-[#0f4c4c]/20 hover:bg-[#0a3939]"
      : "border border-[#0f4c4c] text-[#0f4c4c] hover:bg-[#0f4c4c]/5";
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
                      className="mt-0.5 h-4 w-4 flex-shrink-0 fill-[#0f4c4c]"
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
                  className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-[#0f4c4c] focus:ring-2 focus:ring-[#0f4c4c]/20"
                />
                <input
                  type="email"
                  required
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-[#0f4c4c] focus:ring-2 focus:ring-[#0f4c4c]/20"
                />
                <input
                  type="tel"
                  required
                  placeholder="WhatsApp (10 dígitos)"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-[#0f4c4c] focus:ring-2 focus:ring-[#0f4c4c]/20"
                />

                {error ? (
                  <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-lg bg-[#0f4c4c] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0a3939] disabled:opacity-60"
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
