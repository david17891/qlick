"use client";

import Image from "next/image";
import Link from "next/link";
import { brandManifest, type BrandVariant } from "@/lib/brand-manifest";
import { cn } from "@/lib/utils";

/**
 * Componente de marca reutilizable.
 *
 * Variantes (siguiendo la guía de identidad visual):
 *  - "full"     → logo completo con tagline.
 *  - "tight"    → logo compacto con tagline.
 *  - "noTagline"→ logo sin tagline (para espacios reducidos).
 *  - "icon"     → solo isotipo Q/mouse (para favicon, avatar, etc.).
 *  - "wordmark" → solo palabra "Qlick".
 *
 * `variant="white"` elige automáticamente los assets blancos para fondos oscuros.
 */

export type LogoLockup = "full" | "tight" | "noTagline" | "icon" | "wordmark";

interface LogoProps {
  lockup?: LogoLockup;
  /** "white" usa los assets blancos; "original" usa los morados. */
  variant?: BrandVariant;
  height?: number;
  className?: string;
  href?: string;
  showWordmark?: boolean;
  priority?: boolean;
}

export function Logo({
  lockup = "full",
  variant = "original",
  height = 40,
  className,
  href,
  priority
}: LogoProps) {
  const src =
    lockup === "icon"
      ? brandManifest.assets.icon[variant]
      : lockup === "wordmark"
        ? brandManifest.assets.wordmark[variant]
        : lockup === "noTagline"
          ? brandManifest.assets.noTagline[variant]
          : lockup === "tight"
            ? brandManifest.assets.fullTight[variant]
            : brandManifest.assets.full[variant];

  // Relación de aspecto aproximada según el lockup.
  const aspect =
    lockup === "icon"
      ? 1
      : lockup === "wordmark"
        ? 315 / 160
        : lockup === "noTagline"
          ? 500 / 300
          : 500 / 361;
  const width = Math.round(height * aspect);

  const img = (
    <Image
      src={src}
      alt={`${brandManifest.name} — logo`}
      width={width}
      height={height}
      priority={priority}
      className={cn("object-contain", className)}
    />
  );

  if (href) {
    return (
      <Link href={href} aria-label={brandManifest.name} className="inline-flex">
        {img}
      </Link>
    );
  }
  return img;
}

/** Isotipo (solo el ícono Q/mouse). */
export function Isotipo({
  variant = "original",
  size = 40,
  className,
  href
}: {
  variant?: BrandVariant;
  size?: number;
  className?: string;
  href?: string;
}) {
  return (
    <Logo
      lockup="icon"
      variant={variant}
      height={size}
      className={className}
      href={href}
    />
  );
}

/** Wordmark Qlick sin símbolo. */
export function Wordmark({
  variant = "original",
  height = 32,
  className
}: {
  variant?: BrandVariant;
  height?: number;
  className?: string;
}) {
  return (
    <Logo lockup="wordmark" variant={variant} height={height} className={className} />
  );
}

/** Tagline "Marketing Integral". */
export function Tagline({
  variant = "original",
  height = 14,
  className
}: {
  variant?: BrandVariant;
  height?: number;
  className?: string;
}) {
  return (
    <Image
      src={brandManifest.assets.tagline[variant]}
      alt={brandManifest.tagline}
      width={Math.round(height * (302 / 47))}
      height={height}
      className={cn("object-contain opacity-80", className)}
    />
  );
}

/** Punto naranja de acento (para bullets, highlights). */
export function AccentDot({ className, size = 12 }: { className?: string; size?: number }) {
  return (
    <Image
      src={brandManifest.assets.accentDot}
      alt=""
      aria-hidden
      width={size}
      height={size}
      className={cn("inline-block", className)}
    />
  );
}
