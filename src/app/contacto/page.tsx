import type { Metadata } from "next";
import { Navbar, Footer } from "@/components/layout";
import { Container, Card, Button, Badge, Field, Input, Textarea } from "@/components/ui";

export const metadata: Metadata = {
  title: "Contacto",
  description:
    "¿Tienes dudas sobre los cursos de Qlick o necesitas asesoría? Escríbenos y te respondemos en menos de 24 horas hábiles.",
  alternates: { canonical: "/contacto" }
};

export default function ContactoPage() {
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
            <Card className="p-8">
              {/* Formulario demo: en el MVP no envía nada real. */}
              <form className="space-y-5" action="#" method="POST">
                <div className="grid sm:grid-cols-2 gap-5">
                  <Field label="Nombre" htmlFor="name">
                    <Input id="name" name="name" placeholder="Tu nombre" required />
                  </Field>
                  <Field label="Email" htmlFor="email">
                    <Input id="email" name="email" type="email" placeholder="tu@email.com" required />
                  </Field>
                </div>
                <Field label="Teléfono / WhatsApp (opcional)" htmlFor="phone">
                  <Input id="phone" name="phone" placeholder="+52 ..." />
                </Field>
                <Field label="¿Qué necesitas?" htmlFor="topic">
                  <select
                    id="topic"
                    name="topic"
                    className="w-full rounded-xl border border-brand-100 bg-white px-4 py-3 text-ink focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                  >
                    <option>Quiero tomar un curso</option>
                    <option>Capacitación para mi equipo</option>
                    <option>Servicios de agencia</option>
                    <option>Duda sobre pagos o facturación</option>
                    <option>Otro</option>
                  </select>
                </Field>
                <Field label="Mensaje" htmlFor="message">
                  <Textarea
                    id="message"
                    name="message"
                    rows={5}
                    placeholder="Cuéntanos un poco más..."
                    required
                  />
                </Field>
                <div className="flex items-center justify-between gap-4">
                  <p className="text-xs text-ink-muted">
                    Demo: este formulario no envía correos reales todavía.
                  </p>
                  <Button type="submit" size="lg">
                    Enviar mensaje
                  </Button>
                </div>
              </form>
            </Card>
          </div>

          <aside className="space-y-6">
            <Card className="p-6">
              <h3 className="font-bold text-ink mb-3">Otras vías</h3>
              <ul className="space-y-3 text-sm">
                <li>
                  <p className="font-semibold text-ink">WhatsApp</p>
                  <p className="text-ink-muted">+52 1 22 22 22 22 22</p>
                </li>
                <li>
                  <p className="font-semibold text-ink">Email</p>
                  <p className="text-ink-muted">hola@qlick.mx</p>
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
