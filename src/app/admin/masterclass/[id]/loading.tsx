import { Container, Card, Skeleton } from "@/components/ui";
import { Navbar, Footer } from "@/components/layout";

/**
 * Loading state para `/admin/masterclass/[id]` (detalle).
 *
 * Aparece mientras Next.js hace el fetch de `getAdminMasterclassById()` +
 * `getRegistrationsByMasterclass()` en paralelo. Skeleton del breadcrumb +
 * header card (badge, título, fechas, 4 metric boxes) + card de Registrados
 * con 3 filas placeholder.
 *
 * Mismo patrón que `/admin/eventos/[id]/loading.tsx`.
 */
export default function AdminMasterclassDetailLoading() {
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-brand-50/30 py-10">
        <Container size="wide">
          {/* Breadcrumb */}
          <Skeleton className="h-3 w-32 mb-4" />

          {/* Header card */}
          <Card className="p-6 mb-6">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="space-y-2 flex-1">
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-7 w-72" />
                <Skeleton className="h-4 w-96" />
              </div>
              <Skeleton className="h-3 w-40" />
            </div>
            <div className="flex flex-wrap gap-4 mb-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-32" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-5 border-t border-brand-100">
              {[1, 2, 3, 4].map((i) => (
                <div key={i}>
                  <Skeleton className="h-3 w-20 mb-1" />
                  <Skeleton className="h-8 w-12" />
                </div>
              ))}
            </div>
          </Card>

          {/* Registrados card */}
          <Card className="overflow-hidden">
            <div className="p-5 border-b border-brand-50">
              <Skeleton className="h-5 w-32" />
            </div>
            <ul className="divide-y divide-brand-50">
              {[1, 2, 3].map((i) => (
                <li key={i} className="p-5 space-y-3">
                  <div className="space-y-1">
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="h-4 w-72" />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Skeleton className="h-5 w-24 rounded-full" />
                    <Skeleton className="h-5 w-28 rounded-full" />
                    <Skeleton className="h-5 w-32 rounded-full" />
                  </div>
                  <Skeleton className="h-9 w-64 rounded-md" />
                </li>
              ))}
            </ul>
          </Card>

          <p className="text-center text-ink-muted mt-10 text-sm">
            Cargando detalle de masterclass…
          </p>
        </Container>
      </main>
      <Footer />
    </>
  );
}