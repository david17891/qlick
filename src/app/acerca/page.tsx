import type { Metadata } from "next";
import type { ComponentType, SVGProps } from "react";
import { Navbar, Footer } from "@/components/layout";
import { Container, Card, Button, SectionHeading, Badge } from "@/components/ui";
import { Logo } from "@/components/brand";
import { LucideIcon } from "@/components/ui/Icon";
import { Handshake, MapPin, Target, TrendingUp } from "lucide-react";

export const metadata: Metadata = {
  title: "Acerca de Qlick",
  description:
    "Qlick Marketing Digital es una agencia y plataforma educativa que ayuda a negocios mexicanos a crecer con marketing aplicado.",
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

      <section className="bg-brand-50/40 border-b border-brand-100">
        <Container className="py-16 text-center">
          <Logo lockup="icon" height={56} className="mx-auto mb-6" />
          <Badge tone="brand" className="mb-4">
            Quiénes somos
          </Badge>
          <h1 className="display-1 text-ink max-w-3xl mx-auto">
            Somos Qlick, una agencia que también <span className="text-brand-gradient">enseña</span>.
          </h1>
          <p className="mt-5 text-lg text-ink-soft max-w-2xl mx-auto">
            Qlick Marketing Digital nació como agencia de marketing. Después de
            años generando resultados para clientes, decidimos empaquetar lo que
            sabemos en cursos prácticos para que más negocios crezcan.
          </p>
        </Container>
      </section>

      {/* Historia */}
      <section className="py-20">
        <Container size="wide" className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <SectionHeading
              eyebrow="Nuestra historia"
              title="De agencia a plataforma educativa"
            />
            <div className="mt-6 space-y-4 text-ink-soft">
              <p>
                Empezamos haciendo marketing para pymes mexicanas: campañas,
                contenido, automatización de ventas. Cada vez teníamos más
                clientes y menos tiempo.
              </p>
              <p>
                La pregunta recurrente era: <em>"¿Y cómo aprendo a hacer esto yo?"</em>.
                Así nació Qlick como plataforma: tomamos lo que funciona en la
                agencia y lo convertimos en formación aplicable.
              </p>
              <p>
                Hoy combinamos ambos mundos: seguimos operando campañas reales y
                actualizamos los cursos con lo que aprendemos en el camino.
              </p>
            </div>
          </div>
          <Card className="p-8 bg-brand-gradient text-white">
            <h3 className="text-2xl font-bold mb-6">Nuestros números</h3>
            <div className="grid grid-cols-2 gap-6">
              {[
                { num: "+8", label: "años de operación" },
                { num: "+2,600", label: "alumnos formados" },
                { num: "+150", label: "cuentas gestionadas" },
                { num: "98%", label: "satisfacción" }
              ].map((s) => (
                <div key={s.label}>
                  <p className="text-3xl font-bold font-display">{s.num}</p>
                  <p className="text-white/80 text-sm mt-1">{s.label}</p>
                </div>
              ))}
            </div>
          </Card>
        </Container>
      </section>

      {/* Valores */}
      <section className="py-20 bg-brand-50/40 border-y border-brand-100">
        <Container size="wide">
          <SectionHeading
            center
            eyebrow="Lo que nos mueve"
            title="Nuestros valores"
          />
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {values.map((v) => (
              <Card key={v.title} className="p-6">
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
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
      <section className="py-20">
        <Container>
          <Card className="p-10 text-center bg-brand-50/50">
            <h2 className="display-2 text-ink">¿Crecemos juntos?</h2>
            <p className="mt-3 text-ink-muted max-w-xl mx-auto">
              Explora el catálogo o cuéntanos tu reto. Te ayudamos a elegir el
              camino correcto.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <Button href="/cursos" size="lg">Ver cursos</Button>
              <Button href="/contacto" variant="outline" size="lg">Contactarnos</Button>
            </div>
          </Card>
        </Container>
      </section>

      <Footer />
    </>
  );
}
