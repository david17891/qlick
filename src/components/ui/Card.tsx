import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
  /**
   * Variante visual:
   *  - "default"  → estilo base (border brand-100, shadow-card) — mismo de antes.
   *  - "pro"      → border brand-200, shadow-card-pro, hairline gradient arriba.
   *                 Default a true para que todas las Cards se vean mejor.
   *  - "flat"     → sin sombra ni hairline, solo border brand-100. Para uso
   *                 dentro de fondos oscuros (testimonios, etc.) donde la
   *                 sombra no aporta.
   */
  variant?: "default" | "pro" | "flat";
}

/**
 * Card primitivo del design system.
 *
 * v2 (2026-07-21 — redesign visual de David "está muy blanco"):
 *  - default: border-brand-200 (no 100/70), shadow-card-pro (con tinte morado).
 *  - hover: glow-pro con elevación sutil.
 *  - pro añade hairline gradient de 3px arriba (brand → accent).
 *  - flat para fondos oscuros.
 *
 * El cambio se propaga a TODAS las Cards del sitio automáticamente — admin,
 * dashboard, marketing — porque solo editamos el primitivo.
 */
export function Card({
  className,
  hover,
  variant = "pro",
  ...rest
}: CardProps) {
  const variantClasses = {
    default: "bg-white border border-brand-100 shadow-card rounded-3xl",
    pro:
      "relative bg-white border border-brand-200 shadow-card-pro overflow-hidden rounded-3xl " +
      "before:content-[''] before:absolute before:top-0 before:left-0 before:right-0 " +
      "before:h-[3px] before:bg-gradient-to-r before:from-brand-500 before:via-brand-700 before:to-brand-accent " +
      "before:opacity-80",
    flat: "bg-white/5 border border-white/10 rounded-3xl"
  } as const;

  return (
    <div
      className={cn(
        variantClasses[variant],
        hover &&
          "transition-all duration-300 hover:-translate-y-1 hover:shadow-glow-pro",
        className
      )}
      {...rest}
    />
  );
}

export function CardBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6", className)} {...rest} />;
}

export function CardHeader({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6 pb-2", className)} {...rest} />;
}

export function CardFooter({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("p-6 pt-2 flex items-center gap-3", className)}
      {...rest}
    />
  );
}
