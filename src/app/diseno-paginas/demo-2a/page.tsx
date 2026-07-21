import Image from "next/image";
import Link from "next/link";
import { TemplateNav } from "@/components/web-templates/TemplateNav";
import { TemplateFooter } from "@/components/web-templates/TemplateFooter";
import { QlickBadge } from "@/components/web-templates/QlickBadge";
import { LeadFormDemo } from "@/components/web-templates/LeadFormDemo";

export const metadata = {
  title: "Sonrisa Plus · Consultorio dental en Polanco",
  description:
    "Odontología familiar y estética dental en Polanco, CDMX. Limpieza, ortodoncia, implantes y diseño de sonrisa. Primera consulta sin costo.",
};

const ACCENT = "#0284c7";
const ACCENT_DARK = "#075985";

const SERVICES = [
  {
    title: "Limpieza y profilaxis",
    price: "Desde $850",
    description:
      "Limpieza profunda con ultrasonido, pulido y aplicación de flúor. Duración: 45 min.",
  },
  {
    title: "Ortodoncia invisible",
    price: "Desde $45,000",
    description:
      "Alineadores transparentes hechos a medida. Plan de tratamiento 3D incluido.",
  },
  {
    title: "Implantes dentales",
    price: "Desde $18,000",
    description:
      "Implantes de titanio con corona de zirconia. Incluye valoración y plan quirúrgico.",
  },
  {
    title: "Diseño de sonrisa",
    price: "Desde $28,000",
    description:
      "Carillas de porcelana E-max. Mockup digital previo y prueba en boca antes de cementar.",
  },
  {
    title: "Endodoncia",
    price: "Desde $4,500",
    description:
      "Tratamiento de conductos con microscopio dental. Una o dos sesiones según el caso.",
  },
  {
    title: "Blanqueamiento profesional",
    price: "Desde $3,800",
    description:
      "Blanqueamiento LED en consultorio + kit de mantenimiento para casa.",
  },
] as const;

const DOCTORS = [
  {
    name: "Dra. Andrea Mendoza",
    specialty: "Directora · Diseño de sonrisa",
    bio: "15 años de experiencia. Certificada en carillas E-max por la American Academy of Cosmetic Dentistry.",
    color: "#bae6fd",
  },
  {
    name: "Dr. Roberto Salinas",
    specialty: "Implantología y cirugía",
    bio: "Especialista en implantes por la UNAM. Más de 800 implantes colocados con éxito.",
    color: "#7dd3fc",
  },
  {
    name: "Dra. Carolina Vega",
    specialty: "Ortodoncia invisible",
    bio: "Diamond Provider de Invisalign. 400+ casos tratados con alineadores.",
    color: "#a5f3fc",
  },
] as const;

export default function Demo2A() {
  return (
    <div id="top" className="min-h-screen bg-white text-neutral-900">
      <QlickBadge />
      <TemplateNav
        brand="Sonrisa Plus"
        tagline="Odontología · Polanco"
        accentColor={ACCENT_DARK}
        links={[
          { label: "Servicios", href: "#servicios" },
          { label: "Equipo", href: "#equipo" },
          { label: "Tecnología", href: "#tecnologia" },
          { label: "Reseñas", href: "#resenas" },
          { label: "Contacto", href: "#contacto" },
        ]}
        ctaLabel="Agendar cita"
        ctaHref="#contacto"
      />

      {/* ── Hero ── */}
      <section
        className="relative overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 50%, #bae6fd 100%)",
        }}
      >
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 sm:py-24 md:grid-cols-2">
          <div>
            <span
              className="inline-block rounded-full bg-white/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] backdrop-blur"
              style={{ color: ACCENT_DARK }}
            >
              Consultorio dental · Polanco, CDMX
            </span>
            <h1 className="mt-4 font-display text-4xl font-bold leading-[1.05] tracking-tight text-neutral-950 sm:text-6xl">
              Odontología que se siente <span style={{ color: ACCENT_DARK }}>tranquila</span>.
            </h1>
            <p className="mt-5 max-w-md text-lg leading-relaxed text-neutral-700">
              Equipo certificado, tecnología 3D y un plan claro desde la primera
              cita. Sin sorpresas en el presupuesto.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a
                href="#contacto"
                className="inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:opacity-90"
                style={{ backgroundColor: ACCENT_DARK }}
              >
                Agendar primera cita gratis
              </a>
              <a
                href="#servicios"
                className="inline-flex items-center justify-center rounded-full border border-neutral-300 bg-white/70 px-6 py-3 text-sm font-semibold text-neutral-800 backdrop-blur transition hover:border-neutral-400"
              >
                Ver servicios
              </a>
            </div>
            <div className="mt-8 flex items-center gap-6 text-xs text-neutral-700">
              <div>
                <div className="font-display text-xl font-bold" style={{ color: ACCENT_DARK }}>
                  18
                </div>
                <div>años</div>
              </div>
              <div>
                <div className="font-display text-xl font-bold" style={{ color: ACCENT_DARK }}>
                  6,200
                </div>
                <div>pacientes</div>
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
                src="/servicios/web/sonrisa-hero.jpg"
                alt="Consultorio moderno de Sonrisa Plus en Polanco"
                fill
                priority
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-8 text-white">
                <div className="text-[10px] uppercase tracking-[0.3em] opacity-80">
                  Sonrisa Plus
                </div>
                <div className="mt-1 font-display text-2xl font-bold">
                  Polanco
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
              Tratamientos para todas las edades
            </h2>
            <p className="mt-3 text-neutral-700">
              Todos los precios son aproximados y se confirman después de la
              valoración inicial. Sin sorpresas.
            </p>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {SERVICES.map((s) => (
              <div
                key={s.title}
                className="rounded-2xl border border-neutral-200 bg-white p-6 transition hover:border-sky-200 hover:shadow-md"
              >
                <h3 className="font-display text-lg font-semibold text-neutral-950">
                  {s.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-700">
                  {s.description}
                </p>
                <div className="mt-4 flex items-center justify-between text-xs">
                  <span
                    className="font-display text-base font-bold"
                    style={{ color: ACCENT_DARK }}
                  >
                    {s.price}
                  </span>
                  <a
                    href="#contacto"
                    className="font-semibold"
                    style={{ color: ACCENT_DARK }}
                  >
                    Cotizar →
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Equipo ── */}
      <section
        id="equipo"
        className="py-20 sm:py-24"
        style={{ backgroundColor: "#f8fafc" }}
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="max-w-2xl">
            <span
              className="inline-block text-[10px] font-semibold uppercase tracking-[0.3em]"
              style={{ color: ACCENT_DARK }}
            >
              El equipo
            </span>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-neutral-950 sm:text-4xl">
              Especialistas certificados
            </h2>
            <p className="mt-3 text-neutral-700">
              Tres doctores, una auxiliar y una recepcionista. Te atiende siempre
              la misma persona, no rotes.
            </p>
          </div>
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {DOCTORS.map((doc, i) => (
              <div
                key={doc.name}
                className="overflow-hidden rounded-2xl border border-neutral-200 bg-white"
              >
                <div className="relative aspect-[4/3] w-full">
                  {i === 0 ? (
                    <Image
                      src="/servicios/web/sonrisa-doctor.jpg"
                      alt={`Dra. ${doc.name}`}
                      fill
                      sizes="(max-width: 768px) 100vw, 33vw"
                      className="object-cover"
                    />
                  ) : (
                    <div
                      className="h-full w-full"
                      style={{ backgroundColor: doc.color }}
                    />
                  )}
                </div>
                <div className="p-5">
                  <h3 className="font-display text-lg font-semibold text-neutral-950">
                    {doc.name}
                  </h3>
                  <p
                    className="mt-1 text-xs font-semibold uppercase tracking-[0.15em]"
                    style={{ color: ACCENT_DARK }}
                  >
                    {doc.specialty}
                  </p>
                  <p className="mt-3 text-sm leading-relaxed text-neutral-700">
                    {doc.bio}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Tecnología ── */}
      <section id="tecnologia" className="bg-white py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid gap-10 md:grid-cols-2">
            <div>
              <span
                className="inline-block text-[10px] font-semibold uppercase tracking-[0.3em]"
                style={{ color: ACCENT_DARK }}
              >
                Tecnología
              </span>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-neutral-950 sm:text-4xl">
                Equipos que importan
              </h2>
              <p className="mt-4 leading-relaxed text-neutral-700">
                Invertimos en tecnología para que cada visita sea más corta, más
                precisa y menos invasiva.
              </p>
              <ul className="mt-6 space-y-3 text-sm text-neutral-800">
                {[
                  "Escáner intraoral 3D (sin moldes incómodos)",
                  "Tomógrafo cone beam para planeación de implantes",
                  "Microscopio dental para endodoncia",
                  "Rayos X digitales (80% menos radiación)",
                  "Software de diseño de sonrisa en tiempo real",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <svg
                      viewBox="0 0 20 20"
                      className="mt-0.5 h-4 w-4 flex-shrink-0 fill-current"
                      style={{ color: ACCENT }}
                      aria-hidden="true"
                    >
                      <path d="M16.7 5.3a1 1 0 0 1 0 1.4l-7 7a1 1 0 0 1-1.4 0l-3-3a1 1 0 1 1 1.4-1.4L9 11.6l6.3-6.3a1 1 0 0 1 1.4 0Z" />
                    </svg>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { name: "Escáner 3D", src: "/servicios/web/sonrisa-escaner.jpg" },
                { name: "Clínica", src: "/servicios/web/sonrisa-clinica.jpg" },
                { name: "Consultorio", src: "/servicios/web/sonrisa-consultorio.jpg" },
                { name: "Atención", color: "#e0f2fe" },
              ].map((tech) => (
                <div
                  key={tech.name}
                  className="relative aspect-square overflow-hidden rounded-2xl"
                >
                  {tech.src ? (
                    <Image
                      src={tech.src}
                      alt={tech.name}
                      fill
                      sizes="(max-width: 768px) 50vw, 25vw"
                      className="object-cover"
                    />
                  ) : (
                    <div
                      className="h-full w-full"
                      style={{ backgroundColor: tech.color }}
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                  <span className="absolute inset-x-0 bottom-0 p-3 font-display text-sm font-semibold text-white">
                    {tech.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Reseñas ── */}
      <section
        id="resenas"
        className="py-20 sm:py-24"
        style={{ backgroundColor: "#f0f9ff" }}
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="max-w-2xl">
            <span
              className="inline-block text-[10px] font-semibold uppercase tracking-[0.3em]"
              style={{ color: ACCENT_DARK }}
            >
              Testimonios
            </span>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-neutral-950 sm:text-4xl">
              Pacientes que recomiendan
            </h2>
          </div>
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {[
              {
                name: "Lucía H.",
                quote:
                  "Tenía pánico al dentista desde niña. Aquí me atendieron con calma y me explicaron todo paso a paso. Mis limpiezas son otra cosa ahora.",
              },
              {
                name: "Pablo M.",
                quote:
                  "Mi ortodoncia con Invisalign se vio en pantalla antes de empezar. 14 meses y listo. Vale cada peso.",
              },
              {
                name: "Adriana T.",
                quote:
                  "Diseño de sonrisa con carillas. La Dra. Mendoza me enseñó el resultado antes de hacerlo. Quedó exacto a lo que me mostró.",
              },
            ].map((t) => (
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
        className="py-20 sm:py-24"
        style={{ backgroundColor: ACCENT_DARK }}
      >
        <div className="mx-auto max-w-6xl px-4 text-white sm:px-6">
          <div className="grid gap-10 md:grid-cols-2">
            <div>
              <span className="inline-block text-[10px] font-semibold uppercase tracking-[0.3em] text-white/70">
                Agenda
              </span>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
                Primera consulta sin costo
              </h2>
              <p className="mt-3 text-white/80">
                Incluye revisión completa, plan de tratamiento por escrito y
                cotización. Sin compromiso.
              </p>
              <div className="mt-6 space-y-3 text-sm">
                <div className="flex items-start gap-3">
                  <span className="text-white/60">📍</span>
                  <div>
                    <div className="font-semibold">Dirección</div>
                    <div className="text-white/80">
                      Av. Presidente Masaryk 220, Polanco, CDMX 11550
                    </div>
                  </div>
                </div>
                <div className="mt-4 overflow-hidden rounded-xl border border-white/20">
                  <iframe
                    title="Ubicación de Sonrisa Plus en Polanco"
                    src="https://www.google.com/maps?q=Av.+Presidente+Masaryk+220,+Polanco,+CDMX&output=embed"
                    width="100%"
                    height="200"
                    style={{ border: 0 }}
                    allowFullScreen
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    className="block"
                  />
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-white/60">📞</span>
                  <div>
                    <div className="font-semibold">WhatsApp</div>
                    <div className="text-white/80">+52 55 2345 6789</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-white/60">🕐</span>
                  <div>
                    <div className="font-semibold">Horario</div>
                    <div className="text-white/80">
                      Lun a Vie · 9:00 – 19:00
                      <br />
                      Sáb · 9:00 – 14:00
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="rounded-2xl bg-white p-6 text-neutral-900">
              <h3 className="font-display text-lg font-semibold">Agenda online</h3>
              <p className="mt-1 text-sm text-neutral-600">
                Déjanos tus datos y te confirmamos cita en menos de 4 horas.
              </p>
              <LeadFormDemo
                demo="sonrisa-plus"
                accentFocus={ACCENT_DARK}
                serviceOptions={SERVICES.map((s) => s.title)}
                buttonText="Solicitar primera cita"
                successMessage="Recibimos tu solicitud. Te contactamos hoy mismo para confirmar tu cita."
              />
            </div>
          </div>
        </div>
      </section>

      <TemplateFooter
        brand="Sonrisa Plus"
        tagline="Consultorio dental · Polanco"
        description="Odontología familiar y estética dental en Polanco, CDMX. Equipo certificado, tecnología 3D, sin sorpresas en el presupuesto."
        address="Av. Presidente Masaryk 220, Polanco, CDMX 11550"
        phone="+52 55 2345 6789"
        email="hola@sonrisaplus.mx"
        schedule="Lun-Vie 9-19 · Sáb 9-14"
        accentColor={ACCENT_DARK}
        socialLinks={[
          { label: "Instagram · @sonrisa.plus", href: "#" },
          { label: "Facebook · Sonrisa Plus", href: "#" },
        ]}
      />
    </div>
  );
}
