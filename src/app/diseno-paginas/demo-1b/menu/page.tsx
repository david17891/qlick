import Image from "next/image";
import Link from "next/link";
import { TemplateNav } from "@/components/web-templates/TemplateNav";
import { TemplateFooter } from "@/components/web-templates/TemplateFooter";
import { QlickBadge } from "@/components/web-templates/QlickBadge";

export const metadata = {
  title: "Menú completo · Taquería Don Carlos",
  description:
    "Menú completo de la Taquería Don Carlos: tacos al carbón, al pastor y de guisado. Coyoacán, CDMX.",
};

const ACCENT = "#c2410c";
const ACCENT_DARK = "#9a3412";

const FULL_MENU = {
  "Al carbón": [
    { name: "Taco de arrachera", price: "$35", desc: "Carne asada al carbón, cebolla, cilantro y salsa verde." },
    { name: "Taco de costilla", price: "$32", desc: "Costilla de res al carbón con chile toreado." },
    { name: "Taco de chorizo", price: "$28", desc: "Chorizo artesanal de Toluca con cebolla asada." },
    { name: "Taco de pechuga", price: "$30", desc: "Pechuga marinada al carbón, aguacate y queso Oaxaca." },
  ],
  "Al pastor": [
    { name: "Taco al pastor (orden de 5)", price: "$120", desc: "Cerdo marinado con achiote y chiles, piña y cilantro." },
    { name: "Gringa al pastor", price: "$95", desc: "Tortilla de harina con queso Oaxaca, pastor y piña." },
    { name: "Vampiro al pastor", price: "$85", desc: "Tortilla de harina asada con queso gratinado y pastor." },
    { name: "Quesadilla al pastor", price: "$90", desc: "Quesadilla de queso Oaxaca con pastor y piña." },
  ],
  "Guisados": [
    { name: "Taco de cochinita pibil", price: "$30", desc: "Cochinita pibil estilo Yucatán con cebolla morada." },
    { name: "Taco de barbacoa", price: "$32", desc: "Barbacoa de res al estilo Hidalgo, consomé aparte." },
    { name: "Taco de chicharrón", price: "$26", desc: "Chicharrón prensado en salsa verde o roja." },
    { name: "Taco de mole", price: "$30", desc: "Mole poblano con pollo deshebrado y ajonjolí." },
  ],
  "Para acompañar": [
    { name: "Consomé de res (litro)", price: "$80", desc: "Caldo concentrado de res, perfecto para 2-3 personas." },
    { name: "Guacamole", price: "$65", desc: "Guacamole fresco con totopos de la casa." },
    { name: "Agua de horchata (litro)", price: "$45", desc: "Horchata casera con canela y un toque de vainilla." },
    { name: "Refresco de vidrio", price: "$25", desc: "Coca-Cola, Manzanita, Sidral o Sangría." },
  ],
} as const;

export default function Demo1BMenu() {
  return (
    <div className="min-h-screen bg-[#fff8f1] text-neutral-900">
      <QlickBadge />
      <TemplateNav
        brand="Don Carlos"
        tagline="Tacos al carbón · Coyoacán"
        accentColor={ACCENT_DARK}
        links={[
          { label: "Inicio", href: "/diseno-paginas/demo-1b" },
          { label: "Menú", href: "#menu" },
          { label: "Contacto", href: "/diseno-paginas/demo-1b#contacto" },
        ]}
        ctaLabel="Pedir a domicilio"
        ctaHref="/diseno-paginas/demo-1b#contacto"
      />

      {/* ── Hero ── */}
      <section
        id="menu"
        className="relative overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, #fff8f1 0%, #fed7aa 50%, #fdba74 100%)",
        }}
      >
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 sm:py-20 md:grid-cols-2">
          <div>
            <span
              className="inline-block rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em]"
              style={{ backgroundColor: `${ACCENT}22`, color: ACCENT_DARK }}
            >
              Menú completo
            </span>
            <h1 className="mt-4 font-display text-4xl font-bold leading-[1.05] tracking-tight text-neutral-950 sm:text-6xl">
              Todo nuestro{" "}
              <span style={{ color: ACCENT_DARK }}>menú</span>.
            </h1>
            <p className="mt-4 max-w-lg text-lg leading-relaxed text-neutral-800">
              12 tacos diferentes más 4 para acompañar. Todo preparado al momento.
            </p>
          </div>
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[2rem] shadow-xl">
            <Image
              src="/servicios/web/doncarlos-menu.jpg"
              alt="Plato de tacos al carbón servidos con salsas y limones"
              fill
              priority
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover"
            />
          </div>
        </div>
      </section>

      {/* ── Menú por sección ── */}
      <section className="bg-white py-14 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="space-y-14">
            {Object.entries(FULL_MENU).map(([categoria, items]) => (
              <div key={categoria}>
                <h2
                  className="font-display text-2xl font-bold tracking-tight sm:text-3xl"
                  style={{ color: ACCENT_DARK }}
                >
                  {categoria}
                </h2>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  {items.map((item) => (
                    <div
                      key={item.name}
                      className="rounded-2xl border border-neutral-200 bg-[#fff8f1] p-5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-display text-base font-semibold text-neutral-950">
                          {item.name}
                        </h3>
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
          <div className="mt-12 text-center">
            <a
              href="/diseno-paginas/demo-1b#contacto"
              className="inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:opacity-90"
              style={{ backgroundColor: ACCENT_DARK }}
            >
              Pedir por WhatsApp
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
