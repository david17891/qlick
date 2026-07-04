"use client";

import Image from "next/image";
import Link from "next/link";
import { brandManifest, type BrandVariant } from "@/lib/brand-manifest";
import { cn } from "@/lib/utils";

/**
 * Componente de marca reutilizable.
 *
 * Variantes de lockup:
 *  - "full"     → logo completo con tagline.
 *  - "tight"    → logo compacto con tagline.
 *  - "noTagline"→ logo sin tagline.
 *  - "icon"     → solo isotipo Q/mouse.
 *  - "wordmark" → solo palabra "Qlick".
 *
 * ⚠️ AUDITORÍA DE TRANSPARENCIA (ver docs/BRAND_ASSET_AUDIT.md):
 * Los assets "white" NO son transparentes (rectángulos opacos). Por eso NO se
 * deben usar el PNG blanco directo sobre fondos oscuros. Para fondos oscuros:
 *   - Usa variant="original" (los assets morados SÍ son transparentes), o
 *   - Usa el componente <BrandLockup variant="dark">.
 *
 * El isotipo morado (icon original) mantiene buen contraste sobre fondos
 * oscuros (#0f0a1a) porque el morado #AB3FEA es brillante.
 */

export type LogoLockup = "full" | "tight" | "noTagline" | "icon" | "wordmark";

interface LogoProps {
  lockup?: LogoLockup;
  /** "white" usa los assets blancos; "original" usa los morados. */
  variant?: BrandVariant;
  height?: number;
  className?: string;
  href?: string;
  priority?: boolean;
}

function resolveAssetSrc(
  lockup: LogoLockup,
  variant: BrandVariant
): { src: string; width: number; height: number } {
  const group =
    lockup === "icon"
      ? brandManifest.assets.icon
      : lockup === "wordmark"
        ? brandManifest.assets.wordmark
        : lockup === "noTagline"
          ? brandManifest.assets.noTagline
          : lockup === "tight"
            ? brandManifest.assets.fullTight
            : brandManifest.assets.full;

  // group es un objeto indexado por variante (original/white) o "src".
  const asset = (group as Record<string, { src: string; width: number; height: number }>)[
    variant
  ];
  return asset;
}

export function Logo({
  lockup = "full",
  variant = "original",
  height = 40,
  className,
  href,
  priority
}: LogoProps) {
  const asset = resolveAssetSrc(lockup, variant);
  const aspect = asset.width / asset.height;
  const width = Math.round(height * aspect);

  const img = (
    <Image
      src={asset.src}
      alt={`${brandManifest.name} — logo`}
      width={width}
      height={height}
      priority={priority}
      className={cn("object-contain", className)}
    />
  );

  if (href) {
    return (
      <Link
        href={href}
        aria-label={brandManifest.name}
        className="inline-flex items-center py-1"
      >
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

/** Wordmark (solo la palabra "Qlick" con el dot naranja). Fondos claros. */
export function Wordmark({
  variant = "original",
  height = 28,
  className,
  href
}: {
  variant?: BrandVariant;
  height?: number;
  className?: string;
  href?: string;
}) {
  return (
    <Logo
      lockup="wordmark"
      variant={variant}
      height={height}
      className={className}
      href={href}
    />
  );
}

/**
 * Lockup seguro para fondos oscuros.
 *
 * Como los PNG blancos son opacos, este lockup renderiza el isotipo morado
 * (transparente) + el texto "Qlick" en tipografía blanca + tagline opcional.
 * Es la forma correcta de mostrar la marca sobre fondos oscuros sin cajas
 * opacas accidentales.
 */
export function BrandLockup({
  variant = "dark",
  size = "md",
  showTagline = false,
  className,
  href
}: {
  variant?: "dark" | "light";
  size?: "sm" | "md" | "lg";
  showTagline?: boolean;
  className?: string;
  href?: string;
}) {
  const iconSize = size === "sm" ? 24 : size === "lg" ? 40 : 32;
  const textSize = size === "sm" ? "text-lg" : size === "lg" ? "text-2xl" : "text-xl";
  const taglineSize = size === "sm" ? "text-[10px]" : "text-xs";

  const textColor = variant === "dark" ? "text-white" : "text-ink";
  const taglineColor =
    variant === "dark" ? "text-white/60" : "text-ink-muted";

  const content = (
    <div className={cn("flex items-center gap-2.5", className)}>
      <Image
        src={brandManifest.assets.icon.original.src}
        alt="Isotipo de Qlick"
        width={iconSize}
        height={iconSize}
        priority
        className="object-contain"
      />
      <div className="leading-none">
        <span className={cn("font-bold font-display tracking-tight", textSize, textColor)}>
          Qlick
        </span>
        {showTagline && (
          <span className={cn("block mt-0.5 font-medium", taglineSize, taglineColor)}>
            {brandManifest.tagline}
          </span>
        )}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} aria-label={brandManifest.name} className="inline-flex">
        {content}
      </Link>
    );
  }
  return content;
}

/** Tagline "Marketing Integral" como imagen (solo fondos claros). */
export function Tagline({
  variant = "original",
  height = 14,
  className
}: {
  variant?: BrandVariant;
  height?: number;
  className?: string;
}) {
  const asset =
    brandManifest.assets.tagline[
      variant as "original" | "white"
    ] as unknown as { src: string };
  return (
    <Image
      src={asset.src}
      alt={brandManifest.tagline}
      width={Math.round(height * (302 / 47))}
      height={height}
      className={cn("object-contain opacity-80", className)}
    />
  );
}

/** Punto naranja de acento (para bullets, highlights). */
export function AccentDot({
  className,
  size = 12
}: {
  className?: string;
  size?: number;
}) {
  const dot = brandManifest.assets.accentDot as unknown as {
    src: string;
    width: number;
    height: number;
  };
  const aspect = dot.width / dot.height;
  return (
    <Image
      src={dot.src}
      alt=""
      aria-hidden
      width={size}
      height={Math.round(size / aspect)}
      className={cn("inline-block", className)}
    />
  );
}
