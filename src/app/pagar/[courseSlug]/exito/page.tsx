/**
 * Página de éxito tras checkout — `/pagar/[slug]/exito`.
 *
 * Flujo:
 * 1. Stripe redirige al usuario aquí con `?session_id=cs_test_XXX`.
 * 2. Leemos el estado del Checkout Session vía `provider.getStatus()`.
 *    (No leemos del webhook — el webhook corre asíncrono y pudo ya haber
 *    creado el grant; pero podemos mostrar feedback inmediato.)
 * 3. Si el status es 'approved' (o 'processing' para OXXO/SPEI con voucher
 *    ya emitido) → mostramos "listo, ya tenés acceso" + CTA al dashboard.
 * 4. Si el status es 'pending' (OXXO/SPEI no pagado aún) → instrucciones.
 * 5. Si no hay session_id o status desconocido → mensaje neutro "verificá
 *    tu email".
 *
 * Server Component. No muta estado — solo lee. El grant real lo hace el
 * webhook (`/api/webhooks/stripe`); esta página refleja el estado más
 * reciente posible al callback redirect.
 *
 * Por qué no redirigir directamente al dashboard sin esperar: queremos
 * feedback explícito + tiempo para que el webhook procese si Stripe
 * redirige antes de mandar el evento. La mayoría de las veces el webhook
 * ya corrió cuando el usuario llega acá (Stripe envía el evento a webhook
 * endpoint y redirect al usuario en paralelo).
 */

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Navbar, Footer } from "@/components/layout";
import { Container, Card, Button } from "@/components/ui";
import { getCurrentStudent } from "@/lib/auth/session";
import { getCourseBySlug } from "@/lib/lms/courses-server";
import { checkCourseAccess } from "@/lib/lms/entitlements";
import { getPaymentProvider } from "@/lib/payments";
import type { PaymentStatus } from "@/types";

export async function generateMetadata({
  params,
}: {
  params: { courseSlug: string };
}): Promise<Metadata> {
  return {
    title: `Pago recibido · Qlick`,
    description: `Confirmación de pago para ${params.courseSlug}.`,
    robots: { index: false, follow: false },
  };
}

interface ExitoPageProps {
  params: { courseSlug: string };
  searchParams: { session_id?: string; status?: string };
}

export default async function ExitoPage({ params, searchParams }: ExitoPageProps) {
  const { courseSlug } = params;
  const sessionId = typeof searchParams.session_id === "string" ? searchParams.session_id : null;
  const pendingFlag = searchParams.status === "pending";

  // 1. Auth.
  const session = await getCurrentStudent();
  if (!session) {
    redirect(`/login?next=${encodeURIComponent(`/pagar/${courseSlug}/exito`)}`);
  }

  // 2. Resolver el curso.
  const course = await getCourseBySlug(courseSlug);
  if (!course) {
    redirect("/dashboard");
  }

  // 3. Consultar estado del pago en el provider (best-effort).
  //    Si no hay session_id, mostramos mensaje neutro.
  let paymentStatus: PaymentStatus | "unknown" = "unknown";
  if (sessionId) {
    try {
      const provider = getPaymentProvider();
      const result = await provider.getStatus(sessionId);
      paymentStatus = result.status;
    } catch (err) {
      // Si falla la consulta, seguimos con status "unknown" — el webhook
      // eventualmente procesará y grantAccess correrá.
      // eslint-disable-next-line no-console
      console.warn("[exito] getStatus falló (continuamos)", {
        sessionId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 4. Verificar si el access ya está activo (webhook pudo haber corrido
  //    antes que el usuario llegara acá).
  const access = await checkCourseAccess(session.userId, course.id);
  const accessActive = access.hasAccess;

  // 5. Render según estado.
  // Stripe redirige con ?status=pending para OXXO/SPEI no pagado aún.
  const isPending = pendingFlag || paymentStatus === "pending";

  let title: string;
  let body: string;
  let ctaLabel: string;
  let ctaHref: string;
  let tone: "success" | "warning" = "success";

  if (accessActive) {
    title = "¡Listo! Ya tenés acceso";
    body = `Tu pago fue confirmado. ${course.title} ya está disponible en tu dashboard.`;
    ctaLabel = "Ir al dashboard";
    ctaHref = "/dashboard?paid=ok";
  } else if (isPending) {
    title = "Pago pendiente de confirmación";
    body =
      "Si pagaste con OXXO o SPEI, el voucher / transferencia está siendo procesado. " +
      "Te avisaremos por email cuando se confirme. También podés chequear tu dashboard " +
      "más tarde.";
    ctaLabel = "Ir al dashboard";
    ctaHref = "/dashboard";
    tone = "warning";
  } else if (paymentStatus === "rejected" || paymentStatus === "expired") {
    title = "El pago no se completó";
    body =
      "El proveedor rechazó o expiró tu intento de pago. Podés intentar de nuevo " +
      "con otro método o contactarnos si necesitás ayuda.";
    ctaLabel = "Volver a intentar";
    ctaHref = `/pagar/${courseSlug}`;
    tone = "warning";
  } else {
    // status desconocido o sin session_id — el webhook puede estar en camino.
    title = "Recibimos tu pago";
    body =
      "Estamos procesando tu pago. En unos segundos deberías ver el curso en tu " +
      "dashboard. Si después de 1 minuto no aparece, contactános.";
    ctaLabel = "Ir al dashboard";
    ctaHref = "/dashboard?paid=pending";
    tone = "warning";
  }

  const toneClasses =
    tone === "success"
      ? "border-emerald-300 bg-emerald-50 text-emerald-900"
      : "border-amber-300 bg-amber-50 text-amber-900";

  return (
    <>
      <Navbar />
      <section className="bg-brand-50/40 min-h-[calc(100vh-4rem)]">
        <Container className="py-14">
          <div className="max-w-xl mx-auto">
            <Card className="p-8">
              <div className={`rounded-lg border p-4 ${toneClasses}`}>
                <h1 className="text-2xl font-bold">{title}</h1>
                <p className="mt-2 text-sm whitespace-pre-line">{body}</p>
              </div>

              {sessionId && (
                <p className="mt-4 text-xs text-ink-muted">
                  ID de sesión: <code className="font-mono">{sessionId}</code>
                </p>
              )}

              <div className="mt-6 flex flex-col sm:flex-row gap-3">
                <Button href={ctaHref} className="flex-1 text-center">
                  {ctaLabel}
                </Button>
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