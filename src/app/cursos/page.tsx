import type { Metadata } from "next";
import Link from "next/link";
import { Navbar, Footer } from "@/components/layout";
import { Container, Button, Card, Badge, SectionHeading } from "@/components/ui";
import { Reveal } from "@/components/feedback/Reveal";
import { BookOpen, Calendar, Compass } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cursos · Qlick",
  description:
    "Los cursos de Qlick están en preparación. Mientras tanto, conoce nuestros servicios profesionales y eventos.",
  robots: { index: false, follow: true },
};

/**
 * /cursos — Landing "Próximamente" (decisión David 2026-07-21).
 *
 * El catálogo de cursos en LMS se conserva en DB con status='proximamente'
 * (FASE 8A, migration `20260721044345_courses_status_proximamente.sql`).
 * Pero la home y este landing NO los promueven como oferta activa.
 *
 * Mientras el LMS no se lance, esta página:
 * 1. Comunica claramente que los cursos están en preparación.
 * 2. Apunta a los servicios profesionales como alternativa real.
 * 3. Muestra los próximos eventos como otra vía de aprendizaje.
 * 4. Ofrece WhatsApp para consultas específicas.
 *
 * Decisión de SEO: `robots: { index: false }` para que Google no indexe
 * esta página como contenido activo (no queremos que compita con /servicios).
 */
export default function CursosProximamentePage() {
  return (
    <>
      <Navbar />

      {/* Hero */}
      <section className="relative overflow-hidden bg-brand-50/40 border-b border-brand-100">
        <Container size="wide" className="py-20 sm:py-24">
          <div className="mx-auto max-w-2xl text-center">
            <Badge tone="info" className="mb-5">
              Próximamente
            </Badge>
            <h1 className="display-1 text-ink">
              Los cursos de Qlick están en preparación.
            </h1>
            <p className="mt-5 text-lg text-ink-soft">
              Estamos diseñando el catálogo de cursos con el mismo nivel de
              calidad que nuestros servicios. Mientras tanto, ya puedes
              trabajar con nosotros por otras vías.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button href="/servicios" size="lg">
                Ver servicios disponibles
              </Button>
              <Button href="/eventos" variant="outline" size="lg">
                Próximos eventos
              </Button>
            </div>
          </div>
        </Container>
      </section>

      {/* Alternativas reales */}
      <section className="py-20">
        <Container size="wide">
          <SectionHeading
            center
            eyebrow="Mientras tanto"
            title="Tres formas de trabajar con nosotros hoy"
            description="El mismo nivel de estrategia, aplicado a lo que tu negocio necesita ahora."
          />
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              {
                icon: Compass,
                title: "Auditoría y diagnóstico",
                body: "Una sesión 1 a 1 (Zoom o presencial) donde analizamos tu marketing y te damos un plan claro de acción.",
                href: "/servicios/auditoria-1a1",
                cta: "Ver paquetes",
              },
              {
                icon: BookOpen,
                title: "Servicios profesionales",
                body: "Diseño web, campañas de Meta Ads, Google Business Profile. Pago único, entregable concreto.",
                href: "/servicios",
                cta: "Ver catálogo",
              },
              {
                icon: Calendar,
                title: "Eventos y talleres",
                body: "Talleres presenciales y en línea sobre marketing, IA y herramientas para tu negocio. Cupo limitado.",
                href: "/eventos",
                cta: "Ver eventos",
              },
            ].map((alt, i) => (
              <Reveal key={alt.title} delay={i * 100}>
                <Card hover className="h-full p-6 flex flex-col">
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                    <alt.icon className="h-6 w-6" />
                  </div>
                  <h3 className="font-bold text-lg text-ink">{alt.title}</h3>
                  <p className="mt-2 text-ink-muted flex-1">{alt.body}</p>
                  <Link
                    href={alt.href}
                    className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:gap-2 transition-all"
                  >
                    {alt.cta} →
                  </Link>
                </Card>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* CTA WhatsApp */}
      <section className="py-16">
        <Container size="wide">
          <div className="rounded-3xl bg-ink text-white px-8 py-12 sm:px-16 sm:py-16 text-center">
            <h2 className="display-3 text-white">
              ¿Quieres saber cuándo lanzamos los cursos?
            </h2>
            <p className="mt-3 text-white/70 max-w-xl mx-auto">
              Mándanos WhatsApp y te avisamos cuando el catálogo esté listo.
              Sin compromiso, sin spam.
            </p>
            <a
              href="https://wa.me/5216532935492?text=Hola%2C%20quiero%20saber%20cu%C3%A1ndo%20lanzan%20los%20cursos."
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex items-center justify-center rounded-full bg-brand-500 px-7 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-brand-600"
            >
              Hablar por WhatsApp →
            </a>
          </div>
        </Container>
      </section>

      <Footer />
    </>
  );
}
