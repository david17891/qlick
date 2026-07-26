import type { Metadata } from "next";
import { Navbar, Footer, PageHero, CTABanner } from "@/components/layout";
import { Container } from "@/components/ui";
import { faqs } from "@/lib/data/content";

export const metadata: Metadata = {
  title: "Preguntas frecuentes",
  description:
    "Resolvemos las dudas más comunes sobre servicios, eventos, contacto y el próximo catálogo de cursos de Qlick.",
  alternates: { canonical: "/faq" }
};

export default function FaqPage() {
  const categories = Array.from(new Set(faqs.map((f) => f.category)));
  const categoryLabels: Record<string, string> = {
    cursos: "Cursos",
    pagos: "Pagos",
    acceso: "Acceso",
    certificados: "Certificados",
    general: "General"
  };

  return (
    <>
      <Navbar />
      <PageHero
        variant="dark"
        centered={false}
        badge="Respuestas claras"
        title="Lo importante antes de dar el siguiente click."
        subtitle="Aquí reunimos lo que más nos preguntan sobre servicios, eventos, pagos y cómo empezar con Qlick."
      />

      <section className="site-page py-16 sm:py-24">
        <Container size="narrow">
          <div className="site-faq-list space-y-10">
            {categories.map((cat) => (
              <div key={cat}>
                <h2 className="text-xl font-bold text-ink mb-4 flex items-center gap-2">
                  <span className="h-6 w-1 rounded-full bg-brand-500" />
                  {categoryLabels[cat] ?? cat}
                </h2>
                <div className="space-y-3">
                  {faqs
                    .filter((f) => f.category === cat)
                    .map((f) => (
                      <details key={f.id} className="group overflow-hidden">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-ink transition hover:text-brand-700">
                          {f.question}
                          <span className="text-brand-500 transition-transform group-open:rotate-45 shrink-0">
                            +
                          </span>
                        </summary>
                        <div>{f.answer}</div>
                      </details>
                    ))}
                </div>
              </div>
            ))}
          </div>

        </Container>
      </section>

      <CTABanner
        variant="subtle"
        badge="¿No encuentras lo que buscas?"
        title="Cuéntanos tu pregunta directamente."
        subtitle="Te respondemos con el contexto que necesitas para decidir."
        actions={<a href="/contacto" className="home-button home-button--accent">Contactar</a>}
      />

      <Footer />
    </>
  );
}
