/**
 * Página de inscripción a un curso (v0.9.0).
 *
 * Flujo:
 * 1. Llega con `/inscripcion/[slug]` (catálogo) o `/inscripcion/[slug]?ref=qr` (QR).
 * 2. Si NO hay sesión → muestra preview del curso + botón Google con `?next=`
 *    que apunta de vuelta a esta página.
 * 3. Si hay sesión → llama `enrollUserInCourse(userId, courseId, source)` y
 *    redirige a `/dashboard?enrolled=[slug]`.
 * 4. Idempotencia: si el alumno ya estaba inscripto, el upsert lo deja igual
 *    y de todos modos redirige a /dashboard (no se duplica la inscripción).
 *
 * Tracking del origen (`source`):
 * - `?ref=qr` → source = "qr" (atribución de campaña QR)
 * - sin `?ref=` → source = "organic" (catálogo)
 *
 * Server Component. La lógica de auth + inscripción corre 100% en server.
 * Solo el botón de login es Client Component (EnrollmentLoginButton).
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { Navbar, Footer } from "@/components/layout";
import { Container, Card, Button, Badge } from "@/components/ui";
import { requireStudent } from "@/lib/auth/session";
import { getCourseBySlug } from "@/lib/lms/courses-server";
import { enrollUserInCourse } from "@/lib/lms/enrollments-server";
import { EnrollmentLoginButton } from "./EnrollmentLoginButton";

type SearchParams = { ref?: string };

export async function generateMetadata({
  params,
}: {
  params: { courseSlug: string };
}): Promise<Metadata> {
  const course = await getCourseBySlug(params.courseSlug);
  if (!course) {
    return { title: "Curso no encontrado · Qlick" };
  }
  return {
    title: `Inscribirme a ${course.title} · Qlick`,
    description:
      course.description ??
      `Inscríbete con un solo toque vía Google y empezá hoy.`,
    alternates: { canonical: `/inscripcion/${params.courseSlug}` },
    robots: { index: false, follow: false }, // no indexar páginas de enrollment
  };
}

export default async function EnrollmentPage({
  params,
  searchParams,
}: {
  params: { courseSlug: string };
  searchParams: SearchParams;
}) {
  const { courseSlug } = params;
  const course = await getCourseBySlug(courseSlug);

  if (!course) {
    return (
      <>
        <Navbar />
        <Container className="py-14">
          <Card className="p-8 text-center max-w-md mx-auto">
            <h1 className="text-2xl font-bold text-ink">Curso no encontrado</h1>
            <p className="text-ink-muted mt-2">
              El curso <code>"{courseSlug}"</code> no existe o no está publicado.
            </p>
            <Button href="/cursos" className="mt-6">
              Ver catálogo
            </Button>
          </Card>
        </Container>
        <Footer />
      </>
    );
  }

  // Si el curso es de pago, redirigir a /pagar/[slug] preservando el
  // `?ref=qr` u otros search params (v1.0.0+).
  if (course.accessType === "paid") {
    const qs = new URLSearchParams();
    if (searchParams.ref) qs.set("ref", searchParams.ref);
    const queryString = qs.toString();
    redirect(`/pagar/${courseSlug}${queryString ? `?${queryString}` : ""}`);
  }

  const source: "qr" | "organic" = searchParams.ref === "qr" ? "qr" : "organic";
  const session = await requireStudent();

  // ---- Autenticado: inscribir + redirigir ----
  if (session) {
    const result = await enrollUserInCourse(session.userId, course.id, source);
    if (!result.ok) {
      return (
        <>
          <Navbar />
          <Container className="py-14">
            <Card className="p-8 text-center max-w-md mx-auto">
              <h1 className="text-2xl font-bold text-ink">
                No pudimos inscribirte
              </h1>
              <p className="text-ink-muted mt-2">{result.note}</p>
              <Button href="/cursos" className="mt-6">
                Volver al catálogo
              </Button>
            </Card>
          </Container>
          <Footer />
        </>
      );
    }
    // OK → redirigir al dashboard con flag enrolled.
    redirect(`/dashboard?enrolled=${encodeURIComponent(courseSlug)}`);
  }

  // ---- No autenticado: preview + CTA OAuth ----
  const returnPath =
    source === "qr"
      ? `/inscripcion/${encodeURIComponent(courseSlug)}?ref=qr`
      : `/inscripcion/${encodeURIComponent(courseSlug)}`;

  return (
    <>
      <Navbar />
      <section className="bg-brand-50/40 min-h-[calc(100vh-4rem)]">
        <Container className="py-14">
          <div className="max-w-2xl mx-auto">
            <Card className="p-8">
              {source === "qr" && (
                <div className="mb-5">
                  <Badge tone="info">
                    Inscripción vía QR · te guardamos el origen
                  </Badge>
                </div>
              )}

              <h1 className="text-3xl font-bold text-ink leading-tight">
                {course.title}
              </h1>
              {course.subtitle && (
                <p className="text-lg text-ink-soft mt-2">{course.subtitle}</p>
              )}
              {course.description && (
                <p className="text-ink-muted mt-4 whitespace-pre-line">
                  {course.description}
                </p>
              )}

              <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                {course.instructorName && (
                  <span className="text-ink-soft">
                    Instructor:{" "}
                    <strong className="text-ink">{course.instructorName}</strong>
                  </span>
                )}
                {course.durationMinutes != null && (
                  <span className="text-ink-soft">
                    Duración:{" "}
                    <strong className="text-ink">
                      {Math.round(course.durationMinutes / 60)} h
                    </strong>
                  </span>
                )}
                {course.priceMXN != null && (
                  <span className="text-ink-soft">
                    Precio:{" "}
                    <strong className="text-ink">{course.priceMXN} MXN</strong>
                  </span>
                )}
                {course.level && (
                  <span className="text-ink-soft">
                    Nivel:{" "}
                    <strong className="text-ink">
                      {course.level === "beginner"
                        ? "Principiante"
                        : course.level === "intermediate"
                          ? "Intermedio"
                          : "Avanzado"}
                    </strong>
                  </span>
                )}
              </div>

              <div className="mt-8">
                <EnrollmentLoginButton
                  returnPath={returnPath}
                  courseTitle={course.title}
                />
                <p className="mt-3 text-xs text-ink-muted text-center">
                  Te inscribimos con un solo toque. Sin contraseñas, sin pasos
                  extra. Te creamos la cuenta con tu Google.
                </p>
              </div>

              <p className="mt-6 text-sm text-ink-muted text-center">
                ¿Solo querés ver el curso?{" "}
                <Link
                  href={`/cursos/${course.slug}`}
                  className="font-semibold text-brand-600 hover:underline"
                >
                  Ver detalle
                </Link>
              </p>
            </Card>
          </div>
        </Container>
      </section>
      <Footer />
    </>
  );
}
