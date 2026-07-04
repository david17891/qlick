import { Container, Card } from "@/components/ui";
import { Navbar, Footer } from "@/components/layout";

/**
 * Loading state para `/admin/handoffs`.
 *
 * Aparece mientras Next.js hace el fetch de `listHandoffs` + el cross-table
 * de `getRecentEventForHandoff` (1 query batched). Mismo patrón que
 * `/admin/eventos/loading.tsx`: skeleton del layout para evitar pantalla
 * en blanco durante el SSR.
 */
export default function AdminHandoffsLoading() {
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-brand-50/30 py-10">
        <Container size="wide">
          <div className="mb-6 animate-pulse">
            <div className="h-4 w-32 bg-brand-100 rounded mb-2" />
            <div className="h-8 w-72 bg-brand-100 rounded" />
            <div className="h-3 w-64 bg-brand-100 rounded mt-2" />
          </div>

          {/* Header de métricas */}
          <Card className="p-4 mb-6 animate-pulse">
            <div className="grid grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="rounded-lg bg-white/60 p-3">
                  <div className="h-3 w-20 bg-brand-100 rounded mb-2 mx-auto" />
                  <div className="h-7 w-12 bg-brand-100 rounded mx-auto" />
                </div>
              ))}
            </div>
          </Card>

          {/* Filtros */}
          <Card className="p-4 mb-6 animate-pulse">
            <div className="flex flex-wrap items-end gap-3">
              <div className="h-8 w-32 bg-brand-100 rounded" />
              <div className="h-8 w-32 bg-brand-100 rounded" />
              <div className="h-8 w-32 bg-brand-100 rounded" />
              <div className="h-8 w-20 bg-brand-100 rounded" />
            </div>
          </Card>

          {/* Tabla */}
          <Card className="overflow-hidden animate-pulse">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-brand-50/50">
                  <tr>
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                      <th key={i} className="text-left px-4 py-3">
                        <div className="h-3 w-20 bg-brand-100 rounded" />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[1, 2, 3, 4, 5].map((r) => (
                    <tr key={r} className="border-b border-brand-50">
                      {[1, 2, 3, 4, 5, 6].map((c) => (
                        <td key={c} className="px-4 py-3">
                          <div className="h-3 w-full max-w-[160px] bg-brand-100 rounded" />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <p className="text-center text-ink-muted mt-10 text-sm">
            Cargando handoffs…
          </p>
        </Container>
      </main>
      <Footer />
    </>
  );
}
