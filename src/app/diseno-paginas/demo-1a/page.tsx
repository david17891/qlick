import Image from "next/image";
import { TemplateNav } from "@/components/web-templates/TemplateNav";
import { TemplateFooter } from "@/components/web-templates/TemplateFooter";
import { QlickBadge } from "@/components/web-templates/QlickBadge";

export const metadata = {
  title: "Lumière Studio · Salón de belleza en CDMX",
  description:
    "Salón de belleza en la Roma Norte. Cortes, color, manicura, pedicura y tratamientos faciales. Reserva por WhatsApp.",
};

const ACCENT = "#b76e79";
const ACCENT_DARK = "#8e4f5a";

const SERVICES = [
  {
    name: "Corte + Peinado",
    price: "$350",
    duration: "60 min",
    description: "Corte personalizado según tu tipo de cabello y peinado profesional.",
  },
  {
    name: "Color & Balayage",
    price: "$1,200",
    duration: "3 h",
    description: "Color completo, balayage, highlights o babylights con productos profesionales.",
  },
  {
    name: "Manicura + Gel",
    price: "$280",
    duration: "75 min",
    description: "Manicura completa con esmaltado en gel de larga duración, más de 100 colores.",
  },
  {
    name: "Tratamiento Facial",
    price: "$650",
    duration: "60 min",
    description: "Limpieza profunda, exfoliación, mascarilla e hidratación para todo tipo de piel.",
  },
  {
    name: "Pedicura Spa",
    price: "$380",
    duration: "60 min",
    description: "Exfoliación, masaje relajante y esmaltado. Salesminerales y aromaterapia.",
  },
  {
    name: "Paquete Novia",
    price: "$2,800",
    duration: "Medio día",
    description: "Prueba previa, día de la boda con peinado, maquillaje y manicura incluidos.",
  },
] as const;

export default function Demo1A() {
  return (
    <div id="top" className="min-h-screen bg-[#fdf8f5] text-neutral-900">
      <QlickBadge />
      <TemplateNav
        brand="Lumière"
        tagline="Studio · Roma Norte"
        accentColor={ACCENT_DARK}
        links={[
          { label: "Servicios", href: "#servicios" },
          { label: "Sobre nosotros", href: "#nosotros" },
          { label: "Contacto", href: "#contacto" },
        ]}
        ctaLabel="Reservar cita"
        ctaHref="#contacto"
      />

      {/* ── Hero ── */}
      <section
        className="relative overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, #fdf8f5 0%, #fce8e9 50%, #f5d4d7 100%)",
        }}
      >
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 sm:py-24 md:grid-cols-2">
          <div>
            <span
              className="inline-block rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em]"
              style={{
                backgroundColor: `${ACCENT}1f`,
                color: ACCENT_DARK,
              }}
            >
              Salón de belleza · CDMX
            </span>
            <h1 className="mt-4 font-display text-4xl font-bold leading-[1.05] tracking-tight text-neutral-950 sm:text-6xl">
              Cabello, manos y piel.
              <br />
              <span style={{ color: ACCENT_DARK }}>Hecho con calma.</span>
            </h1>
            <p className="mt-5 max-w-md text-lg leading-relaxed text-neutral-700">
              Estética de autor en la Roma Norte. Más de 8 años dejando a
              nuestras clientas salir con el pelo como en revista.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a
                href="#contacto"
                className="inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:opacity-90"
                style={{ backgroundColor: ACCENT_DARK }}
              >
                Reservar mi cita
              </a>
              <a
                href="#servicios"
                className="inline-flex items-center justify-center rounded-full border border-neutral-300 bg-white/70 px-6 py-3 text-sm font-semibold text-neutral-800 backdrop-blur transition hover:border-neutral-400"
              >
                Ver servicios
              </a>
            </div>
            <div className="mt-8 flex items-center gap-6 text-xs text-neutral-600">
              <div>
                <div className="font-display text-xl font-bold" style={{ color: ACCENT_DARK }}>
                  10+
                </div>
                <div>años</div>
              </div>
              <div>
                <div className="font-display text-xl font-bold" style={{ color: ACCENT_DARK }}>
                  2,400
                </div>
                <div>clientas felices</div>
              </div>
              <div>
                <div className="font-display text-xl font-bold" style={{ color: ACCENT_DARK }}>
                  4.9
                </div>
                <div>Google Reviews</div>
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="relative aspect-[4/5] w-full overflow-hidden rounded-[2rem] shadow-2xl">
              <Image
                src="/servicios/web/lumiere-hero.jpg"
                alt="Interior del salón Lumière Studio en la Roma Norte, CDMX"
                fill
                priority
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-8 text-white">
                <div className="text-[10px] uppercase tracking-[0.3em] opacity-80">
                  Lumière Studio
                </div>
                <div className="mt-1 font-display text-2xl font-bold">
                  Roma Norte
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Servicios ── */}
      <section id="servicios" className="bg-white py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="max-w-2xl">
            <span
              className="inline-block text-[10px] font-semibold uppercase tracking-[0.3em]"
              style={{ color: ACCENT_DARK }}
            >
              Servicios
            </span>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-neutral-950 sm:text-4xl">
              Lo que hacemos
            </h2>
            <p className="mt-3 text-neutral-700">
              Cada servicio incluye consulta previa sin costo. Si no sabes qué
              te queda, te asesoramos con gusto.
            </p>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {SERVICES.map((service) => (
              <div
                key={service.name}
                className="rounded-2xl border border-neutral-200 bg-white p-6 transition hover:border-neutral-300 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-display text-lg font-semibold text-neutral-950">
                    {service.name}
                  </h3>
                  <span
                    className="font-display text-lg font-bold"
                    style={{ color: ACCENT_DARK }}
                  >
                    {service.price}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-neutral-700">
                  {service.description}
                </p>
                <div className="mt-4 flex items-center justify-between text-xs">
                  <span className="text-neutral-500">{service.duration}</span>
                  <a
                    href="#contacto"
                    className="font-semibold"
                    style={{ color: ACCENT_DARK }}
                  >
                    Reservar →
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Sobre nosotras ── */}
      <section
        id="nosotros"
        className="py-20 sm:py-24"
        style={{ backgroundColor: "#fce8e9" }}
      >
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 sm:px-6 md:grid-cols-2">
          <div>
            <span
              className="inline-block text-[10px] font-semibold uppercase tracking-[0.3em]"
              style={{ color: ACCENT_DARK }}
            >
              Sobre nosotras
            </span>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-neutral-950 sm:text-4xl">
              Estudio de la Roma Norte desde 2016
            </h2>
            <p className="mt-5 text-base leading-relaxed text-neutral-700">
              Cortes, color, manicura y faciales con cita con horario real y
              productos profesionales de verdad. No es un spa impersonal: te
              atiende siempre la misma estilista que conoce tu cabello.
            </p>
            <div className="mt-8 grid grid-cols-3 gap-4 border-t border-neutral-300/50 pt-6">
              <div>
                <div className="font-display text-2xl font-bold" style={{ color: ACCENT_DARK }}>
                  10+
                </div>
                <div className="mt-1 text-xs uppercase tracking-[0.15em] text-neutral-600">
                  años
                </div>
              </div>
              <div>
                <div className="font-display text-2xl font-bold" style={{ color: ACCENT_DARK }}>
                  2,400
                </div>
                <div className="mt-1 text-xs uppercase tracking-[0.15em] text-neutral-600">
                  clientas felices
                </div>
              </div>
              <div>
                <div className="font-display text-2xl font-bold" style={{ color: ACCENT_DARK }}>
                  4.9
                </div>
                <div className="mt-1 text-xs uppercase tracking-[0.15em] text-neutral-600">
                  Google Reviews
                </div>
              </div>
            </div>
          </div>
          <div className="relative aspect-[4/5] w-full overflow-hidden rounded-[2rem] shadow-xl">
            <Image
              src="/servicios/web/lumiere-equipo.jpg"
              alt="Equipo de Lumière Studio trabajando en el salón"
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover"
            />
          </div>
        </div>
      </section>

      {/* ── Contacto ── */}
      <section
        id="contacto"
        className="py-20 text-white sm:py-24"
        style={{ backgroundColor: ACCENT_DARK }}
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid gap-10 md:grid-cols-[1.1fr,1fr]">
            <div>
              <span className="inline-block text-[10px] font-semibold uppercase tracking-[0.3em] text-white/70">
                Contacto
              </span>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
                Agenda tu cita
              </h2>
              <p className="mt-3 text-white/80">
                Respondemos por WhatsApp en menos de 2 horas en horario de
                atención. Si es urgente, también puedes llamarnos directo.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <a
                  href="https://wa.me/5215512345678?text=Hola%20Lumi%C3%A8re%2C%20quiero%20agendar%20una%20cita"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold transition hover:bg-neutral-100"
                  style={{ color: ACCENT_DARK }}
                >
                  Escribir por WhatsApp
                </a>
                <a
                  href="tel:+5215512345678"
                  className="inline-flex items-center justify-center rounded-full border border-white/30 bg-transparent px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                >
                  Llamar al salón
                </a>
              </div>
              <div className="mt-8 space-y-4 text-sm">
                <div className="flex items-start gap-3">
                  <span className="text-white/60">📍</span>
                  <div>
                    <div className="font-semibold">Dirección</div>
                    <div className="text-white/80">
                      Av. Álvaro Obregón 121, Roma Norte, CDMX 06700
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-white/60">🕐</span>
                  <div>
                    <div className="font-semibold">Horario</div>
                    <div className="text-white/80">
                      Lun a Vie · 10:00 – 20:00
                      <br />
                      Sáb · 10:00 – 18:00
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="rounded-2xl bg-white/10 p-6 backdrop-blur">
              <h3 className="font-display text-lg font-semibold">
                ¿Prefieres reservar en línea?
              </h3>
              <p className="mt-2 text-sm text-white/80">
                Te llevamos a nuestro formulario de reserva con selección de
                servicio, fecha y horario preferido. Sin llamadas, sin esperas.
              </p>
              <a
                href="/diseno-paginas/demo-1a/contacto"
                className="mt-5 inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                style={{ backgroundColor: ACCENT }}
              >
                Ir al formulario de reserva →
              </a>
              <p className="mt-3 text-xs text-white/60">
                Te respondemos en menos de 2 horas hábiles.
              </p>
            </div>
          </div>
        </div>
      </section>

      <TemplateFooter
        brand="Lumière Studio"
        tagline="Salón de belleza · Roma Norte"
        description="Estética de autor en la Roma Norte, CDMX. Cortes, color, manicura y tratamientos faciales desde 2016."
        address="Av. Álvaro Obregón 121, Roma Norte, CDMX 06700"
        phone="+52 55 1234 5678"
        email="hola@lumiere-studio.mx"
        schedule="Lun-Vie 10-20 · Sáb 10-18"
        accentColor={ACCENT_DARK}
        socialLinks={[
          { label: "Instagram · @lumiere.studio", href: "#" },
          { label: "Facebook · Lumière Studio", href: "#" },
        ]}
      />
    </div>
  );
}
