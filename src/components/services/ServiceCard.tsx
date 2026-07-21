import Link from "next/link";
import { Card, Badge, LucideIcon } from "@/components/ui";
import { formatMXN } from "@/lib/utils";
import { resolveIcon } from "./ServiceIcon";
import type { ServiceWithVariants } from "@/types/services";

/**
 * Card del catálogo público de servicios.
 *
 * Diseño:
 * - Icono Lucide del service (header con fondo brand-gradient).
 * - displayName + shortDescription.
 * - Precio "desde" calculado de la variant más barata.
 * - Badge con cantidad de variants.
 * - CTA "Ver paquetes" → /servicios/[slug].
 */
export function ServiceCard({ service }: { service: ServiceWithVariants }) {
  const minPrice =
    service.variants.length > 0
      ? Math.min(...service.variants.map((v) => v.priceMXN))
      : null;
  const IconComponent = resolveIcon(service.icon);

  return (
    <Link
      href={`/servicios/${service.slug}`}
      className="group block h-full"
      aria-label={`Ver paquetes de ${service.displayName}`}
    >
      <Card hover className="h-full flex flex-col">
        {/* Header con icono */}
        <div className="relative bg-brand-gradient p-6">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm">
            <LucideIcon
              icon={IconComponent}
              size="lg"
              className="text-white"
            />
          </div>
          {service.variants.length > 0 && (
            <div className="absolute right-4 top-4">
              <Badge tone="accent">
                {service.variants.length} paquetes
              </Badge>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex flex-1 flex-col p-6">
          <h3 className="font-display text-xl font-bold text-ink group-hover:text-brand-700 transition">
            {service.displayName}
          </h3>
          {service.shortDescription && (
            <p className="mt-2 text-sm text-ink-soft line-clamp-3">
              {service.shortDescription}
            </p>
          )}

          {/* Precio desde */}
          <div className="mt-auto pt-6">
            {minPrice !== null ? (
              <div className="flex items-baseline gap-2">
                <span className="text-xs uppercase tracking-wide text-ink-muted">
                  Desde
                </span>
                <span className="font-display text-2xl font-bold text-brand-700">
                  {formatMXN(minPrice)}
                </span>
                <span className="text-xs text-ink-muted">MXN</span>
              </div>
            ) : null}
            <div className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 group-hover:gap-2 transition-all">
              Ver paquetes
              <span aria-hidden="true">→</span>
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}
