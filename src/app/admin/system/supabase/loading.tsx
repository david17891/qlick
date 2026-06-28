import { Card, Skeleton } from "@/components/ui";
import { Navbar, Footer } from "@/components/layout";

/**
 * Loading state para `/admin/system/supabase` (panel de diagnóstico).
 *
 * Aparece mientras Next.js resuelve las env vars del servidor
 * (`checkSupabaseConfig()` + `realDataAdvisory()`). Skeleton del header
 * + 4 cards (Estado global, Variables detectadas, Avisos, Antes de usar
 * datos reales).
 *
 * Mantiene el look slate-50 del panel real (no brand-50) — es un panel
 * técnico, no de marketing.
 *
 * Mismo patrón que `/admin/eventos/loading.tsx` adaptado al tono slate.
 */
export default function AdminSupabaseStatusLoading() {
  return (
    <>
      <Navbar />
      <main className="bg-slate-50 min-h-screen">
        <div className="max-w-4xl mx-auto px-4 py-10">
          {/* Header */}
          <header className="mb-8 space-y-2">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-8 w-72" />
            <Skeleton className="h-4 w-96" />
          </header>

          {/* 4 cards apilados */}
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="mb-6 p-6 space-y-4">
              <Skeleton className="h-5 w-40" />
              <ul className="space-y-3">
                {[1, 2, 3].map((j) => (
                  <li key={j} className="flex items-center justify-between">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-5 w-20 rounded-full" />
                  </li>
                ))}
              </ul>
            </Card>
          ))}

          <p className="text-center text-ink-muted mt-10 text-sm">
            Cargando estado de Supabase…
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}