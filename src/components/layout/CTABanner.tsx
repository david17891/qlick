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
 * CTA banner estandarizado para las superficies públicas.
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
      <section className={cn("site-cta-wrap", className)}>
        <div className="site-cta site-cta--quiet">
          {badge && (
            <p className="site-eyebrow justify-center">
              <span className="site-eyebrow__line" aria-hidden="true" />
              {badge}
            </p>
          )}
          <h2 className="site-cta__title">{title}</h2>
          {subtitle && <p className="site-cta__subtitle">{subtitle}</p>}
          {actions && <div className="mt-6 flex flex-wrap justify-center gap-3">{actions}</div>}
        </div>
      </section>
    );
  }

  // variant === "gradient" — CTA oscuro compartido con la portada
  return (
    <section className={cn("site-cta-wrap", className)}>
      <div className="site-cta site-cta--dark">
        <div className="site-cta__grid" aria-hidden="true" />
        <div className="relative z-10">
            <Link href="/" className="inline-block">
              <Isotipo size={42} className="mx-auto mb-6" />
            </Link>
            {badge && (
              <p className="site-eyebrow site-eyebrow--light justify-center">
                <span className="site-eyebrow__line" aria-hidden="true" />
                {badge}
              </p>
            )}
            <h2 className="site-cta__title site-cta__title--dark">{title}</h2>
            {subtitle && (
              <p className="site-cta__subtitle site-cta__subtitle--dark">{subtitle}</p>
            )}
            {actions && <div className="mt-8 flex flex-wrap justify-center gap-3">{actions}</div>}
        </div>
      </div>
    </section>
  );
}
