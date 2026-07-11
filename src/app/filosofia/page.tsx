import { Navbar, Footer } from "@/components/layout";
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

      {/* ----------------------------- HERO ----------------------------- */}
      <section className="relative overflow-hidden bg-hero-mesh">
        <div className="absolute inset-0 -z-10 opacity-50" />
        <Container size="wide" className="pt-16 pb-20 sm:pt-24 sm:pb-28">
          <div className="grid lg:grid-cols-12 gap-12 items-center">
            {/* Bloque centrado — la frase */}
            <div className="lg:col-span-12 max-w-4xl mx-auto text-center animate-fade-up">
              <span className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white/70 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-brand-600">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-accent" />
                Filosofía Qlick
              </span>

              <h1 className="display-1 mt-6 text-ink">
                <span className="text-brand-gradient">No basta con existir.</span>
                <br />
                <span>Hay que ser imposible de ignorar.</span>
              </h1>

              <p className="mt-6 max-w-2xl mx-auto text-lg text-ink-soft">
                Marketing que se traduce en ventas.{" "}
                <span className="text-ink">Y que se nota.</span>
              </p>

              <p className="mt-6 max-w-2xl mx-auto text-base text-ink-muted">
                Esta frase es lo que hay detrás de cada curso, cada
                masterclass, cada asesoría. Si lo que haces hoy no te hace
                visible, no te hace vender, no te hace recordar — entonces
                no es marketing. Es ruido. Y este es el lugar para dejar
                de hacer ruido.
              </p>

              <div className="mt-10 flex flex-wrap justify-center gap-3">
                <Button href="/cursos" size="lg">
                  Ver cursos →
                </Button>
                <Button href="/masterclass" variant="outline" size="lg">
                  Próximas masterclasses
                </Button>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* ----------------------------- PRINCIPIOS ----------------------------- */}
      <section className="bg-ink text-white py-20">
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
                <div className="text-[11px] uppercase tracking-[0.2em] text-brand-accent font-bold">
                  {item.tag}
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
      <section className="py-20 bg-white">
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

      {/* ----------------------------- CTA ----------------------------- */}
      <section className="bg-hero-mesh py-20">
        <Container size="narrow" className="text-center">
          <h2 className="display-2 text-ink">
            Empieza <span className="text-brand-gradient">hoy</span>.
          </h2>
          <p className="mt-4 text-lg text-ink-soft">
            El primer paso es gratis y toma 30 segundos.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button href="/cursos" size="lg">
              Ver cursos →
            </Button>
            <Button
              href="https://wa.me/5215555555555?text=Hola%20Qlick%2C%20me%20interesa%20saber%20m%C3%A1s"
              variant="outline"
              size="lg"
            >
              Hablar por WhatsApp
            </Button>
          </div>
        </Container>
      </section>

      <WhatsAppButton />
      <Footer />
    </>
  );
}

/** Tres principios negativos — dicen lo que NO es Qlick. */
const NO_VENDEMOS = [
  {
    tag: "01 · Sin relleno",
    title: "Cursos vacíos de teoría",
    body: "Nada de frameworks genéricos importados del 2014 que nadie aplica. Cada lección es una acción concreta que puedes correr esta semana.",
  },
  {
    tag: "02 · Sin moldes",
    title: "Plantillas para copiar y pegar",
    body: "Si tuvieras que copiarlo, lo encontraría tu competencia en Google en 5 minutos. Lo que enseñamos se adapta a tu negocio, no al revés.",
  },
  {
    tag: "03 · Sin humo",
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
