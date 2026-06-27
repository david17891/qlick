"use client";

/**
 * Error boundary para `/admin/eventos/[id]`.
 *
 * Mismo patrón que `/admin/eventos/error.tsx` y
 * `/aprender/[courseSlug]/[lessonSlug]/error.tsx`.
 */

import { useEffect } from "react";
import { Container, Card, Button, Badge } from "@/components/ui";
import { Navbar, Footer } from "@/components/layout";

export default function AdminEventoDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[/admin/eventos/[id]] error boundary capturó:", error);
  }, [error]);

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-brand-50/30 py-10">
        <Container size="wide">
          <div className="max-w-2xl mx-auto">
            <Card className="p-8 text-center">
              <Badge tone="warning">Error</Badge>
              <h1 className="text-2xl font-bold text-ink mt-4">
                No pudimos cargar este evento
              </h1>
              <p className="text-ink-muted mt-3">
                El evento puede no existir o Supabase puede estar caído.
                Probá recargar o volvé a la lista de eventos.
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
                <Button href="/admin/eventos" variant="outline" size="lg">
                  Volver a la lista
                </Button>
              </div>
            </Card>
          </div>
        </Container>
      </main>
      <Footer />
    </>
  );
}
