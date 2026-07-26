import { Navbar, Footer, PageHero, CTABanner } from "@/components/layout";
import { Container, Button } from "@/components/ui";
import { WhatsAppButton } from "@/components/contact/WhatsAppButton";
import type { Metadata } from "next";

/**
 * /filosofia — landing del QR del certificado de asistencia.
 *
 * Historia: el QR de cada certificado Concept C apunta acá (en vez de
 * a /verify/[folio]). El folio sigue siendo verificable por URL tipeada,
 * pero el QR hace otra cosa: lleva a quien escaneó a la frase de la marca.
 *
 * Frase fundacional provista por David, julio 2026:
 *   "No basta con existir. Hay que ser imposible de ignorar."
 *
 * Tono: coherente con `src/app/page.tsx` (marketing práctico + española MX),
 * ampliado a un registro más visceral. NO inventa claims — usa el posicionamiento
 * existente ("marketing que se traduce en ventas", "+2,600 alumnos", etc.)
 * y le suma la punctuación audaz de la frase fundacional.
 */
export const metadata: Metadata = {
  title: "Filosofía · Qlick",
  description:
    "No basta con existir. Hay que ser imposible de ignorar. La filosofía que hay detrás de cada curso de Qlick.",
  robots: { index: true, follow: true },
};

export default function FilosofiaPage() {
  return (
    <>
      <Navbar />

      <PageHero
        variant="dark"
        badge="Filosofía Qlick"
        title="No basta con existir. Hay que ser imposible de ignorar."
        subtitle="Marketing que se traduce en ventas. Y que se nota. Si lo que haces hoy no te hace visible, no te hace vender o no te hace recordar, entonces es ruido."
        actions={
          <>
            <Button href="/servicios" variant="accent" size="lg">Ver servicios</Button>
            <Button href="/eventos" variant="ghost" size="lg" className="!text-white hover:!bg-white/10">Próximos eventos</Button>
          </>
        }
      />

      {/* ----------------------------- PRINCIPIOS ----------------------------- */}
      <section className="bg-ink py-20 text-white">
        <Container size="wide">
          <div className="max-w-2xl">
            <h2 className="display-2 text-white">
              Lo que <span className="text-brand-accent">no</span> vendemos
            </h2>
            <p className="mt-4 text-ink-muted">
              Tres cosas a las que decimos que no, sin ambigüedad.
            </p>
          </div>

          <div className="mt-12 grid md:grid-cols-3 gap-6">
            {NO_VENDEMOS.map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 hover:bg-white/[0.06] transition-colors"
              >
                <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-accent">
                  {item.number}
                </div>
                <h3 className="mt-3 text-xl font-bold text-white">
                  {item.title}
                </h3>
                <p className="mt-3 text-sm text-ink-muted leading-relaxed">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* ----------------------------- LO QUE SÍ HACEMOS ----------------------------- */}
      <section className="site-page py-20 sm:py-24">
        <Container size="wide">
          <div className="max-w-2xl">
            <h2 className="display-2 text-ink">
              Lo que <span className="text-brand-gradient">sí</span> enseñamos
            </h2>
            <p className="mt-4 text-ink-soft">
              Cuatro módulos, una promesa: aplicar desde la primera lección.
            </p>
          </div>

          <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {SI_ENSENAMOS.map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-brand-200 bg-brand-50 p-6"
              >
                <div className="h-10 w-10 rounded-xl bg-brand-500 text-white flex items-center justify-center text-lg font-bold">
                  {item.num}
                </div>
                <h3 className="mt-4 text-lg font-bold text-ink">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm text-ink-soft leading-relaxed">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <CTABanner
        variant="gradient"
        badge="Empieza hoy"
        title="Haz que el siguiente click cuente."
        subtitle="Elige un servicio, mira la agenda o escríbenos con tu contexto."
        actions={
          <>
            <a href="/servicios" className="home-button home-button--accent">Ver servicios</a>
            <a href="/contacto" className="home-button home-button--dark-ghost">Hablar con Qlick</a>
          </>
        }
      />

      <WhatsAppButton />
      <Footer />
    </>
  );
}

/** Tres principios negativos — dicen lo que NO es Qlick. */
const NO_VENDEMOS = [
  {
    number: "01",
    title: "Cursos vacíos de teoría",
    body: "Nada de frameworks genéricos importados del 2014 que nadie aplica. Cada lección es una acción concreta que puedes correr esta semana.",
  },
  {
    number: "02",
    title: "Plantillas para copiar y pegar",
    body: "Si tuvieras que copiarlo, lo encontraría tu competencia en Google en 5 minutos. Lo que enseñamos se adapta a tu negocio, no al revés.",
  },
  {
    number: "03",
    title: "Gurús con frases ingeniosas",
    body: "Cero 'secrets revealed'. Cero 'esto cambió mi vida en 7 días'. Solo sistema probado por +2,600 alumnos y aplicable a México.",
  },
];

/** Cuatro módulos — lo que sí enseñamos. */
const SI_ENSENAMOS = [
  {
    num: "1",
    title: "Publicidad",
    body: "Meta Ads, Google Ads y TikTok Ads con estructura replicable. Cómo gastar menos y conseguir clientes calificados.",
  },
  {
    num: "2",
    title: "Contenido",
    body: "Estrategia editorial, producción con IA y calendarios que no se abandonan a los 14 días. Para Reels, TikTok y LinkedIn.",
  },
  {
    num: "3",
    title: "Ventas",
    body: "Embudo completo: lead → cita → cierre. WhatsApp Business, CRM, seguimiento que no depende del 'feeling' del vendedor.",
  },
  {
    num: "4",
    title: "Automatización",
    body: "n8n, Make, Airtable. Conecta tus herramientas, deja de copiar datos a mano, y libera tiempo de tu equipo.",
  },
];
