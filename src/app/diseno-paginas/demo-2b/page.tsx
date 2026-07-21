import Image from "next/image";
import { TemplateNav } from "@/components/web-templates/TemplateNav";
import { TemplateFooter } from "@/components/web-templates/TemplateFooter";
import { QlickBadge } from "@/components/web-templates/QlickBadge";
import { LeadFormDemo } from "@/components/web-templates/LeadFormDemo";

export const metadata = {
  title: "Bufete Mendoza · Abogados en CDMX",
  description:
    "Despacho de abogados en CDMX. Derecho civil, mercantil, familiar, penal y corporativo. Consulta inicial sin costo. Más de 25 años de experiencia.",
};

const ACCENT = "#1e3a5f";
const ACCENT_DARK = "#0f1f3a";
const ACCENT_GOLD = "#a98038";

const PRACTICE_AREAS = [
  {
    title: "Derecho Mercantil",
    description:
      "Constitución de sociedades, contratos comerciales, fusión y adquisición de empresas, propiedad intelectual.",
  },
  {
    title: "Derecho Civil",
    description:
      "Contratos, arrendamientos, responsabilidad civil, sucesiones, juicios de amparo.",
  },
  {
    title: "Derecho Familiar",
    description:
      "Divorcios, custodia, pensiones alimenticias, adopciones. Atención con perspectiva de derechos.",
  },
  {
    title: "Derecho Penal",
    description:
      "Defensa en procesos federales y locales. Atención desde la etapa de investigación hasta amparo.",
  },
  {
    title: "Derecho Corporativo",
    description:
      "Asesoría preventiva para empresas, gobierno corporativo, compliance, contratos internacionales.",
  },
  {
    title: "Propiedad Intelectual",
    description:
      "Registro de marcas, patentes, derechos de autor. Defensa ante infracciones y piratería.",
  },
] as const;

const LAWYERS = [
  {
    name: "Lic. Rodrigo Mendoza",
    role: "Socio fundador",
    years: "32 años",
    specialty: "Mercantil y corporativo",
    bio: "Maestría en Derecho Empresarial por la UNAM. Ex presidente del Colegio de Abogados de CDMX.",
    image: "/servicios/web/mendoza-abogado.jpg",
  },
  {
    name: "Lic. Patricia Aguilar",
    role: "Socia",
    years: "18 años",
    specialty: "Civil y familiar",
    bio: "Especialista en mediación familiar. Certificada por el Instituto de la Judicatura Federal.",
    image: "/servicios/web/mendoza-aguilar.jpg",
  },
  {
    name: "Lic. Jorge Ramírez",
    role: "Asociado senior",
    years: "12 años",
    specialty: "Penal y amparo",
    bio: "Doctor en Ciencias Penales. Profesor de Derecho Procesal en la Universidad Iberoamericana.",
    image: "/servicios/web/mendoza-ramirez.jpg",
  },
  {
    name: "Lic. Fernanda Castro",
    role: "Asociada",
    years: "7 años",
    specialty: "Propiedad intelectual",
    bio: "Maestría en Propiedad Intelectual por la Universidad de Alicante. Agente registrado ante IMPI.",
    image: "/servicios/web/mendoza-castro.jpg",
  },
] as const;

const CASES = [
  {
    year: "2024",
    title: "Fusión de dos farmacéuticas",
    sector: "Mercantil",
    description:
      "Asesoría integral en la fusión por absorción de una farmacéutica regional por una trasnacional. Cierre en 11 meses.",
  },
  {
    year: "2024",
    title: "Defensa en juicio mercantil",
    sector: "Civil",
    description:
      "Defensa exitosa de empresa familiar contra demanda de proveedor. Laudo favorable y costas a favor.",
  },
  {
    year: "2023",
    title: "Registro de marca internacional",
    sector: "Propiedad intelectual",
    description:
      "Registro de marca mexicana en 14 países del Tratado de Madrid. Defensa contra oposición en 2 jurisdicciones.",
  },
] as const;

export default function Demo2B() {
  return (
    <div id="top" className="min-h-screen bg-[#f8f7f4] text-neutral-900">
      <QlickBadge />
      <TemplateNav
        brand="Bufete Mendoza"
        tagline="Abogados · CDMX"
        accentColor={ACCENT_DARK}
        links={[
          { label: "Áreas", href: "#areas" },
          { label: "Equipo", href: "#equipo" },
          { label: "Casos", href: "#casos" },
          { label: "Publicaciones", href: "#blog" },
          { label: "Contacto", href: "#contacto" },
        ]}
        ctaLabel="Consulta gratis"
        ctaHref="#contacto"
      />

      {/* ── Hero ── */}
      <section
        className="relative overflow-hidden text-white"
        style={{
          background:
            "linear-gradient(135deg, #0f1f3a 0%, #1e3a5f 60%, #2c5282 100%)",
        }}
      >
        <div className="absolute inset-0 opacity-20" aria-hidden="true">
          <div
            className="absolute right-1/4 top-1/3 h-px w-32 rotate-45"
            style={{ backgroundColor: ACCENT_GOLD }}
          />
          <div
            className="absolute right-1/3 top-1/2 h-px w-24 rotate-45"
            style={{ backgroundColor: ACCENT_GOLD }}
          />
          <div
            className="absolute right-[20%] top-[60%] h-px w-20 rotate-45"
            style={{ backgroundColor: ACCENT_GOLD }}
          />
        </div>
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-20 sm:px-6 sm:py-28 md:grid-cols-2">
          <div>
            <span
              className="inline-block rounded-full border border-white/30 bg-white/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] backdrop-blur"
              style={{ color: ACCENT_GOLD }}
            >
              Bufete desde 1998
            </span>
            <h1 className="mt-4 font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
              25 años resolviendo
              <br />
              <span style={{ color: ACCENT_GOLD }}>casos complejos</span>.
            </h1>
            <p className="mt-5 max-w-md text-lg leading-relaxed text-white/85">
              Despacho boutique con experiencia en litigio civil, mercantil,
              penal y corporativo. Atención directa del abogado que lleva tu
              caso, sin pasamanos.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a
                href="#contacto"
                className="inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold text-[#0f1f3a] shadow-md transition hover:opacity-90"
                style={{ backgroundColor: ACCENT_GOLD }}
              >
                Consulta inicial gratis
              </a>
              <a
                href="#areas"
                className="inline-flex items-center justify-center rounded-full border border-white/30 bg-white/5 px-6 py-3 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/10"
              >
                Ver áreas de práctica
              </a>
            </div>
            <div className="mt-10 grid grid-cols-3 gap-6 border-t border-white/15 pt-6 text-xs">
              <div>
                <div
                  className="font-display text-2xl font-bold"
                  style={{ color: ACCENT_GOLD }}
                >
                  25+
                </div>
                <div className="text-white/70">años</div>
              </div>
              <div>
                <div
                  className="font-display text-2xl font-bold"
                  style={{ color: ACCENT_GOLD }}
                >
                  1,400
                </div>
                <div className="text-white/70">casos cerrados</div>
              </div>
              <div>
                <div
                  className="font-display text-2xl font-bold"
                  style={{ color: ACCENT_GOLD }}
                >
                  4
                </div>
                <div className="text-white/70">socios</div>
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="relative aspect-[4/5] w-full overflow-hidden rounded-[2rem] shadow-2xl">
              <Image
                src="/servicios/web/mendoza-hero.jpg"
                alt="Oficinas corporativas del Bufete Mendoza en Paseo de la Reforma"
                fill
                priority
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-8 text-white">
                <div className="border-t pt-4" style={{ borderColor: ACCENT_GOLD }}>
                  <div
                    className="text-[10px] uppercase tracking-[0.3em]"
                    style={{ color: ACCENT_GOLD }}
                  >
                    Mendoza · Aguilar · Ramírez · Castro
                  </div>
                  <div className="mt-1 font-display text-xl font-bold text-white">
                    Bufete desde 1998
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Áreas de práctica ── */}
      <section id="areas" className="bg-white py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="max-w-2xl">
            <span
              className="inline-block text-[10px] font-semibold uppercase tracking-[0.3em]"
              style={{ color: ACCENT_GOLD }}
            >
              Áreas de práctica
            </span>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-neutral-950 sm:text-4xl">
              Lo que hacemos
            </h2>
            <p className="mt-3 text-neutral-700">
              Seis áreas de práctica, una filosofía: atención personal del
              abogado responsable, no pasamanos entre asociados.
            </p>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {PRACTICE_AREAS.map((area) => (
              <div
                key={area.title}
                className="rounded-2xl border border-neutral-200 bg-white p-6 transition hover:border-neutral-300 hover:shadow-md"
              >
                <div
                  className="mb-3 h-1 w-12 rounded"
                  style={{ backgroundColor: ACCENT_GOLD }}
                />
                <h3 className="font-display text-lg font-semibold text-neutral-950">
                  {area.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-700">
                  {area.description}
                </p>
                <a
                  href="#contacto"
                  className="mt-4 inline-block text-sm font-semibold"
                  style={{ color: ACCENT_DARK }}
                >
                  Consultar sobre este tema →
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Equipo ── */}
      <section
        id="equipo"
        className="py-20 sm:py-24"
        style={{ backgroundColor: "#f8f7f4" }}
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="max-w-2xl">
            <span
              className="inline-block text-[10px] font-semibold uppercase tracking-[0.3em]"
              style={{ color: ACCENT_GOLD }}
            >
              El equipo
            </span>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-neutral-950 sm:text-4xl">
              Abogados que llevan tu caso
            </h2>
            <p className="mt-3 text-neutral-700">
              No somos un call center. Cada caso lo lleva personalmente uno de
              los cuatro socios.
            </p>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {LAWYERS.map((lawyer) => (
              <div
                key={lawyer.name}
                className="overflow-hidden rounded-2xl border border-neutral-200 bg-white"
              >
                <div className="relative aspect-[4/5] w-full">
                  <Image
                    src={lawyer.image}
                    alt={lawyer.name}
                    fill
                    sizes="(max-width: 768px) 50vw, 25vw"
                    className="object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-5 text-white">
                    <div
                      className="text-[10px] uppercase tracking-[0.2em]"
                      style={{ color: ACCENT_GOLD }}
                    >
                      {lawyer.years} · {lawyer.role}
                    </div>
                  </div>
                </div>
                <div className="p-5">
                  <h3 className="font-display text-base font-semibold text-neutral-950">
                    {lawyer.name}
                  </h3>
                  <p
                    className="mt-1 text-xs font-semibold uppercase tracking-[0.15em]"
                    style={{ color: ACCENT_DARK }}
                  >
                    {lawyer.specialty}
                  </p>
                  <p className="mt-3 text-sm leading-relaxed text-neutral-700">
                    {lawyer.bio}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Casos de éxito ── */}
      <section id="casos" className="bg-white py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="max-w-2xl">
            <span
              className="inline-block text-[10px] font-semibold uppercase tracking-[0.3em]"
              style={{ color: ACCENT_GOLD }}
            >
              Casos recientes
            </span>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-neutral-950 sm:text-4xl">
              Algunos casos que hemos cerrado
            </h2>
            <p className="mt-3 text-neutral-700">
              Con permiso de nuestros clientes, publicamos una selección de los
              casos más representativos.
            </p>
          </div>
          <div className="mt-10 space-y-4">
            {CASES.map((c) => (
              <article
                key={c.title}
                className="grid gap-4 rounded-2xl border border-neutral-200 bg-white p-6 sm:grid-cols-[auto,1fr,auto] sm:items-center"
              >
                <div
                  className="font-display text-2xl font-bold"
                  style={{ color: ACCENT_GOLD }}
                >
                  {c.year}
                </div>
                <div>
                  <h3 className="font-display text-lg font-semibold text-neutral-950">
                    {c.title}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-neutral-700">
                    {c.description}
                  </p>
                </div>
                <span
                  className="rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-white"
                  style={{ backgroundColor: ACCENT_DARK }}
                >
                  {c.sector}
                </span>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── Blog ── */}
      <section
        id="blog"
        className="py-20 sm:py-24"
        style={{ backgroundColor: "#f8f7f4" }}
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="max-w-2xl">
            <span
              className="inline-block text-[10px] font-semibold uppercase tracking-[0.3em]"
              style={{ color: ACCENT_GOLD }}
            >
              Publicaciones
            </span>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-neutral-950 sm:text-4xl">
              Lo que escribimos
            </h2>
          </div>
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {[
              {
                slug: "como-constituir-sas-mexico-2026",
                title: "Cómo constituir una SAS en México en 2026",
                date: "15 junio 2026",
                excerpt:
                  "Guía paso a paso con costos reales, tiempos y los errores que más vemos en clientes primerizos.",
                src: "/servicios/web/mendoza-blog-sas.jpg",
              },
              {
                slug: "derecho-familiar-nueva-ley",
                title: "Lo que cambia en derecho familiar con la nueva ley",
                date: "3 abril 2026",
                excerpt:
                  "Análisis de las reformas recientes en materia de pensiones alimenticias y custodia.",
                src: "/servicios/web/mendoza-blog-familia.jpg",
              },
              {
                slug: "clausulas-nunca-firmar-contrato-mercantil",
                title: "5 cláusulas que NUNCA debes firmar en un contrato mercantil",
                date: "20 febrero 2026",
                excerpt:
                  "El top 5 de cláusulas que vemos firmar a clientes sin leer y que después cuestan miles de pesos.",
                src: "/servicios/web/mendoza-blog-contrato.jpg",
              },
            ].map((post) => (
              <article
                key={post.slug}
                className="overflow-hidden rounded-2xl border border-neutral-200 bg-white"
              >
                <div className="relative aspect-[16/9] w-full">
                  <Image
                    src={post.src}
                    alt={post.title}
                    fill
                    sizes="(max-width: 768px) 100vw, 33vw"
                    className="object-cover"
                  />
                </div>
                <div className="p-5">
                  <div
                    className="text-[10px] font-semibold uppercase tracking-[0.2em]"
                    style={{ color: ACCENT_GOLD }}
                  >
                    {post.date}
                  </div>
                  <h3 className="mt-2 font-display text-base font-semibold text-neutral-950">
                    {post.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-neutral-700">
                    {post.excerpt}
                  </p>
                  <a
                    href={`/diseno-paginas/demo-2b/blog/${post.slug}`}
                    className="mt-3 inline-block text-sm font-semibold"
                    style={{ color: ACCENT_DARK }}
                  >
                    Leer artículo →
                  </a>
                </div>
              </article>
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
              <span
                className="inline-block text-[10px] font-semibold uppercase tracking-[0.3em]"
                style={{ color: ACCENT_GOLD }}
              >
                Consulta inicial
              </span>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
                30 minutos sin costo
              </h2>
              <p className="mt-3 text-white/80">
                Conversamos sobre tu caso, te decimos si podemos ayudarte y
                qué esperar en tiempos y costos. Sin compromiso.
              </p>
              <div className="mt-6 space-y-3 text-sm">
                <div className="flex items-start gap-3">
                  <span className="text-white/60">📍</span>
                  <div>
                    <div className="font-semibold">Oficina</div>
                    <div className="text-white/80">
                      Paseo de la Reforma 222, Piso 14, CDMX 06600
                    </div>
                  </div>
                </div>
                <div className="mt-4 overflow-hidden rounded-xl border border-white/20">
                  <iframe
                    title="Ubicación de Bufete Mendoza en Reforma"
                    src="https://www.google.com/maps?q=Paseo+de+la+Reforma+222,+CDMX&output=embed"
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
                    <div className="text-white/80">+52 55 8765 1234</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-white/60">🕐</span>
                  <div>
                    <div className="font-semibold">Horario</div>
                    <div className="text-white/80">
                      Lun a Vie · 9:00 – 18:00
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="rounded-2xl bg-white p-6 text-neutral-900">
              <h3 className="font-display text-lg font-semibold">Solicitar consulta</h3>
              <p className="mt-1 text-sm text-neutral-600">
                Confidencialidad garantizada desde el primer contacto.
              </p>
              <LeadFormDemo
                demo="bufete-mendoza"
                accentFocus={ACCENT_DARK}
                serviceOptions={PRACTICE_AREAS.map((a) => a.title)}
                buttonText="Solicitar consulta"
                successMessage="Recibimos tu solicitud. Te contactamos en menos de 24 horas hábiles."
              />
            </div>
          </div>
        </div>
      </section>

      <TemplateFooter
        brand="Bufete Mendoza"
        tagline="Abogados · CDMX"
        description="Despacho boutique con 25 años de experiencia en derecho mercantil, civil, familiar, penal y corporativo. Atención directa del abogado responsable."
        address="Paseo de la Reforma 222, Piso 14, CDMX 06600"
        phone="+52 55 8765 1234"
        email="contacto@bufetemendoza.mx"
        schedule="Lun-Vie 9-18"
        accentColor={ACCENT_DARK}
        socialLinks={[
          { label: "LinkedIn · Bufete Mendoza", href: "#" },
          { label: "Instagram · @bufetemendoza", href: "#" },
        ]}
      />
    </div>
  );
}
