"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { getCurrentUser, signOut } from "@/lib/auth/mock-auth";
import type { User } from "@/types";

const links = [
  { href: "/cursos", label: "Cursos" },
  { href: "/acerca", label: "Acerca de" },
  { href: "/beneficios", label: "Beneficios" },
  { href: "/faq", label: "Preguntas" },
  { href: "/contacto", label: "Contacto" }
];

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setUser(getCurrentUser());
    const handler = () => setUser(getCurrentUser());
    window.addEventListener("storage", handler);
    window.addEventListener("qlick:auth-change", handler);
    return () => {
      window.removeEventListener("storage", handler);
      window.removeEventListener("qlick:auth-change", handler);
    };
  }, [pathname]);

  const handleSignOut = () => {
    signOut();
    window.dispatchEvent(new Event("qlick:auth-change"));
    router.push("/");
  };

  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-brand-100/70">
      <nav className="mx-auto max-w-7xl px-5 sm:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-10">
          <Logo href="/" lockup="noTagline" height={34} />
          <ul className="hidden md:flex items-center gap-1">
            {links.map((l) => {
              const active = pathname?.startsWith(l.href);
              return (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className={cn(
                      "px-3 py-2 rounded-full text-sm font-medium transition",
                      active
                        ? "text-brand-700 bg-brand-50"
                        : "text-ink-soft hover:text-brand-700 hover:bg-brand-50/60"
                    )}
                  >
                    {l.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="hidden md:flex items-center gap-2">
          {user ? (
            <>
              {user.role === "admin" && (
                <Button href="/admin" variant="ghost" size="sm">
                  Admin
                </Button>
              )}
              <Button href="/dashboard" variant="outline" size="sm">
                Mi panel
              </Button>
              <button
                onClick={handleSignOut}
                className="text-sm font-medium text-ink-muted hover:text-ink px-3"
              >
                Salir
              </button>
            </>
          ) : (
            <>
              <Button href="/login" variant="ghost" size="sm">
                Acceso alumnos
              </Button>
              <Button href="/cursos" size="sm">
                Empezar ahora
              </Button>
            </>
          )}
        </div>

        {/* Botón menú móvil */}
        <button
          className="md:hidden p-2 -mr-2 text-ink"
          onClick={() => setOpen((v) => !v)}
          aria-label="Abrir menú"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {open ? (
              <path d="M6 6l12 12M18 6L6 18" />
            ) : (
              <path d="M3 6h18M3 12h18M3 18h18" />
            )}
          </svg>
        </button>
      </nav>

      {/* Menú móvil */}
      {open && (
        <div className="md:hidden border-t border-brand-100 bg-white">
          <div className="px-5 py-4 space-y-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="block px-3 py-2.5 rounded-xl text-ink-soft hover:bg-brand-50 font-medium"
              >
                {l.label}
              </Link>
            ))}
            <div className="pt-3 flex flex-col gap-2">
              {user ? (
                <>
                  <Button href="/dashboard" className="w-full" size="sm">
                    Mi panel
                  </Button>
                  <button
                    onClick={() => {
                      handleSignOut();
                      setOpen(false);
                    }}
                    className="text-sm text-ink-muted py-2"
                  >
                    Cerrar sesión
                  </button>
                </>
              ) : (
                <>
                  <Button href="/login" variant="outline" className="w-full" size="sm">
                    Acceso alumnos
                  </Button>
                  <Button href="/cursos" className="w-full" size="sm">
                    Empezar ahora
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
