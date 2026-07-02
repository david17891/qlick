"use client";

/**
 * Error boundary para `/admin/eventos`.
 *
 * Captura excepciones no manejadas en el render de la lista (p.ej. si
 * Supabase estÃ¡ caÃ­do o RLS bloquea la query).
 *
 * Mismo patrÃ³n que `/aprender/[courseSlug]/[lessonSlug]/error.tsx`.
 * En dev muestra el mensaje real. En prod, fallback genÃ©rico con
 * "Reintentar" + volver al dashboard admin.
 */

import { useEffect } from "react";
import { Container, Card, Button, Badge } from "@/components/ui";
import { Navbar as NavbarClient } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";

export default function AdminEventosError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[/admin/eventos] error boundary capturÃ³:", error);
  }, [error]);

  return (
    <>
      <NavbarClient />
      <main className="min-h-screen bg-brand-50/30 py-10">
        <Container size="wide">
          <div className="max-w-2xl mx-auto">
            <Card className="p-8 text-center">
              <Badge tone="warning">Error</Badge>
              <h1 className="text-2xl font-bold text-ink mt-4">
                No pudimos cargar la lista de eventos
              </h1>
              <p className="text-ink-muted mt-3">
                OcurriÃ³ un problema al consultar Supabase. Esto puede ser
                un bug pasajero o un problema de configuraciÃ³n. ProbÃ¡
                recargar o volvÃ© al dashboard.
              </p>

              {process.env.NODE_ENV !== "production" && error.message && (
                <details className="mt-6 text-left">
                  <summary className="cursor-pointer text-xs font-mono text-ink-muted hover:text-ink">
                    Detalle tÃ©cnico (solo dev)
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
                <Button href="/admin" variant="outline" size="lg">
                  Volver al dashboard
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

