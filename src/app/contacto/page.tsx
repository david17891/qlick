import type { Metadata } from "next";
import { Navbar, Footer } from "@/components/layout";
import { Container, Card, Button, Badge } from "@/components/ui";
import { ContactForm } from "@/components/contact/ContactForm";
import { WhatsAppButton } from "@/components/contact/WhatsAppButton";
import { getContactEmail, getMailtoLink } from "@/lib/contact/whatsapp";

export const metadata: Metadata = {
  title: "Contacto",
  description:
    "¿Tienes dudas sobre los cursos de Qlick o necesitas asesoría? Escríbenos y te respondemos en menos de 24 horas hábiles.",
  alternates: { canonical: "/contacto" }
};

export default function ContactoPage() {
  const email = getContactEmail();

  return (
    <>
      <Navbar />
      <section className="bg-brand-50/40 border-b border-brand-100">
        <Container className="py-16">
          <Badge tone="brand" className="mb-4">
            Hablemos
          </Badge>
          <h1 className="display-1 text-ink">Cuéntanos tu reto</h1>
          <p className="mt-5 text-lg text-ink-soft max-w-2xl">
            ¿No sabes qué curso elegir? ¿Necesitas capacitación para tu equipo?
            Te ayudamos a encontrar el camino correcto.
          </p>
        </Container>
      </section>

      <section className="py-16">
        <Container size="wide" className="grid lg:grid-cols-3 gap-10">
          <div className="lg:col-span-2">
            <ContactForm />
          </div>

          <aside className="space-y-6">
            <Card className="p-6">
              <h3 className="font-bold text-ink mb-3">Otras vías</h3>
              <ul className="space-y-4 text-sm">
                <li>
                  <p className="font-semibold text-ink mb-1">WhatsApp ventas</p>
                  <WhatsAppButton intent="sales" size="sm" variant="outline" />
                </li>
                <li>
                  <p className="font-semibold text-ink mb-1">WhatsApp soporte</p>
                  <WhatsAppButton intent="support" size="sm" variant="outline" />
                </li>
                <li>
                  <p className="font-semibold text-ink mb-1">Email</p>
                  <a
                    href={getMailtoLink("Contacto desde la web de Qlick")}
                    className="text-brand-600 hover:underline font-medium"
                  >
                    {email}
                  </a>
                </li>
                <li>
                  <p className="font-semibold text-ink">Horario</p>
                  <p className="text-ink-muted">Lun–Vie · 9:00–18:00 (CDMX)</p>
                </li>
              </ul>
            </Card>
            <Card className="p-6 bg-brand-gradient text-white">
              <h3 className="font-bold mb-2">¿Primera vez?</h3>
              <p className="text-sm text-white/90 mb-4">
                Mira el catálogo y empieza con un curso gratis.
              </p>
              <Button href="/cursos" variant="accent" className="w-full">
                Ver cursos
              </Button>
            </Card>
          </aside>
        </Container>
      </section>

      <Footer />
    </>
  );
}
