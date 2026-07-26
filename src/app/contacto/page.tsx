import type { Metadata } from "next";
import { Navbar, Footer, PageHero } from "@/components/layout";
import { Container, Card, Button } from "@/components/ui";
import { ContactForm } from "@/components/contact/ContactForm";
import { WhatsAppButton } from "@/components/contact/WhatsAppButton";
import { getContactEmail, getMailtoLink } from "@/lib/contact/whatsapp";
import { Lock } from "lucide-react";

export const metadata: Metadata = {
  title: "Contacto",
  description:
    "Cuéntanos qué necesita tu negocio. Hablemos de diseño web, campañas, presencia local o una auditoría clara.",
  alternates: { canonical: "/contacto" }
};

export default function ContactoPage() {
  const email = getContactEmail();

  return (
    <>
      <Navbar />
      <PageHero
        variant="dark"
        centered={false}
        badge="Contacto"
        title="Cuéntanos qué quieres mover."
        subtitle="Si necesitas una página, una campaña, una auditoría o simplemente ordenar tus ideas, empecemos por el contexto."
      />

      <section className="site-page py-16 sm:py-24">
        <Container size="wide" className="grid lg:grid-cols-3 gap-10">
          <div className="lg:col-span-2">
            <ContactForm />
          </div>

          <aside className="space-y-6">
            <Card className="p-6">
              <h3 className="font-bold text-ink mb-3">Otras vías</h3>
              <ul className="space-y-4 text-sm">
                <li>
                  <p className="font-semibold text-ink mb-1">WhatsApp</p>
                  <WhatsAppButton
                    intent="sales"
                    size="sm"
                    variant="outline"
                    label="Hablar por WhatsApp"
                  />
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
            <Card className="p-6 border-amber-200 bg-amber-50/50">
              <h3 className="font-bold text-ink mb-2 flex items-center gap-2">
                <Lock className="h-4 w-4" /> Privacidad y consentimiento
              </h3>
              <p className="text-sm text-ink-soft leading-relaxed">
                Al enviarnos tu información aceptas ser contactado por Qlick por
                WhatsApp, llamada o correo. Usamos tus datos únicamente para
                responder tu solicitud y dar seguimiento a lo que nos pidas.
                Consulta el aviso completo antes de enviar el formulario.
              </p>
            </Card>
            <Card className="p-6 bg-brand-gradient text-white">
              <h3 className="font-bold mb-2">¿Ya tienes algo en mente?</h3>
              <p className="text-sm text-white/90 mb-4">
                Revisa el catálogo y encuentra el punto de partida más cercano.
              </p>
              <Button href="/servicios" variant="accent" className="w-full">
                Ver servicios
              </Button>
            </Card>
          </aside>
        </Container>
      </section>

      <Footer />
    </>
  );
}
