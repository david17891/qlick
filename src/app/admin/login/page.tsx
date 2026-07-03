"use client";

import { Suspense, useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
// Import directo del client component (no del wrapper SSR) porque esta
// page es "use client". La identidad del Navbar no es relevante en el
// login (siempre es "no authed").
import { Navbar as NavbarClient } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Container, Card, Button, Field, Input, Badge } from "@/components/ui";
import { Logo } from "@/components/brand";
import { requestMagicLinkClient } from "@/lib/auth/admin-auth-client";
import { AdminGoogleLoginButton } from "./AdminGoogleLoginButton";

/**
 * Login admin real (Supabase Auth magic link).
 *
 * Exclusivo para administradores (rol admin). El login de alumnos/instructores
 * sigue siendo el /login mock (D-004). Aquí no se mezclan flujos: un alumno no
 * puede entrar a /admin aunque tenga sesión Supabase, porque el allowlist
 * (ADMIN_EMAIL_ALLOWLIST) lo rechaza en middleware + callback.
 *
 * UX: se pide solo el email; el enlace llega por correo. Anti-enumeración: la
 * action siempre devuelve un mensaje genérico, sin confirmar si el email es
 * admin.
 */
export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <AdminLoginPageInner />
    </Suspense>
  );
}

function AdminLoginPageInner() {
  const params = useSearchParams();
  const forbidden = params.get("error") === "forbidden";
  const expired = params.get("error") === "expired";
  const callbackErr = params.get("error") === "callback";
  const serverError = forbidden || expired || callbackErr;

  // FIX 2026-07-03 (sesion David): respetar returnUrl para volver a la
  // URL original despues del login (no siempre a /admin). Sanitize: solo
  // paths internos que empiecen con /admin/ (no URLs absolutas, no //).
  const rawReturn = params.get("returnUrl");
  const returnUrl =
    rawReturn &&
    rawReturn.startsWith("/admin/") &&
    !rawReturn.startsWith("//") &&
    !rawReturn.includes("://")
      ? rawReturn
      : undefined;

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [resultNote, setResultNote] = useState<string | null>(() => {
    if (forbidden) return "Tu cuenta no está autorizada como administradora.";
    if (expired) return "El enlace ha expirado. Pide uno nuevo.";
    if (callbackErr) return "Error al procesar el enlace. Intenta de nuevo.";
    return null;
  });
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!serverError) setResultNote(null);
  }, [email, serverError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setResultNote(null);
    try {
      const result = await requestMagicLinkClient(email, { returnUrl });
      setResultNote(result.note);
      setSent(result.sent);
    } catch {
      setResultNote("Ocurrió un error inesperado. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <NavbarClient />
      <section className="bg-brand-50/40 min-h-[calc(100vh-4rem)]">
        <Container className="py-14">
          <div className="max-w-md mx-auto">
            <Card className="p-8">
              <div className="flex items-center gap-3 mb-6">
                <Logo lockup="icon" height={36} />
                <div>
                  <h1 className="text-2xl font-bold text-ink">Acceso admin</h1>
                  <p className="text-sm text-ink-muted">
                    Panel administrativo de Qlick.
                  </p>
                </div>
              </div>

              <div className="mb-5">
                <Badge tone="info">Acceso restringido · personal autorizado</Badge>
              </div>

              {/* Google OAuth — TEMPORAL 2026-06-29.
                  Para entrar más rápido que esperar el magic link. Cuando se
                  retire, eliminar este bloque + AdminGoogleLoginButton.tsx.
                  El callback /auth/callback sigue validando ADMIN_EMAIL_ALLOWLIST,
                  así que solo funciona para emails autorizados (david17891@gmail.com). */}
              <div className="mb-5">
                <AdminGoogleLoginButton returnUrl={returnUrl} />
              </div>

              <div className="relative my-5">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-brand-100" />
                </div>
                <div className="relative flex justify-center text-xs uppercase tracking-wide">
                  <span className="bg-white px-3 text-ink-muted">o</span>
                </div>
              </div>

              {!sent ? (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <Field
                    label="Email administrativo"
                    htmlFor="email"
                    hint="Te enviaremos un enlace mágico a tu correo."
                  >
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      placeholder="admin@qlick.mx"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </Field>

                  <Button type="submit" size="lg" className="w-full" disabled={loading}>
                    {loading ? "Enviando enlace..." : "Enviar enlace mágico"}
                  </Button>
                </form>
              ) : (
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-4 text-sm text-emerald-800">
                  <p className="font-semibold mb-1">Revisa tu correo</p>
                  <p>{resultNote}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setSent(false);
                      setEmail("");
                    }}
                    className="mt-3 text-xs font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800"
                  >
                    Usar otro correo
                  </button>
                </div>
              )}

              {resultNote && !sent && !serverError && (
                <p className="mt-4 text-xs text-red-600 bg-red-50 rounded-lg p-2">
                  {resultNote}
                </p>
              )}

              {serverError && !sent && (
                <p className="mt-4 text-xs text-red-600 bg-red-50 rounded-lg p-2">{resultNote}</p>
              )}

              <p className="mt-6 text-sm text-ink-muted text-center">
                ¿Eres alumno?{" "}
                <Link href="/login" className="font-semibold text-brand-600 hover:underline">
                  Acceso alumnos
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
