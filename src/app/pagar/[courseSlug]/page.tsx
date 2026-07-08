/**
 * Página de pago de un curso (v1.0.0 — Fase C).
 *
 * Flujo:
 * 1. Llega con `/pagar/[slug]`.
 * 2. Si el curso es free → redirect a `/inscripcion/[slug]` (no necesita pago).
 * 3. Si NO hay sesión → redirect a `/login?next=/pagar/[slug]`.
 * 4. Si ya tiene course_access activo → redirect a `/dashboard?already_paid=1`.
 * 5. Si todo OK → renderiza preview del curso + componente de checkout:
 *      - `NEXT_PUBLIC_PAYMENT_PROVIDER === "mock"` (default dev) →
 *        SimulatorForm con 3 botones (éxito/fallo/pendiente) que llama a
 *        `/api/dev/simulate-webhook`.
 *      - cualquier otro valor (stripe, mercadopago, conekta) → CheckoutButton
 *        que dispara `/api/payments/create-checkout` y redirige al provider.
 *
 * Server Component. La decisión de provider corre 100% en server. Tanto
 * SimulatorForm como CheckoutButton son Client Components.
 */

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Navbar, Footer } from "@/components/layout";
import { Container, Card, Button, Badge } from "@/components/ui";
import { getCurrentStudent } from "@/lib/auth/session";
import { getCourseBySlug } from "@/lib/lms/courses-server";
import { checkCourseAccess } from "@/lib/lms/entitlements";
import { SimulatorForm } from "./SimulatorForm";
import { CheckoutButton } from "./CheckoutButton";

// Provider activo leído en build/runtime. Default "mock" para dev local.
const PAYMENT_PROVIDER = (process.env.NEXT_PUBLIC_PAYMENT_PROVIDER ?? "mock").toLowerCase();
const IS_MOCK = PAYMENT_PROVIDER === "mock";

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

  // Auth: OPCIONAL — guest checkout es el flujo principal desde 2026-07-08.
  // Cualquiera puede ver la página y pagar. Si hay sesión, igual la usamos
  // para evitar pagar dos veces (idempotencia). Si no hay sesión, el
  // webhook crea la cuenta con el email de Stripe al confirmarse el pago.
  // NOTA: NO llamamos a checkCourseAccess() acá (la verificación la hace
  // el cliente después del pago vía /exito).
  const session = await getCurrentStudent();

  return (
    <>
      <Navbar />
      <section className="bg-brand-50/40 min-h-[calc(100vh-4rem)]">
        <Container className="py-14">
          <div className="max-w-2xl mx-auto">
            <Card className="p-8">
              <div className="mb-5">
                {IS_MOCK ? (
                  <Badge tone="warning">
                    Modo simulación · reemplazaremos esto cuando integremos
                    Stripe/MercadoPago/Conekta
                  </Badge>
                ) : (
                  <Badge tone="success">
                    Pago seguro · {PAYMENT_PROVIDER}
                  </Badge>
                )}
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
                {IS_MOCK ? (
                  <SimulatorForm
                    courseSlug={courseSlug}
                    courseTitle={course.title}
                    amountMxn={course.priceMXN ?? 0}
                  />
                ) : (
                  <CheckoutButton
                    courseSlug={courseSlug}
                    courseTitle={course.title}
                    amountMxn={course.priceMXN ?? 0}
                  />
                )}
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
