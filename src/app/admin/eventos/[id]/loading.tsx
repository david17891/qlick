import { Container, Card } from "@/components/ui";
import { Navbar, Footer } from "@/components/layout";

/**
 * Loading state para `/admin/eventos/[id]`.
 *
 * Aparece mientras Next.js hace el fetch de evento + 5 datasets
 * (confirmations, attendees, surveys, leads) en paralelo. Skeleton
 * del header + 4 secciones con líneas animadas.
 */
export default function AdminEventoDetailLoading() {
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-brand-50/30 py-10">
        <Container size="wide">
          <div className="mb-4 h-3 w-24 bg-brand-100 rounded animate-pulse" />
          <Card className="p-6 mb-6 animate-pulse">
            <div className="h-5 w-20 bg-brand-100 rounded mb-3" />
            <div className="h-7 w-72 bg-brand-100 rounded mb-3" />
            <div className="h-4 w-1/2 bg-brand-50 rounded mb-5" />
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-5 border-t border-brand-100">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-14 bg-brand-50 rounded" />
              ))}
            </div>
          </Card>
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="overflow-hidden mb-6 animate-pulse">
              <div className="p-5 border-b border-brand-50">
                <div className="h-5 w-32 bg-brand-100 rounded mb-2" />
                <div className="h-3 w-1/2 bg-brand-50 rounded" />
              </div>
              <div className="p-5 space-y-2">
                {[1, 2, 3].map((j) => (
                  <div key={j} className="h-4 bg-brand-50 rounded" />
                ))}
              </div>
            </Card>
          ))}
          <p className="text-center text-ink-muted text-sm">
            Cargando detalle del evento…
          </p>
        </Container>
      </main>
      <Footer />
    </>
  );
}
