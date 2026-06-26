import type { Metadata } from "next";
import { Navbar, Footer } from "@/components/layout";
import { Container, Badge } from "@/components/ui";
import { CourseCard } from "@/components/course";
import { getPublishedCourses } from "@/lib/lms/courses-server";
import { getCourseStats } from "@/lib/data/courses";
import type { Course as LmsCourse } from "@/types/lms";
import type { Course as LegacyCourse } from "@/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cursos de marketing",
  description:
    "Explora el catálogo completo de cursos de marketing de Qlick: fundamentos, publicidad, ventas, automatización y contenido.",
  alternates: { canonical: "/cursos" }
};

/**
 * Adapta un `Course` del LMS al shape legacy que espera `CourseCard`.
 *
 * Trade-off: el componente CourseCard está atado al mock legacy. Refactorizarlo
 * al shape LMS es scope de Fase E+. Por ahora, mapeamos campo a campo.
 */
function lmsToLegacyAdapter(c: LmsCourse): LegacyCourse {
  // Mapeo explícito de enums LMS (inglés) → legacy (español).
  const levelMap: Record<string, "basico" | "intermedio" | "avanzado"> = {
    beginner: "basico",
    intermediate: "intermedio",
    advanced: "avanzado",
  };
  const statusMap: Record<string, "gratis" | "pago" | "proximamente"> = {
    free: "gratis",
    paid: "pago",
    freemium: "gratis", // freemium = gratis en legacy
  };
  return {
    id: c.id,
    slug: c.slug,
    title: c.title,
    shortDescription: c.description ?? c.subtitle ?? "",
    longDescription: c.description ?? "",
    thumbnailUrl: c.coverImageUrl ?? "",
    estimatedHours: c.durationMinutes ? c.durationMinutes / 60 : 0,
    level: levelMap[c.level] ?? "basico",
    instructorId: c.instructorName ?? "",
    category: c.category,
    tags: [],
    studentsCount: 0,
    rating: 0,
    priceMXN: c.priceMXN ?? 0,
    originalPriceMXN: null,
    isFeatured: c.isFeatured,
    status: statusMap[c.accessType] ?? "gratis",
  } as unknown as LegacyCourse;
}

export default async function CursosPage() {
  const lmsCourses = await getPublishedCourses();
  // Adaptamos al shape legacy para reutilizar CourseCard sin refactor.
  const courses = lmsCourses.map(lmsToLegacyAdapter);
  const totalLessons = courses.reduce(
    (acc, c) => acc + getCourseStats(c.id).totalLessons,
    0
  );
  // Calculamos cuántos cursos hay de cada tipo para los filtros.
  const freeCount = lmsCourses.filter((c) => c.accessType === "free").length;
  const paidCount = lmsCourses.filter((c) => c.accessType === "paid").length;

  return (
    <>
      <Navbar />
      <section className="bg-brand-50/40 border-b border-brand-100">
        <Container size="wide" className="py-16">
          <Badge tone="brand" className="mb-4">
            Catálogo completo
          </Badge>
          <h1 className="display-1 text-ink">Cursos de marketing aplicado</h1>
          <p className="mt-4 text-lg text-ink-soft max-w-2xl">
            {lmsCourses.length} cursos · {totalLessons} lecciones · {freeCount} gratis · {paidCount} de pago.
            Aprende a tu ritmo y aplica desde el primer día.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {["Todos", "Básico", "Intermedio", "Avanzado", "Gratis", "Pago"].map(
              (f, i) => (
                <button
                  key={f}
                  className={
                    "px-4 py-2 rounded-full text-sm font-semibold transition " +
                    (i === 0
                      ? "bg-brand-500 text-white"
                      : "bg-white text-ink-soft border border-brand-100 hover:border-brand-300")
                  }
                >
                  {f}
                </button>
              )
            )}
          </div>
        </Container>
      </section>

      <section className="py-14">
        <Container size="wide">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {lmsCourses.map((lmsCourse) => {
              const legacy = lmsToLegacyAdapter(lmsCourse);
              return (
                <div key={lmsCourse.id} className="relative">
                  <CourseCard course={legacy} />
                  {/* Badge de precio/acceso: override sobre el card. */}
                  {lmsCourse.accessType === "paid" ? (
                    <div className="absolute top-3 right-3 z-10">
                      <Badge tone="warning">
                        {lmsCourse.priceMXN && lmsCourse.priceMXN > 0
                          ? `$${lmsCourse.priceMXN} MXN`
                          : "Premium"}
                      </Badge>
                    </div>
                  ) : lmsCourse.accessType === "freemium" ? (
                    <div className="absolute top-3 right-3 z-10">
                      <Badge tone="info">Gratis + Premium</Badge>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </Container>
      </section>

      <Footer />
    </>
  );
}
