import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container, Badge } from "@/components/ui";
import { CTABanner } from "@/components/layout";
import { ServiceDetailInteractive } from "@/components/services/ServiceDetailInteractive";
import { ServiceDemosSection } from "@/components/services/ServiceDemosSection";
import { getServiceBySlug } from "@/lib/services";
import { formatMXN } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface PageProps {
  params: { slug: string };
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const service = await getServiceBySlug(params.slug);
  if (!service) return { title: "Servicio no encontrado · Qlick" };
  return {
    title: `${service.displayName} · Qlick`,
    description:
      service.shortDescription ?? service.longDescription ?? undefined,
    alternates: { canonical: `/servicios/${service.slug}` },
    openGraph: {
      title: service.displayName,
      description:
        service.shortDescription ?? service.longDescription ?? undefined,
    },
  };
}

export default async function ServicioDetallePage({ params }: PageProps) {
  const service = await getServiceBySlug(params.slug);
  if (!service) notFound();

  const minPrice =
    service.variants.length > 0
      ? Math.min(...service.variants.map((v) => v.priceMXN))
      : null;

  return (
    <>
      {/* FIX 2026-07-21 (David): "lo primero que quiero que aparezca es
          el costo del servicio". Eliminado el PageHero morado del detalle.
          Hero nuevo minimal: nombre del servicio + precio grande + CTA
          que scrollea a las variants (anchor #paquetes). Fondo blanco
          para que el precio sea lo más visible sin competencia visual. */}
      <section className="py-16 sm:py-24 bg-white border-b border-brand-100">
        <Container size="wide">
          <div className="mx-auto max-w-3xl text-center">
            <Badge tone="brand" className="mb-6">
              Servicio digital
            </Badge>
            <h1 className="display-1 text-ink mb-6">
              {service.displayName}
            </h1>
            {minPrice !== null && (
              <div className="mb-8">
                <p className="text-xs uppercase tracking-widest text-ink-muted font-semibold">
                  Desde
                </p>
                <p className="mt-2 font-display text-6xl sm:text-7xl font-bold text-brand-700">
                  {formatMXN(minPrice)}
                </p>
                <p className="mt-1 text-sm text-ink-muted">MXN · pago único</p>
              </div>
            )}
            <a
              href="#paquetes"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-500 px-8 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-brand-600"
            >
              Ver paquetes
              <span aria-hidden="true">→</span>
            </a>
          </div>
        </Container>
      </section>

      {/* Descripción larga */}
      {service.longDescription && (
        <section className="py-14 sm:py-20">
          <Container size="wide">
            <div className="mx-auto max-w-3xl text-center">
              <Badge tone="brand" className="mb-4">
                Acerca de este servicio
              </Badge>
              <p className="text-lg text-ink-soft whitespace-pre-line">
                {service.longDescription}
              </p>
            </div>
          </Container>
        </section>
      )}

      {/* FIX 2026-07-21 (David): para /servicios/sitio-web, mostramos el
          portafolio de 4 demos como ejemplos del trabajo. Los demos siguen
          accesibles en /diseno-paginas/demo-* (no se mueven, no se
          rompe nada). El cliente ve el resultado antes de contratar. */}
      {service.slug === "sitio-web" && <ServiceDemosSection />}

      {/* Variants — client component para el modal. El section tiene
          id="paquetes" para que el CTA "Ver paquetes" del hero scrollee
          aquí sin JS extra (anchor nativo). */}
      <div id="paquetes">
        <ServiceDetailInteractive service={service} />
      </div>

      {/* CTA final */}
      <CTABanner
        variant="subtle"
        title="¿Tienes dudas antes de contratar?"
        subtitle="Mándanos WhatsApp y te las resolvemos en minutos. Sin compromiso."
        actions={
          <>
            <a
              href={
                "https://wa.me/5216532935492?text=Hola%2C%20tengo%20dudas%20sobre%20el%20servicio%20" +
                encodeURIComponent(service.displayName) +
                "."
              }
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-full bg-brand-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-600"
            >
              Hablar por WhatsApp
            </a>
            <a
              href="/servicios"
              className="inline-flex items-center justify-center rounded-full border-2 border-brand-500 px-6 py-3 text-sm font-semibold text-brand-700 transition hover:bg-brand-50"
            >
              Ver todos los servicios
            </a>
          </>
        }
      />
    </>
  );
}
