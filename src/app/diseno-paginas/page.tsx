import { Container, Badge } from "@/components/ui";
import { Navbar, Footer } from "@/components/layout";
import { CheckoutButton } from "@/components/web-templates/CheckoutButton";

type Package = {
  id: string;
  name: string;
  price: string;
  period: string;
  description: string;
  features: readonly string[];
  accent: string;
  featured?: boolean;
};

const PACKAGES: readonly Package[] = [
  {
    id: "esencial",
    name: "Esencial",
    price: "$2,500",
    period: "MXN · pago único",
    description: "Tu página para aparecer en internet.",
    features: [
      "2 páginas: tu información + contacto",
      "Diseño responsivo (celular y computadora)",
      "Botón de WhatsApp directo",
      "Tu dominio propio",
      "Aparece en Google (SEO básico)",
      "Listo en 3-5 días",
    ],
    accent: "border-brand-200",
  },
  {
    id: "profesional",
    name: "Profesional",
    price: "$5,500",
    period: "MXN · pago único",
    description: "Tu sitio completo para captar clientes.",
    features: [
      "5 páginas: inicio, sobre ti, servicios, galería, contacto",
      "Diseño responsivo profesional",
      "Formulario que guarda los mensajes + WhatsApp",
      "Google Maps embebido",
      "Google Analytics y Meta Pixel configurados",
      "Blog con 2 artículos base",
      "2 rondas de revisión",
      "Listo en 7-10 días",
    ],
    accent: "border-brand-500",
    featured: true,
  },
];

const REASONS = [
  {
    title: "Diseño con IA, acabado humano",
    body: "Generamos assets visuales con IA y los curamos uno por uno. El resultado se ve hecho a mano, no por una plantilla genérica.",
  },
  {
    title: "Tu propio dominio, desde el día uno",
    body: "No te hospedamos en qlick.digital/tu-negocio. Compramos y configuramos tu dominio real (tunegocio.mx) incluido en el paquete.",
  },
  {
    title: "Listo para captar clientes, no solo para verse bonita",
    body: "Con Mi sitio, Google Analytics y Meta Pixel configurados desde el día uno. Sabes quién te visita y puedes hacer retargeting en Facebook.",
  },
  {
    title: "Entrega rápida, sin enredos",
    body: "De 3 a 10 días según el paquete. Una sola persona habla contigo durante todo el proceso. Cero markups ni subcontratos sorpresas.",
  },
] as const;

const PROCESS = [
  {
    step: "01",
    title: "Cotiza en 5 minutos",
    body: "Mándanos WhatsApp con el nombre de tu negocio y qué te gustaría tener. Te respondemos con el alcance y precio en el mismo día.",
  },
  {
    step: "02",
    title: "50% de anticipo",
    body: "Para arrancar. Transferencia o Mercado Pago. El resto al entregar y aprobar.",
  },
  {
    step: "03",
    title: "Diseño + revisión",
    body: "Te enseñamos la web en 5 días. Incluye 1 o 2 rondas de revisión según tu paquete.",
  },
  {
    step: "04",
    title: "Publicación y entrega",
    body: "Conectamos tu dominio, configuramos Analytics y Pixel, y te capacitamos para editar el contenido cuando quieras.",
  },
] as const;

const DEMOS = [
  {
    id: "demo-1a",
    name: "Lumière",
    rubro: "Salón de belleza",
    paquete: "Esencial",
    accent: "from-rose-100 via-rose-50 to-amber-50",
    accentText: "text-rose-900",
    swatch: "#c08081",
  },
  {
    id: "demo-1b",
    name: "Taquería Don Carlos",
    rubro: "Gastronomía mexicana",
    paquete: "Esencial",
    accent: "from-orange-100 via-amber-50 to-yellow-50",
    accentText: "text-orange-900",
    swatch: "#c2410c",
  },
  {
    id: "demo-2a",
    name: "Sonrisa Plus",
    rubro: "Consultorio dental",
    paquete: "Profesional",
    accent: "from-sky-100 via-white to-cyan-50",
    accentText: "text-sky-900",
    swatch: "#0284c7",
  },
  {
    id: "demo-2b",
    name: "Bufete Mendoza",
    rubro: "Despacho de abogados",
    paquete: "Profesional",
    accent: "from-slate-200 via-slate-50 to-amber-50",
    accentText: "text-slate-900",
    swatch: "#1e3a5f",
  },
] as const;

export default function DisenoPaginasPage() {
  return (
    <>
      <Navbar />

      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute -right-20 top-0 h-72 w-72 rounded-full bg-brand-500/10 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -left-32 top-40 h-80 w-80 rounded-full bg-brand-accent/15 blur-3xl"
          aria-hidden="true"
        />
        <Container className="relative py-20 sm:py-28">
          <Badge className="mb-5">Diseño de páginas · México</Badge>
          <h1 className="display-1 max-w-3xl text-ink">
            Páginas web que <span className="text-brand-gradient">atraen clientes</span>, no solo que se ven bonitas.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-soft">
            Diseño con asistencia de IA, precios claros desde $2,500 MXN, entrega
            en 5-10 días. Tu web queda con dominio propio, WhatsApp conectado y lista
            para generar leads desde el día uno.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="#cotizar"
              className="inline-flex items-center justify-center rounded-full bg-brand-500 px-6 py-3 text-sm font-semibold text-white shadow-glow transition hover:bg-brand-600"
            >
              Cotiza tu página
            </a>
            <a
              href="#demos"
              className="inline-flex items-center justify-center rounded-full border border-brand-200 bg-white px-6 py-3 text-sm font-semibold text-ink transition hover:border-brand-500"
            >
              Ver ejemplos
            </a>
          </div>
          <p className="mt-6 text-sm text-ink-muted">
            50% de anticipo para arrancar · resto contra entrega · 3-10 días según paquete.
          </p>
        </Container>
      </section>

      {/* ── Por qué Qlick ── */}
      <section className="border-y border-brand-100 bg-white py-16 sm:py-20">
        <Container>
          <div className="max-w-2xl">
            <h2 className="display-2 text-ink">
              Por qué las páginas de Qlick se venden solas
            </h2>
            <p className="mt-3 text-ink-soft">
              No somos una agencia que te cobra $30,000 y desaparece. Somos un
              equipo que entrega rápido, con precios honestos y diseño cuidado.
            </p>
          </div>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {REASONS.map((reason, i) => (
              <div
                key={reason.title}
                className="rounded-2xl border border-brand-100 bg-[#fbf9ff] p-6"
              >
                <div
                  className="mb-3 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/10 font-display text-sm font-bold text-brand-500"
                  aria-hidden="true"
                >
                  {String(i + 1).padStart(2, "0")}
                </div>
                <h3 className="font-display text-base font-semibold text-brand-500">
                  {reason.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                  {reason.body}
                </p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* ── Paquetes ── */}
      <section id="paquetes" className="py-20 sm:py-24">
        <Container>
          <div className="max-w-2xl">
            <h2 className="display-2 text-ink">Dos paquetes, precios claros</h2>
            <p className="mt-3 text-ink-soft">
              Sin contratos largos ni letras chiquitas. Lo que ves es lo que pagas.
            </p>
          </div>
          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            {PACKAGES.map((pkg) => (
              <div
                key={pkg.id}
                className={`group relative flex h-full flex-col rounded-3xl border-2 bg-white p-8 shadow-card transition-all duration-300 hover:-translate-y-2 hover:border-brand-500 hover:ring-4 hover:ring-brand-500/30 hover:shadow-2xl hover:shadow-brand-500/30 ${pkg.accent}`}
              >
                {pkg.featured ? (
                  <span className="absolute -top-3 right-6 rounded-full bg-brand-500 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-white">
                    Más vendido
                  </span>
                ) : null}
                <div>
                  <h3 className="font-display text-xl font-semibold text-ink">
                    {pkg.name}
                  </h3>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="font-display text-4xl font-bold text-brand-500">
                      {pkg.price}
                    </span>
                    <span className="text-sm text-ink-muted">{pkg.period}</span>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-ink-soft">
                    {pkg.description}
                  </p>
                </div>
                <ul className="mt-6 space-y-2.5">
                  {pkg.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2 text-sm text-ink"
                    >
                      <svg
                        viewBox="0 0 20 20"
                        className="mt-0.5 h-4 w-4 flex-shrink-0 fill-brand-500"
                        aria-hidden="true"
                      >
                        <path d="M16.7 5.3a1 1 0 0 1 0 1.4l-7 7a1 1 0 0 1-1.4 0l-3-3a1 1 0 1 1 1.4-1.4L9 11.6l6.3-6.3a1 1 0 0 1 1.4 0Z" />
                      </svg>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <CheckoutButton
                  paquete={pkg.id}
                  paqueteLabel={pkg.name}
                  variant={pkg.featured ? "primary" : "outline"}
                  fullWidth
                  className="mt-auto pt-8"
                />
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-sm text-ink-muted">
            ¿Necesitas algo más grande? Escríbenos y armamos un alcance a la medida.
          </p>
        </Container>
      </section>

      {/* ── Demos / Showcase ── */}
      <section id="demos" className="border-t border-brand-100 bg-white py-20 sm:py-24">
        <Container>
          <div className="max-w-2xl">
            <h2 className="display-2 text-ink">Mira lo que entregamos</h2>
            <p className="mt-3 text-ink-soft">
              Cuatro ejemplos reales de sitios que armamos para clientes como
              tú. Cada demo es navegable, hecho con la misma plantilla que
              usamos para producción.
            </p>
          </div>
          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            {DEMOS.map((demo) => (
              <a
                key={demo.id}
                href={`/diseno-paginas/${demo.id}`}
                className="group block overflow-hidden rounded-3xl border border-brand-100 bg-[#fbf9ff] transition hover:-translate-y-0.5 hover:shadow-card"
              >
                <div
                  className={`relative h-44 overflow-hidden bg-gradient-to-br ${demo.accent}`}
                >
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <div className={`font-display text-3xl font-bold ${demo.accentText}`}>
                        {demo.name}
                      </div>
                      <div
                        className={`mt-1 text-[10px] uppercase tracking-[0.2em] ${demo.accentText} opacity-70`}
                      >
                        {demo.rubro}
                      </div>
                    </div>
                  </div>
                  <div
                    className="absolute right-4 top-4 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white"
                    style={{ backgroundColor: demo.swatch }}
                  >
                    {demo.paquete}
                  </div>
                </div>
                <div className="flex items-center justify-between p-5">
                  <div>
                    <div className="font-display text-base font-semibold text-ink">
                      {demo.name}
                    </div>
                    <div className="text-xs text-ink-muted">
                      {demo.rubro} · Paquete {demo.paquete}
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-brand-500 transition group-hover:translate-x-0.5">
                    Ver demo →
                  </span>
                </div>
              </a>
            ))}
          </div>
        </Container>
      </section>

      {/* ── Proceso ── */}
      <section id="proceso" className="py-20 sm:py-24">
        <Container>
          <div className="max-w-2xl">
            <h2 className="display-2 text-ink">Cómo trabajamos</h2>
            <p className="mt-3 text-ink-soft">
              Cero enredos. Una sola persona te acompaña de principio a fin.
            </p>
          </div>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {PROCESS.map((p) => (
              <div
                key={p.step}
                className="relative rounded-2xl border border-brand-100 bg-white p-6"
              >
                <div className="font-display text-3xl font-bold text-brand-500/30">
                  {p.step}
                </div>
                <h3 className="mt-2 font-display text-base font-semibold text-ink">
                  {p.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                  {p.body}
                </p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* ── CTA Final ── */}
      <section
        id="cotizar"
        className="border-t border-brand-100 bg-gradient-to-br from-brand-500 via-brand-secondary to-brand-700 py-16 text-white sm:py-20"
      >
        <Container className="text-center">
          <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            ¿Listo para tener tu página?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-white/85">
            Mándanos WhatsApp con el nombre de tu negocio y qué te gustaría
            tener. Te respondemos hoy mismo con el alcance y precio.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a
              href="https://wa.me/5215512345678?text=Hola%20Qlick%2C%20me%20interesa%20cotizar%20una%20p%C3%A1gina%20web"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-brand-500 shadow-md transition hover:bg-brand-50"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5 fill-current"
                aria-hidden="true"
              >
                <path d="M12 2a10 10 0 0 0-8.5 15.2L2 22l4.9-1.3A10 10 0 1 0 12 2Zm5.6 14.2c-.2.6-1.4 1.2-1.9 1.3-.5.1-1.1.1-1.8-.1-.4-.1-.9-.3-1.5-.5-2.6-1.1-4.3-3.7-4.4-3.9-.1-.2-1.1-1.4-1.1-2.6 0-1.2.7-1.8.9-2 .2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.4.2.5.7 1.7.8 1.9.1.1.1.3 0 .5l-.3.5c-.1.2-.3.3-.1.6.2.3.7 1.2 1.5 1.9 1 .9 1.9 1.2 2.2 1.3.2.1.4.1.5-.1l.6-.7c.1-.2.3-.2.5-.1l1.7.8c.2.1.4.2.4.3.1.2.1.7-.1 1.3Z" />
              </svg>
              Escríbenos por WhatsApp
            </a>
            <a
              href="mailto:hola@qlick.digital?subject=Cotizaci%C3%B3n%20p%C3%A1gina%20web"
              className="inline-flex items-center justify-center rounded-full border border-white/30 bg-transparent px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              hola@qlick.digital
            </a>
          </div>
          <p className="mt-6 text-xs text-white/70">
            O si prefieres, agenda una llamada de 15 minutos para platicar tu proyecto.
          </p>
        </Container>
      </section>

      <Footer />
    </>
  );
}
