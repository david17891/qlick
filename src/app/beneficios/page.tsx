import type { Metadata } from "next";
import type { ComponentType, SVGProps } from "react";
import { Navbar, Footer, PageHero, CTABanner } from "@/components/layout";
import { Container, Card, Button } from "@/components/ui";
import { LucideIcon } from "@/components/ui/Icon";
import {
  Award,
  MapPin,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
  Target,
  Zap
} from "lucide-react";

export const metadata: Metadata = {
  title: "Qué obtienes al trabajar con Qlick",
  description:
    "Diseño, estrategia y marketing aplicado para que tu negocio avance con claridad, entregables concretos y trato directo.",
  alternates: { canonical: "/beneficios" }
};

const benefits: Array<{ icon: ComponentType<SVGProps<SVGSVGElement>>; title: string; body: string }> = [
  {
    icon: Zap,
    title: "Claridad antes de invertir",
    body: "Entendemos tu punto de partida y ordenamos las prioridades antes de proponerte una solución."
  },
  {
    icon: Target,
    title: "Un alcance que se puede revisar",
    body: "Sabrás qué incluye el servicio, qué no y qué decisión estamos tomando en cada etapa."
  },
  {
    icon: Award,
    title: "Entregable listo para usar",
    body: "No recibes solo recomendaciones: recibes una página, una campaña, un diagnóstico o una configuración que puede empezar a trabajar."
  },
  {
    icon: MapPin,
    title: "Pensado para México",
    body: "Precios en MXN, contexto local y decisiones aterrizadas al mercado donde realmente vendes."
  },
  {
    icon: MessageCircle,
    title: "Trato directo",
    body: "Hablas con la persona que entiende el proyecto. Menos intermediarios y más velocidad para decidir."
  },
  {
    icon: RefreshCw,
    title: "Una siguiente acción clara",
    body: "Cada servicio termina con una recomendación concreta para que sepas qué mover después."
  },
  {
    icon: ShieldCheck,
    title: "Sin ataduras innecesarias",
    body: "Pago único, propiedad sobre tu trabajo y sin renovaciones automáticas que te sorprendan."
  }
];

export default function BeneficiosPage() {
  return (
    <>
      <Navbar />

      <PageHero
        variant="dark"
        centered={false}
        badge="La diferencia Qlick"
        title="Lo que cambia cuando el marketing deja de ser ruido."
        subtitle="Una forma de trabajar pensada para que entiendas la decisión, recibas algo útil y sepas qué hacer después."
        actions={
          <Button href="/servicios" variant="accent" size="lg">
            Ver servicios
          </Button>
        }
      />

      <section className="site-page py-16 sm:py-24">
        <Container size="wide">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {benefits.map((b) => (
              <Card key={b.title} hover className="p-6">
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center chip-brand">
                  <LucideIcon icon={b.icon} size="lg" tone="inherit" />
                </div>
                <h3 className="font-bold text-lg text-ink">{b.title}</h3>
                <p className="mt-2 text-ink-muted">{b.body}</p>
              </Card>
            ))}
          </div>
        </Container>
      </section>

      <CTABanner
        variant="gradient"
        badge="Tu siguiente paso"
        title="Empieza por lo que hoy más te frena."
        subtitle="Te ayudamos a convertir el problema correcto en un plan que puedas poner a trabajar."
        actions={
          <>
            <a href="/servicios" className="home-button home-button--accent">Explorar servicios</a>
            <a href="/contacto" className="home-button home-button--dark-ghost">Hablemos</a>
          </>
        }
      />

      <Footer />
    </>
  );
}
