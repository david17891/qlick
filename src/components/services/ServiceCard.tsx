import Link from "next/link";
import { Card, LucideIcon } from "@/components/ui";
import { CheckCircle2 } from "lucide-react";
import { formatMXN } from "@/lib/utils";
import { resolveIcon } from "./ServiceIcon";
import type { ServiceWithVariants } from "@/types/services";

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
      <Card hover variant="pro" className="service-card h-full flex flex-col overflow-hidden">
        <div className="service-card__header">
          <div className="flex items-center gap-3">
            <span className="service-card__icon">
              <LucideIcon icon={IconComponent} size="md" tone="inherit" />
            </span>
          </div>
          <h3 className="mt-6 font-display text-2xl font-bold leading-tight tracking-tight text-ink">
            {service.displayName}
          </h3>
          {service.shortDescription && (
            <p className="mt-3 line-clamp-3 text-sm leading-6 text-ink-muted">
              {service.shortDescription}
            </p>
          )}
        </div>

        <div className="service-card__body">
          {service.bullets.length > 0 && (
            <ul className="space-y-2.5">
              {service.bullets.slice(0, 4).map((bullet) => (
                <li key={bullet} className="flex items-start gap-2 text-sm text-ink-soft">
                  <LucideIcon
                    icon={CheckCircle2}
                    size="sm"
                    className="mt-0.5 shrink-0 text-brand-500"
                  />
                  <span className="line-clamp-2">{bullet}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="service-card__footer">
            {minPrice !== null ? (
              <div>
                <span className="service-card__price-label">Desde</span>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="font-display text-2xl font-bold tracking-tight text-ink">
                    {formatMXN(minPrice)}
                  </span>
                  <span className="text-xs text-ink-muted">MXN</span>
                </div>
              </div>
            ) : (
              <span className="service-card__price-label">A cotizar</span>
            )}
            <span className="home-card-link text-sm">
              Ver paquetes <span aria-hidden="true">↗</span>
            </span>
          </div>
        </div>
      </Card>
    </Link>
  );
}
