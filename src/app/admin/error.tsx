"use client";

/**
 * Error boundary global para `/admin/**` (cubre cualquier pagina
 * del panel administrativo). Mismo patron que otros error.tsx del
 * repo: mensaje claro + detalle tecnico solo en dev + reintentar +
 * volver a una ruta segura.
 */

import { useEffect } from "react";
import { Container, Card, Button, Badge } from "@/components/ui";
import { Navbar as NavbarClient } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log SIN PII: solo message + digest. Stack solo en dev (el
    // navegador ya lo muestra en la consola de devtools).
    // eslint-disable-next-line no-console
    console.error("[/admin] error boundary capturo:", {
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  return (
    <>
      <NavbarClient />
      <main className="min-h-screen bg-brand-50/30 py-10">
        <Container size="wide">
          <div className="max-w-2xl mx-auto">
            <Card className="p-8 text-center">
              <Badge tone="danger">Error</Badge>
              <h1 className="text-2xl font-bold text-ink mt-4">
                Algo salio mal
              </h1>
              <p className="text-ink-muted mt-3">
                El panel administrativo tuvo un error. Puede ser un problema
                con Supabase, con la sesion, o con un evento que ya no existe.
                Reintenta o vuelve al panel principal.
              </p>

              {process.env.NODE_ENV !== "production" && error.message && (
                <details className="mt-6 text-left">
                  <summary className="cursor-pointer text-xs font-mono text-ink-muted hover:text-ink">
                    Detalle tecnico (solo dev)
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
                  Ir al panel
                </Button>
              </div>

              <p className="mt-6 text-xs text-ink-muted">
                Si el error persiste, contacta al equipo tecnico con el
                <code className="mx-1 px-1.5 py-0.5 bg-brand-50 rounded text-[10px]">
                  digest
                </code>
                de arriba (en dev) o el mensaje que veas.
              </p>
            </Card>
          </div>
        </Container>
      </main>
      <Footer />
    </>
  );
}

