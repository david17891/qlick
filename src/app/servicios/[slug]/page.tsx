import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container, Badge, LucideIcon } from "@/components/ui";
import { PageHero, CTABanner } from "@/components/layout";
import { ServiceDetailInteractive } from "@/components/services/ServiceDetailInteractive";
import { resolveIcon } from "@/components/services/ServiceIcon";
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
  const IconComponent = resolveIcon(service.icon);

  return (
    <>
      <PageHero
        variant="gradient"
        badge={service.category === "digital" ? "Servicio digital" : service.category}
        title={service.displayName}
        subtitle={service.shortDescription ?? undefined}
        centered
        stats={
          <div className="mt-8 flex flex-wrap justify-center gap-x-8 gap-y-2 text-sm text-white/80">
            {minPrice !== null && (
              <span>· Desde {formatMXN(minPrice)} MXN</span>
            )}
            <span>· {service.variants.length} paquetes disponibles</span>
            {service.requiresScheduling && <span>· Agendamiento requerido</span>}
          </div>
        }
      >
        {/* Icono grande del service */}
        <div className="mt-8 flex justify-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-white/15 backdrop-blur-sm shadow-glow-accent">
            <LucideIcon
              icon={IconComponent}
              size="2xl"
              className="text-white"
            />
          </div>
        </div>
      </PageHero>

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

      {/* Variants — client component para el modal */}
      <ServiceDetailInteractive service={service} />

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
