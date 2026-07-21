import Link from "next/link";
import { Container, Badge } from "@/components/ui";
import { Logo } from "@/components/brand";
import { QlickBadge } from "@/components/web-templates/QlickBadge";
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
    description:
      "Para el negocio local que hoy no tiene nada digital y necesita salir en Google ya.",
    features: [
      "Landing de 1 página (5 secciones)",
      "Diseño responsivo a elegir de 3 plantillas",
      "Botón de WhatsApp + formulario de contacto",
      "SEO on-page mínimo (título, meta, sitemap)",
      "1 ronda de revisión",
      "Entrega en 3-5 días",
    ],
    accent: "border-[#0f4c4c]/15",
  },
  {
    id: "negocio",
    name: "Negocio",
    price: "$5,500",
    period: "MXN · pago único",
    description:
      "Para la PyME con Facebook que ya quiere verse seria y captar clientes desde su web.",
    features: [
      "Sitio de hasta 5 páginas (Inicio, Sobre nosotros, Servicios, Galería, Contacto)",
      "Diseño responsivo profesional a elegir de 3 plantillas",
      "WhatsApp + formulario + Google Maps",
      "SEO on-page completo + Google Analytics + Meta Pixel",
      "Blog inicial con 2 artículos base",
      "2 rondas de revisión",
      "Entrega en 7-10 días",
    ],
    accent: "border-[#0f4c4c] ring-1 ring-[#0f4c4c]/20",
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
    body: "WhatsApp, formulario, Meta Pixel y Analytics configurados desde el primer día. Tu web no es un poster: es una herramienta de venta.",
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
    paquete: "Negocio",
    accent: "from-sky-100 via-white to-cyan-50",
    accentText: "text-sky-900",
    swatch: "#0284c7",
  },
  {
    id: "demo-2b",
    name: "Bufete Mendoza",
    rubro: "Despacho de abogados",
    paquete: "Negocio",
    accent: "from-slate-200 via-slate-50 to-amber-50",
    accentText: "text-slate-900",
    swatch: "#1e3a5f",
  },
] as const;

export default function WebServicePage() {
  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <QlickBadge />

      {/* ── Navbar Qlick ── */}
      <header className="border-b border-black/5 bg-white/80 backdrop-blur">
        <Container className="flex items-center justify-between py-4">
          <Link href="/" className="flex items-center gap-2">
            <Logo className="h-7 w-auto" />
            <span className="hidden text-sm font-semibold tracking-tight text-neutral-800 sm:inline">
              Qlick Marketing Digital
            </span>
          </Link>
          <nav className="flex items-center gap-5 text-sm">
            <a href="#paquetes" className="hidden text-neutral-700 hover:text-neutral-950 sm:inline">
              Paquetes
            </a>
            <a href="#demos" className="hidden text-neutral-700 hover:text-neutral-950 sm:inline">
              Demos
            </a>
            <a href="#proceso" className="hidden text-neutral-700 hover:text-neutral-950 sm:inline">
              Proceso
            </a>
            <a
              href="#cotizar"
              className="rounded-full bg-[#0f4c4c] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0a3939]"
            >
              Cotizar
            </a>
          </nav>
        </Container>
      </header>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-[#f4f8f8] via-white to-white">
        <div
          className="pointer-events-none absolute -right-20 top-0 h-72 w-72 rounded-full bg-[#0f4c4c]/10 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -left-32 top-40 h-80 w-80 rounded-full bg-amber-200/30 blur-3xl"
          aria-hidden="true"
        />
        <Container className="relative py-20 sm:py-28">
          <Badge className="mb-5">Servicio de páginas web · México</Badge>
          <h1 className="max-w-3xl font-display text-4xl font-bold leading-[1.05] tracking-tight text-neutral-950 sm:text-6xl">
            Páginas web que <span className="text-[#0f4c4c]">atraen clientes</span>, no solo que se ven bonitas.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-neutral-700">
            Diseño con asistencia de IA, precios claros desde $2,500 MXN, entrega
            en 5-10 días. Tu web queda con dominio propio, WhatsApp conectado y lista
            para generar leads desde el día uno.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="#cotizar"
              className="inline-flex items-center justify-center rounded-full bg-[#0f4c4c] px-6 py-3 text-sm font-semibold text-white shadow-md shadow-[#0f4c4c]/20 transition hover:bg-[#0a3939]"
            >
              Cotiza tu página
            </a>
            <a
              href="#demos"
              className="inline-flex items-center justify-center rounded-full border border-neutral-300 bg-white px-6 py-3 text-sm font-semibold text-neutral-800 transition hover:border-neutral-400"
            >
              Ver ejemplos
            </a>
          </div>
          <p className="mt-6 text-sm text-neutral-500">
            50% de anticipo para arrancar · resto contra entrega · 3-10 días según paquete.
          </p>
        </Container>
      </section>

      {/* ── Por qué Qlick ── */}
      <section className="border-y border-black/5 bg-neutral-50/50 py-16 sm:py-20">
        <Container>
          <div className="max-w-2xl">
            <h2 className="font-display text-2xl font-bold tracking-tight text-neutral-950 sm:text-3xl">
              Por qué las páginas de Qlick se venden solas
            </h2>
            <p className="mt-3 text-neutral-700">
              No somos una agencia que te cobra $30,000 y desaparece. Somos un
              equipo que entrega rápido, con precios honestos y diseño cuidado.
            </p>
          </div>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {REASONS.map((reason) => (
              <div
                key={reason.title}
                className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm"
              >
                <h3 className="font-display text-base font-semibold text-[#0f4c4c]">
                  {reason.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-700">
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
            <h2 className="font-display text-2xl font-bold tracking-tight text-neutral-950 sm:text-3xl">
              Dos paquetes, precios claros
            </h2>
            <p className="mt-3 text-neutral-700">
              Sin contratos largos ni letras chiquitas. Lo que ves es lo que pagas.
            </p>
          </div>
          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            {PACKAGES.map((pkg) => (
              <div
                key={pkg.id}
                className={`relative flex flex-col rounded-3xl border-2 bg-white p-8 shadow-sm ${
                  pkg.featured ? "ring-1 ring-[#0f4c4c]/20" : ""
                } ${pkg.accent}`}
              >
                {pkg.featured ? (
                  <span className="absolute -top-3 right-6 rounded-full bg-[#0f4c4c] px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-white">
                    Más vendido
                  </span>
                ) : null}
                <div>
                  <h3 className="font-display text-xl font-semibold text-neutral-950">
                    {pkg.name}
                  </h3>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="font-display text-4xl font-bold text-[#0f4c4c]">
                      {pkg.price}
                    </span>
                    <span className="text-sm text-neutral-500">{pkg.period}</span>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-neutral-700">
                    {pkg.description}
                  </p>
                </div>
                <ul className="mt-6 space-y-2.5">
                  {pkg.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2 text-sm text-neutral-800"
                    >
                      <svg
                        viewBox="0 0 20 20"
                        className="mt-0.5 h-4 w-4 flex-shrink-0 fill-[#0f4c4c]"
                        aria-hidden="true"
                      >
                        <path d="M16.7 5.3a1 1 0 0 1 0 1.4l-7 7a1 1 0 0 1-1.4 0l-3-3a1 1 0 1 1 1.4-1.4L9 11.6l6.3-6.3a1 1 0 0 1 1.4 0Z" />
                      </svg>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <CheckoutButton
                  paquete={pkg.id as "esencial" | "negocio"}
                  paqueteLabel={pkg.name}
                  variant={pkg.featured ? "primary" : "outline"}
                  fullWidth
                  className="mt-8"
                />
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-sm text-neutral-500">
            ¿Necesitas algo más grande? Escríbenos y armamos un alcance a la medida.
          </p>
        </Container>
      </section>

      {/* ── Demos / Showcase ── */}
      <section id="demos" className="border-t border-black/5 bg-neutral-50/50 py-20 sm:py-24">
        <Container>
          <div className="max-w-2xl">
            <h2 className="font-display text-2xl font-bold tracking-tight text-neutral-950 sm:text-3xl">
              Mira lo que entregamos
            </h2>
            <p className="mt-3 text-neutral-700">
              Cuatro ejemplos reales de sitios que armamos para clientes como
              tú. Cada demo es navegable, hecho con la misma plantilla que
              usamos para producción.
            </p>
          </div>
          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            {DEMOS.map((demo) => (
              <Link
                key={demo.id}
                href={`/web/${demo.id}`}
                className="group block overflow-hidden rounded-3xl border border-black/5 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                <div
                  className={`relative h-44 overflow-hidden bg-gradient-to-br ${demo.accent}`}
                >
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <div
                        className={`font-display text-3xl font-bold ${demo.accentText}`}
                      >
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
                    <div className="font-display text-base font-semibold text-neutral-950">
                      {demo.name}
                    </div>
                    <div className="text-xs text-neutral-500">
                      {demo.rubro} · Paquete {demo.paquete}
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-[#0f4c4c] transition group-hover:translate-x-0.5">
                    Ver demo →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </Container>
      </section>

      {/* ── Proceso ── */}
      <section id="proceso" className="py-20 sm:py-24">
        <Container>
          <div className="max-w-2xl">
            <h2 className="font-display text-2xl font-bold tracking-tight text-neutral-950 sm:text-3xl">
              Cómo trabajamos
            </h2>
            <p className="mt-3 text-neutral-700">
              Cero enredos. Una sola persona te acompaña de principio a fin.
            </p>
          </div>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {PROCESS.map((p) => (
              <div
                key={p.step}
                className="relative rounded-2xl border border-black/5 bg-white p-6"
              >
                <div className="font-display text-3xl font-bold text-[#0f4c4c]/30">
                  {p.step}
                </div>
                <h3 className="mt-2 font-display text-base font-semibold text-neutral-950">
                  {p.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-700">
                  {p.body}
                </p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* ── CTA Final ── */}
      <section id="cotizar" className="border-t border-black/5 bg-[#0f4c4c] py-16 text-white sm:py-20">
        <Container className="text-center">
          <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            ¿Listo para tener tu página?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-white/80">
            Mándanos WhatsApp con el nombre de tu negocio y qué te gustaría
            tener. Te respondemos hoy mismo con el alcance y precio.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a
              href="https://wa.me/5215512345678?text=Hola%20Qlick%2C%20me%20interesa%20cotizar%20una%20p%C3%A1gina%20web"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-[#0f4c4c] shadow-md transition hover:bg-neutral-100"
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
          <p className="mt-6 text-xs text-white/60">
            O si prefieres, agenda una llamada de 15 minutos para platicar tu proyecto.
          </p>
        </Container>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-black/5 bg-white">
        <Container className="flex flex-col items-center justify-between gap-3 py-6 sm:flex-row">
          <div className="flex items-center gap-2 text-sm text-neutral-600">
            <Logo className="h-5 w-auto" />
            <span>Qlick Marketing Digital</span>
          </div>
          <p className="text-xs text-neutral-500">
            Hecho con cariño en México · Servicio de páginas web
          </p>
        </Container>
      </footer>
    </div>
  );
}
