"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { getCurrentUser, signOut } from "@/lib/auth/mock-auth";
import { isAdminEmail } from "@/lib/auth/admin-auth";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isValidSupabaseUrl } from "@/lib/supabase/config";
import type { User } from "@/types";

const links = [
  { href: "/cursos", label: "Cursos" },
  { href: "/eventos", label: "Eventos" },
  { href: "/acerca", label: "Acerca de" },
  { href: "/beneficios", label: "Beneficios" },
  { href: "/faq", label: "Preguntas" },
  { href: "/contacto", label: "Contacto" }
];

/**
 * Identidad efectiva del usuario para la Navbar.
 *
 * - `kind === "mock"`: usuario demo desde localStorage (modo demo). Solo
 *   detectable client-side — en SSR siempre devolverá `kind === "none"`.
 * - `kind === "supabase-student"`: sesión Supabase real, NO admin.
 * - `kind === "supabase-admin"`: sesión Supabase real, SÍ admin.
 *
 * La Navbar solo necesita saber:
 *   - ¿Hay alguien autenticado?
 *   - ¿Es admin (mostrar botón Admin)?
 *   - ¿Es alumno (mostrar Mi panel)?
 *
 * **SSR-aware:** `initialIdentity` se calcula server-side en
 * `NavbarServer.tsx` (vía `getCurrentStudent` / `getCurrentAdmin`) y se
 * pasa como prop. Esto elimina el flash visual de "Acceso alumnos" →
 * "Mi panel" que ocurría cuando el componente hidrataba con
 * `{kind: "none"}` y luego actualizaba en `useEffect`.
 * Ver bug "flash visual navbar" 2026-06-29.
 */
export type NavbarIdentity =
  | { kind: "none" }
  | { kind: "mock"; user: User }
  | { kind: "supabase-student"; email: string }
  | { kind: "supabase-admin"; email: string };

export function Navbar({ initialIdentity }: { initialIdentity?: NavbarIdentity } = {}) {
  const pathname = usePathname();
  // Si el server component padre calculó la identidad, úsala como estado
  // inicial para evitar el flash de "no authed" antes de hidratar.
  const [identity, setIdentity] = useState<NavbarIdentity>(
    initialIdentity ?? { kind: "none" },
  );

  useEffect(() => {
    let cancelled = false;

    async function resolveIdentity(): Promise<NavbarIdentity> {
      // 1) Si Supabase está configurado, intentamos leer la sesión real.
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
      const publishableKey =
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
        "";
      if (isValidSupabaseUrl(url) && publishableKey) {
        try {
          const supabase = createSupabaseBrowserClient();
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (user && user.email) {
            const email = user.email.trim().toLowerCase();
            if (isAdminEmail(email)) {
              return { kind: "supabase-admin", email };
            }
            return { kind: "supabase-student", email };
          }
        } catch {
          // Caemos al mock.
        }
      }

      // 2) Fallback: mock demo (localStorage).
      const mockUser = getCurrentUser();
      if (mockUser) return { kind: "mock", user: mockUser };
      return { kind: "none" };
    }

    void resolveIdentity().then((id) => {
      if (!cancelled) setIdentity(id);
    });

    // Re-resolver cuando se dispara el evento de cambio de auth (mock).
    const handler = () => {
      void resolveIdentity().then((id) => {
        if (!cancelled) setIdentity(id);
      });
    };
    window.addEventListener("storage", handler);
    window.addEventListener("qlick:auth-change", handler);
    return () => {
      cancelled = true;
      window.removeEventListener("storage", handler);
      window.removeEventListener("qlick:auth-change", handler);
    };
  }, [pathname]);

  const isAuthed = identity.kind !== "none";
  const isAdmin =
    identity.kind === "mock"
      ? identity.user.role === "admin"
      : identity.kind === "supabase-admin";

  const handleSignOut = async () => {
    // Limpia mock local.
    signOut();
    window.dispatchEvent(new Event("qlick:auth-change"));

    // Si Supabase está vivo, también cerramos sesión real.
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
      const publishableKey =
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
        "";
      if (isValidSupabaseUrl(url) && publishableKey) {
        const supabase = createSupabaseBrowserClient();
        await supabase.auth.signOut();
      }
    } catch {
      // Ignorar: lo importante es el redirect.
    }
    window.location.href = "/";
  };

  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-brand-100/70">
      <nav className="mx-auto max-w-7xl px-5 sm:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-10">
          <Logo href="/" lockup="noTagline" height={36} />
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
          {isAuthed ? (
            <>
              {isAdmin && (
                <Button href="/admin" variant="ghost" size="sm">
                  Admin
                </Button>
              )}
              <Button
                href={isAdmin ? "/admin" : "/dashboard"}
                variant="outline"
                size="sm"
              >
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
          onClick={() => setOpenSafeToggle()}
          aria-label="Abrir menú"
        >
          <MenuIcon />
        </button>
      </nav>

      {/* Menú móvil */}
      <MobileMenu
        identity={identity}
        isAdmin={isAdmin}
        onSignOut={handleSignOut}
      />
    </header>
  );
}

/* ----- helpers ----- */

// Toggle simple del menú móvil: alteramos la clase `hidden` del contenedor.
// No usamos useState extra aquí para mantener este Server-Component-friendly.
function setOpenSafeToggle(): void {
  const el = document.getElementById("navbar-mobile-menu");
  if (el) el.classList.toggle("hidden");
}

function MenuIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18M3 12h18M3 18h18" />
    </svg>
  );
}

function MobileMenu({
  identity,
  isAdmin,
  onSignOut,
}: {
  identity: NavbarIdentity;
  isAdmin: boolean;
  onSignOut: () => void;
}) {
  const isAuthed = identity.kind !== "none";
  return (
    <div
      id="navbar-mobile-menu"
      className="hidden md:hidden border-t border-brand-100 bg-white"
    >
      <div className="px-5 py-4 space-y-1">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="block px-3 py-2.5 rounded-xl text-ink-soft hover:bg-brand-50 font-medium"
          >
            {l.label}
          </Link>
        ))}
        <div className="pt-3 flex flex-col gap-2">
          {isAuthed ? (
            <>
              {isAdmin && (
                <Button href="/admin" className="w-full" size="sm">
                  Admin
                </Button>
              )}
              <Button
                href={isAdmin ? "/admin" : "/dashboard"}
                className="w-full"
                size="sm"
              >
                Mi panel
              </Button>
              <button
                onClick={onSignOut}
                className="text-sm text-ink-muted py-2 text-left"
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
  );
}