import { Container } from "@/components/ui";
import { Navbar, Footer } from "@/components/layout";

/**
 * Loading state para `/aprender/[courseSlug]/[lessonSlug]`.
 *
 * Aparece mientras Next.js compila la página en dev (puede tardar varios
 * segundos la primera vez) o mientras se hace la verificación de access
 * contra el LMS. En vez de pantalla en blanco durante el recompile, ve
 * un placeholder con el shell del sitio.
 */
export default function LessonLoading() {
  return (
    <>
      <Navbar />
      <Container size="wide" className="py-8">
        <div className="animate-pulse space-y-6">
          <div className="h-4 w-48 bg-brand-100 rounded" />
          <div className="aspect-video bg-brand-50 rounded-2xl" />
          <div className="space-y-2">
            <div className="h-3 w-32 bg-brand-100 rounded" />
            <div className="h-8 w-3/4 bg-brand-100 rounded" />
            <div className="h-4 w-1/2 bg-brand-50 rounded" />
          </div>
        </div>
        <p className="text-center text-ink-muted mt-10 text-sm">
          Cargando lección…
        </p>
      </Container>
      <Footer />
    </>
  );
}
