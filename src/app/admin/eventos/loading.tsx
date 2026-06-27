import { Container, Card } from "@/components/ui";
import { Navbar, Footer } from "@/components/layout";

/**
 * Loading state para `/admin/eventos`.
 *
 * Aparece mientras Next.js hace el fetch de `getAdminEvents()` (4 queries
 * en paralelo). En vez de pantalla en blanco, ve un skeleton del layout.
 *
 * Mismo patrón que `/aprender/[courseSlug]/[lessonSlug]/loading.tsx`.
 */
export default function AdminEventosLoading() {
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-brand-50/30 py-10">
        <Container size="wide">
          <div className="mb-6 animate-pulse">
            <div className="h-4 w-32 bg-brand-100 rounded mb-2" />
            <div className="h-8 w-72 bg-brand-100 rounded" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-5 animate-pulse">
                <div className="h-5 w-20 bg-brand-100 rounded mb-2" />
                <div className="h-6 w-3/4 bg-brand-100 rounded mb-3" />
                <div className="h-4 w-full bg-brand-50 rounded mb-1" />
                <div className="h-4 w-2/3 bg-brand-50 rounded mb-4" />
                <div className="grid grid-cols-2 gap-2">
                  {[1, 2, 3, 4].map((j) => (
                    <div key={j} className="h-14 bg-brand-50 rounded-lg" />
                  ))}
                </div>
              </Card>
            ))}
          </div>
          <p className="text-center text-ink-muted mt-10 text-sm">
            Cargando eventos…
          </p>
        </Container>
      </main>
      <Footer />
    </>
  );
}
