"use client";

import { useState } from "react";
import { Container, Badge, LucideIcon } from "@/components/ui";
import { ServiceCheckoutModal } from "./ServiceCheckoutModal";
import { resolveIcon } from "./ServiceIcon";
import type { ServiceWithVariants, ServiceVariant } from "@/types/services";
import { formatMXN } from "@/lib/utils";

/**
 * Sección interactiva del detalle de servicio: lista de variants con
 * botón "Lo quiero" que abre el modal de checkout.
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
      <section className="bg-brand-50/30 py-14 sm:py-20 border-y border-brand-100">
        <Container size="wide">
          <div className="mx-auto max-w-2xl text-center">
            <Badge tone="brand" className="mb-4">Paquetes</Badge>
            <h2 className="display-2 text-ink">Elegí el paquete que se ajusta a tu momento</h2>
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
  // Variants con precio "profesional" (el más caro del set) se marcan featured.
  // Heurística: el variant con mayor priceMXN del set se considera "top".
  // El padre pasa el flag por contexto, pero acá usamos position en el set
  // (no la tenemos). Hacemos una versión simple: badge "Recomendado" si el
  // label incluye "profesional" o "personas" (las tiers altas del seed).
  const isFeatured = /profesional|personas|completo/i.test(variant.label);
  const deliveryLabel = formatDeliveryLabel(variant);

  return (
    <div
      className={
        "relative flex flex-col rounded-2xl border bg-white p-6 shadow-sm transition hover:shadow-lg " +
        (isFeatured
          ? "border-brand-500 ring-1 ring-brand-500/20"
          : "border-brand-100")
      }
    >
      {isFeatured && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge tone="accent">Más elegido</Badge>
        </div>
      )}

      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50">
          <LucideIcon
            icon={resolveIcon("Package")}
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

      {variant.description && (
        <p className="mt-4 text-sm text-ink-soft line-clamp-4">
          {variant.description}
        </p>
      )}

      <div className="mt-6 flex items-baseline gap-2">
        <span className="font-display text-3xl font-bold text-ink">
          {formatMXN(variant.priceMXN)}
        </span>
        <span className="text-sm text-ink-muted">MXN</span>
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
