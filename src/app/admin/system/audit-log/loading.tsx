import { Container, Card, Skeleton } from "@/components/ui";
import { Navbar, Footer } from "@/components/layout";

/**
 * Loading state para `/admin/system/audit-log`.
 *
 * Aparece mientras Next.js hace el fetch de `listAuditLogs()` (con count).
 * Skeleton del header + filtros + tabla.
 *
 * Mismo patrón que `/admin/eventos/loading.tsx` y
 * `/admin/loading.tsx`.
 */
export default function AdminAuditLogLoading() {
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-slate-50">
        <Container size="wide" className="py-10">
          {/* Header */}
          <div className="mb-6 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-40" />
          </div>

          {/* Filtros */}
          <Card className="p-4 mb-6">
            <div className="flex flex-wrap items-end gap-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="space-y-1">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-8 w-32" />
                </div>
              ))}
              <Skeleton className="h-8 w-20" />
            </div>
          </Card>

          {/* Tabla skeleton */}
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <th key={i} className="px-4 py-3 text-left">
                        <Skeleton className="h-3 w-16" />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="px-4 py-3">
                        <Skeleton className="h-3 w-24" />
                      </td>
                      <td className="px-4 py-3">
                        <Skeleton className="h-3 w-40" />
                      </td>
                      <td className="px-4 py-3">
                        <Skeleton className="h-5 w-28 rounded-full" />
                      </td>
                      <td className="px-4 py-3">
                        <Skeleton className="h-3 w-20" />
                      </td>
                      <td className="px-4 py-3">
                        <Skeleton className="h-3 w-16" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <p className="text-center text-ink-muted mt-10 text-sm">
            Cargando audit log…
          </p>
        </Container>
      </main>
      <Footer />
    </>
  );
}