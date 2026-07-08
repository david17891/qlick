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

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Navbar, Footer } from "@/components/layout";
import { Container, Card, Button, Badge } from "@/components/ui";
import { getCurrentStudent } from "@/lib/auth/session";
import { getCourseBySlug } from "@/lib/lms/courses-server";
import { checkCourseAccess } from "@/lib/lms/entitlements";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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
  //
  // Detección de "ya compraste": si hay sesión o si hay cookie
  // qlick_recent_purchase (de un pago guest reciente), consultamos
  // course_access y mostramos UI distinto en vez del botón "Pagar ahora".
  const session = await getCurrentStudent();

  let alreadyPurchased = false;
  let purchaseEmail: string | null = null;
  let processingPayment = false;
  if (session) {
    const access = await checkCourseAccess(session.userId, course.id);
    alreadyPurchased = access.hasAccess;
  } else {
    const recentEmail = cookies().get("qlick_recent_purchase")?.value;
    if (recentEmail) {
      try {
        const admin = createSupabaseAdminClient();
        const { data: listData } = await admin.auth.admin.listUsers({
          page: 1,
          perPage: 500,
        });
        const user = listData?.users?.find(
          (u) => u.email?.toLowerCase() === recentEmail.toLowerCase()
        );
        if (user) {
          const access = await checkCourseAccess(user.id, course.id);
          alreadyPurchased = access.hasAccess;
          if (alreadyPurchased) {
            purchaseEmail = recentEmail;
          } else {
            // Race condition: cookie seteada pero webhook aún no creó
            // course_access. Chequeamos payments recientes (última 1h).
            // Si hay un payment approved/pending para este user+curso,
            // mostramos "procesando" en vez del botón de pago.
            const oneHourAgo = new Date(
              Date.now() - 60 * 60 * 1000
            ).toISOString();
            const recentPay = await admin
              .from("payments")
              .select("id, status, created_at")
              .eq("user_id", user.id)
              .eq("course_id", course.id)
              .gte("created_at", oneHourAgo)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (recentPay?.data) {
              processingPayment = true;
              purchaseEmail = recentEmail;
            }
          }
        }
      } catch {
        // Si falla el lookup (admin client no configurado, etc.), seguimos
        // con el flujo normal de compra.
      }
    }
  }

  if (alreadyPurchased || processingPayment) {
    // Mostramos UI "ya compraste" / "procesando" en lugar del botón de pago.
    const badgeTone: "success" | "warning" = alreadyPurchased
      ? "success"
      : "warning";
    const badgeText = alreadyPurchased
      ? "Ya tenés este curso"
      : "Procesando tu pago";
    const headerText = alreadyPurchased
      ? `Tu pago fue confirmado${purchaseEmail ? ` para ${purchaseEmail}` : ""}. El curso ya está disponible en tu dashboard.`
      : `Recibimos tu pago${purchaseEmail ? ` de ${purchaseEmail}` : ""}. El webhook de Stripe está terminando de procesarlo —en unos segundos deberías ver el curso en tu dashboard. Si después de 1 minuto no aparece, contactános.`;
    return (
      <>
        <Navbar />
        <section className="bg-brand-50/40 min-h-[calc(100vh-4rem)]">
          <Container className="py-14">
            <div className="max-w-2xl mx-auto">
              <Card className="p-8">
                <div className="mb-5">
                  <Badge tone={badgeTone}>{badgeText}</Badge>
                </div>
                <h1 className="text-3xl font-bold text-ink leading-tight">
                  {course.title}
                </h1>
                {course.subtitle && (
                  <p className="text-lg text-ink-soft mt-2">{course.subtitle}</p>
                )}
                <p className="text-ink-muted mt-6">{headerText}</p>
                <div className="mt-8 flex flex-col sm:flex-row gap-3">
                  <Button href="/dashboard" className="flex-1 text-center">
                    Ir al dashboard
                  </Button>
                  {alreadyPurchased && purchaseEmail && !session && (
                    <Button
                      href={`/pagar/${courseSlug}/exito?session_id=auto&resend=1`}
                      variant="ghost"
                      className="flex-1 text-center"
                    >
                      Reenviar link de acceso
                    </Button>
                  )}
                  {processingPayment && (
                    <Button
                      href={`/pagar/${courseSlug}`}
                      variant="ghost"
                      className="flex-1 text-center"
                    >
                      Refrescar
                    </Button>
                  )}
                  <Button href="/cursos" variant="ghost" className="flex-1 text-center">
                    Ver más cursos
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
