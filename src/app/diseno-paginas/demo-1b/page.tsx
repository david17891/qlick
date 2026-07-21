import Image from "next/image";
import { TemplateNav } from "@/components/web-templates/TemplateNav";
import { TemplateFooter } from "@/components/web-templates/TemplateFooter";
import { QlickBadge } from "@/components/web-templates/QlickBadge";

export const metadata = {
  title: "Taquería Don Carlos · Tacos al carbón en Coyoacán",
  description:
    "Tacos al carbón, al pastor y de guisado desde 1987. Abierto de noche en el centro de Coyoacán. Servicio a domicilio y para llevar.",
};

const ACCENT = "#c2410c";
const ACCENT_DARK = "#9a3412";

const MENU = [
  {
    category: "Al carbón",
    items: [
      { name: "Taco de arrachera", price: "$35", desc: "Carne asada al carbón, cebolla, cilantro y salsa verde." },
      { name: "Taco de costilla", price: "$32", desc: "Costilla de res al carbón con chile toreado." },
      { name: "Taco de chorizo", price: "$28", desc: "Chorizo artesanal de Toluca con cebolla asada." },
    ],
  },
  {
    category: "Al pastor",
    items: [
      { name: "Taco al pastor (orden de 5)", price: "$120", desc: "Cerdo marinado con achiote y chiles, piña y cilantro." },
      { name: "Gringa al pastor", price: "$95", desc: "Tortilla de harina con queso Oaxaca, pastor y piña." },
      { name: "Vampiro al pastor", price: "$85", desc: "Tortilla de harina asada con queso gratinado y pastor." },
    ],
  },
  {
    category: "Guisados",
    items: [
      { name: "Taco de cochinita pibil", price: "$30", desc: "Cochinita pibil estilo Yucatán con cebolla morada." },
      { name: "Taco de barbacoa", price: "$32", desc: "Barbacoa de res al estilo Hidalgo, consomé aparte." },
      { name: "Taco de chicharrón", price: "$26", desc: "Chicharrón prensado en salsa verde o roja." },
    ],
  },
] as const;

const STATS = [
  { number: "37", label: "años sirviendo" },
  { number: "12", label: "tipos de taco" },
  { number: "5", label: "salsas de la casa" },
  { number: "∞", label: "consomé gratis" },
] as const;

export default function Demo1B() {
  return (
    <div id="top" className="min-h-screen bg-[#fff8f1] text-neutral-900">
      <QlickBadge />
      <TemplateNav
        brand="Don Carlos"
        tagline="Tacos al carbón · Coyoacán"
        accentColor={ACCENT_DARK}
        links={[
          { label: "Menú", href: "#menu" },
          { label: "Historia", href: "#historia" },
          { label: "Cómo llegar", href: "#llegar" },
          { label: "Contacto", href: "#contacto" },
        ]}
        ctaLabel="Pedir a domicilio"
        ctaHref="#contacto"
      />

      {/* ── Hero ── */}
      <section
        className="relative overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, #fff8f1 0%, #fed7aa 50%, #fdba74 100%)",
        }}
      >
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 sm:py-24 md:grid-cols-2">
          <div>
            <span
              className="inline-block rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em]"
              style={{ backgroundColor: `${ACCENT}22`, color: ACCENT_DARK }}
            >
              Tacos al carbón desde 1987
            </span>
            <h1 className="mt-4 font-display text-4xl font-bold leading-[1.05] tracking-tight text-neutral-950 sm:text-6xl">
              Tacos como los de antes.
              <br />
              <span style={{ color: ACCENT_DARK }}>Y al mismo precio.</span>
            </h1>
            <p className="mt-5 max-w-md text-lg leading-relaxed text-neutral-800">
              Carne al carbón, salsas de la casa y tortilla recién hecha. En
              el corazón de Coyoacán, abiertos desde el atardecer hasta que se
              acaban.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a
                href="#contacto"
                className="inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:opacity-90"
                style={{ backgroundColor: ACCENT_DARK }}
              >
                Pedir a domicilio
              </a>
              <a
                href="#menu"
                className="inline-flex items-center justify-center rounded-full border border-neutral-300 bg-white/70 px-6 py-3 text-sm font-semibold text-neutral-800 backdrop-blur transition hover:border-neutral-400"
              >
                Ver el menú
              </a>
            </div>
          </div>

          <div className="relative">
            <div className="relative aspect-[4/5] w-full overflow-hidden rounded-[2rem] shadow-2xl">
              <Image
                src="/servicios/web/doncarlos-hero.jpg"
                alt="Tacos al carbón recién hechos en comal de la Taquería Don Carlos"
                fill
                priority
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-8 text-white">
                <div className="text-[10px] uppercase tracking-[0.3em] opacity-80">
                  Don Carlos
                </div>
                <div className="mt-1 font-display text-2xl font-bold">
                  desde 1987
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

      {/* ── Stats ── */}
      <section className="bg-[#7c2d12] py-10 text-white">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 sm:px-6 md:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label} className="text-center">
              <div className="font-display text-4xl font-bold text-amber-300">
                {s.number}
              </div>
              <div className="mt-1 text-xs uppercase tracking-[0.2em] text-white/80">
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Menú ── */}
      <section id="menu" className="bg-white py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="max-w-2xl">
            <span
              className="inline-block text-[10px] font-semibold uppercase tracking-[0.3em]"
              style={{ color: ACCENT_DARK }}
            >
              El menú
            </span>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-neutral-950 sm:text-4xl">
              Lo que servimos
            </h2>
            <p className="mt-3 text-neutral-700">
              Todos los tacos vienen en orden de 5 con tortilla de maíz recién
              hecha. Salsas aparte en la mesa.
            </p>
          </div>
          <div className="mt-10 space-y-12">
            {MENU.map((section) => (
              <div key={section.category}>
                <h3
                  className="font-display text-xl font-semibold"
                  style={{ color: ACCENT_DARK }}
                >
                  {section.category}
                </h3>
                <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {section.items.map((item) => (
                    <div
                      key={item.name}
                      className="rounded-2xl border border-neutral-200 bg-[#fff8f1] p-5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <h4 className="font-display text-base font-semibold text-neutral-950">
                          {item.name}
                        </h4>
                        <span
                          className="font-display text-base font-bold"
                          style={{ color: ACCENT_DARK }}
                        >
                          {item.price}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-relaxed text-neutral-700">
                        {item.desc}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Sobre nosotros + Cómo llegar (mini) ── */}
      <section
        id="nosotros"
        className="py-12 sm:py-16"
        style={{ backgroundColor: "#fff8f1" }}
      >
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <p className="text-base leading-relaxed text-neutral-700">
            Negocio familiar en <strong>Coyoacán desde 1987</strong>. Carne al carbón, al pastor y de guisado. Av. Centenario 91, abierto Lun-Dom 18:00-02:00.
          </p>
        </div>
      </section>

      {/* ── Contacto ── */}
      <section
        id="contacto"
        className="py-20 text-white sm:py-24"
        style={{ backgroundColor: ACCENT_DARK }}
      >
        <div className="mx-auto max-w-6xl px-4 text-center sm:px-6">
          <span className="inline-block text-[10px] font-semibold uppercase tracking-[0.3em] text-white/70">
            ¿Te provocamos?
          </span>
          <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-5xl">
            Pide tus tacos a domicilio
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-white/80">
            Servicio a domicilio por WhatsApp en Coyoacán, Del Carmen y
            Villa Coyoacán. Tiempo de entrega: 30-45 minutos.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a
              href="https://wa.me/5215587654321?text=Hola%20Don%20Carlos%2C%20quiero%20pedir%20tacos"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold transition hover:bg-neutral-100"
              style={{ color: ACCENT_DARK }}
            >
              Pedir por WhatsApp
            </a>
            <a
              href="tel:+5215587654321"
              className="inline-flex items-center justify-center rounded-full border border-white/30 bg-transparent px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Llamar al puesto
            </a>
          </div>
        </div>
      </section>

      <TemplateFooter
        brand="Taquería Don Carlos"
        tagline="Tacos al carbón · Coyoacán"
        description="Tacos al carbón, al pastor y de guisado desde 1987. Negocio familiar en el corazón de Coyoacán, CDMX."
        address="Av. Centenario 91, Del Carmen, Coyoacán, CDMX 04100"
        phone="+52 55 8765 4321"
        email="hola@doncarlos.mx"
        schedule="Lun-Dom 18:00 – 02:00"
        accentColor={ACCENT_DARK}
        socialLinks={[
          { label: "Instagram · @tacosdoncarlos", href: "#" },
          { label: "Facebook · Taquería Don Carlos", href: "#" },
        ]}
      />
    </div>
  );
}
