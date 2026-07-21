"use client";

import { useState } from "react";

type NavLink = { label: string; href: string };

type TemplateNavProps = {
  brand: string;
  tagline?: string;
  links: NavLink[];
  accentColor?: string;
  ctaLabel?: string;
  ctaHref?: string;
};

/**
 * Nav genérico para sitios demo de clientes. Transparente sobre hero,
 * sólido al hacer scroll. Mobile-first con menú hamburguesa.
 */
export function TemplateNav({
  brand,
  tagline,
  links,
  accentColor = "#0f4c4c",
  ctaLabel,
  ctaHref,
}: TemplateNavProps) {
  const [open, setOpen] = useState(false);

  return (
    <nav
      className="sticky top-0 z-40 w-full border-b border-black/5 bg-white/90 backdrop-blur"
      aria-label="Navegación principal"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <a
          href="#top"
          className="flex items-baseline gap-2"
          style={{ color: accentColor }}
        >
          <span className="font-display text-xl font-bold tracking-tight sm:text-2xl">
            {brand}
          </span>
          {tagline ? (
            <span className="hidden text-[10px] uppercase tracking-[0.18em] text-neutral-500 sm:inline">
              {tagline}
            </span>
          ) : null}
        </a>

        <div className="hidden items-center gap-7 md:flex">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-neutral-700 transition hover:text-neutral-950"
            >
              {link.label}
            </a>
          ))}
          {ctaLabel && ctaHref ? (
            <a
              href={ctaHref}
              className="rounded-full px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
              style={{ backgroundColor: accentColor }}
            >
              {ctaLabel}
            </a>
          ) : null}
        </div>

        <button
          type="button"
          className="inline-flex items-center justify-center rounded-md p-2 text-neutral-800 md:hidden"
          onClick={() => setOpen((prev) => !prev)}
          aria-label="Abrir menú"
          aria-expanded={open}
        >
          <svg
            viewBox="0 0 24 24"
            className="h-6 w-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            {open ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 6l12 12M6 18L18 6"
              />
            ) : (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 7h16M4 12h16M4 17h16"
              />
            )}
          </svg>
        </button>
      </div>

      {open ? (
        <div className="border-t border-black/5 bg-white md:hidden">
          <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-md px-3 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
                onClick={() => setOpen(false)}
              >
                {link.label}
              </a>
            ))}
            {ctaLabel && ctaHref ? (
              <a
                href={ctaHref}
                className="mt-2 rounded-full px-4 py-2 text-center text-sm font-semibold text-white"
                style={{ backgroundColor: accentColor }}
                onClick={() => setOpen(false)}
              >
                {ctaLabel}
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </nav>
  );
}
