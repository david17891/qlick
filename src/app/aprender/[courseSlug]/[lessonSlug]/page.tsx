import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Navbar, Footer } from "@/components/layout";
import { Container, Card, Button, Badge } from "@/components/ui";
import { LessonView } from "@/components/course/LessonView";
import { getCurrentStudent } from "@/lib/auth/session";
import { getCourseBySlug as getCourseBySlugLMS } from "@/lib/lms/courses-server";
import { checkCourseAccess } from "@/lib/lms/entitlements";
import { getUserEnrollments } from "@/lib/lms/enrollments-server";
import {
  getCourseBySlug as getCourseBySlugMock,
  flatLessons,
} from "@/lib/data/courses";
import { findLesson as findLessonInMock } from "@/lib/data/courses";

// NOTA DE DISEÑO:
// Esta página tiene un problema de chicken-and-egg: el componente
// `LessonView` está atado al mock legacy (`src/lib/data/courses`),
// pero el sistema de entitlements opera contra el LMS real
// (`src/lib/lms/*` con UUIDs). Hacer el bridge completo es scope de
// Fase E+. Por ahora:
//   1. Cargamos el curso del LMS para chequear access (course_access real).
//   2. Si tiene access, renderizamos el LessonView con el curso del mock
//      (que tiene módulos/lecciones con sus videos).
//   3. Si no tiene access, mostramos paywall con CTA a /pagar o /inscripcion.
// Trade-off: si el catálogo LMS difiere del mock, las lecciones pueden no
// matchear exactamente. Para MVP es aceptable porque los slugs coinciden.

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { courseSlug: string; lessonSlug: string };
}): Promise<Metadata> {
  const course = getCourseBySlugMock(params.courseSlug);
  if (!course) return { title: "Curso no encontrado · Qlick" };
  return {
    title: `Lección de ${course.title} · Qlick`,
    alternates: {
      canonical: `/aprender/${course.slug}/${params.lessonSlug}`,
    },
    robots: { index: false, follow: false },
  };
}

export default async function LessonPage({
  params,
}: {
  params: { courseSlug: string; lessonSlug: string };
}) {
  const { courseSlug, lessonSlug } = params;

  // Cargar curso del mock (para módulos y lecciones) y del LMS (para access).
  const mockCourse = getCourseBySlugMock(courseSlug);
  if (!mockCourse) {
    notFound();
  }
  const lmsCourse = await getCourseBySlugLMS(courseSlug);

  // Auth: requiere sesión student.
  const session = await getCurrentStudent();
  if (!session) {
    redirect(`/login?next=${encodeURIComponent(`/aprender/${courseSlug}/${lessonSlug}`)}`);
  }

  // Check access: usamos el LMS course (si existe) o el slug directo.
  // Si el LMS no tiene el curso O falla la query, DENEGAMOS acceso.
  // (Antes: fallback a hasAccess=true; eso era un agujero de seguridad
  // si la DB se caía en producción.)
  let access;
  if (lmsCourse) {
    access = await checkCourseAccess(session!.userId, lmsCourse.id);
  } else {
    // LMS vacío / error: deny explícito.
    access = {
      hasAccess: false as const,
      reason: "no_access" as const,
    };
  }

  if (!access.hasAccess) {
    // Render paywall.
    return (
      <>
        <Navbar />
        <section className="bg-brand-50/40 min-h-[calc(100vh-4rem)]">
          <Container className="py-14">
            <div className="max-w-2xl mx-auto">
              <Card className="p-8 text-center">
                <Badge tone={access.reason === "expired" ? "warning" : "info"}>
                  {access.reason === "expired"
                    ? "Acceso expirado"
                    : access.reason === "not_authenticated"
                      ? "Necesitás iniciar sesión"
                      : "Acceso restringido"}
                </Badge>
                <h1 className="text-2xl font-bold text-ink mt-4">
                  {lmsCourse?.accessType === "paid" ? "Este curso es de pago" : "Acceso requerido"}
                </h1>
                <p className="text-ink-muted mt-3">
                  {lmsCourse?.accessType === "paid" ? (
                    <>
                      Para acceder a esta lección, primero tenés que pagar
                      <strong> ${lmsCourse.priceMXN} MXN</strong> por el curso{" "}
                      <strong>{mockCourse.title}</strong>.
                    </>
                  ) : (
                    <>Para acceder a esta lección necesitás estar inscripto en el curso.</>
                  )}
                </p>
                <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
                  {lmsCourse?.accessType === "paid" ? (
                    <Button href={`/pagar/${courseSlug}`} size="lg">
                      Ir a pagar
                    </Button>
                  ) : (
                    <Button href={`/inscripcion/${courseSlug}`} size="lg">
                      Inscribirme
                    </Button>
                  )}
                  <Button href="/cursos" variant="outline" size="lg">
                    Ver catálogo
                  </Button>
                </div>
              </Card>
            </div>
          </Container>
        </section>
        <Footer />
      </>
    );
  }

  // OK, tiene access. Renderizar lección con el mock course (que tiene los
  // módulos y videos correctos).
  // Calculamos isPreviewLesson para que el cliente sepa si esta lección es
  // accesible sin enrollment (caso edge: el usuario hace click en "Vista
  // previa" sin estar inscripto). Por seguridad, una lección "preview" solo
  // se permite si la página llegó hasta acá — el server YA validó access.
  const found = findLessonInMock(mockCourse, lessonSlug);
  const isPreviewLesson = found?.lesson.isPreview ?? false;

  // Para el botón "Marcar como completada" necesitamos:
  //  - lessonIndex (0-based en la lista plana de lecciones del curso)
  //  - totalLessons (para calcular el percent nuevo en la Server Action)
  //  - currentPercent (del enrollment activo, si existe)
  //  - lmsCourseId (UUID real del curso en la tabla `courses` del LMS)
  //
  // Estos datos permiten que la Server Action `markLessonCompleteAction`
  // persista el progreso en `enrollments.progress_percent` cuando el user
  // hace click. Sin esto, la UX del demo sería: "marco la lección, el
  // botón cambia, pero al volver al dashboard sigue en 0%".
  const flat = flatLessons(mockCourse);
  const totalLessons = flat.length;
  const lessonIndex = found
    ? flat.findIndex((f) => f.lesson.id === found.lesson.id)
    : 0;

  // Buscar el enrollment del user para conocer su percent actual. El
  // dashboard hace lo mismo; en el peor caso (sin enrollment) caemos
  // a 0 — la action lo creará retroactivamente al marcar.
  const userEnrollments = await getUserEnrollments(session!.userId);
  const currentEnrollment = lmsCourse
    ? userEnrollments.find(
        (e) => e.courseId === lmsCourse.id && e.status === "active",
      )
    : undefined;
  const currentPercent = currentEnrollment?.progressPercent ?? 0;

  return (
    <>
      <Navbar />
      <LessonView
        course={mockCourse}
        lessonSlug={lessonSlug}
        enrolled={access.hasAccess}
        isPreviewLesson={isPreviewLesson}
        lmsCourseId={lmsCourse?.id ?? null}
        currentPercent={currentPercent}
        lessonIndex={lessonIndex >= 0 ? lessonIndex : 0}
        totalLessons={totalLessons}
      />
      <Footer />
    </>
  );
}
