import type { Metadata } from "next";
import { Navbar, Footer } from "@/components/layout";
import { Container, Card, SectionHeading, Button, Badge } from "@/components/ui";

export const metadata: Metadata = {
  title: "Beneficios de la plataforma",
  description:
    "Por qué estudiar en Qlick: aprendizaje aplicado, acceso indefinido, certificados, recursos descargables y soporte humano.",
  alternates: { canonical: "/beneficios" }
};

const benefits = [
  {
    icon: "⚡",
    title: "Aplica desde el día 1",
    body: "Cada lección termina con algo que puedes usar ya: una campaña, un bot, una pieza de contenido. No esperas al final para ver resultados."
  },
  {
    icon: "🎯",
    title: "Metodología orientada a resultados",
    body: "Pensamos en embudos, no en likes. Cada curso conecta lo que aprendes con métricas de negocio: ROAS, costo de adquisición, conversión."
  },
  {
    icon: "🎥",
    title: "Video de calidad y a tu ritmo",
    body: "Producción profesional, lecciones cortas y enfocadas. Avanza, pausa y repite cuando quieras, para siempre."
  },
  {
    icon: "🗂️",
    title: "Recursos descargables",
    body: "Plantillas, guías, checklists y calendarios listos para tu negocio. Ahorro de horas de trabajo."
  },
  {
    icon: "🏆",
    title: "Certificado verificable",
    body: "Al completar obtienes un certificado digital con código único, listo para LinkedIn y tu CV."
  },
  {
    icon: "📱",
    title: "Multiplataforma",
    body: "Estudia desde celular, tablet o escritorio. La plataforma se adapta a ti, no al revés."
  },
  {
    icon: "🇲🇽",
    title: "Pagos pensados para México",
    body: "Tarjeta, transferencia SPEI y efectivo en OXXO. Próximamente meses sin intereses."
  },
  {
    icon: "💬",
    title: "Comunidad y soporte",
    body: "No estás solo: resolvemos tus dudas y conectamos con otros alumnos que están en lo mismo que tú."
  },
  {
    icon: "🔁",
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
                <div className="text-3xl mb-3">{b.icon}</div>
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
