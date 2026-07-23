"use client";

/**
 * Error boundary para `/cursos/[slug]`.
 *
 * Si el render del detalle del curso tira una excepción (p.ej. la falla
 * de hidratación de checkCourseAccess que vimos en sesiones anteriores),
 * Next.js renderiza este componente en lugar de la pantalla en blanco.
 *
 * En desarrollo muestra el mensaje real del error (aparece en
 * `error.digest` y `error.message`). En producción se muestra un mensaje
 * genérico con un botón "Reintentar" que llama a `reset()`.
 */

import { useEffect } from "react";
import Link from "next/link";
import { Container, Card, Button, Badge } from "@/components/ui";
import { Navbar as NavbarClient } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";

export default function CourseDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[cursos/[slug]] error boundary capturó:", error);
  }, [error]);

  return (
    <>
      <NavbarClient />
      <section className="bg-brand-50/40 min-h-[calc(100vh-4rem)]">
        <Container className="py-14">
          <div className="max-w-2xl mx-auto">
            <Card className="p-8 text-center">
              <Badge tone="warning">Error</Badge>
              <h1 className="text-2xl font-bold text-ink mt-4">
                No pudimos cargar este curso
              </h1>
              <p className="text-ink-muted mt-3">
                Ocurrió un problema al renderizar la página. Esto puede ser
                un bug pasajero. Prueba recargar o vuelve al catálogo.
              </p>

              {process.env.NODE_ENV !== "production" && error.message && (
                <details className="mt-6 text-left">
                  <summary className="cursor-pointer text-xs font-mono text-ink-muted hover:text-ink">
                    Detalle técnico (solo dev)
                  </summary>
                  <pre className="mt-2 p-3 bg-brand-50 rounded-lg text-xs text-ink-soft overflow-x-auto whitespace-pre-wrap">
                    {error.message}
                    {error.digest ? `\n\ndigest: ${error.digest}` : ""}
                  </pre>
                </details>
              )}

              <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
                <Button onClick={reset} size="lg">
                  Reintentar
                </Button>
                <Button href="/cursos" variant="outline" size="lg">
                  Volver al catálogo
                </Button>
              </div>
            </Card>
          </div>
        </Container>
      </section>
      <Footer />
    </>
  );
}
