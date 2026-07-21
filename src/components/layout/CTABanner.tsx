import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Isotipo } from "@/components/brand";

type CTABannerVariant = "gradient" | "subtle";

export interface CTABannerProps {
  /** Variante visual. Default "gradient" (el de la home actual). */
  variant?: CTABannerVariant;
  /** Eyebrow pequeño arriba del título. */
  badge?: string;
  /** Título principal. */
  title: string;
  /** Subtítulo. */
  subtitle?: string;
  /** Acciones (botones) centradas. */
  actions?: ReactNode;
  className?: string;
}

/**
 * CTA banner estandarizado. Reemplaza el patrón ad-hoc que existía en:
 * - Homepage (línea 364-388): bg-brand-gradient con glow + Isotipo
 * - `/acerca`, `/faq`, etc.: card con bg-brand-50/50 simple
 *
 * Patrón:
 *   <CTABanner
 *     variant="gradient"
 *     title="Da el siguiente click a tu negocio."
 *     subtitle="Inscríbete hoy."
 *     actions={<><Button>Empezar</Button><WhatsAppButton intent="sales" /></>}
 *   />
 */
export function CTABanner({
  variant = "gradient",
  badge,
  title,
  subtitle,
  actions,
  className
}: CTABannerProps) {
  if (variant === "subtle") {
    return (
      <section className={cn("py-16 sm:py-20", className)}>
        <div className="mx-auto max-w-4xl rounded-2xl border border-brand-100 bg-brand-50/50 px-6 py-12 text-center sm:px-12">
          {badge && (
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-brand-600">
              {badge}
            </p>
          )}
          <h2 className="font-display text-3xl font-bold text-ink sm:text-4xl">
            {title}
          </h2>
          {subtitle && <p className="mx-auto mt-3 max-w-2xl text-lg text-ink-muted">{subtitle}</p>}
          {actions && <div className="mt-6 flex flex-wrap justify-center gap-3">{actions}</div>}
        </div>
      </section>
    );
  }

  // variant === "gradient" — el patrón premium de la home
  return (
    <section className={cn("py-16 sm:py-20", className)}>
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="relative overflow-hidden rounded-3xl bg-brand-gradient px-8 py-16 text-center text-white shadow-glow sm:px-16 sm:py-20">
          <div className="absolute inset-0 bg-brand-radial opacity-50" aria-hidden="true" />
          <div className="relative">
            <Link href="/" className="inline-block">
              <Isotipo size={48} className="mx-auto mb-6 brightness-0 invert" />
            </Link>
            {badge && (
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-white/80">
                {badge}
              </p>
            )}
            <h2 className="display-2 text-white">{title}</h2>
            {subtitle && (
              <p className="mx-auto mt-4 max-w-xl text-lg text-white/90">{subtitle}</p>
            )}
            {actions && <div className="mt-8 flex flex-wrap justify-center gap-3">{actions}</div>}
          </div>
        </div>
      </div>
    </section>
  );
}
