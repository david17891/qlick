"use client";

/**
 * Error boundary RAÍZ para toda la app.
 *
 * Captura excepciones no manejadas en cualquier route segment que NO tenga
 * su propio `error.tsx`. Es la red de seguridad final:
 *
 * - Si un `error.tsx` específico (ej. /cursos/[slug]/error.tsx) maneja el
 *   error → ese se renderiza, este nunca se ve.
 * - Si el error escapa de un segmento sin boundary (ej. metadata function
 *   que throwea, o un componente en el layout) → este error boundary lo
 *   agarra y muestra el fallback.
 * - Si el error es en el root layout mismo → necesitaríamos `global-error.tsx`,
 *   pero el layout actual es trivial (no hay providers que puedan fallar).
 *
 * El objetivo de tener esto: NUNCA pantalla blanca por un error no capturado.
 * Si el user ve blanco, es un bug del runtime, no un feature.
 *
 * En dev muestra el mensaje real. En prod, fallback genérico con "Reintentar".
 */

import { useEffect } from "react";
import Link from "next/link";
import { Container, Card, Button, Badge } from "@/components/ui";
// Imports directos (sin pasar por `layout/index.ts`) para NO arrastrar el
// server component NavbarServer al bundle del client error boundary.
// En `error.tsx` (client component) no podemos usar server components
// que lean `next/headers`. Acá no necesitamos la identidad SSR — el
// client component hidratará con identity vacío y resolverá vía
// useEffect si corresponde.
import { Navbar as NavbarClient } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[root error boundary] capturó:", error);
  }, [error]);

  return (
    <>
      <NavbarClient />
      <section className="bg-brand-50/40 min-h-[calc(100vh-4rem)]">
        <Container className="py-14">
          <div className="max-w-2xl mx-auto">
            <Card className="p-8 text-center">
              <Badge tone="danger">Error inesperado</Badge>
              <h1 className="text-2xl font-bold text-ink mt-4">
                Algo se rompió en la plataforma
              </h1>
              <p className="text-ink-muted mt-3">
                Capturamos un error no manejado. El equipo ya fue notificado
                (en dev, mirá la consola). Probá recargar o volvé al inicio.
              </p>

              {process.env.NODE_ENV !== "production" && error.message && (
                <details className="mt-6 text-left">
                  <summary className="cursor-pointer text-xs font-mono text-ink-muted hover:text-ink">
                    Detalle técnico (solo dev)
                  </summary>
                  <pre className="mt-2 p-3 bg-brand-50 rounded-lg text-xs text-ink-soft overflow-x-auto whitespace-pre-wrap">
                    {error.message}
                    {error.digest ? `\n\ndigest: ${error.digest}` : ""}
                    {error.stack ? `\n\n${error.stack.split("\n").slice(0, 10).join("\n")}` : ""}
                  </pre>
                </details>
              )}

              <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
                <Button onClick={reset} size="lg">
                  Reintentar
                </Button>
                <Button href="/" variant="outline" size="lg">
                  Volver al inicio
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
