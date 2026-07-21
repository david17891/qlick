import type { Metadata } from "next";
import { Navbar, Footer } from "@/components/layout";
import { Container, Badge } from "@/components/ui";
import { getPublishedCourses } from "@/lib/lms/courses-server";
import { getCourseStats } from "@/lib/data/courses";
import { CursosClient, type FilterableCourse } from "./CursosClient";
import type { Course as LmsCourse } from "@/types/lms";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cursos de marketing",
  description:
    "Explora el catálogo completo de cursos de marketing de Qlick: fundamentos, publicidad, ventas, automatización y contenido.",
  alternates: { canonical: "/cursos" },
};

/**
 * Adapta un `Course` del LMS al shape legacy que necesita `CourseCard`.
 *
 * Trade-off: el componente CourseCard está atado al mock legacy. Refactorizarlo
 * al shape LMS es scope de Fase E+. Por ahora, mapeamos campo a campo.
 */
function lmsToLegacyAdapter(c: LmsCourse): FilterableCourse {
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
  // El status del LMS manda por encima del accessType. Si el curso está
  // marcado como "proximamente" en la DB, la UI lo muestra con badge
  // "Próximamente" independientemente de si es free/paid/freemium.
  const legacyStatus: "gratis" | "pago" | "proximamente" =
    c.status === "proximamente"
      ? "proximamente"
      : (statusMap[c.accessType] ?? "gratis");
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
    status: legacyStatus,
    accessType: c.accessType,
  } as unknown as FilterableCourse;
}

export default async function CursosPage() {
  const lmsCourses = await getPublishedCourses();
  const courses: FilterableCourse[] = lmsCourses.map((lmsCourse) => {
    const adapted = lmsToLegacyAdapter(lmsCourse);
    // Hidratamos los stats por curso desde el mock legacy.
    // (Mismas stats que ya mostraba CourseCard antes del refactor.)
    const stats = getCourseStats(adapted.id);
    return { ...adapted, totalModules: stats.totalModules, totalLessons: stats.totalLessons } as FilterableCourse;
  });
  const totalLessons = courses.reduce(
    (acc, c) => acc + getCourseStats(c.id).totalLessons,
    0
  );
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
        </Container>
      </section>

      <section className="py-14">
        <Container size="wide">
          <CursosClient courses={courses} />
        </Container>
      </section>

      <Footer />
    </>
  );
}
