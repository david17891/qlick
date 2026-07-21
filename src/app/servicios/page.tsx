import type { Metadata } from "next";
import { Container, Badge, EmptyState } from "@/components/ui";
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

  return (
    <>
      <section className="py-14 sm:py-20">
        <Container size="wide">
          {services.length === 0 ? (
            <EmptyState
              icon="🛠️"
              title="Pronto publicaremos los servicios"
              description="Estamos preparando el catálogo. Mientras tanto, mándanos WhatsApp y te contamos qué podemos hacer por tu negocio."
            />
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {services.map((service) => (
                <ServiceCard key={service.id} service={service} />
              ))}
            </div>
          )}
        </Container>
      </section>
    </>
  );
}
