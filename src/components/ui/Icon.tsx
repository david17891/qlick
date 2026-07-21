import { forwardRef, type SVGProps } from "react";
import { cn } from "@/lib/utils";

export type IconSize = "xs" | "sm" | "md" | "lg" | "xl";

const sizeClasses: Record<IconSize, string> = {
  xs: "h-3.5 w-3.5",
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-6 w-6",
  xl: "h-8 w-8"
};

export type IconProps = SVGProps<SVGSVGElement> & {
  size?: IconSize;
  tone?: "default" | "brand" | "accent" | "white" | "muted";
  /** Si true, el ícono se comporta como block (no inline). */
  block?: boolean;
};

const toneClasses = {
  default: "text-ink",
  brand: "text-brand-500",
  accent: "text-brand-accent",
  white: "text-white",
  muted: "text-ink-muted"
};

/**
 * Wrapper para SVG icons. Estandariza tamaños y tonos de marca.
 *
 * Uso:
 *   <Icon viewBox="0 0 24 24" size="md" tone="brand">
 *     <path d="..." />
 *   </Icon>
 *
 * Si en FASE 6 instalamos lucide-react, este wrapper se puede
 * extender para aceptar un IconNode de Lucide directamente:
 *   <Icon icon={Target} size="md" tone="brand" />
 */
export const Icon = forwardRef<SVGSVGElement, IconProps>(function Icon(
  { size = "md", tone = "default", block, className, ...rest },
  ref
) {
  return (
    <svg
      ref={ref}
      className={cn(
        sizeClasses[size],
        toneClasses[tone],
        block && "block",
        className
      )}
      aria-hidden="true"
      focusable="false"
      {...rest}
    />
  );
});
