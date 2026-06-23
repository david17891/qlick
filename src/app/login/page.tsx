"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Navbar, Footer } from "@/components/layout";
import { Container, Card, Button, Field, Input, Badge } from "@/components/ui";
import { Logo } from "@/components/brand";
import { signIn } from "@/lib/auth/mock-auth";
import type { UserRole } from "@/types";

const demoAccounts: { email: string; role: UserRole; label: string; desc: string }[] = [
  { email: "alumno@qlick.com", role: "student", label: "Alumno", desc: "Ve tu panel y avanza cursos" },
  { email: "admin@qlick.com", role: "admin", label: "Admin", desc: "Gestiona cursos y alumnos" },
  { email: "instructor@qlick.com", role: "instructor", label: "Instructor", desc: "Crea y administra contenido" }
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setError(null);
  }, [email, password]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    // Simulamos un pequeño delay para que se sienta como login real.
    setTimeout(() => {
      const result = signIn(email, password);
      setLoading(false);
      if (!result.ok || !result.user) {
        setError(result.error ?? "No se pudo iniciar sesión.");
        return;
      }
      window.dispatchEvent(new Event("qlick:auth-change"));
      const role = result.user.role;
      router.push(role === "admin" ? "/admin" : role === "instructor" ? "/dashboard" : "/dashboard");
    }, 350);
  };

  const fillDemo = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword("qlick1234");
    setError(null);
  };

  return (
    <>
      <Navbar />
      <section className="bg-brand-50/40 min-h-[calc(100vh-4rem)]">
        <Container className="py-14">
          <div className="grid lg:grid-cols-2 gap-10 items-start max-w-5xl mx-auto">
            {/* Formulario */}
            <Card className="p-8">
              <div className="flex items-center gap-3 mb-6">
                <Logo lockup="icon" height={36} />
                <div>
                  <h1 className="text-2xl font-bold text-ink">Acceso alumnos</h1>
                  <p className="text-sm text-ink-muted">
                    Inicia sesión para continuar aprendiendo.
                  </p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <Field label="Email" htmlFor="email">
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="tu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </Field>
                <Field label="Contraseña" htmlFor="password" hint="Demo: la contraseña es qlick1234">
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </Field>

                {error && (
                  <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <Button type="submit" size="lg" className="w-full" disabled={loading}>
                  {loading ? "Entrando..." : "Entrar"}
                </Button>
              </form>

              <p className="mt-6 text-sm text-ink-muted text-center">
                ¿No tienes cuenta?{" "}
                <Link href="/cursos" className="font-semibold text-brand-600 hover:underline">
                  Explora los cursos
                </Link>
              </p>
            </Card>

            {/* Demo accounts */}
            <div>
              <Badge tone="warning" className="mb-3">
                ⚠️ Modo demo
              </Badge>
              <h2 className="text-xl font-bold text-ink mb-1">
                Cuentas de demostración
              </h2>
              <p className="text-sm text-ink-muted mb-5">
                Este es un MVP con autenticación simulada (no real). Haz clic en
                una cuenta para autocompletar y entrar:
              </p>
              <div className="space-y-3">
                {demoAccounts.map((a) => (
                  <button
                    key={a.email}
                    onClick={() => fillDemo(a.email)}
                    className="w-full text-left rounded-xl border border-brand-100 bg-white p-4 hover:border-brand-300 hover:shadow-card transition"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-bold text-ink">{a.label}</p>
                        <p className="text-sm text-ink-muted">{a.desc}</p>
                      </div>
                      <span className="text-xs font-mono text-brand-600">{a.email}</span>
                    </div>
                  </button>
                ))}
              </div>
              <Card className="mt-5 p-4 bg-brand-50/50 border-brand-100">
                <p className="text-xs text-ink-muted">
                  <strong className="text-ink-soft">Seguridad:</strong> en producción
                  la autenticación se maneja con Supabase Auth (hashes, sesiones y
                  OAuth). Esta versión solo es para recorrer la plataforma.
                </p>
              </Card>
            </div>
          </div>
        </Container>
      </section>
      <Footer />
    </>
  );
}
