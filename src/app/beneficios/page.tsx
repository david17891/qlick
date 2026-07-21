import type { Metadata } from "next";
import type { ComponentType, SVGProps } from "react";
import { Navbar, Footer } from "@/components/layout";
import { Container, Card, SectionHeading, Button, Badge } from "@/components/ui";
import { LucideIcon } from "@/components/ui/Icon";
import {
  Award,
  FolderOpen,
  MapPin,
  MessageCircle,
  RefreshCw,
  Smartphone,
  Target,
  Video,
  Zap
} from "lucide-react";

export const metadata: Metadata = {
  title: "Beneficios de la plataforma",
  description:
    "Por qué estudiar en Qlick: aprendizaje aplicado, acceso indefinido, certificados, recursos descargables y soporte humano.",
  alternates: { canonical: "/beneficios" }
};

const benefits: Array<{ icon: ComponentType<SVGProps<SVGSVGElement>>; title: string; body: string }> = [
  {
    icon: Zap,
    title: "Aplica desde el día 1",
    body: "Cada lección termina con algo que puedes usar ya: una campaña, un bot, una pieza de contenido. No esperas al final para ver resultados."
  },
  {
    icon: Target,
    title: "Metodología orientada a resultados",
    body: "Pensamos en embudos, no en likes. Cada curso conecta lo que aprendes con métricas de negocio: ROAS, costo de adquisición, conversión."
  },
  {
    icon: Video,
    title: "Video de calidad y a tu ritmo",
    body: "Producción profesional, lecciones cortas y enfocadas. Avanza, pausa y repite cuando quieras, para siempre."
  },
  {
    icon: FolderOpen,
    title: "Recursos descargables",
    body: "Plantillas, guías, checklists y calendarios listos para tu negocio. Ahorro de horas de trabajo."
  },
  {
    icon: Award,
    title: "Certificado verificable",
    body: "Al completar obtienes un certificado digital con código único, listo para LinkedIn y tu CV."
  },
  {
    icon: Smartphone,
    title: "Multiplataforma",
    body: "Estudia desde celular, tablet o escritorio. La plataforma se adapta a ti, no al revés."
  },
  {
    icon: MapPin,
    title: "Pagos pensados para México",
    body: "Tarjeta, transferencia SPEI y efectivo en OXXO. Próximamente meses sin intereses."
  },
  {
    icon: MessageCircle,
    title: "Comunidad y soporte",
    body: "No estás solo: resolvemos tus dudas y conectamos con otros alumnos que están en lo mismo que tú."
  },
  {
    icon: RefreshCw,
    title: "Actualizaciones incluidas",
    body: "El marketing cambia rápido. Cuando un curso se actualiza, lo ves sin pagar de nuevo."
  }
];

export default function BeneficiosPage() {
  return (
    <>
      <Navbar />

      <section className="bg-brand-50/40 border-b border-brand-100">
        <Container className="py-16">
          <Badge tone="brand" className="mb-4">
            Beneficios
          </Badge>
          <h1 className="display-1 text-ink max-w-3xl">
            Por qué aprender en Qlick cambia las reglas.
          </h1>
          <p className="mt-5 text-lg text-ink-soft max-w-2xl">
            No es una plataforma más de cursos. Es un sistema para que apliques
            marketing que mueve números reales.
          </p>
        </Container>
      </section>

      <section className="py-16">
        <Container size="wide">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {benefits.map((b) => (
              <Card key={b.title} hover className="p-6">
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <LucideIcon icon={b.icon} size="lg" tone="inherit" />
                </div>
                <h3 className="font-bold text-lg text-ink">{b.title}</h3>
                <p className="mt-2 text-ink-muted">{b.body}</p>
              </Card>
            ))}
          </div>
        </Container>
      </section>

      <section className="py-16 bg-brand-50/40 border-t border-brand-100">
        <Container>
          <Card className="p-10 text-center bg-brand-gradient text-white">
            <h2 className="display-2 text-white">¿List@ para empezar?</h2>
            <p className="mt-3 text-white/90 max-w-xl mx-auto">
              Tu primer curso es gratis. Sin tarjeta, sin compromiso.
            </p>
            <Button href="/cursos" variant="accent" size="lg" className="mt-6">
              Ver catálogo
            </Button>
          </Card>
        </Container>
      </section>

      <Footer />
    </>
  );
}
