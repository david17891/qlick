import type { Metadata } from "next";
import { Navbar, Footer } from "@/components/layout";
import { Container, Card, Badge, Button } from "@/components/ui";
import { faqs } from "@/lib/data/content";

export const metadata: Metadata = {
  title: "Preguntas frecuentes",
  description:
    "Resolvemos las dudas más comunes sobre cursos, acceso, pagos, certificados y soporte en Qlick.",
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
      <section className="bg-brand-50/40 border-b border-brand-100">
        <Container className="py-16">
          <Badge tone="brand" className="mb-4">
            Soporte
          </Badge>
          <h1 className="display-1 text-ink">Preguntas frecuentes</h1>
          <p className="mt-5 text-lg text-ink-soft max-w-2xl">
            Lo que más nos preguntan antes de inscribirse. Si tienes otra duda,
            contáctanos.
          </p>
        </Container>
      </section>

      <section className="py-16">
        <Container size="narrow">
          <div className="space-y-10">
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
                      <details
                        key={f.id}
                        className="group rounded-xl border border-brand-100 bg-white overflow-hidden"
                      >
                        <summary className="flex items-center justify-between gap-4 px-5 py-4 cursor-pointer list-none font-semibold text-ink hover:bg-brand-50/50 transition">
                          {f.question}
                          <span className="text-brand-500 transition-transform group-open:rotate-45 shrink-0">
                            +
                          </span>
                        </summary>
                        <div className="px-5 pb-5 text-ink-soft">{f.answer}</div>
                      </details>
                    ))}
                </div>
              </div>
            ))}
          </div>

          <Card className="mt-12 p-8 text-center bg-brand-50/50">
            <h3 className="text-xl font-bold text-ink">¿No encuentras tu respuesta?</h3>
            <p className="mt-2 text-ink-muted">
              Escríbenos y te respondemos en menos de 24 horas hábiles.
            </p>
            <Button href="/contacto" className="mt-4">
              Contactar
            </Button>
          </Card>
        </Container>
      </section>

      <Footer />
    </>
  );
}
