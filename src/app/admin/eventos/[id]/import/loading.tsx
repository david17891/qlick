import { Container, Card, Skeleton } from "@/components/ui";
import { Navbar, Footer } from "@/components/layout";

/**
 * Loading state para `/admin/eventos/[id]/import` (wizard de import xlsx).
 *
 * Aparece mientras Next.js hace `requireAdmin()` + `getEventById()` antes
 * de montar el `ImportWizard` (client component). Skeleton del breadcrumb
 * + título + card del wizard con step indicator + upload area + CTA.
 *
 * El wizard real es client-side (cambia entre pasos por estado interno),
 * así que el skeleton solo refleja el layout estático del primer paso.
 *
 * Mismo patrón que `/admin/eventos/loading.tsx`.
 */
export default function AdminEventImportLoading() {
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-brand-50/30 py-10">
        <Container size="wide">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 mb-4">
            <Skeleton className="h-3 w-20" />
            <span className="text-ink-muted">·</span>
            <Skeleton className="h-3 w-40" />
          </div>

          {/* H1 + descripción */}
          <Skeleton className="h-7 w-96 mb-1" />
          <Skeleton className="h-4 w-2/3 mb-6" />

          {/* Wizard placeholder */}
          <Card className="p-8 space-y-6">
            {/* Step indicator (3 pasos) */}
            <div className="flex items-center justify-center gap-4 mb-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-8 w-8 rounded-full" />
              ))}
            </div>
            {/* Upload area (dropzone) */}
            <Skeleton className="h-40 w-full rounded-xl" />
            {/* Helper text */}
            <Skeleton className="h-4 w-1/2 mx-auto" />
            {/* CTA */}
            <Skeleton className="h-10 w-48 mx-auto rounded-md" />
          </Card>

          <p className="text-center text-ink-muted mt-10 text-sm">
            Cargando wizard de importación…
          </p>
        </Container>
      </main>
      <Footer />
    </>
  );
}