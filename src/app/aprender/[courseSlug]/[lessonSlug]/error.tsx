"use client";

/**
 * Error boundary para `/aprender/[courseSlug]/[lessonSlug]`.
 *
 * Mismo patrón que `src/app/cursos/[slug]/error.tsx`. Captura excepciones
 * no manejadas en el render de la lección (p.ej. si una migración del LMS
 * rompe el lookup de enrollment o el flat lessons).
 *
 * En dev muestra el mensaje real. En prod, fallback genérico con "Reintentar".
 */

import { useEffect } from "react";
import Link from "next/link";
import { Container, Card, Button, Badge } from "@/components/ui";
import { Navbar, Footer } from "@/components/layout";

export default function LessonError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[aprender/[courseSlug]/[lessonSlug]] error boundary capturó:", error);
  }, [error]);

  return (
    <>
      <Navbar />
      <section className="bg-brand-50/40 min-h-[calc(100vh-4rem)]">
        <Container className="py-14">
          <div className="max-w-2xl mx-auto">
            <Card className="p-8 text-center">
              <Badge tone="warning">Error</Badge>
              <h1 className="text-2xl font-bold text-ink mt-4">
                No pudimos cargar esta lección
              </h1>
              <p className="text-ink-muted mt-3">
                Ocurrió un problema al renderizar la lección. Esto puede
                ser un bug pasajero. Probá recargar o volvé al dashboard.
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
                <Button href="/dashboard" variant="outline" size="lg">
                  Volver al dashboard
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
