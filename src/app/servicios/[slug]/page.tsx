import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Container, Badge } from "@/components/ui";
import { CTABanner } from "@/components/layout";
import { ServiceDetailInteractive } from "@/components/services/ServiceDetailInteractive";
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
      {/* FIX 2026-07-21 (David, segundo round): "no quiero esos
          indicadores feos y ver paquetes, quiero que ahí directamente
          pongas los paquetes". El hero es SOLO título + precio enorme.
          Sin "DESDE" / "MXN" / "Ver paquetes" — los paquetes se ven
          inmediatamente debajo, no hace falta scroll explícito. */}
      <section className="py-14 sm:py-20 bg-white border-b border-brand-100">
        <Container size="wide">
          <div className="mx-auto max-w-3xl text-center">
            <Badge tone="brand" className="mb-5">
              Servicio digital
            </Badge>
            <h1 className="display-1 text-ink mb-6">
              {service.displayName}
            </h1>
            {minPrice !== null && (
              <p className="font-display text-6xl sm:text-7xl font-bold text-brand-700">
                Desde {formatMXN(minPrice)}
              </p>
            )}
          </div>
        </Container>
      </section>

      {/* Variants — client component para el modal. Aparece DIRECTAMENTE
          debajo del hero, sin secciones intermedias ("Acerca de" o
          demos) que roben atención a la decisión de compra. */}
      <ServiceDetailInteractive service={service} />

      {/* FIX 2026-07-21 (David, segundo round): para /servicios/sitio-web,
          debajo de los paquetes va un botón "Ver ejemplos" que abre
          la primera demo (Lumière, demo-1a). Los otros demos siguen
          accesibles por URL directa (`/diseno-paginas/demo-*`). Se
          removió la sección inline de 4 cards (ServiceDemosSection)
          para no repetir lo que el botón ofrece. */}
      {service.slug === "sitio-web" && (
        <section className="py-10 sm:py-12 text-center bg-white border-t border-brand-100">
          <Container size="wide">
            <Link
              href="/diseno-paginas/demo-1a"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-full border-2 border-brand-500 px-7 py-3 text-base font-semibold text-brand-700 transition hover:bg-brand-50"
            >
              Ver ejemplos de sitios web
              <span aria-hidden="true">↗</span>
            </Link>
            <p className="mt-3 text-xs text-ink-muted">
              4 sitios publicados. Te abrimos uno y puedes navegar a los demás.
            </p>
          </Container>
        </section>
      )}

      {/* Descripción larga — movida al FINAL para que no compita con la
          decisión de compra. Va después de los paquetes. */}
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
