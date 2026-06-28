import { Container, Card, Skeleton } from "@/components/ui";
import { Navbar, Footer } from "@/components/layout";

/**
 * Loading state para `/admin` (AdminView).
 *
 * Aparece mientras Next.js hace el fetch de `getCurrentUser()` + `isSupabaseConfigured()`
 * en el useEffect del AdminView. Skeleton del header + tabs + (Resumen) 4 stat cards +
 * 2 cards de Top cursos / Estado pagos, así cuando llega el contenido real el cambio
 * se ve continuo y no un flash a página en blanco.
 *
 * Mismo patrón que `/admin/eventos/loading.tsx` y `/admin/eventos/[id]/loading.tsx`.
 */
export default function AdminLoading() {
  return (
    <>
      <Navbar />
      <Container size="wide" className="py-10">
        {/* Header: saludo + badge de rol */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-8 w-72" />
          </div>
          <Skeleton className="h-7 w-20 rounded-full" />
        </div>

        {/* Tabs (7 tabs + 2 links a masterclass/eventos) */}
        <div className="flex flex-wrap items-center gap-2 mb-8 border-b border-brand-100 pb-3">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <Skeleton key={i} className="h-9 w-24 rounded-full" />
          ))}
          <Skeleton className="h-9 w-36 rounded-full ml-auto" />
          <Skeleton className="h-9 w-24 rounded-full" />
        </div>

        {/* Stat cards (Resumen tab) */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="p-5">
              <Skeleton className="h-3 w-20 mb-2" />
              <Skeleton className="h-7 w-24 mb-1" />
              <Skeleton className="h-3 w-32" />
            </Card>
          ))}
        </div>

        {/* Top cursos + Estado pagos */}
        <div className="grid lg:grid-cols-2 gap-6">
          <Card className="p-6">
            <Skeleton className="h-5 w-48 mb-4" />
            <ul className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <li key={i} className="flex items-center justify-between">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-6 w-20 rounded-full" />
                </li>
              ))}
            </ul>
          </Card>
          <Card className="p-6">
            <Skeleton className="h-5 w-56 mb-4" />
            <ul className="space-y-3">
              {[1, 2, 3].map((i) => (
                <li key={i} className="flex items-center justify-between">
                  <Skeleton className="h-6 w-20 rounded-full" />
                  <Skeleton className="h-5 w-8" />
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <p className="text-center text-ink-muted mt-10 text-sm">
          Cargando panel…
        </p>
      </Container>
      <Footer />
    </>
  );
}