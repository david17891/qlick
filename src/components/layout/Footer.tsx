import Link from "next/link";
import { BrandLockup } from "@/components/brand";
import { Container } from "@/components/ui";

const cols = [
  {
    title: "Plataforma",
    links: [
      { href: "/cursos", label: "Cursos" },
      { href: "/eventos", label: "Eventos" },
      { href: "/dashboard", label: "Mi panel" },
      { href: "/login", label: "Acceso alumnos" }
    ]
  },
  {
    title: "Empresa",
    links: [
      { href: "/acerca", label: "Acerca de Qlick" },
      { href: "/beneficios", label: "Beneficios" },
      { href: "/contacto", label: "Contacto" },
      { href: "/privacidad", label: "Aviso de Privacidad" }
    ]
  },
  {
    title: "Soporte",
    links: [
      { href: "/faq", label: "Preguntas frecuentes" },
      { href: "/contacto", label: "Ayuda" },
      { href: "/admin", label: "Admin" }
    ]
  }
];

export function Footer() {
  return (
    <footer className="bg-ink text-white/80">
      <Container size="wide" className="py-14">
        <div className="grid gap-10 md:grid-cols-4">
          <div className="space-y-4">
            <BrandLockup href="/" variant="dark" showTagline size="md" />
            <p className="text-sm text-white/60 max-w-xs">
              Formación práctica en marketing, ventas, publicidad y automatización
              para hacer crecer negocios en México.
            </p>
          </div>
          {cols.map((c) => (
            <div key={c.title}>
              <h4 className="text-white font-semibold mb-3 text-sm">{c.title}</h4>
              <ul className="space-y-2">
                {c.links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="text-sm text-white/70 hover:text-brand-300 transition"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 pt-6 border-t border-white/10 flex flex-col sm:flex-row gap-3 justify-between text-xs text-white/50">
          <p>
            © {new Date().getFullYear()} Qlick. Hecho en México.
          </p>
          <p>
            Plataforma educativa — MVP con datos de demostración. Pagos simulados.
          </p>
        </div>
      </Container>
    </footer>
  );
}
