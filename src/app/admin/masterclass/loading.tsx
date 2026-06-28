import { Container, Card, Skeleton } from "@/components/ui";
import { Navbar, Footer } from "@/components/layout";

/**
 * Loading state para `/admin/masterclass` (lista).
 *
 * Aparece mientras Next.js hace el fetch de `getAdminMasterclasses()`.
 * Skeleton del header (breadcrumb + h1 + summary) + grid de 3 cards.
 *
 * Mismo patrón que `/admin/eventos/loading.tsx`.
 */
export default function AdminMasterclassListLoading() {
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-brand-50/30 py-10">
        <Container size="wide">
          {/* Header: breadcrumb + h1 + summary */}
          <div className="mb-6 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-8 w-72" />
            <Skeleton className="h-4 w-80" />
          </div>

          {/* Card grid (masterclasses) */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-5 flex flex-col">
                <div className="flex items-center justify-between mb-2">
                  <Skeleton className="h-5 w-20 rounded-full" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <Skeleton className="h-6 w-3/4 mb-2" />
                <Skeleton className="h-4 w-full mb-1" />
                <Skeleton className="h-4 w-2/3 mb-4" />
                <div className="grid grid-cols-3 gap-2 mt-auto">
                  {[1, 2, 3].map((j) => (
                    <Skeleton key={j} className="h-14" />
                  ))}
                </div>
                <Skeleton className="h-9 w-full mt-4 rounded-full" />
              </Card>
            ))}
          </div>

          <p className="text-center text-ink-muted mt-10 text-sm">
            Cargando masterclasses…
          </p>
        </Container>
      </main>
      <Footer />
    </>
  );
}