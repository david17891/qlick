import type { Metadata } from "next";
import { Container, Badge, EmptyState } from "@/components/ui";
import { PageHero, CTABanner } from "@/components/layout";
import { ServiceCard } from "@/components/services/ServiceCard";
import { getActiveServices } from "@/lib/services";
import { formatMXN } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Servicios de marketing para tu negocio · Qlick",
  description:
    "Diseño de páginas web, auditoría 1a1 de marketing y campañas de Meta Ads. Servicios profesionales a precios accesibles para emprendedores y PyMEs en México.",
  alternates: { canonical: "/servicios" },
  openGraph: {
    title: "Servicios de marketing para tu negocio · Qlick",
    description:
      "Diseño de páginas, auditoría 1a1 y campañas de Meta Ads. Hecho por estrategas senior.",
    url: "/servicios",
  },
};

export default async function ServiciosPage() {
  const services = await getActiveServices();

  // Total de services + variants para stats del hero.
  const totalVariants = services.reduce((acc, s) => acc + s.variants.length, 0);
  const minPrice = services.length
    ? Math.min(
        ...services.flatMap((s) => s.variants.map((v) => v.priceMXN)),
      )
    : null;

  return (
    <>
      <PageHero
        variant="gradient"
        badge="Servicios profesionales"
        title="Servicios hechos por estrategas, no por plantillas"
        subtitle="Desde una página web que te encuentre en Google hasta una campaña de Meta Ads lista para lanzar. Pagas una vez, te quedas con todo."
        centered
        stats={
          services.length > 0 ? (
            <div className="mt-8 flex flex-wrap justify-center gap-x-8 gap-y-2 text-sm text-white/80">
              <span>· {services.length} servicios activos</span>
              <span>· {totalVariants} paquetes disponibles</span>
              {minPrice !== null && (
                <span>
                  · Desde {formatMXN(minPrice)} MXN
                </span>
              )}
            </div>
          ) : null
        }
      />

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

      {/* ¿Por qué Qlick? — bloques de confianza (reusar lógica de /diseno-paginas) */}
      <section className="bg-brand-50/30 py-14 sm:py-20 border-y border-brand-100">
        <Container size="wide">
          <div className="mx-auto max-w-2xl text-center">
            <Badge tone="brand" className="mb-4">Por qué Qlick</Badge>
            <h2 className="display-2 text-ink">No es magia, es método</h2>
            <p className="mt-4 text-lg text-ink-soft">
              Cada servicio sigue un proceso claro: brief, ejecución, revisión,
              entrega. Sin enredos ni markups sorpresa.
            </p>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-3">
            {[
              {
                title: "1 sola persona habla contigo",
                body: "David te responde directo. Cero markups, cero subcontratos.",
              },
              {
                title: "Entrega en días, no meses",
                body: "De 3 a 10 días según el servicio. Te avisamos por WhatsApp en cada paso.",
              },
              {
                title: "Pagas por resultado",
                body: "Sin licencias raras ni mensualidades ocultas. Lo que contratas, te lo quedas.",
              },
            ].map((b) => (
              <div
                key={b.title}
                className="rounded-2xl border border-brand-100 bg-white p-6 shadow-sm"
              >
                <h3 className="font-bold text-ink">{b.title}</h3>
                <p className="mt-2 text-sm text-ink-soft">{b.body}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* CTA final */}
      <CTABanner
        variant="gradient"
        title="¿No encuentras lo que necesitas?"
        subtitle="Mándanos WhatsApp con lo que tienes en mente. Si está en nuestro radar, te armamos un paquete a la medida."
        actions={
          <>
            <a
              href="https://wa.me/5216532935492?text=Hola%2C%20quiero%20informaci%C3%B3n%20sobre%20los%20servicios%20de%20Qlick."
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-ink transition hover:bg-brand-50"
            >
              Hablar por WhatsApp
            </a>
            <a
              href="/"
              className="inline-flex items-center justify-center rounded-full border-2 border-white px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Volver al inicio
            </a>
          </>
        }
      />
    </>
  );
}
