/**
 * Login de ALUMNOS vía Supabase Auth magic link.
 *
 * Server Component: renderiza un form (Client Component MagicLinkForm) que
 * dispara `signInWithOtp` en el navegador. La verificación de membership es
 * server-side en `/auth/callback-student` (intercambia el `code` por sesión y
 * redirige a /dashboard si todo OK).
 *
 * Diferencias con /admin/login:
 * - NO usamos ADMIN_EMAIL_ALLOWLIST. Cualquier email puede pedir un enlace.
 *   El rol "student" no requiere allowlist: la autorización fina (qué
 *   cursos/lecciones) está en RLS por auth.uid().
 * - El callback es otra ruta (`/auth/callback-student`) para no colisionar
 *   con el callback de admin (`/auth/callback`).
 *
 * UX: minimalista, copy enfocado en el alumno ("Continúa aprendiendo").
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Navbar, Footer } from "@/components/layout";
import { Container, Card, Badge } from "@/components/ui";
import { Logo } from "@/components/brand";
import { MagicLinkForm } from "./MagicLinkForm";

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
                  Acceso sin contraseña · enlace mágico a tu correo
                </Badge>
              </div>

              <Suspense fallback={null}>
                <MagicLinkForm />
              </Suspense>

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