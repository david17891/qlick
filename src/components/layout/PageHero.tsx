import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageHeroVariant = "light" | "dark" | "mesh" | "gradient";

const variantClasses: Record<PageHeroVariant, string> = {
  light: "bg-brand-50/40 border-b border-brand-100 text-ink",
  dark: "bg-ink text-white",
  mesh: "bg-hero-mesh text-ink",
  gradient: "bg-brand-gradient text-white"
};

const eyebrowColorClasses: Record<PageHeroVariant, string> = {
  light: "text-brand-600",
  dark: "text-brand-300",
  mesh: "text-brand-600",
  gradient: "text-white/80"
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
 * Hero estandarizado para todas las páginas internas del LMS.
 *
 * Reemplaza el patrón ad-hoc que existía en ~15 páginas:
 *   - `/acerca`, `/faq`, `/cursos`, `/eventos`, etc.: `bg-brand-50/40 border-b`
 *   - `/filosofia`: `bg-hero-mesh`
 *   - `/cursos/[slug]`: `bg-ink text-white`
 *   - `/diseno-paginas`: `bg-brand-gradient` con glow
 *
 * Patrón:
 *   <PageHero
 *     variant="light"
 *     badge="Cursos"
 *     title="Catálogo de cursos"
 *     subtitle="Formación práctica en marketing"
 *     actions={<Button>Ver todos</Button>}
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
      {variant === "gradient" && (
        <div className="absolute inset-0 bg-brand-radial opacity-50" aria-hidden="true" />
      )}
      <div
        className={cn(
          "relative mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 sm:py-20 lg:py-24",
          centered ? "text-center" : ""
        )}
      >
        {badge && (
          <p
            className={cn(
              "mb-3 text-xs font-bold uppercase tracking-[0.2em]",
              eyebrowColorClasses[variant]
            )}
          >
            {badge}
          </p>
        )}
        <h1
          className={cn(
            "display-2",
            variant === "light" || variant === "mesh" ? "text-ink" : "text-white"
          )}
        >
          {title}
        </h1>
        {subtitle && (
          <p
            className={cn(
              "mx-auto mt-5 max-w-2xl text-lg",
              isDark ? "text-white/85" : "text-ink-soft"
            )}
          >
            {subtitle}
          </p>
        )}
        {actions && <div className={cn("mt-8 flex flex-wrap gap-3", centered ? "justify-center" : "")}>{actions}</div>}
        {stats && <div className={cn("mt-10", centered ? "flex flex-wrap justify-center gap-6" : "")}>{stats}</div>}
        {children}
      </div>
    </section>
  );
}
