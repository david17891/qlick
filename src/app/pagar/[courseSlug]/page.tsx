/**
 * Página de pago de un curso (v1.0.0 — Fase C).
 *
 * Flujo:
 * 1. Llega con `/pagar/[slug]`.
 * 2. Si el curso es free → redirect a `/inscripcion/[slug]` (no necesita pago).
 * 3. Si NO hay sesión → redirect a `/login?next=/pagar/[slug]`.
 * 4. Si ya tiene course_access activo → redirect a `/dashboard?already_paid=1`.
 * 5. Si todo OK → renderiza preview del curso + SimulatorForm con 3 botones
 *    (éxito, fallo, pendiente) que llama a `/api/dev/simulate-webhook`.
 *
 * DEV-ONLY: la página usa el simulador de pagos. En producción, se reemplaza
 * por el flujo real del provider (Stripe Checkout, MercadoPago Checkout Pro,
 * Conekta OXXO flow, etc.).
 *
 * Server Component. La lógica de auth y decisión corre 100% en server.
 * Solo el SimulatorForm es Client Component (botones que llaman al endpoint).
 */

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Navbar, Footer } from "@/components/layout";
import { Container, Card, Button, Badge } from "@/components/ui";
import { getCurrentStudent } from "@/lib/auth/session";
import { getCourseBySlug } from "@/lib/lms/courses-server";
import { checkCourseAccess } from "@/lib/lms/entitlements";
import { SimulatorForm } from "./SimulatorForm";

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
    title: `Pagar ${course.title} · Qlick`,
    description: `Pagá ${course.title} y empezá hoy.`,
    alternates: { canonical: `/pagar/${params.courseSlug}` },
    robots: { index: false, follow: false },
  };
}

export default async function PayPage({
  params,
}: {
  params: { courseSlug: string };
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

  // Si el curso es free, no tiene sentido estar en /pagar. Redirigir.
  if (course.accessType !== "paid") {
    redirect(`/inscripcion/${courseSlug}`);
  }

  // Auth: requiere sesión de estudiante.
  const session = await getCurrentStudent();
  if (!session) {
    redirect(`/login?next=${encodeURIComponent(`/pagar/${courseSlug}`)}`);
  }

  // Si ya tiene acceso activo, no tiene que pagar de nuevo.
  const access = await checkCourseAccess(session!.userId, course.id);
  if (access.hasAccess) {
    redirect(`/dashboard?already_paid=1`);
  }

  return (
    <>
      <Navbar />
      <section className="bg-brand-50/40 min-h-[calc(100vh-4rem)]">
        <Container className="py-14">
          <div className="max-w-2xl mx-auto">
            <Card className="p-8">
              <div className="mb-5">
                <Badge tone="warning">
                  Modo simulación · reemplazaremos esto cuando integremos
                  Stripe/MercadoPago/Conekta
                </Badge>
              </div>

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
                    <strong className="text-ink">${course.priceMXN} MXN</strong>
                  </span>
                )}
              </div>

              <div className="mt-8">
                <SimulatorForm
                  courseSlug={courseSlug}
                  courseTitle={course.title}
                  amountMxn={course.priceMXN ?? 0}
                />
              </div>

              <p className="mt-6 text-sm text-ink-muted text-center">
                ¿Querés ver el detalle antes de pagar?{" "}
                <a
                  href={`/cursos/${course.slug}`}
                  className="font-semibold text-brand-600 hover:underline"
                >
                  Ver detalle
                </a>
              </p>
            </Card>
          </div>
        </Container>
      </section>
      <Footer />
    </>
  );
}
