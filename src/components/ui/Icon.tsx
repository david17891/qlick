import { forwardRef, type ComponentType, type SVGProps } from "react";
import { cn } from "@/lib/utils";

export type IconSize = "xs" | "sm" | "md" | "lg" | "xl" | "2xl";

const sizeClasses: Record<IconSize, string> = {
  xs: "h-3.5 w-3.5",
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-6 w-6",
  xl: "h-8 w-8",
  "2xl": "h-10 w-10"
};

export type IconProps = SVGProps<SVGSVGElement> & {
  size?: IconSize;
  tone?: "default" | "brand" | "accent" | "white" | "muted" | "inherit";
  block?: boolean;
};

const toneClasses = {
  default: "text-ink",
  brand: "text-brand-500",
  accent: "text-brand-accent",
  white: "text-white",
  muted: "text-ink-muted",
  inherit: ""
};

/**
 * Wrapper para SVG icons inline. Estandariza tamaños y tonos de marca.
 *
 * Uso:
 *   <Icon viewBox="0 0 24 24" size="md" tone="brand">
 *     <path d="..." />
 *   </Icon>
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

/**
 * Wrapper para iconos de `lucide-react`. Estandariza tamaños y tonos de marca
 * sin tener que pasar className cada vez.
 *
 * Uso:
 *   import { Target } from "lucide-react";
 *   <LucideIcon icon={Target} size="lg" tone="brand" />
 *
 * El icono de Lucide ya incluye su propio viewBox y stroke, por lo que
 * este wrapper solo aplica tamaño y tono.
 */
export interface LucideIconProps {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  size?: IconSize;
  tone?: "default" | "brand" | "accent" | "white" | "muted" | "inherit";
  /** Stroke width del icono. Default 2 (estándar Lucide). */
  strokeWidth?: number;
  className?: string;
  /** Aria label si el icono necesita ser leído por screen readers. */
  label?: string;
}

export function LucideIcon({
  icon: IconComponent,
  size = "md",
  tone = "default",
  strokeWidth = 2,
  className,
  label
}: LucideIconProps) {
  return (
    <IconComponent
      aria-hidden={label ? undefined : "true"}
      aria-label={label}
      role={label ? "img" : undefined}
      strokeWidth={strokeWidth}
      className={cn(sizeClasses[size], toneClasses[tone], className)}
    />
  );
}
