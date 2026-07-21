import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container, Badge } from "@/components/ui";
import { CTABanner } from "@/components/layout";
import { ServiceDetailInteractive } from "@/components/services/ServiceDetailInteractive";
import { ServiceDemosSection } from "@/components/services/ServiceDemosSection";
import { getServiceBySlug } from "@/lib/services";

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

  return (
    <>
      {/* FIX 2026-07-21 (David, cuarto round): "en todos los servicios
          lo que quiero que quites es lo que esta en recuadro rojo" →
          EL HERO SE ELIMINÓ ENTERO (badge + título + precio grande).
          Los paquetes son ahora LO PRIMERO que se ve. El precio
          sigue visible en cada card de variant ($1,000 / $2,000 etc.)
          así que el costo sigue siendo directo sin hero competiendo. */}
      <ServiceDetailInteractive service={service} />

      {/* FIX 2026-07-21 (David, cuarto round): regresamos los 4 ejemplos
          de sitios web para /servicios/sitio-web. Van DESPUÉS de los
          paquetes para mostrar el resultado antes de contratar. */}
      {service.slug === "sitio-web" && <ServiceDemosSection />}

      {/* Descripción larga al final (no compite con la decisión). */}
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
