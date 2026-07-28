"use client";

import { useState } from "react";
import { Container, LucideIcon } from "@/components/ui";
import { CheckCircle2, Package } from "lucide-react";
import { ServiceCheckoutModal } from "./ServiceCheckoutModal";
import { resolveIcon } from "./ServiceIcon";
import type { ServiceWithVariants, ServiceVariant } from "@/types/services";
import { formatMXN } from "@/lib/utils";

/**
 * Sección interactiva del detalle de servicio: lista de variants con
 * botón "Lo quiero" que abre el modal de checkout.
 *
 * v2 (2026-07-21): los variants ahora muestran `includes` como bullets
 * en vez de `description` (texto plano). El `description` queda como
 * fallback legacy para filas que aún no tengan `includes`.
 *
 * Client Component (necesita useState para el modal).
 * El hero y la descripción larga se renderizan en el page.tsx (Server).
 */
export function ServiceDetailInteractive({
  service,
}: {
  service: ServiceWithVariants;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<ServiceVariant | null>(null);

  function handleOpen(variant: ServiceVariant) {
    setSelected(variant);
    setOpen(true);
  }

  function handleClose() {
    setOpen(false);
    // Mantenemos `selected` hasta que cierre la animación (mejor UX al reabrir).
  }

  return (
    <>
      <section className="service-detail-intro site-page">
        <Container size="wide">
          <div className="service-detail-panel p-7 sm:p-10">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
              <div className="max-w-3xl">
                <p className="site-eyebrow">
                  <span className="site-eyebrow__line" aria-hidden="true" />
                  Servicio Qlick
                </p>
                <h1 className="mt-5 font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl">
                  {service.displayName}
                </h1>
                <p className="mt-4 max-w-2xl text-lg leading-8 text-ink-muted">
                  {service.shortDescription ??
                    "Elige el alcance que mejor encaja con lo que tu negocio necesita hoy."}
                </p>
              </div>
              <div className="shrink-0 text-left sm:text-right">
                <span className="service-card__price-label">Opciones disponibles</span>
                <span className="mt-1 block font-display text-3xl font-bold tracking-tight text-ink">
                  {service.variants.length}
                </span>
              </div>
            </div>
          </div>
        </Container>
      </section>

      <section className="site-page border-y border-brand-100 bg-brand-50/35 py-14 sm:py-20">
        <Container size="wide">
          <div className="mx-auto max-w-2xl text-center">
            <p className="site-eyebrow justify-center">
              <span className="site-eyebrow__line" aria-hidden="true" />
              Alcance claro
            </p>
            <h2 className="mt-5 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
              Elige el paquete que se ajusta a tu momento
            </h2>
            <p className="mt-4 text-lg text-ink-soft">
              {service.variants.length === 1
                ? "Un solo paquete, todo incluido."
                : `${service.variants.length} paquetes para que elijas según tu presupuesto y tiempos.`}
            </p>
          </div>

          <div
            className={
              "mt-12 grid gap-6 " +
              (service.variants.length === 1
                ? "max-w-xl mx-auto"
                : service.variants.length === 2
                  ? "sm:grid-cols-2 max-w-3xl mx-auto"
                  : service.variants.length === 4
                    ? "sm:grid-cols-2 lg:grid-cols-4 max-w-7xl mx-auto"
                    : "sm:grid-cols-2 lg:grid-cols-3")
            }
          >
            {service.variants.map((variant) => (
              <VariantCard
                key={variant.id}
                variant={variant}
                serviceDisplayName={service.displayName}
                serviceSlug={service.slug}
                onSelect={() => handleOpen(variant)}
              />
            ))}
          </div>
        </Container>
      </section>

      {selected && (
        <ServiceCheckoutModal
          open={open}
          onClose={handleClose}
          service={service}
          variant={selected}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* VariantCard (interno)                                               */
/* ------------------------------------------------------------------ */

function VariantCard({
  variant,
  serviceDisplayName,
  serviceSlug,
  onSelect,
}: {
  variant: ServiceVariant;
  serviceDisplayName: string;
  serviceSlug: string;
  onSelect: () => void;
}) {
  // Variants con tier alta o recomendada se marcan como featured para resaltar visualmente.
  const isFeatured =
    /pro|profesional|personas|completo|recomendado|premium/i.test(
      variant.label
    ) || /recomendado/i.test(variant.slug);
  const deliveryLabel = formatDeliveryLabel(variant);

  return (
    <div
      className={
      "service-variant-card " + (isFeatured ? "service-variant-card--featured" : "")
    }
  >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center chip-brand">
          <LucideIcon
            icon={Package}
            size="md"
            tone="brand"
          />
        </div>
        <div className="flex-1">
          <h3 className="font-display text-lg font-bold text-ink">
            {variant.label}
          </h3>
          {deliveryLabel && (
            <p className="text-xs text-ink-muted">{deliveryLabel}</p>
          )}
        </div>
      </div>

      {/* v2: bullets `includes` (preferencia). Fallback: `description` legacy. */}
      {variant.includes.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {variant.includes.map((line, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-ink-soft">
              <LucideIcon
                icon={CheckCircle2}
                size="sm"
                className="mt-0.5 shrink-0 text-brand-500"
              />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      ) : variant.description ? (
        <p className="mt-4 text-sm text-ink-soft line-clamp-4">
          {variant.description}
        </p>
      ) : null}

      <div className="mt-6 flex flex-col gap-1">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-3xl font-bold text-ink">
            {formatMXN(variant.priceMXN)}
          </span>
          <span className="text-sm text-ink-muted">MXN</span>
        </div>
        {variant.includes.length > 0 && variant.description && (
          <p className="text-xs font-semibold text-brand-700 bg-brand-50/80 px-2 py-0.5 rounded w-fit border border-brand-200/60">
            {variant.description}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={onSelect}
        className={
          "mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition " +
          (isFeatured
            ? "bg-brand-accent text-ink hover:brightness-95 shadow-[0_6px_20px_-6px_rgba(239,159,8,0.6)]"
            : "bg-brand-500 text-white hover:bg-brand-600")
        }
        aria-label={`Contratar ${variant.label} de ${serviceDisplayName}`}
      >
        Lo quiero
        <span aria-hidden="true">→</span>
      </button>
    </div>
  );
}

function formatDeliveryLabel(v: ServiceVariant): string | null {
  if (v.deliveryDaysMin == null && v.deliveryDaysMax == null) return null;
  if (v.deliveryDaysMin === v.deliveryDaysMax) {
    return `Entrega en ${v.deliveryDaysMin} ${v.deliveryDaysMin === 1 ? "día" : "días"}`;
  }
  if (v.deliveryDaysMin != null && v.deliveryDaysMax != null) {
    return `Entrega en ${v.deliveryDaysMin}–${v.deliveryDaysMax} días`;
  }
  if (v.deliveryDaysMax != null) {
    return `Entrega en hasta ${v.deliveryDaysMax} días`;
  }
  return null;
}
