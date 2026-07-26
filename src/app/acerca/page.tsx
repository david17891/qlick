import type { Metadata } from "next";
import type { ComponentType, SVGProps } from "react";
import { Navbar, Footer, PageHero, CTABanner } from "@/components/layout";
import { Container, Card, SectionHeading } from "@/components/ui";
import { LucideIcon } from "@/components/ui/Icon";
import { Handshake, MapPin, Target, TrendingUp } from "lucide-react";

export const metadata: Metadata = {
  title: "Acerca de Qlick",
  description:
    "Qlick Marketing Digital ayuda a negocios mexicanos a avanzar con diseño web, campañas, presencia local y estrategia aplicada.",
  alternates: { canonical: "/acerca" }
};

const values: Array<{ icon: ComponentType<SVGProps<SVGSVGElement>>; title: string; body: string }> = [
  {
    icon: Target,
    title: "Resultados antes que apariencia",
    body: "No nos enamoramos de campañas bonitas. Medimos y decidimos por lo que mueve el negocio."
  },
  {
    icon: Handshake,
    title: "Cercanía humana",
    body: "Operamos como extensión de tu equipo. Hablas con personas, no con chatbots (aunque enseñemos a hacerlos)."
  },
  {
    icon: TrendingUp,
    title: "Mejora continua",
    body: "El marketing cambia todos los meses. Actualizamos el contenido y nuestra práctica en consecuencia."
  },
  {
    icon: MapPin,
    title: "Hecho en México",
    body: "Entendemos el mercado local: hábitos, pagos, estacionales y forma de comprar."
  }
];

export default function AcercaPage() {
  return (
    <>
      <Navbar />

      <PageHero
        variant="dark"
        badge="Quiénes somos"
        title="Marketing con criterio, diseño y una siguiente acción clara."
        subtitle="Qlick nació para ayudar a negocios mexicanos a dejar de improvisar su presencia digital y empezar a moverla con intención."
      />

      {/* Historia */}
      <section className="py-20">
        <Container size="wide" className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <SectionHeading eyebrow="Nuestra historia" title="De la práctica real a soluciones que puedes usar" />
            <div className="mt-6 space-y-4 text-ink-soft">
              <p>
                Empezamos trabajando con negocios que necesitaban algo más que
                una publicación bonita: campañas, páginas, automatización y
                decisiones que pudieran explicar.
              </p>
              <p>
                Con el tiempo entendimos que el problema no era la falta de
                ideas, sino la falta de claridad sobre qué hacer primero. Así
                convertimos nuestra forma de trabajar en servicios con alcance,
                precio y entrega visibles.
              </p>
              <p>
                Hoy combinamos estrategia, diseño y ejecución. Los cursos y
                talleres forman parte del siguiente capítulo; los servicios y
                eventos son el trabajo que ya está disponible.
              </p>
            </div>
          </div>
          <Card className="about-story-card p-8 sm:p-10">
            <p className="site-eyebrow site-eyebrow--light">
              <span className="site-eyebrow__line" aria-hidden="true" />
              Nuestra forma de trabajar
            </p>
            <h3 className="mt-6 font-display text-3xl font-bold tracking-tight text-white">
              Menos ruido. Más dirección.
            </h3>
            <ul className="mt-8 space-y-5 text-sm leading-6 text-white/65">
              <li><strong className="text-white">01</strong><span className="ml-4">Entendemos el contexto antes de proponer.</span></li>
              <li><strong className="text-white">02</strong><span className="ml-4">Diseñamos con un alcance que se puede revisar.</span></li>
              <li><strong className="text-white">03</strong><span className="ml-4">Entregamos algo listo para el siguiente paso.</span></li>
            </ul>
          </Card>
        </Container>
      </section>

      {/* Valores */}
      <section className="site-page border-y border-brand-100 bg-brand-50/35 py-20">
        <Container size="wide">
          <SectionHeading
            center
            eyebrow="Lo que nos mueve"
            title="Nuestros valores"
          />
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {values.map((v) => (
              <Card key={v.title} className="p-6">
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center chip-brand">
                  <LucideIcon icon={v.icon} size="lg" tone="inherit" />
                </div>
                <h3 className="font-bold text-ink">{v.title}</h3>
                <p className="mt-2 text-sm text-ink-muted">{v.body}</p>
              </Card>
            ))}
          </div>
        </Container>
      </section>

      {/* CTA */}
      <CTABanner
        variant="gradient"
        badge="Siguiente paso"
        title="¿Qué quieres destrabar primero?"
        subtitle="Explora los servicios disponibles o cuéntanos el contexto de tu negocio."
        actions={
          <>
            <a href="/servicios" className="home-button home-button--accent">Ver servicios</a>
            <a href="/contacto" className="home-button home-button--dark-ghost">Contactarnos</a>
          </>
        }
      />

      <Footer />
    </>
  );
}
