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

const TESTIMONIALS = [
  {
    name: "Mariana R.",
    quote:
      "El mejor balayage que me han hecho en CDMX. Salí con el cabello como en revista y la atención es de primera.",
  },
  {
    name: "Sofía C.",
    quote:
      "Voy cada 3 semanas por manicura en gel. Puntuales, limpias y siempre con café mientras me atienden.",
  },
  {
    name: "Daniela P.",
    quote:
      "Mi paquete de novia fue perfecto. Llegué sin estrés y salí con todo hecho. Lo recomiendo cerrado.",
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
          { label: "Galería", href: "#galeria" },
          { label: "Reseñas", href: "#resenas" },
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
                  8+
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
            <div
              className="absolute -bottom-6 -left-6 hidden h-24 w-24 rounded-full shadow-lg sm:block"
              style={{ backgroundColor: ACCENT }}
              aria-hidden="true"
            />
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

      {/* ── Sobre nosotros ── */}
      <section
        id="nosotros"
        className="py-20 sm:py-24"
        style={{ backgroundColor: "#fdf8f5" }}
      >
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 sm:px-6 md:grid-cols-2">
          <div className="relative aspect-square w-full overflow-hidden rounded-3xl">
            <Image
              src="/servicios/web/lumiere-equipo.jpg"
              alt="Estilista de Lumière trabajando con una clienta"
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-8 text-white">
              <div className="font-display text-2xl font-bold">El equipo</div>
              <div className="text-sm opacity-80">5 estilistas · 1 facialista</div>
            </div>
          </div>
          <div>
            <span
              className="inline-block text-[10px] font-semibold uppercase tracking-[0.3em]"
              style={{ color: ACCENT_DARK }}
            >
              Sobre nosotros
            </span>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-neutral-950 sm:text-4xl">
              Un estudio, no una cadena
            </h2>
            <p className="mt-4 leading-relaxed text-neutral-700">
              Abrimos en 2016 en la Roma Norte. Empezamos con 2 sillas y un
              balayage, hoy somos un equipo de 6 especialistas. Lo que nunca
              cambió: cero prisa, cita con horario real, y productos
              profesionales de verdad.
            </p>
            <p className="mt-4 leading-relaxed text-neutral-700">
              Trabajamos con L&apos;Oréal Professionnel, Olaplex y OPI. Si
              tienes alergias o preferencias, lo hablamos antes de cualquier
              servicio.
            </p>
            <div className="mt-6 grid grid-cols-3 gap-4 text-sm">
              <div className="rounded-xl bg-white p-3 text-center">
                <div className="font-display text-xl font-bold" style={{ color: ACCENT_DARK }}>
                  100%
                </div>
                <div className="text-xs text-neutral-600">veganos</div>
              </div>
              <div className="rounded-xl bg-white p-3 text-center">
                <div className="font-display text-xl font-bold" style={{ color: ACCENT_DARK }}>
                  6
                </div>
                <div className="text-xs text-neutral-600">especialistas</div>
              </div>
              <div className="rounded-xl bg-white p-3 text-center">
                <div className="font-display text-xl font-bold" style={{ color: ACCENT_DARK }}>
                  0
                </div>
                <div className="text-xs text-neutral-600">prisa</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Galería ── */}
      <section id="galeria" className="bg-white py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="max-w-2xl">
            <span
              className="inline-block text-[10px] font-semibold uppercase tracking-[0.3em]"
              style={{ color: ACCENT_DARK }}
            >
              Galería
            </span>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-neutral-950 sm:text-4xl">
              Trabajos recientes
            </h2>
            <p className="mt-3 text-neutral-700">
              Antes y después de clientas reales (con su permiso, siempre).
            </p>
          </div>
          <div className="mt-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {(
              [
                { name: "Balayage caramelo", src: "/servicios/web/lumiere-balayage.jpg" },
                { name: "Corte bob", src: "/servicios/web/lumiere-corte.jpg" },
                { name: "Manicura nude", src: "/servicios/web/lumiere-manicura.jpg" },
                { name: "Peinado novia", src: "/servicios/web/lumiere-novia.jpg" },
                { name: "Color chocolate", c1: "#8e4f5a", c2: "#b76e79" },
                { name: "Highlights rubios", c1: "#f5d4d7", c2: "#fce8e9" },
                { name: "Pedicura spa", c1: "#e0b8be", c2: "#fce8e9" },
                { name: "Tratamiento facial", c1: "#fce8e9", c2: "#8e4f5a" },
              ] as const
            ).map((item) => (
              <div
                key={item.name}
                className="group relative aspect-square overflow-hidden rounded-2xl bg-neutral-200"
                style={
                  "src" in item
                    ? undefined
                    : { background: `linear-gradient(135deg, ${item.c1} 0%, ${item.c2} 100%)` }
                }
              >
                {"src" in item ? (
                  <Image
                    src={item.src}
                    alt={item.name}
                    fill
                    sizes="(max-width: 768px) 50vw, 25vw"
                    className="object-cover"
                  />
                ) : null}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-3 opacity-0 transition group-hover:opacity-100">
                  <div className="text-xs font-semibold text-white">
                    {item.name}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Reseñas ── */}
      <section
        id="resenas"
        className="py-20 sm:py-24"
        style={{ backgroundColor: "#fdf8f5" }}
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="max-w-2xl">
            <span
              className="inline-block text-[10px] font-semibold uppercase tracking-[0.3em]"
              style={{ color: ACCENT_DARK }}
            >
              Reseñas
            </span>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-neutral-950 sm:text-4xl">
              Lo que dicen nuestras clientas
            </h2>
          </div>
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {TESTIMONIALS.map((t) => (
              <figure
                key={t.name}
                className="rounded-2xl border border-neutral-200 bg-white p-6"
              >
                <div className="flex gap-1" style={{ color: ACCENT }}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <svg
                      key={i}
                      viewBox="0 0 20 20"
                      className="h-4 w-4 fill-current"
                      aria-hidden="true"
                    >
                      <path d="M10 1.5l2.6 5.3 5.9.8-4.3 4.2 1 5.8L10 14.9 4.8 17.6l1-5.8L1.5 7.6l5.9-.8L10 1.5Z" />
                    </svg>
                  ))}
                </div>
                <blockquote className="mt-3 text-sm leading-relaxed text-neutral-800">
                  &ldquo;{t.quote}&rdquo;
                </blockquote>
                <figcaption
                  className="mt-4 text-xs font-semibold"
                  style={{ color: ACCENT_DARK }}
                >
                  — {t.name}
                </figcaption>
              </figure>
            ))}
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
          <div className="grid gap-10 md:grid-cols-2">
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
              <div className="mt-6 space-y-3 text-sm">
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
                  <span className="text-white/60">📞</span>
                  <div>
                    <div className="font-semibold">WhatsApp</div>
                    <div className="text-white/80">+52 55 1234 5678</div>
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
            <div className="rounded-2xl bg-white p-6 text-neutral-900">
              <h3 className="font-display text-lg font-semibold">Reserva rápida</h3>
              <p className="mt-1 text-sm text-neutral-600">
                Déjanos tus datos y te contactamos hoy mismo.
              </p>
              <form className="mt-5 space-y-3">
                <input
                  type="text"
                  placeholder="Tu nombre"
                  className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-[#b76e79] focus:ring-2 focus:ring-[#b76e79]/20"
                />
                <input
                  type="tel"
                  placeholder="WhatsApp (10 dígitos)"
                  className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-[#b76e79] focus:ring-2 focus:ring-[#b76e79]/20"
                />
                <select
                  className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#b76e79] focus:ring-2 focus:ring-[#b76e79]/20"
                  defaultValue=""
                >
                  <option value="" disabled>
                    Servicio de interés
                  </option>
                  {SERVICES.map((s) => (
                    <option key={s.name} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <textarea
                  placeholder="Cuéntanos brevemente qué te gustaría"
                  rows={3}
                  className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-[#b76e79] focus:ring-2 focus:ring-[#b76e79]/20"
                />
                <button
                  type="submit"
                  className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                  style={{ backgroundColor: ACCENT_DARK }}
                >
                  Solicitar cita
                </button>
                <p className="text-center text-xs text-neutral-500">
                  Te respondemos por WhatsApp en menos de 2 horas.
                </p>
              </form>
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
