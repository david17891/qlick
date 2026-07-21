import Link from "next/link";
import { Card, LucideIcon } from "@/components/ui";
import { CheckCircle2, Star } from "lucide-react";
import { formatMXN } from "@/lib/utils";
import { resolveIcon } from "./ServiceIcon";
import type { ServiceWithVariants } from "@/types/services";

/**
 * Card del catálogo público de servicios.
 *
 * Diseño v2 (2026-07-21 — feedback de David "actualización del módulo
 * de servicios" + screenshot de referencia):
 * - Header con brand-gradient (mismo estilo que `EventCard` en `/eventos`):
 *   badge con N paquetes en top-right, icon pequeño + título + descripción
 *   corta en blanco.
 * - Si el servicio es `isPopular`, se muestra un badge "MÁS POPULAR" en
 *   top-center (estilo teal/emerald + icono estrella).
 * - Body blanco con bullet list de `service.bullets` (features comunes a
 *   todos los paquetes), precio "desde" y CTA "Ver paquetes".
 * - Border redondeado completo (Card usa `rounded-2xl` por default).
 * - Sin icon grande separado (estaba desperdiciando espacio en el header).
 *
 * Decisión: el header morado con título blanco adentro es la firma de
 * la marca. Es consistente con las cards de eventos y reemplaza el patrón
 * viejo (icon grande en glass + título negro afuera).
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
      <Card hover className="h-full flex flex-col overflow-hidden">
        {/* Header con brand-gradient + contenido en blanco */}
        <div className="relative bg-gradient-to-br from-brand-700 via-brand-500 to-brand-400 p-5 min-h-[180px] flex flex-col gap-2">
          {/* Badge con N paquetes en top-right */}
          {service.variants.length > 0 && (
            <div className="absolute right-3 top-3">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-white/95 text-brand-700">
                {service.variants.length} {service.variants.length === 1 ? "paquete" : "paquetes"}
              </span>
            </div>
          )}

          {/* Badge "MÁS POPULAR" en top-center (estilo destacado verde) */}
          {service.isPopular && (
            <div className="absolute left-1/2 -translate-x-1/2 top-0 -translate-y-1/2 z-10">
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500 text-white shadow-md uppercase tracking-wider">
                <LucideIcon icon={Star} size="sm" className="text-white fill-white" />
                Más popular
              </span>
            </div>
          )}

          {/* Icon pequeño + label + título + descripción corta en blanco */}
          <div className="flex items-center gap-2 text-white/80">
            <LucideIcon icon={IconComponent} size="sm" className="text-white" />
            <span className="text-xs font-semibold uppercase tracking-wider">
              Servicio Qlick
            </span>
          </div>
          <h3 className="font-display text-xl font-bold text-white leading-tight drop-shadow-sm">
            {service.displayName}
          </h3>
          {service.shortDescription && (
            <p className="text-sm text-white/90 line-clamp-3 drop-shadow-sm">
              {service.shortDescription}
            </p>
          )}
        </div>

        {/* Body: bullets + precio + CTA */}
        <div className="mt-auto p-5">
          {/* Bullet list de features comunes (no más de 5 para no saturar) */}
          {service.bullets.length > 0 && (
            <ul className="mb-4 space-y-2">
              {service.bullets.slice(0, 5).map((bullet, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-ink-soft">
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

          {minPrice !== null ? (
            <div className="flex items-baseline gap-2 mb-3">
              <span className="text-xs uppercase tracking-wide text-ink-muted">
                Desde
              </span>
              <span className="font-display text-2xl font-bold text-ink">
                {formatMXN(minPrice)}
              </span>
              <span className="text-xs text-ink-muted">MXN</span>
            </div>
          ) : null}
          <div className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 group-hover:gap-2 transition-all">
            Ver paquetes
            <span aria-hidden="true">→</span>
          </div>
        </div>
      </Card>
    </Link>
  );
}
