import type { Metadata } from "next";
import Link from "next/link";
import { Navbar, Footer, PageHero, CTABanner } from "@/components/layout";
import { Container, Button, Card, SectionHeading } from "@/components/ui";
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

      <PageHero
        variant="dark"
        centered={false}
        badge="Cursos en preparación"
        title="Estamos preparando el próximo capítulo de Qlick."
        subtitle="El catálogo de cursos todavía no está abierto. Mientras tanto, puedes trabajar con nosotros a través de servicios profesionales y eventos en vivo."
        actions={
          <>
            <Button href="/servicios" variant="accent" size="lg">
              Ver servicios disponibles
            </Button>
            <Button href="/eventos" variant="ghost" size="lg" className="!text-white hover:!bg-white/10">
              Próximos eventos
            </Button>
          </>
        }
      />

      {/* Alternativas reales */}
      <section className="site-page py-20 sm:py-24">
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
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center chip-brand">
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

      <CTABanner
        variant="gradient"
        badge="Cuando llegue el momento"
        title="¿Quieres enterarte cuando abramos el catálogo?"
        subtitle="Escríbenos y te avisamos. Sin compromiso, sin ruido."
        actions={
          <a
            href="https://wa.me/5216532935492?text=Hola%2C%20quiero%20saber%20cu%C3%A1ndo%20lanzan%20los%20cursos."
            target="_blank"
            rel="noopener noreferrer"
            className="home-button home-button--accent"
          >
            Hablar por WhatsApp
          </a>
        }
      />

      <Footer />
    </>
  );
}
