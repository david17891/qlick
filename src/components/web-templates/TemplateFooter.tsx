type TemplateFooterProps = {
  brand: string;
  tagline?: string;
  description: string;
  address?: string;
  phone?: string;
  email?: string;
  schedule?: string;
  socialLinks?: { label: string; href: string }[];
  accentColor?: string;
};

/**
 * Footer genérico para sitios demo de clientes.
 * Datos ficticios (memoria: datos sintéticos en fixtures/templates).
 */
export function TemplateFooter({
  brand,
  tagline,
  description,
  address,
  phone,
  email,
  schedule,
  socialLinks = [],
  accentColor = "#0f4c4c",
}: TemplateFooterProps) {
  const year = new Date().getFullYear();
  return (
    <footer
      className="border-t border-black/5 bg-neutral-50"
      style={{ borderTopColor: "rgba(0,0,0,0.06)" }}
    >
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-3">
        <div>
          <div
            className="font-display text-xl font-bold tracking-tight"
            style={{ color: accentColor }}
          >
            {brand}
          </div>
          {tagline ? (
            <div className="mt-1 text-xs uppercase tracking-[0.18em] text-neutral-500">
              {tagline}
            </div>
          ) : null}
          <p className="mt-3 text-sm leading-relaxed text-neutral-600">
            {description}
          </p>
        </div>

        <div>
          <h4
            className="text-xs font-semibold uppercase tracking-[0.2em]"
            style={{ color: accentColor }}
          >
            Contacto
          </h4>
          <ul className="mt-3 space-y-2 text-sm text-neutral-700">
            {address ? <li>{address}</li> : null}
            {phone ? <li>{phone}</li> : null}
            {email ? <li>{email}</li> : null}
            {schedule ? <li>{schedule}</li> : null}
          </ul>
        </div>

        <div>
          <h4
            className="text-xs font-semibold uppercase tracking-[0.2em]"
            style={{ color: accentColor }}
          >
            Síguenos
          </h4>
          <ul className="mt-3 space-y-2 text-sm">
            {socialLinks.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="text-neutral-700 underline-offset-4 transition hover:underline"
                >
                  {link.label}
                </a>
              </li>
            ))}
            {socialLinks.length === 0 ? (
              <li className="text-neutral-500">Próximamente</li>
            ) : null}
          </ul>
        </div>
      </div>
      <div className="border-t border-black/5">
        <div className="mx-auto max-w-6xl px-4 py-4 text-xs text-neutral-500 sm:px-6">
          © {year} {brand}. Sitio demo creado por Qlick Marketing Digital.
        </div>
      </div>
    </footer>
  );
}
