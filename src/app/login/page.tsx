/**
 * Login de ALUMNOS vía Google OAuth (Supabase Auth).
 *
 * Server Component: renderiza el botón de Google (Client Component
 * OAuthLoginForm) que dispara `signInWithOAuth` en el navegador. La
 * verificación de membresía es server-side en `/auth/callback-student`
 * (intercambia el `code` por sesión y redirige a /dashboard si todo OK).
 *
 * Diferencias con /admin/login:
 * - NO usamos ADMIN_EMAIL_ALLOWLIST para alumnos. Cualquier cuenta Google
 *   puede entrar; la autorización fina (qué cursos/lecciones) está en RLS
 *   por auth.uid().
 * - El callback es otra ruta (`/auth/callback-student`) para no colisionar
 *   con el callback de admin (`/auth/callback`).
 *
 * Magic link quedó deprecated en v0.8.0. Ver `MagicLinkForm.tsx` (sin
 * importar) si se necesita volver atrás.
 *
 * UX: minimalista, copy enfocado en el alumno ("Continúa aprendiendo").
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Navbar, Footer } from "@/components/layout";
import { Container, Card, Badge } from "@/components/ui";
import { Logo } from "@/components/brand";
import { OAuthLoginForm } from "./OAuthLoginForm";

export const metadata: Metadata = {
  title: "Acceso alumnos",
  description: "Entra a tu panel para continuar aprendiendo.",
  alternates: { canonical: "/login" },
};

export default function StudentLoginPage() {
  return (
    <>
      <Navbar />
      <section className="bg-brand-50/40 min-h-[calc(100vh-4rem)]">
        <Container className="py-14">
          <div className="max-w-md mx-auto">
            <Card className="p-8">
              <div className="flex items-center gap-3 mb-6">
                <Logo lockup="icon" height={36} />
                <div>
                  <h1 className="text-2xl font-bold text-ink">Acceso alumnos</h1>
                  <p className="text-sm text-ink-muted">
                    Continúa aprendiendo donde lo dejaste.
                  </p>
                </div>
              </div>

              <div className="mb-5">
                <Badge tone="info">
                  Acceso con tu cuenta Google · un toque y adentro
                </Badge>
              </div>

              <OAuthLoginForm />

              <p className="mt-6 text-sm text-ink-muted text-center">
                ¿Eres administrador?{" "}
                <Link
                  href="/admin/login"
                  className="font-semibold text-brand-600 hover:underline"
                >
                  Acceso admin
                </Link>
              </p>
              <p className="mt-2 text-xs text-ink-muted text-center">
                ¿Aún no tienes cuenta?{" "}
                <Link
                  href="/cursos"
                  className="font-semibold text-brand-600 hover:underline"
                >
                  Explora los cursos
                </Link>
              </p>
            </Card>
          </div>
        </Container>
      </section>
      <Footer />
    </>
  );
}