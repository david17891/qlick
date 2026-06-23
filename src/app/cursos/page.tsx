import type { Metadata } from "next";
import { Navbar, Footer } from "@/components/layout";
import { Container, Badge, SectionHeading } from "@/components/ui";
import { CourseCard } from "@/components/course";
import { getAllCourses } from "@/lib/data/courses";
import { getCourseStats } from "@/lib/data/courses";

export const metadata: Metadata = {
  title: "Cursos de marketing",
  description:
    "Explora el catálogo completo de cursos de marketing de Qlick: fundamentos, publicidad, ventas, automatización y contenido.",
  alternates: { canonical: "/cursos" }
};

export default function CursosPage() {
  const courses = getAllCourses();
  const totalLessons = courses.reduce(
    (acc, c) => acc + getCourseStats(c.id).totalLessons,
    0
  );

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
            {courses.length} cursos · {totalLessons} lecciones · acceso indefinido.
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
            {courses.map((c) => (
              <CourseCard key={c.id} course={c} />
            ))}
          </div>
        </Container>
      </section>

      <Footer />
    </>
  );
}
