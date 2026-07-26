import type { Metadata } from "next";
import { Container, Button, EmptyState } from "@/components/ui";
import { PageHero } from "@/components/layout";
import { ServiceCard } from "@/components/services/ServiceCard";
import { getActiveServices } from "@/lib/services";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Servicios de marketing para tu negocio · Qlick",
  description:
    "Diseño web, auditoría de marketing y campañas de Meta Ads. Servicios profesionales a precios accesibles para emprendedores y PyMEs en México.",
  alternates: { canonical: "/servicios" },
  openGraph: {
    title: "Servicios de marketing para tu negocio · Qlick",
    description:
      "Diseño web, auditoría 1a1 y campañas de Meta Ads. Hecho por estrategas senior.",
    url: "/servicios",
  },
};

export default async function ServiciosPage() {
  const services = await getActiveServices();
  const packages = services.reduce((total, service) => total + service.variants.length, 0);

  return (
    <main className="site-page">
      <PageHero
        variant="dark"
        centered={false}
        badge="Servicios Qlick"
        title="Marketing aplicado para que avances con claridad."
        subtitle="Diseño web, presencia local, campañas y diagnóstico. Elige un punto de partida concreto y recibe algo que puedas poner a trabajar."
        actions={
          <>
            <Button href="/contacto" variant="accent" size="lg">
              Cuéntanos tu reto
            </Button>
            <Button
              href="/eventos"
              variant="ghost"
              size="lg"
              className="!text-white hover:!bg-white/10"
            >
              Ver eventos
            </Button>
          </>
        }
        stats={
          <>
            <div>
              <strong>{String(services.length).padStart(2, "0")}</strong>
              <span>servicios activos</span>
            </div>
            <div>
              <strong>{String(packages).padStart(2, "0")}</strong>
              <span>paquetes publicados</span>
            </div>
            <div>
              <strong>MXN</strong>
              <span>precios claros</span>
            </div>
          </>
        }
      />

      <section className="py-16 sm:py-24">
        <Container size="wide">
          <div className="max-w-2xl">
            <p className="site-eyebrow">
              <span className="site-eyebrow__line" aria-hidden="true" />
              Elige tu siguiente movimiento
            </p>
            <h2 className="mt-5 font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl">
              Un servicio concreto. Un resultado que puedes usar.
            </h2>
            <p className="mt-4 text-lg leading-8 text-ink-muted">
              Cada opción tiene alcance, precio y siguiente paso visibles desde
              el principio. Sin paquetes inflados ni reuniones que no llevan a
              nada.
            </p>
          </div>
          {services.length === 0 ? (
            <div className="mt-12">
              <EmptyState
                icon="🛠️"
                title="Pronto publicaremos los servicios"
                description="Estamos preparando el catálogo. Mientras tanto, mándanos WhatsApp y te contamos qué podemos hacer por tu negocio."
              />
            </div>
          ) : (
            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {services.map((service) => (
                <ServiceCard key={service.id} service={service} />
              ))}
            </div>
          )}
        </Container>
      </section>
    </main>
  );
}
