import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageHeroVariant = "light" | "dark" | "mesh" | "gradient";

const variantClasses: Record<PageHeroVariant, string> = {
  light: "site-page-hero site-page-hero--light",
  dark: "site-page-hero site-page-hero--dark",
  mesh: "site-page-hero site-page-hero--light",
  gradient: "site-page-hero site-page-hero--dark"
};

export interface PageHeroProps {
  /** Variante visual del hero. Default "light". */
  variant?: PageHeroVariant;
  /** Eyebrow (etiqueta pequeña arriba del título). */
  badge?: string;
  /** Título principal. */
  title: string;
  /** Subtítulo/descripción. */
  subtitle?: string;
  /** Acciones (botones, links) alineadas a la derecha o abajo. */
  actions?: ReactNode;
  /** Stats (texto pequeño) alineados abajo. */
  stats?: ReactNode;
  /** Centered. Default true. */
  centered?: boolean;
  className?: string;
  children?: ReactNode;
}

/**
 * Hero estandarizado para las superficies públicas de Qlick.
 *
 * Reemplaza el patrón ad-hoc que existía en ~15 páginas:
 *   - `/acerca`, `/faq`, `/cursos`, `/eventos`, etc.: `bg-brand-50/40 border-b`
 *   - `/filosofia`: `bg-hero-mesh`
 *   - `/cursos/[slug]`: `bg-ink text-white`
 *   - `/diseno-paginas`: `bg-brand-gradient` con glow
 *
 * Patrón:
 *   <PageHero
 *     variant="dark"
 *     badge="Servicios"
 *     title="Marketing aplicado para avanzar"
 *     subtitle="Estrategia y ejecución con alcance claro."
 *     actions={<Button>Ver servicios</Button>}
 *   />
 */
export function PageHero({
  variant = "light",
  badge,
  title,
  subtitle,
  actions,
  stats,
  centered = true,
  className,
  children
}: PageHeroProps) {
  const isDark = variant === "dark" || variant === "gradient";
  return (
    <section
      className={cn(
        "relative overflow-hidden",
        variantClasses[variant],
        className
      )}
    >
      <div className="site-page-hero__grid" aria-hidden="true" />
      <div className="site-page-hero__orb site-page-hero__orb--one" aria-hidden="true" />
      <div className="site-page-hero__orb site-page-hero__orb--two" aria-hidden="true" />
      <div
        className={cn(
          "relative mx-auto w-full max-w-7xl px-5 py-16 sm:px-8 sm:py-20 lg:py-24",
          centered ? "text-center" : ""
        )}
      >
        {badge && (
          <p className={cn("site-eyebrow", isDark && "site-eyebrow--light", centered && "justify-center")}>
            <span className="site-eyebrow__line" aria-hidden="true" />
            {badge}
          </p>
        )}
        <h1
          className={cn(
            "site-page-hero__title",
            centered ? "mx-auto" : ""
          )}
        >
          {title}
        </h1>
        {subtitle && (
          <p
            className={cn(
              "site-page-hero__subtitle mt-5 max-w-2xl",
              centered ? "mx-auto" : "",
              isDark ? "site-page-hero__subtitle--dark" : ""
            )}
          >
            {subtitle}
          </p>
        )}
        {actions && <div className={cn("mt-8 flex flex-wrap gap-3", centered ? "justify-center" : "")}>{actions}</div>}
        {stats && <div className={cn("site-page-hero__stats mt-10", centered ? "justify-center" : "")}>{stats}</div>}
        {children}
      </div>
    </section>
  );
}
