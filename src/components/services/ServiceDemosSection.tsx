import { Container, Card, Badge, LucideIcon } from "@/components/ui";
import {
  Camera,
  Utensils,
  Stethoscope,
  Scale,
  ArrowUpRight,
} from "lucide-react";
import Link from "next/link";

/**
 * Sección "Portafolio" para `/servicios/sitio-web` (David feedback
 * 2026-07-21: "yo quiero que sitio web express me mande a lo que eran
 * las páginas" → mostrar los 4 demos legacy como ejemplos del trabajo
 * de Qlick antes de contratar).
 *
 * Server Component (sin estado, no necesita 'use client'). Los demos
 * siguen accesibles por URL directa (`/diseno-paginas/demo-1a` etc.) —
 * no se mueven, no se rompe nada.
 *
 * Hardcoded por ahora: 4 demos fijos. Si en el futuro David agrega más,
 * mover a DB con `service_demos` table + relación N:M con services.
 */
const DEMOS = [
  {
    slug: "demo-1a",
    name: "Lumière",
    icon: Camera,
    type: "Estudio de fotografía",
    description:
      "Tu portafolio en línea. 5 secciones, formulario de contacto, botón directo a WhatsApp para reservar sesiones.",
    accent: "from-brand-700 to-brand-500",
  },
  {
    slug: "demo-1b",
    name: "Don Carlos",
    icon: Utensils,
    type: "Menú digital para restaurante",
    description:
      "El menú de tu restaurante en el celular del cliente. Sin PDFs, sin WhatsApp reenviado 20 veces.",
    accent: "from-amber-600 to-amber-400",
  },
  {
    slug: "demo-2a",
    name: "Sonrisa Plus",
    icon: Stethoscope,
    type: "Clínica dental",
    description:
      "Página para captar pacientes: servicios, equipo médico, blog de salud, formulario de primera cita.",
    accent: "from-sky-600 to-sky-400",
  },
  {
    slug: "demo-2b",
    name: "Bufete Mendoza",
    icon: Scale,
    type: "Despacho de abogados",
    description:
      "Página seria para captar clientes corporativos. Áreas de práctica, equipo, blog jurídico, formulario confidencial.",
    accent: "from-slate-700 to-slate-500",
  },
];

export function ServiceDemosSection() {
  return (
    <section className="py-14 sm:py-20 bg-brand-50/30 border-y border-brand-100">
      <Container size="wide">
        <div className="mx-auto max-w-2xl text-center mb-10">
          <Badge tone="brand" className="mb-4">Trabajo real</Badge>
          <h2 className="display-2 text-ink">Esto es lo que hacemos</h2>
          <p className="mt-4 text-lg text-ink-soft">
            4 sitios publicados. Mismos paquetes, mismo flujo. Abrí cada
            uno para ver el resultado final.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {DEMOS.map((d) => {
            const IconComponent = d.icon;
            return (
              <Link
                key={d.slug}
                href={`/diseno-paginas/${d.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group block"
                aria-label={`Ver el sitio de ${d.name} (${d.type})`}
              >
                <Card className="h-full overflow-hidden transition group-hover:shadow-md group-hover:border-brand-300">
                  {/* Header con gradiente + icon */}
                  <div
                    className={`bg-gradient-to-br ${d.accent} p-6 flex items-center justify-center`}
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                      <LucideIcon
                        icon={IconComponent}
                        size="lg"
                        className="text-white"
                      />
                    </div>
                  </div>
                  <div className="p-5">
                    <h3 className="font-display text-lg font-bold text-ink">
                      {d.name}
                    </h3>
                    <p className="text-xs text-ink-muted mt-0.5">{d.type}</p>
                    <p className="mt-3 text-sm text-ink-soft line-clamp-3">
                      {d.description}
                    </p>
                    <div className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 group-hover:gap-2 transition-all">
                      Ver sitio
                      <LucideIcon
                        icon={ArrowUpRight}
                        size="sm"
                        className="text-brand-600"
                      />
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
