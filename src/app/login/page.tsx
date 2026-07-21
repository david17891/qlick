/**
 * Login de ALUMNOS vía Google OAuth (Supabase Auth) — Fase 6 Hito B.
 *
 * Server Component: renderiza el contenedor visual y delega la lógica de
 * auth al componente cliente `StudentLoginCard`. La verificación de
 * membresía es server-side en `/auth/callback-student` (intercambia el
 * `code` por sesión y redirige a /dashboard si todo OK).
 *
 * Cambios vs v0.8.0:
 * - Google OAuth sigue siendo el método principal (1 click).
 * - Magic link reactivado como fallback visible: el usuario puede elegir
 *   entrar con correo si no quiere usar Google.
 * - Microcopy más orientado a "volver a aprender" que a "login".
 *
 * Diferencias con /admin/login:
 * - NO usamos ADMIN_EMAIL_ALLOWLIST para alumnos. Cualquier cuenta Google
 *   puede entrar; la autorización fina (qué cursos/lecciones) está en RLS
 *   por auth.uid().
 * - El callback es otra ruta (`/auth/callback-student`) para no colisionar
 *   con el callback de admin (`/auth/callback`).
 *
 * UX: minimalista, copy enfocado en el alumno. Trust signals sutiles
 * (badge de seguridad + nota de privacidad).
 */

import type { Metadata } from "next";
import { Navbar, Footer } from "@/components/layout";
import { Container, Card, Badge } from "@/components/ui";
import { Logo } from "@/components/brand";
import { StudentLoginCard } from "./StudentLoginCard";
import { Lock } from "lucide-react";

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
                  <h1 className="text-2xl font-bold text-ink">Bienvenido de vuelta</h1>
                  <p className="text-sm text-ink-muted">
                    Continúa donde lo dejaste.
                  </p>
                </div>
              </div>

              <div className="mb-5">
                <Badge tone="info">
                  <Lock className="h-3 w-3" /> Acceso seguro · sin contraseñas
                </Badge>
              </div>

              <StudentLoginCard />
            </Card>

            {/* Trust strip: refuerza credibilidad sin saturar */}
            <p className="mt-6 text-center text-xs text-ink-muted leading-relaxed">
              Tus datos están protegidos. Nunca compartimos tu correo ni tu
              actividad con terceros.
            </p>
          </div>
        </Container>
      </section>
      <Footer />
    </>
  );
}